#!/usr/bin/env python

""" Copyright 2014 MedicaSoft LLC USA and Info World SRL
Licensed under the Apache License, Version 2.0 the "License";
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
"""

import email, psycopg2,logging, certdisco, certvld

TEMPDIR = '/var/spool/direct/tmp/'
CADIR = '/var/spool/direct/ca'

def find_certificate(addr, local_domain, algo):
    #algorithms:
    # 0 = hybrid
    # 1 = address bound DNS CERT
    # 2 = domain bound DNS CERT
    # 3 = address bound LDAP
    # 4 = domain bound LDAP
    # 5 = stored in database
    logging.debug('Try finding certificate for address: %s', addr)
    parts = addr.partition('@')
    user = parts[0]
    domain = parts[2]
      
    if algo == 1 or algo == 0:
        logging.debug('Trying address bound DNS CERT')
        certs = certdisco.dns_cert(user + '.' + domain)
        if certs != []:
            for cert in certs:
                if certvld.validate(cert, local_domain, addr, domain, addressBound = True):
                    logging.debug('A valid address bound DNS CERT was found')
                    return cert
            logging.debug('No valid address bound DNS CERT found')
            return None
        logging.debug('No address bound DNS CERT found')

    if algo == 2 or algo == 0:
        logging.debug('Trying domain bound DNS CERT')
        certs = certdisco.dns_cert(domain)
        if certs != []:
            for cert in certs:
                if certvld.validate(cert, local_domain, addr, domain, addressBound = False):
                    logging.debug('A valid domain bound DNS CERT was found')
                    return cert
            logging.debug('No valid domain bound DNS CERT found')
            return None
        logging.debug('No domain bound DNS CERT found')

    if algo == 3 or algo == 0:
        logging.debug('Trying address bound LDAP')
        uris = certdisco.dns_srv(domain)
        for uri in uris:
            certs = certdisco.ldap_qry(uri, addr)
            if certs != []:
                for cert in certs:
                    if certvld.validate(cert, local_domain, addr, domain, addressBound = True):
                        logging.debug('A valid address bound LDAP was found using uri: ' + uri)
                        return cert
                logging.debug('No valid address bound LDAP found using uri: ' + uri)
                return None
            logging.debug('No address bound LDAP found using uri: ' + uri)
        logging.debug('No address bound LDAP found')

    if algo == 4 or algo == 0:
        logging.debug('Trying domain bound LDAP')
        uris = certdisco.dns_srv(domain)
        for uri in uris:
            certs = certdisco.ldap_qry(uri, domain)
            if certs != []:
                for cert in certs:
                    if certvld.validate(cert, local_domain, addr, domain, addressBound = False):
                        logging.debug('A valid domain bound LDAP was found using uri: ' + uri)
                        return cert
                logging.debug('No valid domain bound LDAP found using uri: ' + uri)
                return None
            logging.debug('No domain bound LDAP found using uri: ' + uri)
        logging.debug('No domain bound LDAP found')

    return None

def send_message(sender, recipient, message_id, message):
    from M2Crypto import EVP, util, X509
    import certdisco, certvld, crypto, subprocess, os

    logging.debug('Start sending message to: %s', recipient)
    domain = recipient.partition('@')[2]
    sender_domain = sender.partition('@')[2]

    try:
        logging.debug('Connecting to "maildb" database')
        conn = psycopg2.connect(database='maildb', user='direct')
    except psycopg2.OperationalError as dberr:
        logging.error('Database connection failed: %s', dberr)
        return 1

    cur = conn.cursor();
    logging.debug('Searching database record for domain: %s', domain)
    cur.execute("SELECT anchor_path, crl_path, crypt_cert, cert_disco_algo FROM domains WHERE name = %s;", (domain,))
    dom = cur.fetchone()
    cur.close()
    conn.close()

    from_key = os.path.join(CADIR, 'key', sender_domain, 'direct.key') #EVP.load_key('direct.key', util.passphrase_callback)
    from_cert = os.path.join(CADIR, 'cert', sender_domain, 'direct.pem') #X509.load_cert('direct.pem')
    
    algo = 0 if dom == None else dom[3]

    logging.debug('Certificate discovery algorithm: %s', algo)
    if (dom != None) and (dom[3] == 5): #cert_disco_algo = local (cert saved to database)
        logging.debug('Trying local CERT stored in database')
        to_cert = None
        if certvld.validate(dom[2], sender_domain, recipient, domain, addressBound = False):
            logging.debug('A valid local CERT stored in database was found')
            to_cert = dom[2]
        logging.debug('No local CERT found')
    else:
        to_cert = find_certificate(recipient, sender_domain, algo)

    if to_cert == None:
        logging.warning('Recipient certificate not found: %s', recipient)
        return 1

    logging.debug('Securing message')
    cms = crypto.to_smime(message, from_key, from_cert, to_cert)
    logging.debug('Message secured')

    logging.debug('Queueing encrypted mail message for: %s', recipient)
    command = ('/usr/sbin/sendmail', '-f', sender, '--', recipient)
    proc = subprocess.Popen(command, stdin=subprocess.PIPE)

    #proc.stdin.write('From: <%s>\r\n' % sender)
    proc.stdin.write('To: <%s>\r\n' % recipient)
    proc.stdin.write('Message-ID: %s\r\n' % message_id)
    proc.stdin.write(cms)
    proc.communicate()
    status = proc.returncode
    if status == 0:
        logging.debug('Message queued: %s: %s', message_id, recipient)
    else:
        logging.warning('Send message failed: %s: %s', message_id, recipient)
    return status

if __name__ == "__main__":
    import email,sys,platform, logging.handlers

    logging.basicConfig(level=logging.DEBUG,stream=sys.stderr)
    err = logging.handlers.SysLogHandler(address='/dev/log',facility=logging.handlers.SysLogHandler.LOG_MAIL)
    err.setLevel(logging.DEBUG)
    err.setFormatter(logging.Formatter('%(asctime)s ' + platform.node() + ' direct/send[%(process)s]: %(message)s'))
    logging.getLogger('').addHandler(err)

    parser = email.Parser.Parser()
    eml = sys.stdin.read()
    msg = parser.parsestr(eml, True)
    if msg['from'] == None:
        logging.warning('Invalid message sender')
        exit(2)
    if msg['to'] == None:
        logging.warning('Invalid recipient list')
        exit(2)
    #if msg['subject'] == None:
    #    logging.warning('Invalid recipient list')
    #    exit(2)
    if msg['message-id'] == None:
        logging.warning('Invalid message id')
        exit(2)
    if msg['date'] == None:
        logging.warning('Invalid orig date')
        exit(2)

    sender = email.Utils.parseaddr(msg['from'])[1]
    if sender == '':
        exit(2)
    recipients = email.Utils.getaddresses(msg.get_all('to',[]) + msg.get_all('cc', []))
    message_id = msg['message-id']
    retval = ''
    for recipient in recipients:
        err = send_message(sender, recipient[1], message_id, eml)
        if err != 0:
            retval += recipient[1] + '; ' 
    if retval != '':
        retval = '[smime_errors] Could not send DIRECT mail to the following recipient(s): ' + retval
    	exit(retval)
    exit()
	
