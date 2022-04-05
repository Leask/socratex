const ProxyServer = require('../ProxyServer');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

const toTest = ['http://v4.ident.me/', 'https://v4.ident.me/'];

const server = new ProxyServer({
    intercept: true,
    injectResponse: (data, session) => {
        const ipToSwitch = 'x.x.x.x';
        const switchWithIp = '6.6.6.6';
        // console.log('session.isHttps', session.isHttps)
        if (session.isHttps) {
            const newData = Buffer.from(data.toString()
                .replace(new RegExp('Content-Length: ' + ipToSwitch.length, 'gmi'),
                    'Content-Length: ' + (switchWithIp.length))
                .replace(ipToSwitch, switchWithIp));
            return newData;
        }
        return data;
    }
});

const port = 10001;
//starting server on port 10001
server.listen(port, '0.0.0.0', async function() {
    console.log('socrates was started!', server.address());

    for (const singlePath of toTest) {
        const cmd = 'curl' + ' -x localhost:' + port + ' -k ' + singlePath;
        console.log(cmd);
        const { stdout, stderr } = await exec(cmd);
        console.log('Response =>', stdout);
    }
    server.close();
});
