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

from M2Crypto import BIO, SMIME, X509
import subprocess, threading, logging

def writer(proc, message):
    proc.stdin.write(message)
    proc.stdin.close()

def to_smime(message, sender_key, sender_cert, recipient_cert, cipher = 'aes_128_cbc'):
    try:
        smime = SMIME.SMIME()
        #smime.pkey = sender_key
        #smime.x509 = sender_cert
    	signature = ''
        logging.debug('Signing outgoing message')
        command = ('/usr/bin/env', 'openssl', 'cms', '-sign', '-signer', sender_cert , '-inkey', sender_key)
        proc = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, bufsize=-1)
        #proc.stdin.write(message)
        #signature, stderr = proc.communicate()
        thread = threading.Thread(target=writer, args=(proc, message,))
        thread.start()
        for line in proc.stdout:
            signature += line
        thread.join()
        logging.debug('Message signed')
        
        logging.debug('Encrypting message')

        #signature = smime.sign(BIO.MemoryBuffer(message), flags=SMIME.PKCS7_DETACHED)
        #init buffer
        message_signed = BIO.MemoryBuffer(signature)
        #smime.write(message_signed, signature, BIO.MemoryBuffer(message))
        cert_stack = X509.X509_Stack()
        #for cert in recipient_certs:
        cert_stack.push(X509.load_cert_der_string(recipient_cert))

        smime.set_x509_stack(cert_stack)
        smime.set_cipher(SMIME.Cipher(cipher)) 
        
        message_encrypted = smime.encrypt(message_signed)

        out = BIO.MemoryBuffer()
        smime.write(out, message_encrypted)
        out.close()

        logging.debug('Message encrypted')
        return out.read().replace('x-pkcs7-mime', 'pkcs7-mime')
    except SMIME.SMIME_Error, e:
        logging.error('smime error: %s', e)
        raise
    except SMIME.PKCS7_Error, e:
        logging.error('pkcs7 error: %s', e)
        raise

if __name__ == "__main__":
    from M2Crypto import EVP, util
    msg = 'Hello world'
    from_key = EVP.load_key('direct.key', util.passphrase_callback)
    from_cert = X509.load_cert('direct.pem')
    to_cert = X509.load_cert('ttt.pem')
    print to_smime(msg, from_key, from_cert, to_cert)
