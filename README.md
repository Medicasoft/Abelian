
Abelian
=========

This is a scalable production ready version of NHIN Direct.

High Level Overview
===================
Abelian aims to be a high performance, scalable and secure implementation of the Direct Protocol. As such, the main goals were to use best of breed technologies that were already proved in practice as well as to keep the whole design as simple as possible.

The main building blocks we have chosen are:
-	PowerDNS is a high performance authoritative DNS server featuring a large number of database backends. Most importantly it supports CERT queries as well as native database replication.
-	Postfix is a well-known secure mail transfer agent. Built with security in mind it is a modular application easy to be customized through the use of external plugins.
-	PostgreSQL is an advanced cross-platform object-relational database management system. It is ACID compliant, supports transactions and features multiversion concurrency control. It also supports binary replication.
-	Node.js is a JavaScript platform for scalable network applications.

The system architecture is depicted in the following figure:

![Architecture](https://github.com/Medicasoft/Abelian/blob/master/img/abelian_direct.png)

The DNS subsystem
===========
The DNS server (PowerDNS) resolves DNS queries addressed to the Abelian application. Most important, it answers CERT queries returning the public certificate keys owned by a specific user or by the email domain. The Abelian Direct implementation returns certificates in the PKIX format (x509 certificate return in the response payload).

The DNS records are stored in a PostgreSQL database and can be administered through the RESTful API. By default the DNS server is set up to use PostgreSQL’s native database replication to enable load balancing between multiple machines.

The e-mail subsystem
===========
Receiving Direct messages
----------
The backbone of the e-mail subsystem is the postfix SMTP server. It features a number of modules, each performing a specific task. The smtpd daemon receives mail using the SMTP protocol. It can be configured to perform an initial filter based on domain blacklists, reverse DNS lookup and so on. The message is then handed over to the cleanup process who will process the message headers, extracting the message recipients, doing address rewriting, etc. The message is then passed to the qmgr daemon who will add it to the incoming queue and arrange for its delivery through one of many delivery daemons (pipe, local, smtp, virtual, lmtp).

Postfix is configured with a virtual mailbox map backed by the PostgreSQL database. Mailboxes management is done through the RESTful API.

Various content filters can be inserted in the processing pipeline both before and after the message queuing (spam filters, virus filters, etc.). 

The Abelian application features a mail delivery agent implemented as a shell script executed by the pipe delivery daemon. As per the Direct Protocol specification, this filter will:
-	Retrieve the recipient’s certificate private key
-	Decrypt the incoming e-mail
-	Verify the message signature (message hash check, sender certificate validation)
-	Upload the original and decrypted message to the PostgreSQL backend.
-	Compose the MDN response (see next chapter for details on how they are sent).

Sending Direct messages
----------
Outbound e-mails are received by POST-ing to the /Message endpoint of the RESTful API. They should be formatted as MIME 1.0 messages. The node.js application will extract the sender and recipient addresses then it will resolve the recipient’s encryption certificate (through DNS CERT queries or DNS SRV/LDAP query). Then it signs and encrypts the message and finally it forwards it to the postfix  sendmail utility. The message is picked by the pickup daemon and then it goes through the same pipeline as the inbound messages (cleanup, qmgr, content filters). The queue manager daemon will try to deliver it using the smtp delivery process. 

The RESTful API
===========
Sending and receiving Direct messages as well as managing the Abelian configuration is done through a REST based API. This component is written in JavaScript and hosted by a node.js server. It features a low latency asynchronous interface to the Abelian Direct application functionality.

It interacts with the database backends that service the DNS and SMTP services. It also does message processing for the outbound e-mails.

