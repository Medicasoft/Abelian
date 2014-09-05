
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


