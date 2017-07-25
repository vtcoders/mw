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

    // The returned object:
    var mw = {};


    // Just to keep a list of these clients in a global called _mw
    var ConnectionNum = _mw.connectionCount;
    _mw.mw[ConnectionNum.toString()] = mw;
    ++_mw.connectionCount;


    ////////// Private object data ////////


    var url = opts.url;
    var clientId = 'unset'; // unique id from the server 

    var ws =new WebSocket(url);
    
    // for on() and emit() socket.IO like interfaces
    var onCalls = {};

    // client side request counter
    var getSubscriptionCount = 0;

    // List of all Subscriptions that are associated with this
    // client/server
    var subscriptions = {};

    // advertisements are subscriptions that we have not loaded
    // any javaScript for yet, due to race or whatever reason.
    var advertisements = {};

    // for globing files on the server
    var globFuncs = { };
    var globRequestIdCount = 0;


    var debug;
    function setDebugPrefix() {
        // Just a object local console.log() wrapper to keep prints
        // starting the same prefix for all this MW object.  By using bind
        // we keep the line number where log() was called output-ed to
        // console.log(), a simple function wrapper will not give correct
        // line numbers. This totally rocks, it's so simple and bullet
        // proof.
        debug = console.log.bind(console, 'MW Client[' +
            clientId +'](' + url + '):');
    }
    setDebugPrefix();

    // To disable debug spew:
    // var debug = function() {};


    // for socket.IO like interface
    function on(name, func) {

        mw_assert(onCalls[name] === undefined,
            "setting on('" + name + "', ...) callback a second time." +
            " Do you want to override the current callback or " +
            "add an additional callback to '" + name +
            "'.  You need to edit this code.");
        onCalls[name] = func;
    };


    function emit(name, data) {

        // for socket.IO like interface
        var args = [].slice.call(arguments);
        var name = args.shift();
        ws.send(JSON.stringify({ name: name, args: args }));
    }

    // URL accessor; because the URL may not be the same
    // as the user started with.
    mw.url = function() {
        return url;
    };


    ws.onmessage = function(e) {

        debug('message:\n     ' + e.data);

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
                debug('Bad WebSocket "on" message:\n   ' + e.data);
                return;
            }

            // We strip off the source ID and send the Payload.
            var sourceId = message.substr(1, idLen);
            var obj = JSON.parse(message.substr(2+idLen));

            mw_assert(subscriptions[sourceId] !== undefined);
            // There is an option to not have a callback to receive
            // the payload with subscriptions[sourceId].readPayload === null.
            if(subscriptions[sourceId].readerFunc)
                (subscriptions[sourceId].readerFunc)(...obj.args);
            else {
                debug('no readerFunc was set yet. Saving payload for later');
                // We better be subscribed
                // save this current subscription state in case we
                // get a reader set later.
                subscriptions[sourceId].readPayload = obj;
            }

            return;
        }

        var obj = JSON.parse(e.data);
        var name = obj.name; // callback name (not subscription name)

        // We should have this form:
        // e.data = { name: eventName, args:  [ {}, {}, {}, ... ] }
        if(name === undefined || obj.args === undefined ||
                !(obj.args instanceof Array)) {
            mw_fail('MW Bad WebSocket "on" message from ' +
                    url + '\n  ' + e.data);
        }

        if(onCalls[name] === undefined)
            mw_fail('MW WebSocket on callback "' + name +
                    '" not found for message from ' + url + ':' +
                    '\n  ' + e.data);

        debug('handled message=\n   ' + e.data);

        // Call the on callback function using array spread syntax.
        //https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Operators/Spread_operator
        (onCalls[name])(...obj.args);
    };

    ws.onclose = function(e) {

        debug('closed WebSocket connection');

        // Remove this client from the connection list.
        _mw.mw[ConnectionNum] = null;
        delete _mw.mw[ConnectionNum];
    };

    ws.onopen = function(e) {

        // Currently a no opt.
        debug('connected');
    };

    // pretty good client webSocket tutorial.
    // http://cjihrig.com/blog/how-to-use-websockets/

    on('initiate',/*received from the server*/ function(id) {

        clientId = id;

        // set a starting/default user name
        mw.user = 'User-' + id;
        // Now that we have the Client ID we set the
        // debug spew prefix again.
        setDebugPrefix();

        debug('received "initiate"  My client ID=' + id);

        userInit(mw);
    });


    // See what files are on the server.  Used for example to get
    // a list of avatars on the server.
    on('glob', function(globRequestId, err, files) {

        mw_assert(typeof(globFuncs[globRequestId]) === 'function',
                'bad glob received id=' + globRequestId);
        globFuncs[globRequestId](err, files);
        delete globFuncs[globRequestId];
    });


    mw.glob = function(expression, func) {
        emit('glob', expression, globRequestIdCount.toString());
        globFuncs[(globRequestIdCount++).toString()] = func;
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
            mw.glob('/mw/avatars/*.x3d', function(err, avatars) {

                debug('glob err=' + err + ' glob avatars=' + avatars);
                if(err) {
                    debug('MW failed to get avatar list:\n   ' + err);
                    return;
                }

                // Which avatar do we select from the array of avatars.
                var avatarIndex = parseInt(clientId)%(avatars.length);

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
                debug("avatars=" + avatars +
                    " my avatar=" + avatars[avatarIndex]);
                callbackFunc(avatars, avatarIndex);

            }); // mw.glob('/mw/avatars/*.x3d',...)

        }); // mw_addActor(prefix + '../mw_popupDialog.css'

    };


    // the server is destroying a subscription
    on('destroy', function(id) {

        var s = subscription[id];

        if(s === undefined) {

            // We may have not loaded the javaScript for this
            // subscription yet.  This maybe okay.
            debug('got subscription (id=' + id +
                ') "destroy" for unknown subscription');
            return;
        }

        if(s.cleanupFunc)
            s.cleanupFunc();

        delete subscription[id];
    });


    // TODO: currently this only adds subscriptions that have a className.
    on('advertise', function(id, name, className, shortName,
                description, javaScriptUrl) {

        mw_assert(className, "'advertise' className was not set");
        
        // Construct a subscription object for this particular instance of
        // a class of subscription.
        var s = subscriptions[id] = subscriptions[className].copy();

        mw_assert(subscriptions[id] === undefined,
            '"advertise" for a known subscription: shortName=' + shortName); 
            
        // TODO: add additional javaScript loading for the subscription

        if(subscriptions[className] === undefined) {
            // Save this for later
            advertisements[className] = id;
            return;
        }

        subscriptionInit(id, className/*clientKey*/, name,
                className, shortName);
    });


    // Called on server respond to clients 'get' request emit('get', ...)
    on('get', function(id, clientKey, name, className,
                shortName, thisClientIsCreator) {

        mw_assert(subscriptions[clientKey] !== undefined, '');

        var s = subscriptions[clientKey];

        
        if(thisClientIsCreator && s.creatorFunc) {
            // If a creator function is set, we call it as an object
            // subscription method.  It can call any of the subscription
            // object methods that we set above.
            s.creatorFunc();
        }

        // don't need the creator any more.
        delete s.creatorFunc;

        subscriptionInit(id, clientKey, name, className, shortName);
    });


    // getting a subscription in response to a 'get' new or old
    // Subscription request from this client, or in response to a
    // 'subscribe'.
    function subscriptionInit(id, clientKey, name, className, shortName) {

        debug('getting new subscription: ' + shortName);

        if(name) {
            // There will be no more new subscriptions with this name or
            // clientKey, so we do not need this record any more.
            // subscriptions with a 'name' only get created once.
            mw_assert(name === clientKey,
                    "Bad clientKey ('" + clientKeyto + "') subscription");
            var s = subscriptions[id] = subscriptions[clientKey];
            // We don't need this additional reference to this any more.
            delete subscriptions[clientKey];
        } else
            // This is a new subscription from a subscription class
            // so we keep the subscription class and copy it.
            // One copy is for all in the class and one [id] is active.
            var s = subscriptions[id] = subscriptions[clientKey].copy();

        // TODO: determine if we need this id in this object.
        //s.id = id; // save the server subscription ID

        s.shortName = shortName; // The server will change the shortName
        // making it more unique by appending a counter or like thing.

        function send(payload) {
            // 'P' is for payload, a magic constant
            ws.send('P' + id + '=' + JSON.stringify({ args: payload }));
        }

        //
        // Note: by keeping the network protocol simple we end up
        // buffering more state in order to keep things consistent.
        //


        if(s.writePayload !== null)
            // We have a write buffered from the creator function being
            // called.
            send(s.writePayload);

        delete s.writePayload; // this buffer has been used up

        // Now we can really send data instead of just buffering it, so we
        // set the write() function to one that really writes to the web
        // socket.
        s.write = function() {
            send([].slice.call(arguments));
        };

        s.subscribe = function() {

            if(s.isSubscribed) return;
            emit('subscribe', id);
            s.isSubscribed = true;
            s.readerFunc = s.readerFunc_save;
            if(s.readerFunc && s.readPayload !== undefined) {
                s.readerFunc(...(s.readPayload.args));
                delete s.readPayload;
            }

        };

        s.unsubscribe = function() {

            if(!s.isSubscribed) return;
            emit('unsubscribe', id);
            s.isSubscribed = false;
            s.readerFunc_save = s.readerFunc;
            s.readerFunc = null;
            if(s.readPayload !== undefined) {
                delete s.readPayload;
            }
        };

        s.destory = function() {

            emit('destroy', id);
            // We'll get a reply that will make us
            // cleanup this subscription later.
        };

        s.makeOwner = function(isOwner=true) {

            if(s.isOwner != isOwner) {
                s.isOwner = isOwner;
                emit('makeOwner', id, isOwner);
            }
        }

        if(!s.isSubscribed) {
            // We are subscribed by default, so we reset
            s.isSubscribed = true;
            // and then unset via the method.
            s.unsubscribe();
            // Now s.isSubscribed should be false
        }
        if(s.isOwner) {
            // We are not owners by default, so we reset
            s.isOwner = false;
            // and then set via the method.
            s.makeOwner();
            // Now s.isOwner should be true
        }
        if(s.isDestroyed)
            // This may happen because there may have been a change of
            // heart in the creator callback function.
            s.destory();

        // isInitialized means that we can subscribe to it now and it can
        // be read and written too on the server; a real usable
        // subscription and not just a subscription class or named
        // subscription waiting to exist on the server.
        s.isInitialized = true;

        if(s.isDestroyed) {
            delete s.isDestroyed; // destroy is now no longer a buffered thing
            printSubscriptions(); // debug printing
        }

        s.setReader = function(readerFunc) {
            s.readerFunc_save = readerFunc;
            if(s.isSubscribed)
                s.readerFunc = readerFunc;
            if(s.readerFunc && s.readPayload) {
                s.readerFunc(...(s.readPayload.args));
                delete s.readPayload;
            }
        }


        // Now we know what the subscription is to this client
        if(s.isSubscribed) {

            s.readerFunc = s.readerFunc_save;
            if(s.readerFunc && s.readPayload) {
                s.readerFunc(...(s.readPayload.args));
            }
        }

        if(s.readPayload)
            delete s.readPayload;


        delete s.isDestroyed; // destroy is now no longer a buffered thing
        printSubscriptions(); // debug printing
    }



    // A private factory that returns subscription objects.  These objects
    // returned will not have an associated subscription ID on the server.
    function newSubscription(
            name, className,
            shortName, description,
            creatorFunc, readerFunc, cleanupFunc) {

        mw_assert((name && name.length > 0) ||
                (className && className.length > 0),
                'neither name or className are set');
        mw_assert(!name || !className,
                'both name and className are set');


        // make a subscription object explicitly
        var subscription = {
            children: [],
            parent: null,

            // If these 2 default values change you need to
            // change subscriptionInit().
            isSubscribed: true, // We are subscribed by default.
            isOwner: false, // default we are not owners

            isInitialized: false,
            name: name,
            className: className,
            shortName: shortName,
            creatorFunc: creatorFunc,
            readerFunc: null,
            readerFunc_save: readerFunc,
            cleanupFunc: cleanupFunc,

            // copy() returns a copy of this object.
            // var obj2 = obj1 does not work, obj2 is a reference
            // to obj1 and so changing obj2 fields changes obj1
            // fields.
            copy: function() {
                var ret = {};
                // copy just one level deep
                for(var k in this)
                    ret[k] = this[k];
                ret.isInitialized = false;
                return ret;
            },
            subscribe: function() {
                this.isSubscribed = true;
            },
            isDestroyed: false,
            destroy: function() {
                // For now we buffer this value.
                this.isDestroyed = true;
            },
            unsubscribe: function() {
                this.isSubscribed = false;
            },
            writePayload: null, // buffers subscription state
            // until the subscription is confirmed to be on the server
            // and for when the readerFunc is not set yet.
            write: function() {
                // Save (buffer) the last payload written:
                this.writePayload = [].slice.call(arguments);
                // We'll make this write to the webSocket
                // after we get the subscription from
                // the server.
            },
            // make this WebSocket client an owner
            makeOwner: function(isOwner=true) {
                this.isOwner = isOwner;
            },
            getSubscriptionClass:
                function(className, shortName, description,
                        creatorFunc, readerFunc=null, cleanupFunc=null) {
                    var child = newSubscription(null, className, shortName,
                            description, creatorFunc, readerFunc, cleanupFunc);
                    this.children.push(child);
                    child.parent = this;
            },
            getSubscription:
                function(name, shortName, description,
                        creatorFunc, readerFunc=null, cleanupFunc=null) {
                    var child = newSubscription(name, null, shortName,
                            description, creatorFunc, readerFunc, cleanupFunc);
                    this.children.push(child);
                    child.parent = this;
            },
            // save a new reader callback function
            setReader: function(readerFunc) {
                this.readerFunc_save = readerFunc;
            },
            setCleanup: function(cleanupFunc) {
                this.cleanupFunc = cleanupFunc;
            }
        };

        // Make a key to store the subscription on this client
        if(name)
            var clientKey = ' k-e- yZ' + (++getSubscriptionCount).toString();
        else
            var clientKey = className;


        // Talk to the server
        emit('get', clientKey, name, className, shortName, description,
                subscription.isSubscribed, subscription.isOwner);

        // Add it to the list of subscriptions:
        subscriptions[clientKey] = subscription;

        return subscription;
    }


    // Create a named subscription.  Clearly the creatorFunc is ignored if
    // the subscription exists on the server already.
    mw.getSubscription = function(
            name,
            shortName, description,
            creatorFunc=null, readerFunc=null, cleanupFunc=null) {

        return newSubscription(
                name, null, shortName, description,
                creatorFunc, readerFunc, cleanupFunc);
    };


    // Create an unnamed subscription, as in we do not care what it is
    // called on the server.   The new subscription created by each client
    // that calls this is just defined by the callback functions that are
    // set.   shortName and description are not required to be unique,
    // they are just user descriptions.  The readerFunc, and
    // cleanupFunc callbacks are the guts of define the behavior of the
    // subscription.
    mw.getSubscriptionClass = function(
            className, /* unique for this SubscriptionClass */
            shortName, description,
            creatorFunc=null, readerFunc=null, cleanupFunc=null) {

        return newSubscription(
                null, className, shortName, description,
                creatorFunc, readerFunc, cleanupFunc);
    };


    // This function just spews for debugging and does nothing
    // else.
    function printSubscriptions() {

        debug('Subscriptions:');
        console.log('=========== Current Subscriptions =================');

        for(var key in subscriptions) {
            var s = subscriptions[key];
            if(s.isInitialized)
                console.log('   [' + key + '] shortName=' +
                    s.shortName + ' ---  ' +
                    (s.subscribed?'SUBSCRIBED ':'') +
                    (s.isOwner?'OWNER ':'') +
                    (s.name?('name=' +s.name):('className=' + s.className)));
        }

        console.log('=========== Unintialized Subscriptions ============');

        for(var key in subscriptions) {
            var s = subscriptions[key];
            if(!s.isInitialized)
                console.log('   [' + key + '] shortName=' +
                    s.shortName + ' ---  ' +
                    (s.subscribed?'SUBSCRIBED ':'') +
                    (s.isOwner?'OWNER ':'') +
                    (s.name?('name=' +s.name):('className=' + s.className)));
        }

        console.log('====================================================')

    }

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

        mw_addActor(url, null, { mw: mw });
    });
}
