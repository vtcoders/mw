
(function () {


    var lampModelUrl = 'lamp.x3d';


    mw_addActor(lampModelUrl,

        function(groupNode) {

            /* Get a named subscription: create it if it does not exist yet. */
            var subscription = mw.getSubscription('lamp_' + lampModelUrl,

                /* creator initialization */
                function() {

                    // We start with the initial lamp value:
                    this.write(true);
                },

                /* subscription reader function */
                function(onOff) {

                    // TODO: turn on/off lamp

                },

                /* Cleanup function */
                function() {
                    groupNode.parentNode.removeChild(groupNode);
                }
            );

            // TODO: add subscription.write(onOff) calls in lamp x3dom
            // event Listener, letting the subscription read function
            // turn the lamp on and off; so that the state of the lamp
            // stays consistent between many clients.
            //
            // The big question: do we toggle the lamp or do we set it
            // on and off?  

        });

})();
