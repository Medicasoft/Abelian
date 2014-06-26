#!/usr/bin/env python
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
