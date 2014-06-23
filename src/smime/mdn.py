#!/usr/bin/env python
from email.message import Message
import email.utils, time, random

NOTIFICATION = """
Reporting-UA: ; Abelian\r\nDisposition: automatic-action/MDN-sent-automatically;processed\r\nOriginal-Message-ID: %s\r\nFinal-Recipient: rfc822;%s
"""

def make_mdn(sender, recipient, orig_message_id, subject):
    domain = sender.partition('@')[2]

    msg = Message()
    msg['content-type'] = 'multipart/report; report-type=disposition-notification'
 
    txt = Message()
    txt['Content-Type'] = 'text/plain'
    txt['Content-Transfer-Encoding'] = '7bit'
    txt.set_payload('Your message was successfully processed.')
    msg.attach(txt)

    dn = Message()
    dn['Content-Type'] = 'message/disposition-notification'
    dn['Content-Transfer-Encoding'] = '7bit'
    dn.set_payload(NOTIFICATION % (orig_message_id, sender))
    msg.attach(dn)

    return 0, msg.as_string()
