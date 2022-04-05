const util = require('util');
const exec = util.promisify(require('child_process').exec);
const ProxyServer = require('./ProxyServer');

async function test1() {
    console.log('Starting TEST1 - Normal socrates!');

    //init ProxyServer
    const server = new ProxyServer({});

    const toTest = ['https://ifconfig.me', 'http://icanhazip.com', 'https://ifconfig.io/ua', 'http://asdahke.e'];

    //starting server on port 10001
    const PORT = 10001;
    return new Promise(function(res, rej) {
        server.listen(PORT, '0.0.0.0', async function() {
            console.log('socrates was started!', server.address());

            for (const singlePath of toTest) {
                const cmd = 'curl' + ' -x 127.0.0.1:' + PORT + ' ' + singlePath;
                console.log(cmd);
                const { stdout, stderr } = await exec(cmd);
                console.log('Response =>', stdout);
            }

            console.log('Closing socrates Server - TEST1\n');
            server.close();
            res(true);
        });
    });
}

async function test2() {
    console.log('Starting TEST2 - Spoof Response!');
    let ownIp = '';
    const switchWith = '6.6.6.6';
    const IP_REGEXP = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/;

    const toTest = ['https://ifconfig.me', 'http://ifconfig.me'];

    const PORT = 10002; //starting server on port 10001

    const cmdOwnIp = 'curl ' + toTest[0];
    console.log('Getting Own ip with', cmdOwnIp);
    const { stdout, stderr } = await exec(cmdOwnIp);
    ownIp = stdout.match(IP_REGEXP)[0].trim();
    console.log('Your IP is:', ownIp);

    console.log('Starting Proxy Server with spoof-behaviors');
    //init ProxyServer
    const server = new ProxyServer({
        intercept: true,
        injectResponse: (data, session) => {
            //SPOOFING RETURNED RESPONSE
            if (data.toString().match(ownIp)) {
                const newData = Buffer.from(data.toString()
                    .replace(new RegExp('Content-Length: ' + ownIp.length, 'gmi'),
                        'Content-Length: ' + (switchWith.length))
                    .replace(ownIp, switchWith));

                return newData;
            }

            return data;
        }
    });

    return new Promise(function(res, rej) {
        server.listen(PORT, '0.0.0.0', async function() {
            console.log('socrates was started!', server.address());

            for (const singlePath of toTest) {
                const cmd = 'curl' + ' -x 127.0.0.1:' + PORT + ' -k ' + singlePath;
                console.log(cmd);
                const { stdout, stderr } = await exec(cmd);
                console.log('Response =>', stdout);
            }

            console.log('Closing socrates Server - TEST2\n');
            server.close();
            res(true);
        });
    });
}

async function test3() {
    console.log('Starting TEST3 - Spoof Request!');

    const toTest = ['http://ifconfig.io/ua', 'https://ifconfig.me/ua'];

    const PORT = 10003; //starting server on port 10001

    console.log('Starting Proxy Server with spoof-behaviors');
    //init ProxyServer
    const server = new ProxyServer({
        intercept: true,
        injectData: (data, session) => {
            return Buffer.from(data.toString().replace('curl/7.55.1', 'Spoofed UA!!'));
        }
    });

    return new Promise(function(res, rej) {
        server.listen(PORT, '0.0.0.0', async function() {
            console.log('socrates was started!', server.address());

            for (const singlePath of toTest) {
                const cmd = 'curl' + ' -x 127.0.0.1:' + PORT + ' -k ' + singlePath;
                console.log(cmd);
                const { stdout, stderr } = await exec(cmd);
                console.log('Response =>', stdout);
            }

            console.log('Closing socrates Server - TEST3\n');
            server.close();
            res(true);
        });
    })
}

async function test4() {
    console.log('Starting TEST4 - Change Some Keys on runtime!');

    const toTest = ['https://ifconfig.me/', 'https://ifconfig.me/ua'];

    const PORT = 10004; //starting server on port 10001

    //init ProxyServer
    const server = new ProxyServer({
        intercept: true,
        keys: (session) => {
            const tunnel = session.getTunnelStats();
            console.log('\t\t=> Could change keys for', tunnel);
            return false;
        }
    });

    return new Promise(function(res, rej) {
        server.listen(PORT, '0.0.0.0', async function() {
            console.log('socrates was started!', server.address());

            for (const singlePath of toTest) {
                const cmd = 'curl' + ' -x 127.0.0.1:' + PORT + ' -k ' + singlePath;
                console.log(cmd);
                const { stdout, stderr } = await exec(cmd);
                console.log('Response =>', stdout);
            }

            console.log('Closing socrates Server - TEST4\n');
            server.close();
            res(true);
        });
    });
}

async function test5() {
    console.log('Starting TEST5 - Proxy With Authentication!');

    const singlePath = 'https://ifconfig.me/';
    const pwdToTest = ['bar:foo', 'wronguser:wrongpassword'];

    const PORT = 10005; //starting server on port 10001

    //init ProxyServer
    const server = new ProxyServer({
        auth: (username, password, session) => {
            return username === 'bar' && password === 'foo';
        }
    });

    return new Promise(function(res, rej) {
        server.listen(PORT, '0.0.0.0', async function() {
            console.log('socrates was started!', server.address());

            for (const pwd of pwdToTest) {
                const cmd = 'curl' + ' -x ' + pwd + '@127.0.0.1:' + PORT + ' ' + singlePath;
                console.log(cmd);
                const { stdout, stderr } = await exec(cmd)
                    .catch((err) => {
                        if (err.message.indexOf('HTTP code 407')) return { stdout: 'HTTP CODE 407' };
                        throw err;
                    });
                console.log('Response =>', stdout);
            }

            console.log('Closing socrates Server - TEST5\n');
            server.close();
            res(true);
        });
    });
}

async function main() {
    await test1();
    await test2();
    await test3();
    await test4();
    await test5();
}

return main();
