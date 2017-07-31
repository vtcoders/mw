/* We have 3 run cases: 
 *
 *   1. running mw_server from some where else where it's installed:
 *
 *     - mw_server can be in your PATH, and can run many instances
 *
 *   2. running mw_server from the source directory:
 *
 *     - Easier for development
 *
 *   3. you can run 'node lib/mw_server.js'
 *
 *     - This works but does not have the builders configuration changes
 *       to the default parameters from running ./configure
 *
 * All these cases need to be tested to make a release.
 *
 * We also keep it so that if a user wishes to they may move the whole
 * installed directory tree to a different directory and still be able to
 * use it without any changes to any file.  They just need to keep the
 * installed files with all their relative paths the same.  To make this
 * so, we require that all these projects files must not depend on the
 * absolute path, at least at startup time, and the path to other
 * installed project files must be computed from __dirname in this file,
 * or be a relative path (not full path).
 *
 * Hence the structure of the source files is the same as the installed
 * files.
 *
 * In nodeJS __dirname resolves symlinks to the real full path.  That's
 * just what it does, so we work with it.
 */


// For debug spew call debug(message) This is kind-of like MICRO/TEMPLATE
// coding in that when we call debug() we are calling console.log() and
// the function stack does not add a wrapper function.  TODO: This
// can be used for powerful MICRO-like debugging stuff.
var debug = console.log.bind(console);


function assert(val, message = '') {
    if(val) return;
    console.log('Assertion failed: ' + message);
    console.log(new Error().stack);
    // Flush stdout and then exit
    sys.stdout.write(' ', function() {
        process.exit(1);
    });
}

/* config is defined above then this program spliced together via 'make'. */

if(config == null)
    var config = {};

/* Command line and environment optional configuration override some
 * config values via this local 'options' module. */
require("./options").parse(config);


var path = require('path'),
    fs = require('fs'),
    https = require('https').createServer({
            key: fs.readFileSync(path.join(config.etc_dir, 'key.pem')),
            cert: fs.readFileSync(path.join(config.etc_dir, 'cert.pem'))
        }, https_handler).listen(config.https_port);

if(config.http_local)
    var http = require('http').createServer(http_handler).
        listen(config.http_port, 'localhost');
else
    var http = require('http').createServer(http_handler).
        listen(config.http_port);

var
    webSocket = require('ws'),
    url = require('url'),
    querystring = require('querystring'),
    wss = new webSocket.Server({server: https}),
    ws = new webSocket.Server({server: http}),
    glob = require("glob");

// WS reference doc:
// https://github.com/websockets/ws

// TODO: should TLS and non-TLS worlds inter-mix; that is http: vs https:
// webSocket connections share, for now, I think yes, given that we can
// restrict the http server to just localhost.

// We have two WebSocket listening servers:
//
// This server shared with the https server.
wss.on('connection', function(socket) { ws_OnConnection(socket); });
//
// This server shared with the http server.
ws.on('connection', function(socket) { ws_OnConnection(socket); });




// Sends a file.
// TODO: there is no way this is efficient for large files.
function sendFile(req, res, pathname, fullpath)
{
    fs.readFile(fullpath, function(err, data) {
        if (err) {
            res.writeHead(500);
            res.end('Error getting ' + pathname);
            console.error(err);
            return;
        }

        res.writeHead(200);
        res.end(data);
        debug('HTTP(S) sent ' + pathname + ' to ' +
                req.connection.remoteAddress + ':' +
                req.connection.remotePort);
    });
}


function http_handler(req, res) 
{
    var urL = url.parse(req.url);
    var pathname = urL.pathname;

    if(config.mw_dir_str !== pathname.substr(0, config.mw_dir_str_length) ) {
        // regular file not beginning with '/mw/'
        sendFile(req, res, pathname, config.doc_root + pathname);
        return;
    }

    // It is an internal mirror worlds path/usr/local/encap/name beginning with '/mw/'

    sendFile(req, res, pathname, path.join(config.mw_prefix, pathname));
}


function pack(xxx) {

    // arguments is not an Array, so we convert it
    var args = [].slice.call(arguments);
    var name = args.shift();
    return JSON.stringify({ name: name, args: args });
}


// TODO: add rooms.  Rooms categorize subscriptions.


// This is a Socket.IO like interface to write in a Socket.IO like format
// to all the WebSocket clients in both the http and https services.
// This should be faster than looping through socket.Emit() because
// we only pack the data once here.
function Broadcast(name, data) {

    var data = pack(...arguments);

    var thisSocket = this;

    function send(clients) {
        clients.forEach(function(client) {
            if(client.readyState === webSocket.OPEN &&
                    // Exclude this webSocket client if
                    // set
                    thisSocket !== client) {
                client.send(data);
            }
        });
    };
    send(ws.clients);
    send(wss.clients);
};


// Some globals to keep state for all the servers.

var subscriptions = {}, // subscriptions for clients keyed by ID

    subCount = 0, // used for unique client source ID starting at 1
    // subCount never decreases.

    clientCount = 0; // used for unique client ID starting at 1
    // clientCount never decreases.


// factory for subscriptions
function newSubscription(name, className, shortName, description,
        isSubscribed, isOwner, parentId, socket) {

    // Just for debugging:
    function printSubscriptions() {

        console.log(
                    "------------------------------------------------\n" +
                    "-             Subscriptions                    -\n" +
                    "------------------------------------------------");
        for(var k in subscriptions) {
            var s = subscriptions[k];
            if(s.name === k) continue;
            var subscribers = '';
            var owners = '';
            var comma = '';
            for(var k in s.subscribers) {
                subscribers += comma + s.subscribers[k].clientId;
                comma = ',';
            }
            comma = '';
            for(var k in s.owners) {
                owners += comma + s.owners[k].clientId;
                comma = ',';
            }

            console.log('  (' + s.id + ') ' + s.shortName +
                        '  subscribers=[' + subscribers + ']' +
                        '  owners=[' + owners + ']');
        }
        console.log(
                    "------------------------------------------------\n");
    }


    var id = (subCount++).toString();

    var s = {
        id: id,
        parentId: parentId,
        name: name,
        className: className,
        shortName: shortName + '_' + id,
        description: description,
        subscribers: {}, // list of webSockets that subscribe (read)
        // owners is the list of webSockets that claim ownership to
        // this subscription
        payload: null, // The last payload set.
        owners: {},
        // sends payload to the socket of all subscribers.
        sendPayload: function() {
            // send to all reader sockets
            if(this.payload)
                for(var k in this.subscribers)
                    this.subscribers[k].sendPayload(this);
        },
        subscribe: function(sock=null) {
            assert(sock);
            // add a webSocket reader to the list
            if(this.subscribers[sock.clientId] === undefined) {
                this.subscribers[sock.clientId] = sock;
                if(this.payload)
                    sock.sendPayload(this);
            }
            printSubscriptions();
        },
        unsubscribe: function(sock=null) {
            // remove a webSocket reader from the list
            assert(sock);
            if(this.subscribers[sock.clientId] !== undefined)
                delete this.subscribers[sock.clientId];
            printSubscriptions();
        },
        makeOwner: function(sock, isOwner) {
            // add a webSocket reader to the list
            if(this.owners[sock.clientId] === undefined && isOwner)
                this.owners[sock.clientId] = sock;
            else if(this.owners[sock.clientId] !== undefined && !isOwner)
                delete this.owners[sock.clientId];
            printSubscriptions();
        },
        destroy: function() {
            assert(this.id);
            // Tell all clients, not just subscribers
            Broadcast('destroy', this.id);
            // We may be referring to it by name, if it has
            // a name.
            if(this.name) {
                assert(subscriptions[this.name] !== undefined,
                        'cannot delete subscription name=' + this.name);
                delete subscriptions[this.name];
            }
            // We also must refer to it by id.
            delete subscriptions[this.id];
            printSubscriptions();
        }
    };

    if(isSubscribed)
        s.subscribers[socket.clientId] = socket;

    if(isOwner)
        s.owners[socket.clientId] = socket;

    subscriptions[id] = s; // save it in the global store

    if(name) {
        assert(name.length > 0, 'zero length subscription name');
        // We get to this record by name too.  We have to refer to it
        // by name so clients that are not subscribed can ask for it
        // by name.  Note this is set to a reference and not an object
        // copy, that's just what javaScript does.
        subscriptions[name] = s;
    }

    printSubscriptions();

    return s;
}



// WS reference doc:
// https://github.com/websockets/ws
//
// ws is associated with the https server or the http server.
//
function ws_OnConnection(socket) {
 
    // Some care has been taken to make some variables and functions
    // private and some variables and functions public.

    // function private data:
    var onCalls = {};
    // set client ID // note socket.clientId is public
    var clientId = socket.clientId = (++clientCount).toString();

    // Just a object local console.log() wrapper to keep prints starting
    // the same prefix for all this MW object.  By using bind we keep the
    // line number where log() was called output-ed to console.log(), a
    // simple function wrapper will not give correct line numbers (in a
    // browser at least). This totally rocks, it's so simple and bullet
    // proof.
    var debug = console.log.bind(console, 'MW Client[' + clientId +
            '] (' + socket._socket.remoteAddress + ':' +
            socket._socket.remotePort + '):');

    debug('connected');

    // We are making an object like a socket.io socket connection object
    // but we are not overriding the on method that already exists in "ws"
    // WebSockets so we use "on" and we do not expose this method, as
    // in providing the socket.on('event-label', function(a,b,...) { });
    // interface.  We keep the function private.
    function on(name, func) {
        onCalls[name] = func;
    };

    // This will broadcast() to all but this socket (client).
    socket.Broadcast = Broadcast;


    // Write to this socket a Socket.IO-like message.
    //
    // TODO: There maybe a socket.emit already used
    // internally in ws, so we use "Emit" and not "emit".
    //
    // Not the same as socket.sendPayload() which writes the current
    // subscription content (payload) to the client using a different data
    // format.
    socket.Emit = function(name, data) {

        // This will not send payloads so we can debug spew here:
        if(socket.readyState === webSocket.OPEN) {
            // TODO: remove debug spew on release build.
            var message = pack(...arguments);
            debug('sending message:\n   ' + message);
            socket.send(message);
        }
    };

    
    socket.Emit('initiate', clientId);


    // Sends advertisements for subscriptions
    // TODO: Currently just subscription with a
    // className (subscriptions of a class)
    // are sent.
    //
    // This is odd, but what we need to do:
    // if sock === null: sends to socket
    // else: sends to all sockets but sock
    function advertise(sock=null, subs=null) {

        function getAd(s) {
            // Must be a classy subscription
            assert(s && s.className);
            // Important to keep this format in one place:
            return {
                id: s.id,
                className: s.className,
                shortName: s.shortName,
                parentId: s.parentId
            };
        }

        if(!subs) {
            // Send all classy subscriptions
            var subs = [];
            for(var k in subscriptions) {
                var s = subscriptions[k];
                if(s.className)
                    subs.push(getAd(s));
            }
            if(subs.length < 1)
                // there are none
                return;
        } else if(typeof subs !== "array")
            var subs = [].push(getAd(subs));

        if(sock)
            // Sends to all sockets but sock
            sock.Broadcast('advertise', subs);
        else
            // Sends to this socket
            socket.Emit('advertise', subs);
    }


    // Advertise all subscriptions of a class (have className)
    advertise();


    socket.on('message', function(message) {

        debug('message in:\n   ' + message);
        
        // Look for 'P' for Payload the magic constant.
        if(message.substr(0, 1) === 'P') {

            // This is a message to a subscription

            // The message should be of the form: 'P343=' + jsonString
            // where 343 is an example source ID.
            // An example of a minimum message would be like 'P2={}'
            var idLen = 1;
            var stop = message.length - 3;
            // find a '=' so the ID is before it.
            while(idLen < stop && message.substr(idLen+1, 1) !== '=')
                ++idLen;
            
            if(idLen === stop) {
                debug('BAD message:\n   ' + message);
                return;
            }


            // Get the subscription ID and send the Payload as is.
            // We never unpack this message on the server.
            var id = message.substr(1, idLen);

            // Save the payload/message
            // This will be like the payload in: P23=payload
            // payload should be a JSON string
            subscriptions[id].payload = message;
            subscriptions[id].sendPayload(); // to all readers

            /*debug('Sent subscription (' +
                subscriptions[id].shortName +
                ']: ' + message); */

            return;
        }

        // This is a message to the Socket.IO like interface that
        // we made here this WebSocket connection object/function,
        // or an error.

        // unpack the data
        var obj = JSON.parse(message);
        var name = obj.name;

        // We should have this form:
        // e.data = { name: eventName, args:  [ {}, {}, {}, ... ] }
        if(name === undefined || obj.args === undefined ||
                !(obj.args instanceof Array)) {
            debug('BAD message:\n   ' + message);
            return;
        }

        if(onCalls[name] === undefined) {
            debug('"' + name +
                '" callback not found for message:\n   ' +
                message);
            return;
        }

        // Call the on callback function using array spread syntax.
        (onCalls[name])(...obj.args);

        debug('message "' + name + '" on() callback handled')
    });


    // TODO: this is yet another security hole.  They could glob
    // something like '../../../../../*' and that would be bad.
    // They could list every file on the computer that the server
    // could read.
    on('glob', function(expression, requestId) {
        glob(path.join(config.mw_prefix, expression),
                function (err, files) {
                    var ret = [];
                    files.forEach( function(file) {
                        ret.push(file.replace(config.mw_prefix, ''));
                    });
                    socket.Emit('glob', requestId, err, ret);
                }
        );
    });


    // Send current subscription payload to this webSocket.  We make
    // this method public so the every webSocket object may write to other
    // webSocket objects.
    socket.sendPayload = function(subscription) {
        if(socket.readyState === webSocket.OPEN)
            socket.send(subscription.payload);
    };


    // client request to get a subscription, new or existing:
    on('get', function(clientkey, name,
                className, shortName, description,
                isSubscribed, isOwner, parentId) {

        assert((name || className) && !(name && className));

        if(className || subscriptions[name] === undefined) {
            // We create a new subscription in this case:
            var s =  newSubscription(name, className, shortName, description,
                    isSubscribed, isOwner, parentId, socket);
            var thisClientIsCreator = true;
        } else {
        
            // This subscription exists already.
            assert(name && subscriptions[name] !== undefined, '')
            var s = subscriptions[name];
            s.makeOwner(socket, isOwner);
            if(isSubscribed)
                s.subscribe(socket);
            var thisClientIsCreator = false;
        }

        // Tell the client the id and so on:
        socket.Emit('get', s.id, clientkey, s.name,
                    s.className, s.shortName, thisClientIsCreator);

        if(className)
            // A subscription class is a group of subscriptions.

            // A subscription class is a subscription that uses the same
            // client javaScript code for all subscription of that
            // class.

            // This is yet another of this class.  So it's a new
            // subscription, but the client should already know how to use
            // it like all subscriptions of this class.  We just need to
            // advertise it to them.

            // Send to all clients but the one with this socket.
            //
            // TODO: advertise subscriptions that load new javaScript
            // files.
            advertise(socket/*not to*/, s);
    });


    // Many network events have this same form for the webSocket on()
    // handlers (callbacks).  They all just call the subscription object
    // method with the arguments that come from the arguments that are
    // send in the webSocket.  We set them up here in this array.forEach()
    // loop.
    //
    // Put another way: Network-ify these subscription methods.
    ['destroy', 'subscribe', 'unsubscribe', 'makeOwner'].
        forEach(function(eventName) {
            on(eventName, function(id, isOwner) {
                if(subscriptions[id] === undefined)
                    // This is an old subscription that will never exist
                    // again.  The request is too late.  No big deal.
                    return;
                (subscriptions[id][eventName])(socket, isOwner);
            });
    });



    // On the webSocket 'close' event:
    socket.on('close', function() {

        debug('closing');

        var keys = Object.keys(subscriptions);

        var ids = [];

        // We need to use only keys that are subscription
        // IDs.
        // TODO: This seems to be the only place we do this, but maybe we
        // add an id list if this is needed again.
        keys.forEach(function(key) {
            if(subscriptions[key].name !== key)
                ids.push(key);
        });

        ids.forEach(function(id) {

            var s = subscriptions[id];

            if(s.subscribers[clientId] !== undefined)
                delete s.subscribers[clientId]

            if(s.owners[clientId]) {
                delete s.owners[clientId];
                if(Object.keys(s.owners).length < 1)
                    s.destroy();
            }
        });

        debug('closed');
    });
}



function https_handler(req, res) {

    // This handler just adds some authentication and then calls
    // the http handler.

    function parseCookies(req) {
        var list = {},
        rc = req.headers.cookie;

        rc && rc.split(';').forEach(function( cookie ) {
            var parts = cookie.split('=');
            list[parts.shift().trim()] = decodeURI(parts.join('='));
        });

        return list;
    }

    if(config.passcode.length > 0) {
    ////////////////////////////////////////////////////////////////////
    // Restrict access to this server.
    // We do this by:
    //
    //      Checking that a valid session cookie (passcode) was sent
    //
    //                 or
    //
    //      A valid query with the passcode, and then set a passcode
    //      session cookie
    //
    //

    var obj = querystring.parse(url.parse(req.url).query);
    var cookie = parseCookies(req);
    var need_pass_cookie = (!cookie.passcode ||
           cookie.passcode != config.passcode);

    if(need_pass_cookie &&

            (!obj.passcode || obj.passcode.length < 1 ||
            obj.passcode != config.passcode)) {

        debug('rejected connection from address:  ' +
                req.connection.remoteAddress.replace(/^.*:/, '') +
                ' invalid passcode');

        // TODO: IS there a way to close the socket after the end()

        res.writeHead(500, {"Content-Type": "text/plain"});
        res.write("\nBad passcode\n\n");
        res.end();
        return;
    } else if(need_pass_cookie)
        res.setHeader('Set-Cookie', 'passcode=' + config.passcode);
    }

    // Do the same thing as in a http request.
    http_handler(req, res);
}


// TODO: change this:
var commonPath = '/mw/devel_index.html';


// Startup spew to stderr when the server is running, nothing more.
http.on('listening', function() {

    var address =  http.address();

    // If there is no binding (or so called ANY) address than we will be
    // listening on all Internet interfaces, including localhost
    // (127.0.0.1) if it's setup and usable.  It should be called "all
    // addresses".
    //
    // nodejs http server has address='::' for the ANY address interface,
    // or so it appears.  Must be IPv6.
    //
    // Since the native nodejs does not provide an interface to get all
    // known IP interfaces, we just punt and use 'localhost' and
    // 'hostname', where hostname may not even have a working DNS
    // lookup.

    if(address.address.toString() === '::')
        console.error('Server listening on All Addresses on port ' +
                address.port + "\n" +
                'So you may be able to connect via:\n\n' +
                '           http://localhost:' + address.port +
                commonPath +
                '\n      or:  http://' + require('os').hostname() +
                ':' + address.port + commonPath + '\n');
    else
        console.error('Server listening at:\n\n           http://' +
                address.address + ':' + address.port + commonPath + '\n');
});


// Startup spew for the TSL version of the server.
https.on('listening', function() {

    var address = https.address();
    var passcode = '';
    if(config.passcode.length > 0)
        passcode = '?passcode=' + config.passcode;

    if(address.address.toString() === '::')
        console.error('Secure server listening on All Addresses on port ' +
                address.port + "\n" +
                'So you may be able to connect via:\n\n' +
                '           https://localhost:' + address.port +
                commonPath  + passcode +'\n' +
                '      or:  https://' + require('os').hostname() +
                ':' + address.port + commonPath + passcode + '\n');
    else
        console.error('Secure server listening at:\n\n           http://' +
                address.address + ':' + address.port + commonPath +
                passcode) + '\n';
});
