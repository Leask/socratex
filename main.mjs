import { Socrates, utilitas, consts, ssl, storage } from './index.mjs';
import http from 'http';

const meta = await utilitas.which();
const mod = `${meta?.title}.*`;
const logWithTime = { time: true };
const acmeChallenge = { url: null, key: null };

let domain;

const getAddress = (protocol, server) => {
    const { address, family, port } = server.address();
    const add = `${protocol}://${domain}:${port} (${family} ${address})`;
    return { address, family, port, add };
};

const request = async (req, res) => {
    // const { status, body } = await web.default(req.method, req.url, null, req);
    // res.socket.write(`${status}${consts.DOUBLE_CLRF}${body ?? ''}`);
    // res.socket.destroy();
    if (req.method === consts.HTTP_METHODS.GET
        && acmeChallenge.key
        && acmeChallenge.url
        && acmeChallenge.url === req.url) {
        return res.end(acmeChallenge.key);
    }
    res.writeHead(301, {
        Location: `${consts.HTTPS}://${domain}${req.url}`
    }).end();
};

const socratesInit = async (options) => {
    options = {
        port: consts.HTTPS_PORT,
        domain: consts.DEFAULT_OPTIONS.domain,
        https: true,
        listen: '',
        ...options || {},
    };
    domain = options.domain;
    if (options.user && options.password) {
        options.auth = (username, password) => {
            utilitas.log(
                `Authenticate: ${username}:${utilitas.maskPassword(password)}.`,
                meta?.name, logWithTime
            );
            return utilitas.insensitiveCompare(username, options.user)
                && password === options.password;
        };
    }
    const socrates = new Socrates(options);
    socrates.listen(options.port, options.listen, async () => {
        const { add } = getAddress(consts.HTTPS, socrates);
        utilitas.log(`Secure Web Proxy started at ${add}.`, mod);
    });
    const httpd = http.createServer(request);
    httpd.listen(consts.HTTP_PORT, options.listen, async () => {
        const { add } = getAddress(consts.HTTP, httpd);
        utilitas.log(`HTTP Server started at ${add}.`, mod);
    });
    await ssl.ensureCert(
        options.domain,
        async (url, key) => Object.assign(acmeChallenge, { url, key }),
        async (url) => Object.assign(acmeChallenge, { url: null, key: null }),
        { debug: options.debug }
    );
    options.debug && (await import('repl')).start('> ');
};

await socratesInit({
    // user: 'leask',
    // password: 'nopassword',

    debug: true,
});
