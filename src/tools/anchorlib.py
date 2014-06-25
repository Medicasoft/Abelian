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
