/** @file
 *
 * This javaScript codes loads a very simple world and a simple
 * kinect model as a {@link MW#getSubscriptionClass subscription}.
 *
 * @see
 * {@link file_subscription_kinect}
 *
 * @namespace file_test_chat
 */

(function() {

    var prefix = mw_getScriptOptions().prefix;

    // Our very simple test world:
    mw_addActor(prefix + 'plane.x3d');
    mw_addActor(prefix + 'gnome.x3d');

    mw_addActor(prefix + '../subscriptions/viewpointAvatar.js');

    mw_addActor(prefix + '../subscriptions/lamp.js', null,
        { id: '0'/*unique ID to this ../subscriptions/lamp.js lamp*/
        });

    mw_addActor(prefix + '../subscriptions/lamp.js', null,
        {
            id: '1'/*unique ID to this ../subscriptions/lamp.js lamp*/,
            // move to different location than the one
            // above lamp.
            transformAttributes: { translation: '-1.5 4 -1.5' }
        });

    mw_addActor(prefix + 'kinect.x3d');

    mw_addActor(prefix + '../subscriptions/kinect.js');

})();
