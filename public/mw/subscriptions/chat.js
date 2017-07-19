
(function () {

    var ul_messages = document.createElement('ul');
    var div;

    var button = document.createElement('A');
    button.href = '#';
    button.appendChild(document.createTextNode('Chat'));
    // TODO: could be prettier.
    document.body.appendChild(button);
    button.title = 'chat';
    div = document.createElement('div');
    div.innerHTML = '<h2>Chat</h2>\n';
    div.appendChild(ul);

  
    mw_addPopupDialog(div, button);

    button.onclick = function(e) {
        mw_addPopupDialog(div, button);
    };


    /* Get a named subscription: create it if it does not exist yet. */
    var subscription = mw.getSubscription('chat',

        /* subscription creator initialization */
        function() {

            // We start with this initial value for this subscription
            this.write('<em>' + mw.user + "</em> started chat session");
        },

        /* subscription reader */
        function(message) {

            var li = document.createElement('li');
            li.innerHTML = message;
            ul_messages.appendChild(li);
        },

        /* Cleanup function */
        function() {
            groupNode.parentNode.removeChild(groupNode);
        }
    );

    // TODO: add input widget and handler callback that does 

})();
