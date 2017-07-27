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

            mw_assert(subscriptions[sourceId] !== undefined,
                    'subscription with ID=' + sourceId + ' was not found');
            // There is an option to not have a callback to receive
            // the payload with subscriptions[sourceId].readPayload === null.
            if(subscriptions[sourceId].readerFunc)
                (subscriptions[sourceId].readerFunc)(...obj.args);
            else {
                debug('No readerFunc(P=' + sourceId +
                    ') was set yet. Saving payload for later: ' +
                        subscriptions[sourceId].readerFunc);
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



    // We setup subscription objects after the server tells
    // us about them in the 'advertise' and 'get' subscription
    // server reply events.  The 2 functions just below:
    function setUpSubscriptionFromClass(id, name, className, shortName,
                description, javaScriptUrl)
    {
        if(subscriptions[id] !== undefined)
            // That's okay we know about this subscription already.
            return; // Do nothing.

        subscriptions[id] = subscriptions[className].copy();

        var s = subscriptions[id];

        s.id = id;
        s.shortName = shortName;

        if(s.isSubscribed) {
            // reset subscribe
            s.isSubscribed = false;
            s.subscribe();
        }

        printSubscriptions();
    }



    // Learn of an existing subscription on the server.  We are
    // not the subscription creator in this case.  This is NOT
    // in reply from a request from this client.
    //
    // TODO: currently this only learns about subscriptions that have a
    // className.
    on('advertise', function(id, name, className, shortName,
                description, javaScriptUrl) {

        mw_assert(className, "'advertise' className was not set");
        
        // TODO: add additional javaScript loading for the subscription

        if(subscriptions[className] === undefined) {
            if(advertisements[className] === undefined)
                advertisements[className] = [];
            // Save this for later after some javaScript is loaded?
            advertisements[className].push([].slice.call(arguments));
            return;
        }

        setUpSubscriptionFromClass(id, name, className, shortName,
                description, javaScriptUrl);
    });



    // Called on server respond to clients 'get' request emit('get', ...)
    // We may or may not be the subscription creator in this case.
    // This is in reply to a client 'get' request.
    on('get', function(id, clientKey, name, className,
                shortName, thisClientIsCreator) {

        mw_assert(subscriptions[clientKey] !== undefined, '');

        if(name) {
            // There will be no more new subscriptions with this name or
            // clientKey, so we do not need this record any more.
            // subscriptions with a 'name' only get created once.
            mw_assert(name !== clientKey,
                    "Bad clientKey ('" + clientKey + "') subscription");
            // Swap the key for this subscription to use the id from
            // the server.
            var s = subscriptions[id] = subscriptions[clientKey];
            // We don't need this additional reference to this any more.
            delete subscriptions[clientKey];
        } else {
            mw_assert(clientKey === className, '');
            // This is a new subscription from a subscription class
            // so we keep the subscription class and copy it.
            // One copy is for all subscriptions in the class and one [id]
            // is active.
            subscriptions[id] = subscriptions[clientKey].copy();
            var s = subscriptions[id];
        }

        s.shortName = shortName;
        s.id = id;

        if(thisClientIsCreator && s.creatorFunc) {
            // We could not do this before the server replied because we
            // did not know if we are the creator of this subscription, at
            // least for the case of "named" subscriptions.
            //
            // If a creator function is set, we call it as an object
            // subscription method.  It can call any of the subscription
            // object methods that we set above.
            s.creatorFunc();
        }

        // We don't need the subscription creator callback any more.
        delete s.creatorFunc;

        if(advertisements[className] !== undefined) {
            // We got other subscriptions of this class before now
            // in an 'advertise' from the server
            advertisements[className].forEach(function(args) {

                setUpSubscriptionFromClass(...args);
            });
            delete advertisements[className];
        }

        printSubscriptions(); // debug printing
    });


    // A private factory that returns subscription objects.  These objects
    // returned will not have an associated subscription ID on the server.
    // They are not initialized for use.
    function newSubscription(
            name, className,
            shortName, description,
            creatorFunc, readerFunc, cleanupFunc, haveParent=false) {

        mw_assert((name && name.length > 0) ||
                (className && className.length > 0),
                'neither name or className are set');

        mw_assert(!name || !className,
                'both name and className are set');

        var lname = name?name:className;

        if(!haveParent)
            // name and className may not have a '/' in it.
            mw_assert(lname.indexOf('/') === -1,
                "name or className (" + lname + ") has a '/' in it.");

        // If these 2 default values change you need to
        // change other stuff.
        var defaults = {
            isOwner: false,
            isSubscribed: true
        };


        // make a subscription object explicitly
        var subscription = {
            id: null,

            isSubscribed: defaults.isSubscribed,
            isOwner: defaults.isOwner,

            children: [],
            parenT: null,

            name: name,
            className: className,
            shortName: shortName,
            creatorFunc: creatorFunc,
            readerFunc: null,
            readerFunc_save: readerFunc,
            cleanupFunc: cleanupFunc,
            // We buffer incoming payloads if we get some
            // while we are not ready to read.
            readPayload: null,

            // copy() returns a copy of this object.
            // var obj2 = obj1 does not work, obj2 is a reference
            // to obj1 and so changing obj2 fields changes obj1
            // fields.; so we may make subscriptions for a
            // subscription class.
            // TODO: Currently just used to copy a subjection
            // that is a subscription class
            copy: function() {
                mw_assert(!this.id && className, '');
                var ret = {};
                // copy just one level deep
                // TODO: if objects get deeper we need
                // to add more code here.
                for(var k in this)
                    ret[k] = this[k];
                for(var k in defaults)
                    ret[k] = defaults[k];
                // Do not share the children
                ret.children = [];
                return ret;
            },
            subscribe: function() {
                mw_assert(this.id, 'not initialized');
                if(this.isSubscribed) return;
                emit('subscribe', this.id);
                this.isSubscribed = true;
                this.readerFunc = this.readerFunc_save;
                if(this.readPayload && this.readerFunc) {
                    this.readerFunc(readPayload);
                    readPayload = null;
                }
            },
            destroy: function() {
                mw_assert(this.id, 'not initialized');
                emit('destroy', this.id);
            },
            unsubscribe: function() {
                mw_assert(this.id, 'not initialized');
                if(!this.isSubscribed) return;
                emit('unsubscribe', this.id);
                this.isSubscribed = false;
                this.readerFunc = null;
            },
            write: function() {
                mw_assert(this.id, '');
                ws.send('P' + this.id + '=' +
                    JSON.stringify({ args: [].slice.call(arguments)}));
                // We do not use the readerFunc until this comes back from
                // the server.  That will keep the subscription
                // consistent payload with all clients.
            },
            // make this WebSocket client an owner
            makeOwner: function(isOwner=true) {
                mw_assert(this.id, 'not initialized');
                if(this.isOwner === isOwner) return;
                emit('makeOwner', this.id, isOwner);
                this.isOwner = isOwner;
            },
            getSubscription:
                function(name, shortName, description,
                        creatorFunc, readerFunc=null, cleanupFunc=null) {
                    mw_assert(this.id, 'not initialized');
                    mw_assert(name.indexOf('/') === -1,
                        "name (" + name + ") has a '/' in it.");
                    var child = newSubscription(this.id + '/' + name,
                            null, shortName, description,
                            creatorFunc, readerFunc, cleanupFunc,
                            true/*have Parent*/);
                    this.children.push(child);
                    child.parenT = this;
                    // TODO: add more parent child subscription relations
            },
            getSubscriptionClass:
                function(className, shortName, description,
                        creatorFunc, readerFunc=null, cleanupFunc=null) {
                    mw_assert(this.id, 'not initialized');
                    mw_assert(className.indexOf('/') === -1,
                        "className (" + className + ") has a '/' in it.");
                    var child = newSubscription(null,
                            className, shortName, description,
                            creatorFunc, readerFunc, cleanupFunc,
                            true/*have Parent*/);
                    this.children.push(child);
                    child.parenT = this;
                    // TODO: add more parent child subscription relations
            },

            // Set a new reader callback function
            setReader: function(readerFunc) {
                mw_assert(this.id, 'not initialized id=' + this.id);
                // This will be the read function if we subscribe
                this.readerFunc_save = readerFunc;
                if(this.isSubscribed) {
                    this.readFunc = readerFunc;
                    if(this.readPayload && readerFunc) {
                        this.readerFunc(this.readPayload);
                        this.readPayload = null;
                    }
                }
                console.log('\n\n\n subscription ID=' + this.id +
                        '  readerFunc set to: ' + readerFunc + '\n\n');
            },
            setCleanup: function(cleanupFunc) {
                mw_assert(this.id, 'not initialized');
                this.cleanupFunc = cleanupFunc;
            }
        };

        ++getSubscriptionCount;

        // Make a key to store the subscription on this client for
        // until the server sends us an id via 'get' reply
        if(name)
            // TODO: confirm this is a unique key for object subscriptions
            // by just looping until it is.  Unlikely it is not...
            var clientKey = ' k-e- yZ' + getSubscriptionCount.toString();
        else
            var clientKey = className;

        // Add it to the list of subscriptions:
        subscriptions[clientKey] = subscription;


        // Talk to the server.
        // We get a 'get' response with a subscription ID later.
        emit('get', clientKey, name, className, shortName, description,
                subscription.isSubscribed, subscription.isOwner);

        return subscription;
    }


    // Create a named subscription.  Clearly the creatorFunc is ignored if
    // the subscription exists on the server already.
    mw.getSubscription = function(
            name,
            shortName, description,
            creatorFunc=null, readerFunc=null, cleanupFunc=null) {

        newSubscription(
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

        newSubscription(
                null, className, shortName, description,
                creatorFunc, readerFunc, cleanupFunc);
    };


    // This function just spews for debugging and does nothing
    // else.
    var printSubscriptions = 
    mw.print = function() {

        debug('Subscriptions:');
        console.log('=========== Current Subscriptions =================');

        for(var key in subscriptions) {
            var s = subscriptions[key];
            if(s.id)
                console.log('   [' + s.id + '] shortName=' +
                    s.shortName + ' ---  ' +
                    (s.isSubscribed?'SUBSCRIBED ':'') +
                    (s.isOwner?'OWNER ':'') +
                    (s.name?('name=' +s.name):('className=' + s.className)));
        }

        console.log('=========== Subscription Classes ============');

        for(var key in subscriptions) {
            var s = subscriptions[key];
            if(!s.id)
                console.log('   [' + key + '] shortName=' +
                    s.shortName);
        }

        console.log('====================================================')
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

        mw_addActor(url, null, { mw: mw });
    });
}
