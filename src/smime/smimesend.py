#!/usr/bin/env python
import email, psycopg2,logging, certdisco, certvld

def find_certificate(addr, anchor, algo):
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
        certs = certdisco.dns_cert(user + '.' + domain)
        if certs != []:
            for cert in certs:
                logging.debug('Validating address bound DNS CERT certificate')
                if certvld.validate(cert, anchor, addr, domain, addressBound = True):
                    return cert
            return None
    
    if algo == 2 or algo == 0:
        certs = certdisco.dns_cert(domain)
        if certs != []:
            for cert in certs:
                if certvld.validate(cert, anchor, addr, domain, addressBound = False):
                    return cert
            return None

    if algo == 3 or algo == 0:
        uris = certdisco.dns_srv(domain)
        for uri in uris:
            certs = certdisco.ldap_qry(uri, addr)
            if certs != []:
                for cert in certs:
                    if certvld.validate(cert, anchor, addr, domain, addressBound = True):
                        return cert
                return None

    if algo == 4 or algo == 0:
        uris = certdisco.dns_srv(domain)
        for uri in uris:
            certs = certdisco.ldap_qry(uri, domain)
            if certs != []:
                for cert in certs:
                    if certvld.validate(cert, anchor, addr, domain, addressBound = False):
                        return cert
                return None

    return None

def send_message(sender, recipient, message_id, message):
    from M2Crypto import EVP, util, X509
    import certdisco, certvld, crypto, subprocess

    logging.debug('Start sending message to: %s', recipient)
    domain = recipient.partition('@')[2]

    try:
        logging.debug('Connecting to "maildb" database')
        conn = psycopg2.connect(database='maildb', user='dbmail', password='.Logimax.')
    except psycopg2.OperationalError as dberr:
        logging.error('Database connection failed: %s', dberr)
        return 1

    cur = conn.cursor();
    logging.debug('Searching database record for domain: %s', domain)
    cur.execute("SELECT anchor_path, crl_path, crypt_cert, cert_disco_algo FROM domains WHERE name = %s;", (domain,))
    dom = cur.fetchone()
    if dom == None:
        logging.warning('Recipient domain not trusted: %s', domain)
        return 1
    cur.close()
    conn.close()

    logging.debug('Recipient domain is trusted: %s', domain)
    logging.debug('Certificate discovery algorithm: %s', dom[3])

    from_key = EVP.load_key('pb1.key', util.passphrase_callback)
    from_cert = X509.load_cert('pb1.pem')
    to_cert = find_certificate(recipient, dom[0], dom[3])

    if to_cert == None:
        logging.warning('Recipient certificate not found: %s', recipient)
        return 1

    logging.debug('Sending encrypted mail message to: %s', recipient)
    command = ('sendmail', '-f', sender, '--', recipient)
    proc = subprocess.Popen(command, stdin=subprocess.PIPE)
    proc.stdin.write(crypto.to_smime(message, from_key, from_cert, to_cert))
    proc.communicate()
    status = proc.returncode
    if status == 0:
        logging.debug('Message sent: %s: %s', message_id, recipient)
    else:
        logging.warning('Send message failed: %s: %s', message_id, recipient)
    return status

if __name__ == "__main__":
    import email,sys
    logging.basicConfig(format='%(asctime)s pycert[%(process)s]: %(message)s',level=logging.DEBUG,stream=sys.stderr)
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
    for recipient in recipients:
        send_message(sender, recipient[1], message_id, eml)