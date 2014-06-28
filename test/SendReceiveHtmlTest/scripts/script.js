var baseUrl = 'http://abelian.medicasoft.us:8085/';
var senderMailDomain = 'abelian.medicasoft.us';

var sendMessageUrl = baseUrl + 'Message'; //POST
var listMessagesUrl = baseUrl + 'Messages'; //GET
var getMessageUrl = baseUrl + 'Message/'; //GET

//on document ready    
$(function () 
{
    //handlers
    $('#sendBtn').click(sendMessage);
    $('#getMessagesBtn').click(getMessages);     
    $('#messagesTable tbody').on('click', 'tr', getMessage); //display message on row click
    $('#sendPane input[type=radio]').click(toogleMsgContent);    
    
    //get messages on page load;
    getMessages();  
    
});

function toogleMsgContent(){
    $('#sendPane fieldset').attr('disabled', 'true'); //disable all fieldsets
    $('#' + $(this).attr('id') + 'Fieldset').removeAttr('disabled'); //enable this fieldset
}

function sendMessage(event) {
    var to = $('#to').val();
    var from = $('#from').val();
    
    if(to === undefined || to === "" || from === undefined || from === ""){
        log('To and From are mandatory!');
        return;
    }        
    
    var checked = $('input[name=messageType]:checked');
    if(checked.length == 0) {
      log('Please select a message type - File or Text!');
      return;
    }        
    if($(checked[0]).val() == 'text') {
        var content = $('#messageBodyText').val();
        composeMessage(from, to, content);
    }
    else if($(checked[0]).val() == 'file') {
        var files = $('#messageBodyFile')[0].files;
        if(files.length === 0) {
            log('Please select a file!');
            return;
        }
        readMessage(files[0]);
    }
    
}

function composeMessage(from, to, content) {
    log('Composing message...');
    var data = '';
    data += 'from:<' + from + '>\n';
    data += 'to:<' + to + '>\n';
    data += "Message-ID: <" + Date.now() + "@" + senderMailDomain +">\n";
    data += "Date: " + "Fri, 27 Jun 2014 14:03:22 +0300\n"; //todo
    data += '\n';
    data += content;
    
    doSendMessage(data);
}

function doSendMessage(data) {
    log('Sending message...');
    $.post(sendMessageUrl, data)
    .done(function(data, textStatus, xhr) {
        log('Sent message with HTTP response status code = ' + xhr.status);    
    })
    .fail(function(jqXHR) {
        log('Send message returned HTTP status code: ' + jqXHR.status + ' body: ' + jqXHR.responseText);
        
    }); 
}

function readMessage(file) {
    log('Reading file...');
    var reader = new FileReader();

    reader.readAsText(file);
    $(reader).on('load', function(e) {      
        doSendMessage(e.target.result);        
    });
        
}

function getMessages() {
    log('Getting messages...');
    $.get(listMessagesUrl)
    .done(function(data) {
        log('Get messages returned ' + data.totalResults + ' messages');    
        $('#messagesTable tbody').empty();        
        for(var i in data.entry) {
            var newRow =  $('<tr><td>'+data.entry[i].id+'</td><td>'+data.entry[i].to+'</td></tr>');
            newRow.data('link', data.entry[i].id);
            $('#messagesTable tbody').append(newRow);
        }
    })
    .fail(function(jqXHR) {
        log('Get messages returned HTTP status code: ' + jqXHR.status + ' body: ' + jqXHR.responseText);
    });
}

function getMessage() {    
    var link = $(this).data('link');
    $.get(link)
    .done(function(data) {
        log('Get message successfully for id=' + link);
        $('#messagePane').show();
        $('#messageDetailsBody').empty().append(data);
        $('#messageDetailsId').empty().append(link);
    })
    .fail(function(jqXHR) {
        log('Get message returned HTTP status code: ' + jqXHR.status + ' body: ' + jqXHR.responseText);
    });  
}

function deleteMessage() {
    $.delete($(this).data('link'), function(data) {    
        log('Delete message ' + $(this).data('link'));
    });  
}

function log(message) {
    //$('#sendLog').empty();
    var date = moment().format("YYYY-MM-DD HH:mm:ss"); 
    $('#sendLog').append('['+ date + '] ' + message);
    $('#sendLog').append('\n');
    $('#sendLog').scrollTop($('#sendLog')[0].scrollHeight);
}

