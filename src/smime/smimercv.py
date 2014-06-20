#!/usr/bin/python
import sys, os, subprocess, email, psycopg2, logging
from M2Crypto import BIO, SMIME, X509

DATAERR = 65
TEMPFAIL = 75
UNAVAILABLE = 69
TEMPDIR = '/var/spool/direct/tmp/'
CADIR = '/var/spool/direct/ca/'

TEMPLATE = """
-----BEGIN PKCS7-----
%s
-----END PKCS7-----
"""

def process_message(queue_id, recipient, sender, message):
    pid = os.getpid()
    recipient_cert = CADIR + 'direct.pem'
    recipient_key = CADIR + 'direct.key'

    logging.debug('Decrypting incoming message: %s', queue_id)
    command = ('/usr/bin/env', 'openssl', 'cms', '-decrypt', '-recip', recipient_cert , '-inkey', recipient_key)
    proc = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    proc.stdin.write(message.read())
    msg_sign, stderr = proc.communicate()
    
    parser = email.Parser.Parser()
    mail = parser.parsestr(msg_sign)

    for mpart in mail.walk():
        #print mpart.get_content_type()
        if mpart.get_content_type() == 'application/pkcs7-signature':
            sig = mpart.get_payload()
            #openssl needs short base64 encoded lines
            if '\n' not in sig:
                sig = '\n'.join([sig[i:i+77] for i in range(0, len(sig), 77)])
                mpart.set_payload(sig)
                msg_sign = mail.as_string().replace('Content-Type: message/rfc822', 'Content-Type:message/rfc822')
            sig = TEMPLATE % sig
            break
    if not verify_sig_cert(sig, sender):
        return None

    #print mail.as_string()
    #return
    command = ('/usr/bin/env', 'openssl', 'cms', '-verify', '-CApath', CADIR)
    proc = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    proc.stdin.write(msg_sign)
    stdout, stderr = proc.communicate()
    print stdout
    print proc.returncode

def save_message(queue_id, recipient, sender, msg_orig, msg_plain):
    conn = psycopg2.connect(database='maildb', user='direct')
    cur = conn.cursor();
    cur.execute("INSERT INTO messages(queue_id,recipient,sender,original,msg) VALUES(%s,%s,%s,%s,%s);",(queue_id,recipient,sender,msg_orig.read(),msg_plain.read()))
    conn.commit() 

def send_mdn():
    return

def verify_sig_cert(sig, sender):
    import certvld

    p7 = SMIME.load_pkcs7_bio(BIO.MemoryBuffer(sig))
    certs = p7.get0_signers(X509.X509_Stack())
    for cert in certs:
        #print cert.as_text()
        if not certvld.verify_cert(cert, None, sender):
            return False
    return True

if __name__ == "__main__":
    if len(sys.argv) > 1:
        addr =  sys.argv[1]
    queue_id = sys.argv[1]
    recip = sys.argv[2]
    sender = sys.argv[3]

    process_message(queue_id, recip, sender, sys.stdin)
