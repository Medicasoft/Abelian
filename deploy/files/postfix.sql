CREATE TABLE IF NOT EXISTS users
(
  id serial NOT NULL,
  address character varying NOT NULL UNIQUE,
  certificate bytea,
  active boolean,
  CONSTRAINT pk PRIMARY KEY (id)
)
WITH (
  OIDS=FALSE
);

ALTER TABLE users
    OWNER TO direct;
  
  
CREATE TABLE IF NOT EXISTS messages
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

    
CREATE TABLE IF NOT EXISTS domains
(
  id serial NOT NULL,
  name character varying NOT NULL UNIQUE,
  anchor_path character varying,
  crl_path character varying,
  crypt_cert bytea,
  cert_disco_algo integer NOT NULL DEFAULT 0,
  active boolean DEFAULT 't',
  is_local boolean DEFAULT 't',
  CONSTRAINT domains_pk PRIMARY KEY (id),
  CONSTRAINT domains_unique_name UNIQUE (name)
)
WITH (
  OIDS=FALSE
);

ALTER TABLE domains
OWNER TO direct;