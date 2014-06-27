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
