// This makes a simple blob avatar for all users (clients) that load
// this javaScript file.  This makes two interdependent subscription
// classes.  The two subscription classes that contain the payloads that
// are:
//
//   1) the blob avatar URL
//   2) the blob avatar position and orientation
//
// The subscription (2) is a child of (1).
//
/** @file
 *
 * This javaScript codes implements a simple blob avatar.
 *
 * @namespace file_subscription_blobAvatars
 *
 * @see
 * {@link file_test_blobAvatars}
 */

(function () {

    var mw = mw_getScriptOptions().mw;


    /* Create a new subscription for each client that calls this.
     * We don't care what this subscription is called, it's just
     * defined by this javaScript code, so it's anonymous. */
    mw.getSubscriptionClass(
        'blob_avatar_url'/*unique class name*/,
        'blob_avatar_url'/*shortDescription*/,
        'blob avatar URL'/*description*/,

        /* Creator initialization of this top level subscription class.
         * This is called each time a new subscription of this class
         * is created.  Each client that runs this javaScript will
         * run this creator function. */
        function() {

                this.unsubscribe();
                this.makeOwner();

                /* Create a child subscription.  Create a new subscription
                 * for each client that calls this.  It will depend on the
                 * top level avatarUrl parent subscription. */
                this.getSubscriptionClass(
                    'blob_avatar_position'/*unique class name*/,
                    'blob_avatar_position'/*shortDescription*/,
                    'blob avatar position'/*description*/,

                /* child creator */
                function() {

                    this.unsubscribe();
                    this.makeOwner();
                },
                // we have no consumer functions for this child
                // subscription class yet, because we need to wait for
                // the model to load.

                // we have no cleanup functions for this child
                // subscription class yet
            );
        },

        /* particular consumer (reader) of this top level subscription
         * class.  So this is called each time a client writes to a
         * particular subscription of this class. */
        function(avatarUrl) {

            var pos = null, rot;

            if(this.TransformNode !== undefined) {
                // If we are changing the avatar URL: remove the old
                // model and than add a new model.
                // First copy the old avatar position and orientation
                // so we can put the new one there.
                pos = this.TransformNode.getAttribute('translation');
                rot = this.TransformNode.getAttribute('rotation');
                this.TransformNode.parentNode.removeChild(this.TransformNode);
            }

            // Get *this* for up-coming function scope
            var subscription = this;

            mw_addActor(avatarUrl,

                function(transformNode) {

                    // TODO: find a better way to get child subscriptions
                    var child = subscription.children[0];

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

                    if(pos) {
                        // We are changing avatars so we need to
                        // remember where to put the avatar.
                        transformNode.setAttribute('translation', pos);
                        transformNode.setAttribute('rotation', rot);
                        pos = null;
                        rot = null;
                    }

                }, {
                    containerNodeType: 'Transform'
            });
        }

        /* No cleanup function for top level subscription for a
         * particular subscription */
    );


})();
