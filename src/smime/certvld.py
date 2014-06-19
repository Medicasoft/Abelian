#!/usr/bin/env python
import M2Crypto as crypto, logging

def validate(cert, anchor, addr, domain, addressBound = True):
    c = crypto.X509.load_cert_der_string(cert)
    #check binding to expected entity
    if not verify_binding(c, addr, domain, addressBound):
        return False
    #check expiration
    #check signature
    #not been revoked
    #has a trusted certificate path
    return verify_cert(c, anchor, addr)
    


def verify_binding(x509, addr, domain, addressBound):
    emailAddress = x509.get_subject().emailAddress
    logging.debug('Verifying certificate binding, emailAddress: %s', emailAddress)
    subjAltName = None
    for i in range(x509.get_ext_count()):
        ext = x509.get_ext_at(i)
        if ext.get_name() == 'subjectAltName':
            subjAltName = ext.get_value().split(':')
            break;
    logging.debug('Verifying certificate binding, subjectAltName: %s', subjAltName)
    if addressBound:
        if subjAltName != None:
            if len(subjAltName) != 2 or subjAltName[0].lower() != 'email' or subjAltName[1].lower() != addr:
                return False
        if emailAddress != None and emailAddress.lower() != addr:
            return False
        if subjAltName != None and emailAddress != None and subjAltName[1].lower() != emailAddress.lower():
            return False
    else:
        if subjAltName == None or subjAltName[0].lower() != 'dns' or subjAltName[1].lower() != domain:
            return False
    logging.debug('Certificate binding verification: OK')
    return True

def verify_cert(cert, anchor, addr):
    #M2Crypto needs a patch to verify expiration, crl and path so do this for now
    import subprocess
    certfile = addr.replace('@', '.')
    cert.save(certfile, crypto.X509.FORMAT_PEM)
    logging.debug('Verifying certificate expiration, signature, revocation and path: %s', anchor)
    command = ('/usr/bin/env', 'openssl', 'verify', '-CApath', '/var/spool/direct/ca', addr.replace('@', '.'))
    proc = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    stdout, stderr = proc.communicate()
    if (stderr == "") and (stdout.strip() == "%s: OK" % certfile):
        return True
    logging.debug('Chain validation failed:')
    return False