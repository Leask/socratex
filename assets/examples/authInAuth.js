const { Socrates } = require('../../index.mjs');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

const toTest = [
    'http://ifconfig.me',
    'https://ifconfig.me',
    'http://icanhazip.com',
    'http://ifconfig.co',
    'https://ifconfig.co',
];

//init Socrates
const firstSocrates = new Socrates({
    auth: function(username, password) {
        return (username === 'test' && password === 'testPWD');
    }
});
const firstPort = 10001;
//starting server on port 10001
firstSocrates.listen(firstPort, '0.0.0.0', async function() {
    console.log('socrates was started!', firstSocrates.address());
});


//init Socrates2
const secondSocrates = new Socrates({
    upstream: function() {
        return 'test:testPWD@0.0.0.0:' + firstPort;
    }
});
const secondPort = 10002;
//starting server on port 10001
secondSocrates.listen(secondPort, '0.0.0.0', async function() {
    console.log('2 socrates was started!', secondSocrates.address());

    for (const singlePath of toTest) {
        const cmd = 'curl' + ' -x localhost:' + secondPort + ' ' + singlePath;
        console.log(cmd);
        const { stdout, stderr } = await exec(cmd);
        console.log('Response =>', stdout);
    }

    secondSocrates.close();
    firstSocrates.close();
});
