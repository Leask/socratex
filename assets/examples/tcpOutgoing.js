const { Socratex } = require('../index.mjs');

//init Socratex
const server = new Socratex({
    tcpOutgoingAddress: function(data, connection) {
        return 'x.x.x.x'; //using other iFace as default
    }
});

//starting server on port 1555
server.listen(8080, 'y.y.y.y', function() {
    console.log('socratex Server was started!', server.address());
});
