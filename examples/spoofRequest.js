const ProxyServer = require('../ProxyServer');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

const toTest = ['http://ifconfig.io/ua', 'https://ifconfig.me/ua'];

const uaToSwitch = 'curl/7.55.1';
const switchWith = 'My Super Fucking Spoofed UA!';

const server = new ProxyServer({
    intercept: true,
    injectData: (data, session) => {
        if (session.isHttps) {
            // console.log('SESSION-DATA', data.toString()) //you can spoof here
            if (data.toString().match(uaToSwitch)) {
                const newData = Buffer.from(data.toString()
                    .replace(uaToSwitch, switchWith));

                // console.log('data', data.toString());
                // console.log('newData', newData.toString());
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
        const cmd = 'curl' + ' -x localhost:' + port + ' -k ' + singlePath;
        console.log(cmd);
        const { stdout, stderr } = await exec(cmd)
            .catch((err) => ({ stdout: err.message }));
        console.log('Response =>', stdout);
    }
    server.close();
});

// curl -x localhost:10001 http://ifconfig.io/ua
// Response => My Super Fucking Spoofed UA!
//
// curl -x localhost:10001 https://ifconfig.io/ua
// Response => curl/7.55.1
