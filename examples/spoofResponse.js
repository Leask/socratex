const ProxyServer = require('../ProxyServer');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

const toTest = ['http://v4.ident.me/', 'https://v4.ident.me/'];

const ipToSwitch = 'x.x.x.x';
const switchWith = 'bla.bla.bla.bla';

const server = new ProxyServer({
    injectResponse: (data, session) => {
        if (!session.isHttps) {
            //you can spoof here
            if (data.toString().match(ipToSwitch)) {
                const newData = Buffer.from(data.toString()
                    .replace(new RegExp('Content-Length: ' + ipToSwitch.length, 'gmi'),
                        'Content-Length: ' + (switchWith.length))
                    .replace(ipToSwitch, switchWith));

                return newData;
            }
        }
        return data;
    }
});

const port = 10001;
//starting server on port 10001
server.listen(port, '0.0.0.0', async function() {
    console.log('socrates was started!', server.address());

    for (const singlePath of toTest) {
        const cmd = 'curl' + ' -x localhost:' + port + ' ' + singlePath;
        console.log(cmd);
        const { stdout, stderr } = await exec(cmd);
        console.log('Response =>', stdout);
    }
    server.close();
});

// curl -x localhost:10001 http://v4.ident.me/
// Response => bla.bla.bla.bla
// curl -x localhost:10001 https://v4.ident.me/
// Response => x.x.x.x
