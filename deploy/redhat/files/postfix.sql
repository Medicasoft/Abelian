CREATE TABLE IF NOT EXISTS users
(
  id serial NOT NULL,
  address character varying NOT NULL,
  userName character varying,
  domain character varying,
  certificate bytea,
  active boolean DEFAULT 't',
  CONSTRAINT pk PRIMARY KEY (id)
)
WITH (
  OIDS=FALSE
);

ALTER TABLE users
    OWNER TO direct;

CREATE UNIQUE INDEX address_lower_index on users (lower(address));

ALTER INDEX address_lower_index
    OWNER TO direct;

-- users trigger on address insert or update
    
CREATE OR REPLACE FUNCTION setUserDetails() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  userNameP varchar(100);
  domainP varchar(100);
  address varchar(200);
  i int;
BEGIN
  address := NEW.address;  
  i := position('@' in address);    
  userNameP := substring(address from 0 for i);
  domainP := substring(address from i+1);

  UPDATE users SET userName=userNameP, domain=domainP WHERE id=NEW.id;
  
  RETURN NEW;
END
$$;


DROP TRIGGER IF EXISTS userAddressTrigger on users;

CREATE TRIGGER userAddressTrigger AFTER INSERT OR UPDATE OF address ON users
FOR EACH ROW EXECUTE PROCEDURE setUserDetails();
  



CREATE TABLE IF NOT EXISTS messages
(
  id serial NOT NULL,
  queue_id character varying,
  original text,
  msg text,
  recipient character varying,
  sender character varying,
  domain character varying,
  guid uuid,
  processing_started timestamp,
  CONSTRAINT id PRIMARY KEY (id)
)
WITH (
  OIDS=FALSE
);

ALTER TABLE messages
    OWNER TO direct;


CREATE OR REPLACE FUNCTION get_and_lock_next_messages(count integer, message_domains character varying[], lock_message boolean, processingExpiryAge integer)
  RETURNS table(id integer, recipient character varying, sender character varying, guid uuid) AS
$BODY$
BEGIN
  if not lock_message then
    return query
      select m.id, m.recipient, m.sender, m.guid
      FROM messages m
      WHERE m.domain = any(message_domains)
      and (processing_started is null or
           age(LOCALTIMESTAMP, processing_started) > processingExpiryAge * interval '1 second')
      ORDER BY m.id
      LIMIT count;
    return;
  end if;

  --reset expired processing timestamps
  UPDATE messages m SET processing_started = null WHERE m.domain = any(message_domains) and age(LOCALTIMESTAMP, processing_started) > processingExpiryAge * interval '1 second';

  --get unallocated messages and set processing timestamp
  return query
    with ids as (
      select m.id FROM messages m WHERE m.domain = any(message_domains) and processing_started is null ORDER BY m.id LIMIT count
    ),
    updated as (
        update messages m SET processing_started = LOCALTIMESTAMP WHERE m.id in (select * from ids) returning  m.id, m.recipient, m.sender, m.guid
    )
    select *
    from updated
    ORDER BY id;
END
$BODY$
LANGUAGE plpgsql;




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
    
CREATE TABLE IF NOT EXISTS bundles
(
  id serial NOT NULL,
  local_domain_name character varying NOT NULL,
  url character varying NOT NULL,
  interval integer NOT NULL,
  last_run timestamp,
  CONSTRAINT bundles_pk PRIMARY KEY (id)
)
WITH (
  OIDS=FALSE
);

ALTER TABLE bundles
OWNER TO direct;

CREATE TABLE IF NOT EXISTS anchors
(
  id serial NOT NULL,
  local_domain_name character varying NOT NULL,
  domain_name character varying NULL,
  cert character varying NOT NULL,
  CONSTRAINT anchors_pk PRIMARY KEY (id)
)
WITH (
  OIDS=FALSE
);

ALTER TABLE anchors
OWNER TO direct;