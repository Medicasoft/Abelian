#!/bin/sh
SPOOL=/var/spool/direct
TEMPDIR=$SPOOL/tmp
CADIR=$SPOOL/ca
CRLDIR=$SPOOL/crl
TEMPFAIL=75
UNAVAILABLE=69
QUEUE_ID=$1
RECIPIENT=$2
SENDER=$3
cd $TEMPDIR || { echo $TEMPDIR unavailable; exit $TEMPFAIL; }
trap "rm -f *.$$" 0 1 2 3 15
cat >in.$$
#psql -d dbmail -c "\copy (SELECT certificate FROM users WHERE address = '$RECIPIENT') to cert.$$;"
/usr/bin/openssl cms -decrypt -in in.$$ -recip $CADIR/direct.pem -inkey $CADIR/direct.key >sign.$$ || { echo Decryption failed; exit $TEMPFAIL; }
#mail from healthvault seems to have a invalid signature (missing CRLF ?)
/usr/bin/openssl cms -verify -in sign.$$ -out out.$$ -CApath $CRLDIR -noverify || { echo Verification failed; exit $TEMPFAIL; }
$SPOOL/to_db $QUEUE_ID $RECIPIENT $SENDER in.$$ out.$$

exit $?