CREATE TABLE IF NOT EXISTS users
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

