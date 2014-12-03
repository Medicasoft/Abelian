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

import M2Crypto as crypto, logging
TEMPDIR = '/var/spool/direct/tmp/'
CADIR = '/var/spool/direct/ca'

def validate(cert, local_domain, addr, domain, addressBound = True):
    c = crypto.X509.load_cert_der_string(cert)
    logging.debug('Validating certificate CN = ' + c.get_subject().CN)
    #check binding to expected entity
    if not verify_binding(c, addr, domain, addressBound):
        return False
    #check expiration
    #check signature
    #not been revoked
    #has a trusted certificate path
    return verify_cert(c, local_domain, addr)
    


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
            if len(subjAltName) != 2:
                logging.log('Certificate binding verification failed: invalid subjectAltName')
                return False
            if subjAltName[0].lower() == 'dns' and subjAltName[1].lower() == domain:
                logging.debug('Certificate binding verification: OK')
                return True
            if subjAltName[0].lower() != 'email' or subjAltName[1].lower() != addr:
                logging.debug('Certificate binding verification failed %s: emailAddress does not match', emailAddress)
                return False
        if emailAddress != None and emailAddress.lower() != addr:
            logging.debug('Certificate binding verification failed %s: subjectAltName does not match', emailAddress)
            return False
        if subjAltName != None and emailAddress != None and subjAltName[1].lower() != emailAddress.lower():
            logging.debug('Certificate binding verification failed %s: subjectAltName and emailAddress does not match', emailAddress)
            return False
    else:
        if subjAltName == None or subjAltName[0].lower() != 'dns' or subjAltName[1].lower() != domain:
            logging.debug('Certificate binding verification failed %s: subjectAltName does not match', domain)
            return False
    logging.debug('Certificate binding verification: OK')
    return True

def verify_cert(cert, local_domain, addr):
    #M2Crypto needs a patch to verify expiration, crl and path so do this for now
    import subprocess, os, glob
    ca_path = os.path.join(CADIR, 'trust', local_domain)
    logging.debug('Verifying certificate expiration, signature, revocation and path: %s', addr)
    command = ('/usr/bin/env', 'openssl', 'verify', '-CApath', ca_path)

    issuer_hash = hex(cert.get_issuer().as_hash())[2:-1]
    if len(glob.glob(os.path.join(ca_path, issuer_hash, '.r*'))):
        command.append('-crl_check')
    proc = subprocess.Popen(command, stdin = subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    proc.stdin.write(cert.as_pem())
    stdout, stderr = proc.communicate()
    if (proc.returncode == 0) and (stdout.strip() == "stdin: OK"):
        logging.debug('Validation succeeded: CN = ' + cert.get_subject().CN)
        return True
    logging.debug('Validation failed: %s', stdout)
    return False