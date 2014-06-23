var baseUrl = 'http://localhost:8085/';
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
        log('Send message returned HTTP status code: ' + jqXHR.status);
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
        log('Get messages returned ' + data.count + ' messages');    
        $('#messagesTable tbody').empty();
        for(var i in data.messages) {
            var newRow =  $('<tr><td>'+data.messages[i].id+'</td><td>'+data.messages[i].to+'</td></tr>');
            newRow.data('link', data.messages[i].id);
            $('#messagesTable tbody').append(newRow);
        }
    })
    .fail(function(jqXHR) {
        log('Get messages returned HTTP status code: ' + jqXHR.status);
    });
}

function getMessage() {    
    var link = $(this).data('link');
    $.get(link, function(data) {
        log('Get message successfully for id=' + link);
        $('#messagePane').show();
        $('#messageDetailsBody').empty().append(data);
        $('#messageDetailsId').empty().append(link);
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

