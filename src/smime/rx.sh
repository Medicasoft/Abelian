#!/bin/sh

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