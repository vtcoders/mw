/** @file
 *
 * This javaScript codes loads a very simple world and a simple  {@link
 * MW#getSubscription subscription}.
 *
 * @namespace file_test_simpleSubscription
 */


(function() {

    var prefix = mw_getScriptOptions().prefix;

    // Our very simple test world:
    mw_addActor(prefix + 'plane.x3d');
    mw_addActor(prefix + 'gnome.x3d');

    mw_addActor(prefix + '../subscriptions/chat.js');

    /* Get a named subscription: create it if it does not exist yet. */
    var s = mw.getSubscription(

        'hello'/*unique subscription name*/,
        'simple_named_subscription'/*short description*/,
        'simple subscription that writes to the console.log()'/*description*/,

        /* subscription creator initialization */
        function() {

            console.log('We made the named subscription: ' +
                    this.name, 

            // We start with this initial value for this subscription
            this.write(mw.user, );
        },

        /* subscription reader */
        function(user, message) {

            console(this.id

            var li = document.createElement('li');
            li.innerHTML = message;
            ul_messages.appendChild(li);
        }

        /*TODO: No Cleanup function yet*/
    );




})();
