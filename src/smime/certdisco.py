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

import dns.resolver, dns.exception, ldap, logging
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
            if (rdata.algorithm != 5) and (rdata.algorithm != 8) and (rdata.algorithm !=0): #RSASHA1 or RSASHA256 and workaround for athenahealth
                logging.warning('Invalid CERT algorithm: %d: %s', rdata.algorithm, addr)
                continue
            if rdata.certificate_type == 1: #PKIX
                certs.append(rdata.certificate)
            elif rdata.certificate_type == 4: #IPKIX
                import requests
                #try GETting it from url (DER)
                logging.info('Try getting from url ' + answer[3]);
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
    except dns.exception.Timeout:
        logging.warning('CERT query failed: %s: timeout:', addr)

    logging.debug('Certificates found: %s', len(certs))  
    return certs

def dns_srv(addr):
    certs = []
    try:
        logging.info('Sending SRV query: %s', addr)
        srv = dns.resolver.query('_ldap._tcp.' + addr, 'SRV')
        logging.debug('Sorting entries by priority (asc) and weight (desc)')
        for cert in sorted(srv, key = lambda x : (x.priority, -x.weight)):
            ldap_addr = 'ldap://{0}:{1}'.format('.'.join(cert.target[:-1]), cert.port)
            logging.debug('Received LDAP address: %s, priority: %s, weight: %s', ldap_addr, cert.priority, cert.weight)
            certs.append(ldap_addr)
    except dns.resolver.NXDOMAIN:
        logging.warning('SRV query failed: %s: query name does not exist', addr)
    except dns.resolver.NoAnswer:
        logging.warning('SRV query failed: %s: no answer', addr)
    except dns.resolver.NoNameservers:
        logging.warning('SRV query failed: %s: no nameservers available:', addr)
    except dns.exception.Timeout:
        logging.warning('SRV query failed: %s: timeout:', addr)
    return certs

def ldap_qry(uri, mail):
    certs = []
    try:
        logging.debug('Binding LDAP uri: ' + uri)
        l = ldap.initialize(uri)
        logging.debug('Resolve Base DNs')
        nc = l.search_s('', ldap.SCOPE_BASE, '(objectclass=*)', ['namingContexts'])
        for dn, attr in nc:
            logging.debug('Querying base dn: ' + attr['namingContexts'][0])
            res = l.search_s(attr['namingContexts'][0], ldap.SCOPE_SUBTREE, '(mail={0})'.format(mail), ['userCertificate', 'userCertificate;binary'])
            for dn, uc in res:
                if 'userCertificate' in uc:
                    logging.debug('Received LDAP user certificate')
                    certs.extend(uc['userCertificate'])
                else:
                    logging.debug('Received LDAP user certificate (binary)')
                    certs.extend(uc['userCertificate;binary'])
    except ldap.LDAPError as x:
        logging.warning('LDAP query failed: %s: %s', x, mail)
    return certs
