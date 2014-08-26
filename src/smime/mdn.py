#!/usr/bin/env python

""" Copyright 2014 MedicaSoft LLC USA and Info World SRL
Licensed under the Apache License, Version 2.0 the "License";
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
"""

from email.message import Message
import email.utils, time, random

NOTIFICATION = """
Reporting-UA: ; Abelian\r\nFinal-Recipient: rfc822;%s\r\nOriginal-Message-ID: %s\r\nDisposition: automatic-action/MDN-sent-automatically;processed
"""

def make_mdn(sender, recipient, orig_message_id, subject):
    domain = sender.partition('@')[2]

    msg = Message()
    msg['MIME-Version'] = '1.0'
    msg['content-type'] = 'multipart/report; report-type=disposition-notification'
    msg['From'] = '<%s>' % sender
    msg['To'] = '<%s>' % recipient
    msg['Date'] = email.utils.formatdate()
    msg_id = '<%d.%s@%s>' % (time.time(), str(random.getrandbits(64)), domain)
    msg['Message-ID'] =  msg_id
    msg['Subject'] = 'Processed: %s' % subject

    txt = Message()
    txt.set_payload('Your message was successfully processed.')
    msg.attach(txt)

    dn = Message()
    dn['Content-Type'] = 'message/disposition-notification'
    dn['Content-Transfer-Encoding'] = '7bit'
    dn.set_payload(NOTIFICATION % (sender,orig_message_id))
    msg.attach(dn)

    return msg_id, msg.as_string()
