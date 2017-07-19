// This file is sourced from world.html
// This is the first Mirror Worlds javaScript
// file that is loaded by the browser client.


// one stinking global object
var _mw = {

    connectionCount: 0, // number of times we make a webSocket connection
    client_userInitFunc: null,
    mw: {} // list of WebSocket client connections from mw_client()
};


// This is the Mirror Worlds client factory function
//
// opts { url: 'url' }
function mw_client(
        userInit = function(mw) {
            console.log('MW called default userInit('+mw+')');
                    }, opts = {})
{
    // We handle protocols: http: https: ws: wss:
    // The http(s) protocols are converted to ws: or wss:

    var defaultUrl = location.protocol.replace(/^http/, 'ws') +
        '//' + location.hostname + ':' + location.port + '/';

    if(opts.url === undefined)
        opts.url = defaultUrl;

    if(opts.url !== defaultUrl && _mw.remoteURL !== opts.url) {

        // This will connect to a remote server.

        // keep trying until _mw.client_userInitFunc is not set
        if(typeof(_mw.client_userInitFunc) === 'function') {

            console.log('MW waiting to connect to: ' + opts.url);
            // Try again later.
            setTimeout(function() {
                // Interesting, this is recursion without adding to the
                // function call stack.  Or is it still called recursion?
                mw_client(userInit, {url: opts.url});
            }, 400/* x 1 seconds/1000*/);
            return null; // See this is returning (popping this call)
            // before we call mw_client() again.
        }

        // This _mw.client_userInitFunc is changed back to null in
        // /mw/mw_client.js

        _mw.client_userInitFunc = userInit;
        // It's not known when this script gets loaded
        mw_addActor(opts.url + '/mw/mw_client.js', userInit);
        return null; // We cannot return an object in this case.
    }


    console.log('MW WebSocket trying to connect to:' + opts.url);

    // the mw object inherits the WebSocket object
    // the mw object is the WebSocket object

    var mw = new WebSocket(opts.url);

    // Just to keep a list of these clients in a global
    mw.ConnectionNum = _mw.connectionCount;
    _mw.mw[mw.ConnectionNum.toString()] = mw;
    ++_mw.connectionCount;



    var url = opts.url;

    var onCalls = {};
    mw.recvCalls = {};
    mw.cleanupCalls = {};
    mw.Sources = {};
    mw.SourceCount = 0;
    mw.subscriptions = {};
    mw.sendCount = 0; // a counter to label individual requests.
    mw.globFuncs = { };
    mw.globRequestId = 0;
    
    mw.on = function(name, func) {

        onCalls[name] = func;
    };

    mw._emit = function(name, data) {

        var args = [].slice.call(arguments);
        var name = args.shift();
        mw.send(JSON.stringify({ name: name, args: args }));
    };

    // Sends through the server to clients
    mw.sendPayload = function() {

        var args = [].slice.call(arguments);
        var id = args.shift();
        // 'P' is for payload, a magic constant
        mw.send('P' + id + '=' + JSON.stringify({ args: args }));
    };

    // TODO: cleanup the naming of thing private and public.


    // Do we subcribe? Return true or false
    // TODO: move policy stuff.
    function _checkSubscriptionPolicy(sourceId) {

        // TODO: A simple policy for now, needs to be expanded.

        if(mw.Sources[sourceId] !== undefined ||
                // We are the source of this subscription.
                mw.subscribeAll === false
                // dumb policy flag.  TODO more code here
          )
            return false; // do not subscribe

        return true; // subscribe
    }


    mw.onmessage = function(e) {

        //console.log('MW WebSocket message from '
        //        + url + '\n   ' + e.data);

        var message = e.data;
        // Look for 'P' the magic constant.
        if(message.substr(0, 1) === 'P') {

            // The message should be of the form: 'P343=' + jsonString
            // where 343 is an example source ID.  An example of a
            // mininum
            // message would be like 'P2={}'
            var idLen = 1;
            var stop = message.length - 3;
            // find a '=' so the ID is before it.
            while(idLen < stop && message.substr(idLen+1, 1) !== '=')
                ++idLen;

            if(idLen === stop) {
                console.log('MW Bad WebSocket "on" message from ' +
                        url + '\n  ' + e.data);
                return;
            }

            // We strip off the source ID and send the Payload.
            var sourceId = message.substr(1, idLen);
            var obj = JSON.parse(message.substr(2+idLen));

            if(mw.recvCalls[sourceId] === undefined)
                mw_fail('MW WebSocket on payload sink callback "' + name +
                        '" not found for message from ' + url + '=' +
                        '\n  ' + e.data);

            // There is an option to not have a callback to receive
            // the payload with mw.recvCalls === null.
            if(mw.recvCalls !== null)
                (mw.recvCalls[sourceId])(...obj.args);

            return;
        }

        var obj = JSON.parse(e.data);
        var name = obj.name;

        // We should have this form:
        // e.data = { name: eventName, args:  [ {}, {}, {}, ... ] }
        if(name === undefined || obj.args === undefined ||
                !(obj.args instanceof Array)) {
            mw_fail('MW Bad WebSocket "on" message from ' +
                    url + '\n  ' + e.data);
        }

        if(mw.onCalls[name] === undefined)
            mw_fail('MW WebSocket on callback "' + name +
                    '" not found for message from ' + url + ':' +
                    '\n  ' + e.data);

        console.log('MW WebSocket handled message from '
                + url + '\n   ' + e.data);

        // Call the on callback function using array spread syntax.
        //https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Operators/Spread_operator
        (mw.onCalls[name])(...obj.args);
    };

    mw.onclose = function(e) {

        console.log('MW closed to ' + url);

        // Remove this client from the connection list.
        _mw.mw[mw.ConnectionNum] = null;
        delete _mw.mw[mw.ConnectionNum];
    };

    mw.onopen = function(e) {

        // Currently a no opt.
        console.log('MW connected to ' + url);
    };

    // pretty good client webSocket tutorial.
    // http://cjihrig.com/blog/how-to-use-websockets/

    mw.on('initiate',/*received from the server*/ function(id) {

        mw.Id = id;

        console.log('MW initiate from ' + url +
                '\n   My client ID=' + id);

        // set a default user name
        mw.Name = 'User' + id;
        userInit(mw);
    });


    mw.createSource = function(shortName, description,
            tagOrJavaScriptSrc, func, cleanupFunc = null) {
        // client source ID
        var clientSourceId = (++mw.SourceCount).toString();
        mw.CreateSourceFuncs[clientSourceId] = func;
        // TODO: make this cleanupFunc do it's thing on a
        // 'removeSource' server request ???
        mw.CleanupSourceFuncs[clientSourceId] = cleanupFunc;

        // Ask the server to create a new source of data
        mw._emit('createSource', clientSourceId, shortName,
                description, tagOrJavaScriptSrc);
    };


    mw.on('glob', function(globRequestId, err, files) {

        mw_assert(typeof(mw.globFuncs[globRequestId]) === 'function',
                'bad glob received id=' + globRequestId);
        mw.globFuncs[globRequestId](err, files);
        delete mw.globFuncs[globRequestId];
    });


    mw.glob = function(expression, func) {
        mw._emit('glob', expression, mw.globRequestId.toString());
        mw.globFuncs[((mw.globRequestId)++).toString()] = func;
    };


    // callbackFunc(avatars) is a function that gets the argument
    // avatars that is an array of avators that are like for example:
    // [ "/mw/avatars/teapot_red.x3d", "/mw/avatars/teapot_blue.x3d"
    // ... ]
    mw.getAvatars = function(callbackFunc) {

        mw_addActor(_mw_getCurrentScriptPrefix() +
            '../mw_popupDialog.css', function() {

            // We ask the server for a list of avatar files and
            // it returns it in the avatars array in the function
            // callback.
            mw.glob('/mw/avatars/*.x3d', function(er, avatars) {

                console.log('glob er=' + er + ' glob avatars=' + avatars);
                if(er) {
                    console.log('MW failed to get avatar list:\n   ' + er);
                    return;
                }

                // Which avatar do we select from the array of avatars.
                var avatarIndex = mw.Id%(avatars.length);

                var button = document.getElementById('select_avatar');
                if(!button) {
                    button = document.createElement('A');
                    button.href = '#';
                    button.appendChild(document.createTextNode('Select Avatar'));
                    // TODO: could be prettier.
                    document.body.appendChild(button);
                    button.title = 'change avatar';
                }

                button.onclick = function(e) {

                    var div = document.createElement('div');
                    var innerHTML =
                        '<h2>Select an Avatar</h2>\n' +
                        '<select>\n';

                    var i;

                    for(i=0;i<avatars.length;++i) {
                        innerHTML +=
                            '<option value="' + avatars[i] + '"';
                        if(i === avatarIndex)
                            innerHTML += ' selected="selected"';
                        innerHTML += '>' +
                            avatars[i].replace(/^.*\/|/g,'').
                            replace(/\.x3d$/, '').replace(/_/g, ' '); +
                            '</option>\n';
                    }

                    innerHTML +='  </select>\n';

                    div.innerHTML = innerHTML;

                    mw_addPopupDialog(div, button);
                };

                // Call the users callback with the array of avatars.
                callbackFunc(avatars, avatarIndex);

            }); // mw.glob('/mw/avatars/*.x3d',...)

        }); // mw_addActor(prefix + '../mw_popupDialog.css'

    };


    mw.on('createSource', /*received from the server*/
        function(clientSourceId, serverSourceId, shortName) {

            var func = mw.CreateSourceFuncs[clientSourceId];
            // The shortName will be modified by the server and
            // returned in this callback to the javaScript that
            // called mw.createSource().
            func(serverSourceId, shortName);
            // We are done with this function.
            delete mw.CreateSourceFuncs[clientSourceId];

            // Record that we are a source: If mw.Sources[serverSourceId]
            // is defined we are a source to the serverSourceId
            // subscription and while we are at it use the cleanup
            // function as the value.
            mw.Sources[serverSourceId] = mw.CleanupSourceFuncs[clientSourceId];

            // Now that we have things setup for this source we tell the
            // server to advertise the 'newSubscription'.  The server
            // can't send out the 'newSubscription' advertisement until we
            // tell it to, so that we have no race condition:  If we got
            // the 'newSubscription' before we received the sourceId we
            // could not tell if we are the client that is the source for
            // receiving the corresponding 'newSubscription' below...
            mw._emit('advertise', serverSourceId);

            // TODO: add a client initiated removeSource interface
        }
    );

    // For Client code initiated unsubscribe.  The server sends
    // 'removeSource' events for when subscription become unavailable.
    mw.unsubscribe = function(sourceId) {

        // TODO: More code here.
        console.log('MW unsubscribing to ' +
                mw.subscriptions[sourceId].shortName);

        // TODO: remove the <script> if there is one.

        if(mw.cleanupCalls[sourceId] !== undefined) {
            console.log('MW calling cleanupCall(sourceId=' +
                        sourceId + ')');
                    // The user is not required to define a cleanup function.
                    // Look how easy it is to pass the arguments.
                    mw.cleanupCalls[sourceId].apply(mw, arguments);
        }

        delete mw.recvCalls[sourceId];
        if(mw.cleanupCalls[sourceId] !== undefined)
            delete mw.cleanupCalls[sourceId];
        delete mw.subscriptions[sourceId];

        mw.printSubscriptions();
    };


    function _subscribeType(id) {

        // (unsubscribed), (reading), (writing), or (reading/writing)
        var type = '';
        if(mw.recvCalls[id] !== undefined)
            type = 'reading';
        if(mw.Sources[id] !== undefined) {
            if(type.length > 0) return 'reading/writing';
            else return 'writing';
        }
        if(type.length === 0)
            return 'not subscribed';
        return type;
    };


    // This long function just spews for debugging and does nothing
    // else.
    mw.printSubscriptions = function() {

    };


    return mw;
}


// WebRTC
// https://www.html5rocks.com/en/tutorials/webrtc/basics/
// https://www.w3.org/TR/webrtc/
function mw_init() {

    var url = null;

    // Parse the URL query:
    if(location.search.match(/.*(\?|\&)file=.*/) != -1)
        url = location.search.replace(/.*(\?|\&)file=/,'').
            replace(/\&.*$/g, '');

    if(url === null || url.length < 1) {
        // The default mode
        // This is the only place that we declare this.
        url = 'mw_default.js';
    }

    mw_client(/*on initiate*/function(mw) {

        // When this is executed all the stuff is loaded.
        mw_addActor(url,
                function() {mw._emit('initiate');}
                , { mw: mw }
                );
    });
}
