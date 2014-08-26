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

import os, glob, subprocess
import M2Crypto as crypto

def get_anchor_info(anchor):
    cert = None
    if anchor.startswith('-----BEGIN'):
        cert = crypto.X509.load_cert_string(anchor)
    else:
        cert = crypto.X509.load_cert_der_string(anchor)
    subject_hash = hex(cert.get_subject().as_hash())[2:-1]
    fingerprint = cert.get_fingerprint()

    return subject_hash, fingerprint, cert.as_pem()

def add_anchor(anchor, path, rehash = True):
    subject_hash, fingerprint, pem = get_anchor_info(anchor)
    ext = -1
    for fname in glob.glob(os.path.join(path, '%s.*.pem' % subject_hash)):
        if fingerprint == crypto.X509.load_cert(fname).get_fingerprint():
            return
        print fname
        ext = max(ext, int(os.path.split(fname)[1].split('.')[1]))

    print 'Adding: %s.%d.pem' % (subject_hash, ext + 1)
    with open(os.path.join(path, '%s.%d.pem' % (subject_hash, ext + 1)), 'w') as cert_file:
        cert_file.write(pem)
    if rehash:
        return rehash_store(path)
    
    return 0

def remove(subject_hash, path):
    from sys import stdin
    certs = glob.glob(os.path.join(path, '%s.*.pem' % subject_hash))
    if len(certs) == 0:
        print 'No anchor found'
        exit(0)
    elif len(certs) == 1:
        os.remove(certs[0])
        return rehash_store(path)
    else:
        print 'Found more than one anchor with the same subject. Choose one:'
        for i in range(len(certs)):
            fprint = crypto.X509.load_cert(certs[i]).get_fingerprint()
            print i,fprint
        choice = stdin.read(1)
        if choice.lower() == 'q':
            exit(0)
        if choice < len(certs):
            os.remove(certs[choice])
            return rehash_store(path)

def remove_anchor(anchor, path, rehash = True):
    subject_hash, fingerprint, pem = get_anchor_info(anchor)
    for fname in glob.glob(os.path.join(path, '%s.*.pem' % subject_hash)):
        if fingerprint == crypto.X509.load_cert(fname).get_fingerprint():
            os.remove(fname)
            print 'Removed trust anchor: %s' % fname
            if rehash:
                return rehash_store(path)
            return 0

    print 'Trust anchor not found'    
    return 0

def rehash_store(path):
    rehash = subprocess.Popen(['c_rehash', path])
    rehash.communicate()
    return rehash.returncode

def list_anchors(path):
    certs = glob.glob(os.path.join(path, '*.pem'))
    for i in range(len(certs)):
        cert = crypto.X509.load_cert(certs[i])
        text = cert.get_subject().as_text()
        shash = hex(cert.get_subject().as_hash())[2:-1]
        print shash, text
