/**
 *
 * This script will have two distinct parts
 * 1. webSocket-based listener part
 * 2. subscription-model-based receiver & illustrator
 *
 */

//Global jsonData variable
var jsonObject;

//Listener
var socket = new WebSocket("ws://localhost:8181"); // Default is port 8181 at this point

/**
* WebSocket onopen event.
*/
socket.onopen = function (event) {
    label.innerHTML = "Connection open";
}

/**
 * WebSocket onmessage event.
 */
socket.onmessage = function (event) {
	if (typeof event.data === "string") {

		// Create a JSON object
		jsonObject = JSON.parse(event.data);

        console.log("Json Arrived");
}
/**
 * WebSocket onerror event.
 */
socket.onerror = function (event) {
	label.innerHTML = "Error: " + event;
}

//receiver & illustrator
(function () {
    var prefix = mw_getScriptOptions().prefix;
    var mw = mw_getScriptOptions().mw;
    var lampModelUrl = prefix + '../tests/lamp.x3d';


    // Default transformAttributes
    var transformAttributes = { translation: '-3 4 -3' };

    if(mw_getScriptOptions().transformAttributes !== undefined)
        // Different than the default transformAttributes
        transformAttributes = mw_getScriptOptions().transformAttributes;

    mw_assert(mw_getScriptOptions().id !== undefined);
    var namespace = lampModelUrl + '_' + mw_getScriptOptions().id;


    function() {

        /* Get a named subscription: create it if it does not exist yet. */
        var s = mw.getSubscription(

			'kinect'/*unique subscription name*/,
    	    'kinect'/*shortName*/,
    	    'Parent subscription of kinect'/*description*/,

            /* initialization */
            function() {

            },

            /* subscription reader function */
            function() {

            }

            /* Cleanup function */
    	);
    },
})();
