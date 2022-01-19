CREATE TABLE IF NOT EXISTS users
(
  id serial NOT NULL,
  address character varying(300) NOT NULL,
  userName character varying(100),
  password character varying(200),
  domain character varying(300),
  certificate blob,
  active boolean DEFAULT true,
  CONSTRAINT pk PRIMARY KEY (id)
);


CREATE UNIQUE INDEX IF NOT EXISTS address_index on users (address);


-- users trigger on address insert or update
DELIMITER //
CREATE OR REPLACE PROCEDURE processAddress(
	IN address character varying(300),
	OUT userNameP varchar(100),
	OUT domainP varchar(100)
)
BEGIN
	DECLARE i int;

	SET i := position('@' in address);
	SET userNameP := substring(address from 1 for i-1);
	SET domainP := substring(address from i+1);
END; //
DELIMITER ;


delimiter //
CREATE OR REPLACE TRIGGER userAddressTriggerInsert BEFORE INSERT ON users
FOR EACH ROW
BEGIN
	DECLARE userNameP varchar(100);
	DECLARE domainP varchar(100);

   CALL processAddress(NEW.address, userNameP, domainP);
   SET NEW.userName := userNameP;
   SET NEW.domain := domainP;
END; //
delimiter ;

delimiter //
CREATE OR REPLACE TRIGGER userAddressTriggerUpdate BEFORE UPDATE ON users
FOR EACH ROW
BEGIN
	DECLARE userNameP varchar(100);
	DECLARE domainP varchar(100);

	IF new.address <> old.address then

	   CALL processAddress(NEW.address, userNameP, domainP);
	   SET NEW.userName := userNameP;
	   SET NEW.domain := domainP;
	end if;
END; //
delimiter ;


CREATE TABLE IF NOT EXISTS messages
(
  id serial NOT NULL primary key,
  queue_id character varying(200),
  original longtext,
  msg longtext,
  recipient character varying(200),
  sender character varying(200),
  domain character varying(200),
  guid character varying(36),
  processing_started timestamp NULL
);


DELIMITER //
CREATE OR REPLACE PROCEDURE get_and_lock_next_messages(
    IN count integer,
    IN message_domain character varying(500),
    IN lock_message boolean,
    IN processingExpiryAge integer
)
BEGIN
if not lock_message then
    select m.id, m.recipient, m.sender, m.guid
      FROM messages m
      WHERE m.domain = message_domain
      and (processing_started is null or
           TIMESTAMPDIFF(SECOND, processing_started, LOCALTIMESTAMP) > processingExpiryAge)
      ORDER BY m.id
      LIMIT count;
else
  UPDATE messages m SET processing_started = null WHERE m.domain = message_domain and TIMESTAMPDIFF(SECOND, processing_started, LOCALTIMESTAMP) > processingExpiryAge;

  create temporary table ids
    select m.id FROM messages m WHERE m.domain = message_domain and processing_started is null ORDER BY m.id LIMIT count for update;

  update messages m SET processing_started = LOCALTIMESTAMP WHERE m.id in (select * from ids);

  select m.id, m.recipient, m.sender, m.guid
	 from messages m
	 where m.id in (select * from ids)
	 ORDER BY id;

  drop temporary table ids;
end if;
END; //
DELIMITER ;


CREATE TABLE IF NOT EXISTS domains
(
  id serial NOT NULL primary key,
  name character varying(200) NOT NULL,
  anchor_path character varying(200),
  crl_path character varying(200),
  crypt_cert blob,
  cert_disco_algo integer NOT NULL DEFAULT 0,
  active boolean DEFAULT true,
  is_local boolean DEFAULT true,
  CONSTRAINT domains_unique_name UNIQUE (name)
);


# privileges
# grant on everything created

CREATE OR REPLACE USER direct IDENTIFIED BY '<PASSWORD_HERE>';
GRANT ALL PRIVILEGES ON maildb.* TO 'direct';

CREATE OR REPLACE USER postfix Identified by '<PASSWORD_HERE>';
GRANT SELECT ON maildb.domains TO 'postfix';
GRANT SELECT ON maildb.users TO 'postfix';

FLUSH PRIVILEGES;

