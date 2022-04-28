const { Socratex } = require('../../index.mjs');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

const toTest = [
    'http://ifconfig.me',
    'https://ifconfig.me',
    'http://icanhazip.com',
    'http://ifconfig.co',
    'https://ifconfig.co',
];

//init Socratex
const firstSocratex = new Socratex({
    auth: function(username, password) {
        return (username === 'test' && password === 'testPWD');
    }
});
const firstPort = 10001;
//starting server on port 10001
firstSocratex.listen(firstPort, '0.0.0.0', async function() {
    console.log('socratex was started!', firstSocratex.address());
});


//init Socratex2
const secondSocratex = new Socratex({
    upstream: function() {
        return 'test:testPWD@0.0.0.0:' + firstPort;
    }
});
const secondPort = 10002;
//starting server on port 10001
secondSocratex.listen(secondPort, '0.0.0.0', async function() {
    console.log('2 socratex was started!', secondSocratex.address());

    for (const singlePath of toTest) {
        const cmd = 'curl' + ' -x localhost:' + secondPort + ' ' + singlePath;
        console.log(cmd);
        const { stdout, stderr } = await exec(cmd);
        console.log('Response =>', stdout);
    }

    secondSocratex.close();
    firstSocratex.close();
});
