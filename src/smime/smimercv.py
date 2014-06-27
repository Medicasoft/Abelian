#!/usr/bin/python
import sys, os, subprocess, email, psycopg2, logging, smimesend
from email.parser import Parser
from M2Crypto import BIO, SMIME, X509

DATAERR = 65
TEMPFAIL = 75
UNAVAILABLE = 69
TEMPDIR = '/var/spool/direct/tmp/'
CADIR = '/var/spool/direct/ca'

TEMPLATE = """
-----BEGIN PKCS7-----
%s
-----END PKCS7-----
"""

def process_message(queue_id, recipient, sender, message):
    pid = os.getpid()

    recipient_domain = recipient.partition('@')[2]
    ca_path = os.path.join(CADIR, 'trust', recipient_domain)

    recipient_key = os.path.join(CADIR, 'key', recipient_domain, 'direct.key')
    recipient_cert = os.path.join(CADIR, 'cert', recipient_domain, 'direct.pem')
    message_id = None
    subject = None

    mail = Parser().parsestr(message, True)
    if mail['message-id'] != None:
        message_id = mail['message-id']
    if mail['subject'] != None:
        subject = mail['subject']

    logging.debug('Decrypting incoming message: %s', queue_id)
    command = ('/usr/bin/env', 'openssl', 'cms', '-decrypt', '-recip', recipient_cert , '-inkey', recipient_key)
    proc = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    proc.stdin.write(message)
    msg_sign, stderr = proc.communicate()
    
    mail = Parser().parsestr(msg_sign)

    if (subject == None) and (mail['subject'] != None):
        subject = mail['subject']
    is_mdn = False
    sig = None
    for mpart in mail.walk():
        if (message_id == None) and (mpart['message-id'] != None):
            message_id = mail['message-id']
        if (subject == None) and (mpart['subject'] != None):
            subject = mpart['subject']
        ct = mpart.get_content_type()
        if ct == 'message/disposition-notification':
            is_mdn = True
        if ct == 'application/pkcs7-signature':
            sig = mpart.get_payload()
            #openssl needs short base64 encoded lines
            if '\n' not in sig:
                lsig = sig
                sig = '\n'.join([sig[i:i+76] for i in range(0, len(sig), 76)])
                msg_sign = msg_sign.replace(lsig, sig)
                #sig = '\n'.join([sig[i:i+76] for i in range(0, len(sig), 76)])
                #mpart.set_payload(sig)
                #msg_sign = mail.as_string().replace('Content-Type: message/rfc822', 'Content-Type:message/rfc822')
            if sig.endswith('\r\n'):
                sig = sig.rstrip('\r\n')
            if sig.endswith('\n'):
                sig = sig.rstrip('\n')

            sig = TEMPLATE % sig
            break
    if sig == None:
        return None

    if not verify_sig_cert(sig, sender, recipient_domain):
        return None

    command = ('/usr/bin/env', 'openssl', 'cms', '-verify', '-CApath', ca_path)
    proc = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    proc.stdin.write(msg_sign)
    stdout, stderr = proc.communicate()
    if proc.returncode != 0:
        logging.debug('Mail signature validation failed')
        return None

    return (stdout, is_mdn, message_id, subject)

def save_message(queue_id, recipient, sender, msg_orig, msg_plain):
    conn = psycopg2.connect(database='maildb', user='direct')
    cur = conn.cursor();
    cur.execute("INSERT INTO messages(queue_id,recipient,sender,original,msg) VALUES(%s,%s,%s,%s,%s);",(queue_id,recipient,sender,msg_orig,msg_plain))
    conn.commit()

def send_mdn(sender, recipient, orig_message_id, subject, msg_plain):
    import mdn

    msg_id, mdn_msg = mdn.make_mdn(sender, recipient, orig_message_id, subject)   
    return smimesend.send_message(sender, recipient, msg_id, mdn_msg)

def verify_sig_cert(sig, sender, local_domain):
    import certvld

    p7 = SMIME.load_pkcs7_bio(BIO.MemoryBuffer(sig))
    certs = p7.get0_signers(X509.X509_Stack())
    if len(certs) == 0:
        return False
    if not certvld.verify_cert(certs[0], local_domain, sender):
        return False
    if not certvld.verify_binding(certs[0], sender, sender.partition('@')[2], True):
        return False
    return True

if __name__ == "__main__":
    import logging.handlers,platform

    logging.basicConfig(level=logging.DEBUG,stream=sys.stderr)
    err = logging.handlers.SysLogHandler(address='/dev/log',facility=logging.handlers.SysLogHandler.LOG_MAIL)
    err.setLevel(logging.DEBUG)
    err.setFormatter(logging.Formatter('%(asctime)s ' + platform.node() + ' direct/receive[%(process)s]: %(message)s'))
    logging.getLogger('').addHandler(err)

    if len(sys.argv) > 1:
        addr =  sys.argv[1]
    queue_id = sys.argv[1]
    recip = sys.argv[2]
    sender = sys.argv[3]

    orig = sys.stdin.read()
    retval = process_message(queue_id, recip, sender, orig)
    if retval == None:
        logging.debug('Message empty')
        exit(DATAERR)

    plain = retval[0]
    is_mdn = retval[1]
    message_id = retval[2]
    subject = retval[3]

    if not is_mdn: #not MDN
        mdn_rc = send_mdn(recip, sender, message_id, subject, plain)
        if mdn_rc != 0:
            logging.warning('MDN send failed with code: %s', mdn_rc)
            exit(mdn_rc)

    save_message(queue_id, recip, sender, orig, plain)
