
(function () {

    var mw = mw_getScriptOptions().mw;

    // avatars will be an array of all available avatar URLs
    var avatars = null;


    function addAvatar(avatarUrl) {

        console.log("Using Avatar URL: " + avatarUrl);

        /* Create a new subscription for each client that calls this.
         * We don't care what this subscription is called, it's just
         * defined by this javaScript code, so it's anonymous. */
        mw.getSubscriptionClass(
            'user_viewpoint_avatar_class',
            'avatar' /*shortName*/,
            'user_avatar' /*description*/,

            /* Creator initialization of this top level subscription class */
            function() {

                // *this* is the subscription.
                //
                // We do not read our own avatar.  We have not really
                // subscribed yet given that the subscription has not been
                // initialized on the server yet.
                //
                // Subscriptions are subscribed to by default, we don't
                // need to read our avatar URL because we know it.
                this.unsubscribe();


                // We need this subscription to go away when this client
                // quits.
                this.makeOwner();


                // TODO: Add widget event handler that will call:
                // this.write(avatarUrl) to change the
                // avatar.  That's all that is needed to change
                // the avatar, given the code below.

                /* Create a child subscription.  Create a new subscription
                 * for each client that calls this.  It will depend on the
                 * top level avatarUrl parent subscription. */
                this.getSubscriptionClass(
                    'viewpoint_position_xyzRot_class', /*unique className used to
                    * define this class of subscription*/
                    'viewpoint_position' /*shortName*/,
                    'user avatar using viewpoint position' /*description*/,


                    /* child creator */
                    function() {

                        // *this* is the child subscription.
                        // We do not read our own avatar motions.
                        this.unsubscribe();
                        //this.makeOwner();

                        // Get *this* for next function scope
                        var childSubscription = this;

                        var vp = mw_getCurrentViewpoint();
                        // We don't need to write the initial veiwpoint
                        // values because it looks like setting the
                        // 'viewpointChanged' listener does that for us.

                        function writerFunc(e) {
                            // send to server and in turn it's
                            // sent to other clients as our
                            // avatar's current 6D position.
                            childSubscription.write(e.position, e.orientation);
                        };

                        // TODO: If the current view point object changes this
                        // needs to get the new view point object and then
                        // get position and orientation from that new view
                        // point object.

                        vp.addEventListener('viewpointChanged', writerFunc);

                        /* If we want to keep things tidy, we can add a
                         * cleanup function for this particular
                         * subscription: */
                        this.setCleanup(function() {
                            vp.removeEventListener('viewpointChanged', writerFunc);
                        });

                    },
                    // we have no consumer functions for this child
                    // subscription class yet, because we need to wait for
                    // the model to load.

                    // we have no cleanup functions for this child
                    // subscription class yet
                );

                this.write(avatarUrl);
            },

            /* particular consumer (reader) of this top level subscription
             * class.  So this is called each time a client writes to a
             * particular subscription of this class. */
            function(avatarUrl) {

                if(this.TransformNode !== undefined)
                    // If we are changing the avatar URL: remove the old
                    // model and than add a new model.
                    this.TransformNode.parentNode.removeChild(transformNode);

                // Get *this* for next function scope
                var subscription = this;

                mw_addActor(avatarUrl,

                    function(transformNode) {

                        var child = subscription.firstChild;
                        // Save the top model node in case we need to
                        // change the avatar.

                        // So we can remove the old model above.
                        subscription.TransformNode = transformNode;

                        // Sets a consumer for a particular subscription.
                        // This client will become a reader of a
                        // particular subscription when setReader() is
                        // called here:
                        child.setReader(function(pos, rot) {

                            transformNode.setAttribute('translation',
                                pos.x + ' ' + pos.y + ' ' + pos.z);
                            transformNode.setAttribute('rotation',
                                rot[0].x + ' ' + rot[0].y + ' ' +
                                rot[0].z + ' ' + rot[1]);
                        });

                        // Sets a cleanup function for a particular
                        // subscription, otherwise the model will stay and
                        // stop being a moving avatar after the corresponding
                        // user quits.  Gets called by parent cleanup
                        // too.
                        child.setCleanup(function() {
                            transformNode.parentNode.removeChild(transformNode);
                        });

                    }, {
                        containerNodeType: 'Transform'
                });
            }

            /* No cleanup function for top level subscription for a
             * particular subscription */
           );
    }


    mw.getAvatars(function(avatars_, avatarIndex) {

        avatars = avatars_; // save array of avatars

        // Load an avatar from this array list
        addAvatar(avatars[avatarIndex]);

    });

})();
