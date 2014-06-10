#!/usr/bin/env python
import dns.resolver, requests, ldap, base64, logging
CERT_TEMPLATE = """
-----BEGIN CERTIFICATE-----
%s
-----END CERTIFICATE-----
"""

def dns_cert(addr):
    logging.info('Sending CERT query: %s', addr)
    try:
        answer = dns.resolver.query(addr, 'CERT')[0].to_text().split(' ')
        if len(answer) < 4:
            logging.warning('Invalid CERT query answer, too few fields')
            return ''
        cert_type = answer[0]
        key_tag = answer[1]
        algo = answer[2]
        if cert_type in [1, 'PKIX']:
            #format as pem and return
            logging.debug('Found PKIX certificate for: %s', addr)
            return CERT_TEMPLATE % '\n'.join(answer[3:])
        if cert_type in [4, 'IPKIX']:
            #try GETting it from url (as DER) then base64 encode
            res = requests.get(answer[3])
            if res.status_code != 200:
                logging.warning('IPKIX certificate download failed: %s: %s', addr, answer[3])
                return ''
            return CERT_TEMPLATE % base64.b64encode(res.content)
        logging.warning('CERT query answer not PKIX or IPKIX')
        return ''
    except dns.resolver.NXDOMAIN:
        logging.info('CERT query failed: %s: query name does not exist:', addr)
    except dns.resolver.NoAnswer:
        logging.warning('CERT query failed: %s: no answer:', addr)
    except dns.resolver.NoNameservers:
        logging.warning('CERT query failed: %s: no nameservers available:', addr)
    except Timeout:
        logging.warning('CERT query failed: %s: timeout:', addr)
    return ''

def dns_srv(addr):
    try:
        logging.info('Sending SRV query: %s', addr)
        return dns.resolver.query('_ldap._tcp.' + addr, 'SRV')
    except dns.resolver.NXDOMAIN:
        logging.warning('SRV query failed: %s: query name does not exist', addr)
        return ''

def print_pem_cert(cert):
    print cert
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

    addr = addr.partition('@')
    user = addr[0]
    domain = addr[2]

    if domain == '':
        sys.exit(2)

    #try address bound dns CERT query
    cert = dns_cert(user + '.' + domain)
    if cert != '':
        print_pem_cert(cert)
    
    #try domain bound dns CERT query
    cert = dns_cert(domain)
    if cert != '':
        print_pem_cert(cert)

    #make a SRV query to identify LDAP servers
    srv = dns_srv(domain)
    if srv != '':
        for rdata in srv:
            print rdata
        sys.exit(0)

    sys.exit(1)
