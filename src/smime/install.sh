#!/usr/bin/env bash

# Copyright 2014 MedicaSoft LLC USA and Info World SRL 
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
# 
# http://www.apache.org/licenses/LICENSE-2.0
# 
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

DOMAIN=abelian.example.com
MAIL_DOMAIN=direct.abelian.example.com
EXTERNAL_IP=10.0.0.1
SPOOL=/var/spool/direct
#start installation
apt-get update
sudo apt-get install -y unzip
#install PostgreSQL
apt-get install -y postgresql postgresql-contrib
apt-get install -y python-psycopg2
#install PowerDNS
apt-get install -y pdns-server
DEBIAN_FRONTEND=noninteractive apt-get install -y pdns-backend-pgsql
pdns-server
#install postfix
debconf-set-selections <<< "postfix postfix/mailname string $MAIL_DOMAIN"
debconf-set-selections <<< "postfix postfix/main_mailer_type string 'Internet Site'"
apt-get install -y postfix
apt-get install -y postfix-pgsql
#install node.js
apt-get install -y nodejs npm nodejs-legacy
npm install -g forever
#create direct user
groupadd direct
useradd -d $SPOOL -g direct direct
mkdir $SPOOL
mkdir $SPOOL/ca
mkdir $SPOOL/crl
mkdir $SPOOL/tmp
mkdir $SPOOL/api
chown -R direct:direct $SPOOL
chmod -R 770 $SPOOL
#generate server certificates
#--- DO NOT USE SELF-SIGNED CERTS IN PRODUCTION ---
#ca
openssl genrsa -out $SPOOL/ca/ca.key 2048
openssl req -new -x509 -days 365 -subj '/CN='$DOMAIN -key $SPOOL/ca/ca.key -out $SPOOL/ca/ca.pem
#mail root
openssl genrsa -out $SPOOL/ca/direct.key 2048
openssl req -new -subj '/CN='$MAIL_DOMAIN -key $SPOOL/ca/direct.key -out $SPOOL/ca/direct.csr
openssl x509 -req -days 365 -in $SPOOL/ca/direct.csr -CA $SPOOL/ca/ca.pem -CAkey $SPOOL/ca/ca.key -set_serial 1 -out $SPOOL/ca/direct.pem -setalias "Self Signed SMIME" -addtrust emailProtection -addreject clientAuth -addreject serverAuth -trustout
cp $SPOOL/ca/ca.pem /vagrant/
CERT="$(openssl x509 -in $SPOOL/ca/direct.pem -modulus | awk '
 BEGIN {ORS=" ";OFS=" ";PKIX=1;RSASHA1=5}
 {
   #PKIX tagkey RSASHA1 – where tagkey is the decimal value of
   #the last two bytes of the modulus
   if(NR==1) printf("%d %d %d ",PKIX,strtonum("0x" substr($0,length($0)-3)),RSASHA1); 
   #skip –--BEGIN CERTIFICATE-----
   if(NR>3) print l;
     l=$0;
}')"
#get trust bundle
cd $SPOOL/crl
wget -O bbplus.p7b https://secure.bluebuttontrust.org/p7b.ashx?id=4d9daaf9-384a-e211-8bc3-78e3b5114607
openssl pkcs7 -print_certs -in bbplus.p7b -inform der -out bbplus.cer
rm bbplus.p7b
#configure PowerDNS
su - postgres << EOF
psql -d pdns -c "INSERT INTO domains(name,type) VALUES('$DOMAIN', 'NATIVE');"
psql -d pdns -c "INSERT INTO records(domain_id,name,type,content,ttl) VALUES(1,'$DOMAIN','SOA','ns1.$DOMAIN',300);"
psql -d pdns -c "INSERT INTO records(domain_id,name,type,content,ttl) VALUES(1,'$DOMAIN','NS','ns1.$DOMAIN',300);"
psql -d pdns -c "INSERT INTO records(domain_id,name,type,content,ttl,prio) VALUES(1,'$MAIL_DOMAIN','MX','smtp.$DOMAIN',300,10);"
psql -d pdns -c "INSERT INTO records(domain_id,name,type,content,ttl) VALUES(1,'$DOMAIN','A','$EXTERNAL_IP',300);"
psql -d pdns -c "INSERT INTO records(domain_id,name,type,content,ttl) VALUES(1,'ns1.$DOMAIN','A','$EXTERNAL_IP',300);"
psql -d pdns -c "INSERT INTO records(domain_id,name,type,content,ttl) VALUES(1,'smtp.$DOMAIN','A','$EXTERNAL_IP',300);"
psql -d pdns -c "INSERT INTO records(domain_id,name,type,content,ttl) VALUES(1,'$MAIL_DOMAIN','CERT','$CERT',300);"
EOF
rm /etc/powerdns/pdns.d/pdns.simplebind.conf
/etc/init.d/pdns restart
pdnssec rectify-zone $DOMAIN
#configure postfix
#create users database
su - postgres << EOF
createuser -S -D -R -E direct
createdb -O direct maildb
psql -d maildb -c "
	CREATE TABLE users
	(
	  id serial NOT NULL,
	  address character varying,
	  certificate character varying,
	  CONSTRAINT pk PRIMARY KEY (id)
	)
	WITH (
	  OIDS=FALSE
	);
	ALTER TABLE users
		OWNER TO direct;
	CREATE TABLE messages
	(
	  id serial NOT NULL,
	  queue_id character varying,
	  original text,
	  msg text,
	  recipient character varying,
	  sender character varying,
	  CONSTRAINT id PRIMARY KEY (id)
	)
	WITH (
	  OIDS=FALSE
	);
	ALTER TABLE messages
		OWNER TO direct;
"
EOF
cp /home/ubuntu/install/rx.sh /var/spool/direct/rx.sh
cp /home/ubuntu/install/to_db /var/spool/direct/to_db
chown direct:direct /var/spool/direct/rx.sh
chown direct:direct /var/spool/direct/to_db
chmod 770 /var/spool/direct/rx.sh
chmod 770 /var/spool/direct/to_db
postconf -e 'mailbox_transport = direct-rx'
postconf -M direct-rx/unix='direct-rx unix - n n - - pipe flags=RXq user=direct argv=/var/spool/direct/rx.sh ${queue_id} ${recipient} ${sender}'
/etc/init.d/postfix reload
#install REST API
cp /home/ubuntu/install/api/* $SPOOL/api/
cd $SPOOL/api
npm install
su - direct << EOF
forever start api/.
EOF