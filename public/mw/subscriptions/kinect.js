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
//TODO: find a way to verify kinect user
if (this.create) {
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

            // For testing purpose
            jsonObject = event.data;

			// Create a JSON object
			//jsonObject = JSON.parse(event.data);

		    console.log("Json Arrived");
	    }
    }
	/**
	 * WebSocket onerror event.
	 */
	socket.onerror = function (event) {
		label.innerHTML = "Error: " + event;
	}
}

//receiver & illustrator
(function () {

    var mw = mw_getScriptOptions().mw;

    /* Create a new subscription for each client that calls this.
     * We don't care what this subscription is called, it's just
     * defined by this javaScript code, so it's anonymous. */
    mw.getSubscriptionClass(
	    'kinect'/*unique subscription name*/,
	    'kinect'/*shortName*/,
	    'Parent subscription of kinect'/*description*/,

	    /* initialization */
	    function() {
		    //TODO: non-kinect user will do nothing related to position-orientation
		    //	They are already doing it on viewPointAvatar subscription.
		    if (this.create) {
			    // *this* is the subscription.
			    //
			    // We do not read our own model.  We have not really
			    // subscribed yet given that the subscription has not been
			    // initialized on the server yet.
			    //
			    // Subscriptions are subscribed to by default, we don't
			    // need to read our avatar URL because we know it.
			    this.unsubscribe();

			    // We need this subscription to go away when this client
            		// quits.
			    this.makeOwner();

			    /* Create a child subscription.  Create a new subscription
			     * for each client that calls this.  It will depend on the
			     * top level avatarUrl parent subscription. */
			    this.getSubscriptionClass(
				    'viewpoint_kinect'/*unique class name*/,
				    'viewpoint_kinect'/*shortDescription*/,
				    'kinect model viewpoint'/*description*/,

				    /* child creator */
				    function() {

					    // *this* is the child subscription.
					    // We do not read our own avatar motions.
					    this.unsubscribe();
					    // When this client goes away this subscription
					    // is destroyed on the server.
					    this.makeOwner();

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
						    childSubscription.write(e.orientation);
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

		
			    setInterval(function() {
				    this.write(jsonObject);
			    }, 100);	//Json will be wrote every 1/10 sec for now
		    }//end of if-condition for non-kinect users
	    },

	    /* subscription reader function */
	    function(jsonObject) {
		    var rot;

		    if(this.TransformNode !== undefined) {
		        // If we are changing the avatar URL: remove the old
		        // model and than add a new model.
		        // First copy the old avatar position and orientation
		        // so we can put the new one there.
		        rot = this.TransformNode.getAttribute('rotation');
		        this.TransformNode.parentNode.removeChild(this.TransformNode);
		    }
		    // Get *this* for up-coming function scope
		    var subscription = this;

		    // TODO: how should json Data work with mw_addActor?
		    mw_addActor(jsonObject,

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
				    child.setReader(function(rot) {

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
				        transformNode.setAttribute('rotation', rot);
				        rot = null;
				    }

			    }, {
			    containerNodeType: 'Transform'
		    });

		    /**
		     * skeleton illustration below
		     */
		     //Display the skeleton joints.
		    for (var i = 0; i < jsonObject.skeletons.length; i++) { 
			    // bones = populateBones(jsonObject.skeletons[i]);
			    // boneCount = bones.length;
			    var bonesX = [48];
			    var bonesY = [48];
			    var bonesZ = [48];
			    var count = 0;

			    for (var j = 0; j < jsonObject.skeletons[i].joints.length; j++) {
				    var joint = jsonObject.skeletons[i].joints[j];

			         	//X3DOM stuff here
			            // Draw!!!                      
			            //context.translate(320,240);
			            //context.arc(joint.x * 400 +320, (-joint.y) * 400 +240, 5, 0, Math.PI * 2, true);
			            var x = joint.x;
			            var y = joint.y;
			            var z = joint.z;
					
					
				    //  go through the json get each joint name .... get each element by its DEF (joint) name
				    // change its translation atttribute to the x y z coords
	        
				    document.getElementById(joint.name).setAttribute("translation", x + " " + y + " " + z);
		
				    // add point array here
				    bonesX[count] = x;
				    bonesY[count] = y;
				    bonesZ[count] = z;
				    count++;
		
			    }

			    //Joint data on html
			    document.getElementById('jointConnect').setAttribute("point", bonesX[3] + " " + bonesY[3] + " " + bonesZ[3] + " " + bonesX[2] + " " + bonesY[2] + " " + bonesZ[2] + " " + bonesX[2] + " " + bonesY[2] + " " + bonesZ[2] + " " + bonesX[20] + " " + bonesY[20] + " " + bonesZ[20] + " " + bonesX[20] + " " + bonesY[20] + " " + bonesZ[20] + " " + bonesX[8] + " " + bonesY[8] + " " + bonesZ[8] + " " + bonesX[8] + " " + bonesY[8] + " " + bonesZ[8] + " " + bonesX[9] + " " + bonesY[9] + " " + bonesZ[9] + " " + bonesX[9] + " " + bonesY[9] + " " + bonesZ[9] + " " + bonesX[10] + " " + bonesY[10] + " " + bonesZ[10] + " " + bonesX[10] + " " + bonesY[10] + " " + bonesZ[10] + " " + bonesX[11] + " " + bonesY[11] + " " + bonesZ[11] + " " + bonesX[11] + " " + bonesY[11] + " " + bonesZ[11] + " " + bonesX[23] + " " + bonesY[23] + " " + bonesZ[23] + " " + bonesX[11] + " " + bonesY[11] + " " + bonesZ[11] + " " + bonesX[24] + " " + bonesY[24] + " " + bonesZ[24] + " " + bonesX[20] + " " + bonesY[20] + " " + bonesZ[20] + " " + bonesX[4] + " " + bonesY[4] + " " + bonesZ[4] + " " + bonesX[4] + " " + bonesY[4] + " " + bonesZ[4] + " " + bonesX[5] + " " + bonesY[5] + " " + bonesZ[5] + " " + bonesX[5] + " " + bonesY[5] + " " + bonesZ[5] + " " + bonesX[6] + " " + bonesY[6] + " " + bonesZ[6] + " " + bonesX[6] + " " + bonesY[6] + " " + bonesZ[6] + " " + bonesX[7] + " " + bonesY[7] + " " + bonesZ[7] + " " + bonesX[7] + " " + bonesY[7] + " " + bonesZ[7] + " " + bonesX[21] + " " + bonesY[21] + " " + bonesZ[21] + " " + bonesX[7] + " " + bonesY[7] + " " + bonesZ[7] + " " + bonesX[22] + " " + bonesY[22] + " " + bonesZ[22] + " " + bonesX[20] + " " + bonesY[20] + " " + bonesZ[20] + " " + bonesX[1] + " " + bonesY[1] + " " + bonesZ[1] + " " + bonesX[1] + " " + bonesY[1] + " " + bonesZ[1] + " " + bonesX[0] + " " + bonesY[0] + " " + bonesZ[0] + " " + bonesX[0] + " " + bonesY[0] + " " + bonesZ[0] + " " + bonesX[12] + " " + bonesY[12] + " " + bonesZ[12] + " " + bonesX[12] + " " + bonesY[12] + " " + bonesZ[12] + " " + bonesX[13] + " " + bonesY[13] + " " + bonesZ[13] + " " + bonesX[13] + " " + bonesY[13] + " " + bonesZ[13] + " " + bonesX[14] + " " + bonesY[14] + " " + bonesZ[14] + " " + bonesX[14] + " " + bonesY[14] + " " + bonesZ[14] + " " + bonesX[15] + " " + bonesY[15] + " " + bonesZ[15] + " " + bonesX[0] + " " + bonesY[0] + " " + bonesZ[0] + " " + bonesX[16] + " " + bonesY[16] + " " + bonesZ[16] + " " + bonesX[16] + " " + bonesY[16] + " " + bonesZ[16] + " " + bonesX[17] + " " + bonesY[17] + " " + bonesZ[17] + " " + bonesX[17] + " " + bonesY[17] + " " + bonesZ[17] + " " + bonesX[18] + " " + bonesY[18] + " " + bonesZ[18] + " " + bonesX[18] + " " + bonesY[18] + " " + bonesZ[18] + " " + bonesX[19] + " " + bonesY[19] + " " + bonesZ[19]);
			
		    }

	    }
	    /* Cleanup function */

	    /* No cleanup function for top level subscription for a
     		* particular subscription */
    );
})();
