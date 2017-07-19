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
wss.on('connection', function(socket) { ws_OnConnection(socket, wss); });
//
// This server shared with the http server.
ws.on('connection', function(socket) { ws_OnConnection(socket, ws); });


// Some globals to keep state for all the servers.

var subscriptions = {}, // subscriptions for clients keyed by ID

    subCount = 0, // used for unique client source ID starting at 1
    // subCount never decreases.

    clientCount = 0; // used for unique client ID starting at 1
    // clientCount never decreases.



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
        console.log('HTTP(S) sent ' + pathname + ' to ' +
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

    // It is an internal mirror worlds pathname beginning with '/mw/'

    sendFile(req, res, pathname, path.join(config.mw_prefix, pathname));
}


function pack(xxx) {

    // arguments is not an Array, so we convert it
    var args = [].slice.call(arguments);
    var name = args.shift();
    return JSON.stringify({ name: name, args: args });
}


// TODO: add rooms.  Rooms categorize subscriptions.
function Broadcast(name, data) {

    var data = pack(...arguments);

    function send(clients) {
        clients.forEach(function(client) {
            if(client.readyState === webSocket.OPEN)
                client.send(data);
        });
    };
    send(ws.clients);
    send(wss.clients);
};


// WS reference doc:
// https://github.com/websockets/ws
//
// ws is associated with the https server or the http server.
//
function ws_OnConnection(socket, ws) {
  
    var address = socket._socket.remoteAddress + ':' +
            socket._socket.remotePort;

    socket.OnCalls = {};
    socket.Id = ++clientCount; // set client Id
    socket.Owns = {}; // Source ID of subscriptions that this client owns
    socket.Reads = {};   // Source ID of subscriptions this client reads


    console.log('New Client(' + socket.Id +
                ') connection from ' + address);

    // We are making an object like a socket.io socket connection object
    // but we are not overriding the on method that already exists in "ws"
    // WebSockets so we use "On".
    socket.On = function(name, func) {

        socket.OnCalls[name] = func;
    };

    // Write to just this socket.  There is a socket.emit already used
    // internally in ws, so we use "Emit" and not "emit".
    socket.Emit = function(name, data) {

        // This will not send payloads so we can debug spew here:
        if(socket.readyState === webSocket.OPEN) {
            // TODO: remove debug spew on release build.
            var message = pack(...arguments);
            console.log('MW Client(' + socket.Id + ') send to ' + address +
                    '\n   ' + message);
            socket.send(message);
        }
    };


    socket.on('message', function(message) {

        //console.log('MW Client(' + socket.Id +
        //        ') message from ' + address + ':\n  ' + message);

        // Look for 'P' for Payload the magic constant.
        if(message.substr(0, 1) === 'P') {

            // The message should be of the form: 'P343=' + jsonString
            // where 343 is an example source ID.
            // An example of a minimum message would be like 'P2={}'
            var idLen = 1;
            var stop = message.length - 3;
            // find a '=' so the ID is before it.
            while(idLen < stop && message.substr(idLen+1, 1) !== '=')
                ++idLen;
            
            if(idLen === stop) {
                console.log('MW Client(' + socket.Id +
                        ') message from ' + address +
                        ' was BAD\n   ' + message);
                return;
            }

            //console.log('WebSocket message from ' + address +
            //        ':\n  ' + message);

            // Get the source ID and send the Payload as is.
            // We never unpack this message on the server.
            var sourceId = message.substr(1, idLen);
            var clients = mw.sources[sourceId].sinks;
            mw.sources[sourceId].payload = message;

            for(id in clients) {
                if(clients[id].readyState === webSocket.OPEN)
                    clients[id].send(message);
            }

            //console.log('Sent Payload: ' + message);

            return;
        }


        // unpack the data
        var obj = JSON.parse(message);
        var name = obj.name;

        // We should have this form:
        // e.data = { name: eventName, args:  [ {}, {}, {}, ... ] }
        if(name === undefined || obj.args === undefined ||
                !(obj.args instanceof Array)) {
            console.log('MW Bad Client(' + socket.Id +
                    ') message from ' + address +
                    '\n  ' + message);
            return;
        }
           

        if(socket.OnCalls[name] === undefined) {
            mw_fail('MW Client(' + socket.Id +
                    ') on callback "' + name +
                    '" not found for message from ' + address + ':' +
                    '\n  ' + message);
            return;
        }

        console.log('MW Client(' + socket.Id +
                ') handled message from ' + address + '\n   ' +
                message);

        // Call the on callback function using array spread syntax.
        (socket.OnCalls[name])(...obj.args);
    });


    // TODO: this is yet another security hole.  They could glob
    // something like '../../../../../*' and that would be bad.
    // They could list every file on the computer that the server
    // could read.
    socket.On('glob', function(expression, requestId) {
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


    socket.On('initiate', function() {

        console.log('MW Client(' + socket.Id  +
                    ') initate from ' + address);
    });


    socket.Emit('initiate', socket.Id);


    socket.On('advertise', function(sourceId) {

     });



    socket.on('close', function() {

        console.log('MW Client(' + socket.Id + ') closed from ' + address);

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

        console.log('rejected connection from address:  ' +
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
