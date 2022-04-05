const ProxyServer = require('../ProxyServer');

function sleep(ms) {
    return new Promise(function(res, rej) {
        setTimeout(res, ms);
    });
}

const server = new ProxyServer({
    upstream: async function(data, bridgedConnection) {
        // await sleep(1000);
        if (~(data.toString().indexOf('ifconfig.me'))) {
            return 'x.x.x:10001'; //upstream to myProxy
        }
        else if (~(data.toString().indexOf('ifconfig.co'))) {
            return 'x.x.x:10002'; //upstream to another proxy
        }
        else {
            return 'localhost'; // upstreaming to localhost
        }
    },
});

//starting server on port 1555
server.listen(8080, '0.0.0.0', function() {
    console.log('TCP-Proxy-Server started!', server.address());
});
