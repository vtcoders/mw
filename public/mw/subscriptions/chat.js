
(function () {

    var mw =  mw_getScriptOptions().mw;

    var ul_messages = document.createElement('ul');
    var button = document.createElement('A');
    button.href = '#';
    button.appendChild(document.createTextNode('Chat'));
    // TODO: could be prettier.
    document.body.appendChild(button);
    button.title = 'chat';
    var div = document.createElement('div');
    div.innerHTML = '<h2>Chat</h2>\n';
    div.appendChild(ul_messages);
    var input = document.createElement('textarea');
    div.appendChild(input);
    input.autofocus = true;

    //mw_addPopupDialog(div, button);

    button.onclick = function(e) {
        mw_addPopupDialog(div, button);
    };


    /* Get a named subscription: create it if it does not exist yet. */
    var s = mw.getSubscription(

        'chat'/*unique subscription name*/,
        'simple_chat'/*shortName*/,
        'simple chat'/*description*/,

        /* subscription creator initialization */
        function() {

            // We start with this initial value for this subscription
            this.write('<em>' + mw.user + "</em> created chat");
        },

        /* subscription reader */
        function(message) {

            var li = document.createElement('li');
            li.innerHTML = message;
            ul_messages.appendChild(li);
        }

        /*TODO: No Cleanup function yet*/
    );

    s.write('<em>' + mw.user + '</em> joined chat session');

    input.oninput = function() {
        s.write('<em>' + mw.user + '</em> ' + input.value);
    };


    // TODO: add input widget and handler callback that does 

})();
