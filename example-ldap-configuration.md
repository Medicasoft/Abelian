sudo su
yum install openldap-servers openldap-clients
service slapd start
#systemctl enable slapd
slappasswd
				.Parola10. => {SSHA}1Ypnt5T8OzPEoX2rhzIlAf5hJ+Ml8Hgk
vi chrootpw.ldif
	# specify the password generated above for "olcRootPW" section
 	dn: olcDatabase={0}config,cn=config
	changetype: modify
	add: olcRootPW
	olcRootPW: {SSHA}1Ypnt5T8OzPEoX2rhzIlAf5hJ+Ml8Hgk
ldapadd -Y EXTERNAL -H ldapi:/// -f chrootpw.ldif
ldapadd -Y EXTERNAL -H ldapi:/// -f /etc/openldap/schema/cosine.ldif
ldapadd -Y EXTERNAL -H ldapi:/// -f /etc/openldap/schema/nis.ldif
ldapadd -Y EXTERNAL -H ldapi:/// -f /etc/openldap/schema/inetorgperson.ldif

vi chdomain.ldif #depending on the install defaults olcDatabase may be: {2}hdb
	# replace to your own domain name for "dc=***,dc=***" section
	# specify the password generated above for "olcRootPW" section
	 dn: olcDatabase={1}monitor,cn=config
	changetype: modify
	replace: olcAccess
	olcAccess: {0}to * by dn.base="gidNumber=0+uidNumber=0,cn=peercred,cn=external,cn=auth"
	  read by dn.base="cn=Manager,dc=orovillehospital,dc=org" read by * none

	dn: olcDatabase={2}bdb,cn=config
	changetype: modify
	replace: olcSuffix
	olcSuffix: dc=orovillehospital,dc=org

	dn: olcDatabase={2}bdb,cn=config
	changetype: modify
	replace: olcRootDN
	olcRootDN: cn=Manager,dc=orovillehospital,dc=org

	dn: olcDatabase={2}bdb,cn=config
	changetype: modify
	add: olcRootPW
	olcRootPW: {SSHA}1Ypnt5T8OzPEoX2rhzIlAf5hJ+Ml8Hgk

	dn: olcDatabase={2}bdb,cn=config
	changetype: modify
	add: olcAccess
	olcAccess: {0}to attrs=userPassword,shadowLastChange by
	  dn="cn=Manager,dc=orovillehospital,dc=org" write by anonymous auth by self write by * none
	olcAccess: {1}to dn.base="" by * read
	olcAccess: {2}to * by dn="cn=Manager,dc=orovillehospital,dc=org" write by * read
ldapmodify -Y EXTERNAL -H ldapi:/// -f chdomain.ldif
vi basedomain.ldif
	dn: dc=orovillehospital,dc=org
	objectClass: top
	objectClass: dcObject
	objectclass: organization
	o: Oroville Hospital
	dc: org

	dn: cn=Manager,dc=orovillehospital,dc=org
	objectClass: organizationalRole
	cn: Manager
	description: Directory Manager

	dn: ou=direct,dc=orovillehospital,dc=org
	objectClass: organizationalUnit
	ou: Direct

	dn: cn=patient.orovillehospital.org,ou=direct,dc=orovillehospital,dc=org
	objectClass: inetOrgPerson
	sn: patient.orovillehospital.org
	userCertificate;binary:: MIIFbzCCBFegAwIBAgIQChQNs3JfIv/Hhlu2uDpvBzANBgkqhkiG9w0BAQsFADB4MQswCQYDVQQGEwJVUzEXMBUGA1UEChMOTWVkaWNhU29mdCBMTEMxJDAiBgNVBAsTG01lZGljYVNvZnQgRGlyZWN0IE1lc3NhZ2luZzEqMCgGA1UEAxMhTWVkaWNhU29mdCBEaXJlY3QgSW50ZXJtZWRpYXRlIENBMB4XDTE3MDMyNzAwMDAwMFoXDTIwMDMyNTEyMDAwMFowcDELMAkGA1UEBhMCVVMxCzAJBgNVBAgTAmNhMREwDwYDVQQHEwhvcm92aWxsZTEaMBgGA1UEChMRT3JvdmlsbGUgSG9zcGl0YWwxJTAjBgNVBAMTHHBhdGllbnQub3JvdmlsbGVob3NwaXRhbC5vcmcwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDDfDQVaVJvMBQvJopni912U5BV+1hvu0pqbt93zBn6zoXgwvmhSKO12gYJwXjZTj2PfFRUO4XJfKHAIKy5uwEmOAhhpSeydj/7wmZ+RDYFrQQ5b1KtNVidP9a/jK4JZ0d4TvujsPsg+YosvSRuClepyyNTwjoi8Vv1g2O3dI7psbwxjIDrgYWeZYBiaOVqid+T9TFH3vZMyk58oRwuGo5zD1s3zMeRPRD3guGaNNd+seVc5KcY3JonKENx9WiUAqmbTp0iaObXfHhlAYUSn6dJBX9PDoVuljyISwzddO0y77hO9eIptp5jJs0BQDV/A4NCrvMZSO6BgEjm2981ou0fAgMBAAGjggH7MIIB9zAfBgNVHSMEGDAWgBQ9scQOTn6Xe6VvhZLgyJaMQqsIljAdBgNVHQ4EFgQU7HcQaiKbejEKfdHBMuYzmq5Y+sUwJwYDVR0RBCAwHoIccGF0aWVudC5vcm92aWxsZWhvc3BpdGFsLm9yZzAOBgNVHQ8BAf8EBAMCBaAwEwYDVR0lBAwwCgYIKwYBBQUHAwQwgZEGA1UdHwSBiTCBhjBBoD+gPYY7aHR0cDovL2NybDMuZGlnaWNlcnQuY29tL01lZGljYVNvZnREaXJlY3RJbnRlcm1lZGlhdGVDQS5jcmwwQaA/oD2GO2h0dHA6Ly9jcmw0LmRpZ2ljZXJ0LmNvbS9NZWRpY2FTb2Z0RGlyZWN0SW50ZXJtZWRpYXRlQ0EuY3JsMEIGA1UdIAQ7MDkwDQYLKwYBBAGCwVsAAQIwDAYKKwYBBAGCwVsBAzAMBgpghkgBhv1sBAMCMAwGCisGAQQBgsFbAgEwgYAGCCsGAQUFBwEBBHQwcjAkBggrBgEFBQcwAYYYaHR0cDovL29jc3AuZGlnaWNlcnQuY29tMEoGCCsGAQUFBzAChj5odHRwOi8vY2FjZXJ0cy5kaWdpY2VydC5jb20vTWVkaWNhU29mdERpcmVjdEludGVybWVkaWF0ZUNBLmNydDAMBgNVHRMBAf8EAjAAMA0GCSqGSIb3DQEBCwUAA4IBAQBXbY1mDhh2lxYkQFK9cuu3R8Lu+I7Dcz9yS1t0FBIoajkOkzGzHEFZKOwanGEDV6HgfG3d3cwMvxXwlzZ0X9L56YZQslt4hAW9iEi/exc6aW/7e+lU8Hlf/fk4P28yyQqvwKkcIv5jNJ+g8y3ieiIAjkNINe3aTXXLNF4LsYgp3xJypXPyv94kuGb0kv/JR2AhiMr4PAo3GO05N4xQSgE0dG8TpaVBJfBJVvRoJ/8OhFs1wKlVzn0l46/bapA9j2QjRBMeyTx8epP1uvTadmVxkatsw/tiyN+AehMkKtQFd0XviWeTYUbFr3gdEAR3y5IHK/KvMgw04iXEQK/Iyhyu
	mail: patient.orovillehospital.org
	cn: patient.orovillehospital.org

	dn: cn=provider.orovillehospital.org,ou=direct,dc=orovillehospital,dc=org
	objectClass: inetOrgPerson
	sn: provider.orovillehospital.org
	userCertificate;binary:: MIIFcTCCBFmgAwIBAgIQDyH0zOcLZLNK+ZQpE9qU1jANBgkqhkiG9w0BAQsFADB4MQswCQYDVQQGEwJVUzEXMBUGA1UEChMOTWVkaWNhU29mdCBMTEMxJDAiBgNVBAsTG01lZGljYVNvZnQgRGlyZWN0IE1lc3NhZ2luZzEqMCgGA1UEAxMhTWVkaWNhU29mdCBEaXJlY3QgSW50ZXJtZWRpYXRlIENBMB4XDTE3MDMyNzAwMDAwMFoXDTIwMDMyNTEyMDAwMFowcTELMAkGA1UEBhMCVVMxCzAJBgNVBAgTAmNhMREwDwYDVQQHEwhvcm92aWxsZTEaMBgGA1UEChMRT3JvdmlsbGUgSG9zcGl0YWwxJjAkBgNVBAMTHXByb3ZpZGVyLm9yb3ZpbGxlaG9zcGl0YWwub3JnMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtqusTCZynzePv3pvwLaYPsFgIz2QdCAXYFoXaphDfM3kmfjTOKM0pRhHrIiheC5kum8WtIFVA3FPG0DDF5oDSwHA1zVVRotQC4WrpMPKvpESsNuUPUETYd8JQ8aqMmkSrzI9aYwsqtFSdXAYCNgmtfXp6lNuWOR4nOtIeaPN2+keDrW4sgx/culULFYDXCPtlfy3mGM3SEd9S5DPt0HfroPtbL92ma9MrCSc49R9ukyE2OihEMDuTEIjo5vGnJrzjcnTsIYU5V44V9hL2EpnWh2zzQ1J33BSrZQJauLssNUcmeKL4SD2AvO36bZ2/kIu9MvtYgPPu2H05rbruHqutQIDAQABo4IB/DCCAfgwHwYDVR0jBBgwFoAUPbHEDk5+l3ulb4WS4MiWjEKrCJYwHQYDVR0OBBYEFLF33gDDWIHl+Ff6vIDoIMXj6QGzMCgGA1UdEQQhMB+CHXByb3ZpZGVyLm9yb3ZpbGxlaG9zcGl0YWwub3JnMA4GA1UdDwEB/wQEAwIFoDATBgNVHSUEDDAKBggrBgEFBQcDBDCBkQYDVR0fBIGJMIGGMEGgP6A9hjtodHRwOi8vY3JsMy5kaWdpY2VydC5jb20vTWVkaWNhU29mdERpcmVjdEludGVybWVkaWF0ZUNBLmNybDBBoD+gPYY7aHR0cDovL2NybDQuZGlnaWNlcnQuY29tL01lZGljYVNvZnREaXJlY3RJbnRlcm1lZGlhdGVDQS5jcmwwQgYDVR0gBDswOTANBgsrBgEEAYLBWwABAjAMBgorBgEEAYLBWwEDMAwGCmCGSAGG/WwEAwIwDAYKKwYBBAGCwVsCATCBgAYIKwYBBQUHAQEEdDByMCQGCCsGAQUFBzABhhhodHRwOi8vb2NzcC5kaWdpY2VydC5jb20wSgYIKwYBBQUHMAKGPmh0dHA6Ly9jYWNlcnRzLmRpZ2ljZXJ0LmNvbS9NZWRpY2FTb2Z0RGlyZWN0SW50ZXJtZWRpYXRlQ0EuY3J0MAwGA1UdEwEB/wQCMAAwDQYJKoZIhvcNAQELBQADggEBAB3DaS/39NwoUweOwXs1fX6tD+xzP0xHTo8Rbpt226Ml2OICMD6nt5RGSpCLp3DrvokeTOSbWyYrIK8SuYi4utImFfLHMMRXTKTRTPtDP2sHTL5o8d92eDz7Q0EG67kiOm2pwJC8SPEVtRFfpv1kOPB01xtpWJgoQboMTXhSNO4YAu/z48B//h+hb7yRPqWVeDkd/8R94r/9pnZdjM7OzwH0KS+3e+GThtXBIVEe7Slqch+y6lBIl7RW6r9W9gx8gu2Mh9Wzd8hB0mcPsLP2zsNPrZy578bjaplk03dbDtcMGdLRSA4mt1MKu8c18n3HkrUQYvLL8C57wttq+RLbQck=
	mail: provider.orovillehospital.org
	cn: provider.orovillehospital.org
ldapadd -x -D cn=Manager,dc=orovillehospital,dc=org -W -f basedomain.ldif



ldapsearch -x -b "" -s base "(objectclass=*)" namingContexts
ldapsearch -x -b dc=orovillehospital,dc=org -s sub "(mail=patient.orovillehospital.org)" userCertificate
