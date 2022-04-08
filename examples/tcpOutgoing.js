const { Socrates } = require('../index.mjs');

//init Socrates
const server = new Socrates({
    tcpOutgoingAddress: function(data, connection) {
        return 'x.x.x.x'; //using other iFace as default
    }
});

//starting server on port 1555
server.listen(8080, 'y.y.y.y', function() {
    console.log('socrates Server was started!', server.address());
});
