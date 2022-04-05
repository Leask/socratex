const ProxyServer = require('../ProxyServer');

const server = new ProxyServer();

//starting server on port 1555
server.listen(1555, '0.0.0.0', function () {
    console.log('TCP-Proxy-Server started!', server.address());
});

setInterval(function showOpenSockets() {
    const bridgedConnections = server.getBridgedConnections();
    console.log([new Date()], 'OPEN =>', Object.keys(bridgedConnections).length)
}, 2000);