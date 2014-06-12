#!/usr/bin/env python
import dns.resolver, ldap, logging
CERT_TEMPLATE = """
-----BEGIN CERTIFICATE-----
%s
-----END CERTIFICATE-----
"""

def dns_cert(addr):
    logging.info('Sending CERT query: %s', addr)
    certs = []
    try:
        answer = dns.resolver.query(addr, 'CERT')
        for rdata in answer:
            if rdata.algorithm != 5: #RSASHA1
                logging.warning('Invalid CERT algorithm: %d: %s', rdata.algorithm, addr)
                continue
            if rdata.certificate_type == 1: #PKIX
                certs.append(rdata.certificate)
            elif rdata.certificate_type == 4: #IPKIX
                import requests
                #try GETting it from url (DER)
                res = requests.get(answer[3])
                if res.status_code != 200:
                    logging.warning('IPKIX certificate download failed: %s: %s', addr, answer[3])
            else:
                logging.warning('Invalid CERT type: %d: %s', rdata.certificate_type, addr)            
    except dns.resolver.NXDOMAIN:
        logging.info('CERT query failed: %s: query name does not exist:', addr)
    except dns.resolver.NoAnswer:
        logging.warning('CERT query failed: %s: no answer:', addr)
    except dns.resolver.NoNameservers:
        logging.warning('CERT query failed: %s: no nameservers available:', addr)
    except Timeout:
        logging.warning('CERT query failed: %s: timeout:', addr)
    return certs

def dns_srv(addr):
    certs = []
    try:
        logging.info('Sending SRV query: %s', addr)
        srv = dns.resolver.query('_ldap._tcp.' + addr, 'SRV')
        for cert in sorted(srv, key = lambda x : (x.priority, -x.weight)):
            certs.append('ldap://{0}:{1}'.format('.'.join(cert.target[:-1]), cert.port))
    except dns.resolver.NXDOMAIN:
        logging.warning('SRV query failed: %s: query name does not exist', addr)
    return certs

def ldap_qry(uri, mail):
    certs = []
    try:
        l = ldap.initialize(uri)
        res = l.search_s('', ldap.SCOPE_SUBTREE, '(mail={0})'.format(mail), ['userCertificate'])
        for dn, uc in res:
            certs.extend(uc['userCertificate'])
    except ldap.LDAPError as x:
        logging.warning('LDAP query failed: %s: %s', x, mail)
    return certs

def print_pem_cert(certs, anchor, addr, domain, addressBound):
    import base64, certvld
    for cert in certs:
        if certvld.validate(cert, 'anchor.pem', addr, domain, addressBound):
            print base64.b64encode(cert)
            sys.exit(0)

if __name__ == "__main__":
    import sys
    logging.basicConfig(format='%(asctime)s pycert[%(process)s:]: %(message)s',level=logging.DEBUG)
    addr = ''
    if len(sys.argv) > 1:
        addr =  sys.argv[1]
    else:
        addr = sys.stdin.read()[:-1]

    if addr == '':
        sys.exit(2)

    mail = addr
    addr = addr.partition('@')
    user = addr[0]
    domain = addr[2]

    if domain == '':
        sys.exit(2)

    #try address bound dns CERT query
    certs = dns_cert(user + '.' + domain)
    if certs != []:
        print_pem_cert(certs, '', mail, domain, True)
        sys.exit(0)

    #try domain bound dns CERT query
    certs = dns_cert(domain)
    if certs != []:
        print_pem_cert(certs, '', mail, domain, False)
        sys.exit(0)

    #make a SRV query to identify LDAP servers
    uris = dns_srv(domain)
    if uris != []:
        for uri in uris:
            print_pem_cert(ldap_qry(uri, mail), '', mail, domain, True)
        sys.exit(0)

    sys.exit(1)