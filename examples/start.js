const { Socrates } = require('../index.mjs');

//init Socrates
const server = new Socrates({});

//starting server on port 1555
server.listen(8080, '0.0.0.0', function() {
    console.log('TCP-Proxy-Server started!', server.address());
});
