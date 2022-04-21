#!/usr/bin/env node

import { cpus } from 'os';
import cluster from 'cluster';
import http from 'http';

import {
    consts, encryption, event, Socrates, ssl, storage, utilitas, web
} from './index.mjs';

const meta = await utilitas.which(import.meta.url);
const [logWithTime, acmeChallenge] = [{ time: true }, { url: null, key: null }];
const warning = message => utilitas.log(message, 'WARNING');
const cleanTitle = str => str.replace('-x', '');

const argv = {
    address: '', domain: '', http: false, port: 0, getStatus: storage.getConfig,
    setStatus: storage.setConfig, ...utilitas.parseArgv(),
};

const getAddress = (ptcl, server) => {
    const { address, family, port } = server.address();
    const add = `${ptcl}://${_socrates.domain}:${port} (${family} ${address})`;
    return { address, family, port, add };
};

const ensureDomain = async () => {
    if (argv.domain) {
        await storage.setConfig({ domain: argv.domain });
        return argv.domain;
    }
    return (await storage.getConfig())?.config?.domain || '127.0.0.1';
};

const ensureToken = async () => {
    let token = (await storage.getConfig())?.config?.token;
    if (!token) {
        token = encryption.fakeUuid();
        await storage.setConfig({ token });
    }
    return token;
};

const request = async (req, res) => {
    if (req.method === consts.HTTP_METHODS.GET && acmeChallenge.key
        && acmeChallenge.url && acmeChallenge.url === req.url) {
        return res.end(acmeChallenge.key);
    }
    res.writeHead(301, {
        Location: `${consts.HTTPS}://${_socrates.domain}${req.url}`
    }).end();
};

globalThis._socrates = { https: argv.https = !argv.http };
meta.name = cleanTitle(meta.name);
meta.title = cleanTitle(meta.title);

const port = argv.port || (
    _socrates.https ? consts.HTTPS_PORT : consts.HTTP_PORT
);

Object.assign(_socrates, {
    domain: await ensureDomain(), token: await ensureToken()
});

_socrates.address = (
    _socrates.https ? consts.HTTPS.toUpperCase() : consts.PROXY
) + ` ${_socrates.domain}:${port}`;

argv.bypass = argv.bypass ? new Set(
    utilitas.ensureArray(argv.bypass).map(item => item.toUpperCase())
) : null;

if (argv.user && argv.password) {
    argv.basicAuth = async (username, password) => {
        const result = utilitas.insensitiveCompare(username, argv.user)
            && password === argv.password;
        utilitas.log(
            `Authenticate ${result ? 'SUCCESS' : 'FAILED'} => `
            + `${username}:${utilitas.mask(password)}.`,
            meta?.name, logWithTime
        );
        return result;
    };
}

if (_socrates.token) {
    argv.tokenAuth = async (token) => {
        const result = token === _socrates.token;
        utilitas.log(
            `Authenticate ${result ? 'SUCCESS' : 'FAILED'} => `
            + `TOKEN:${utilitas.mask(token)}.`,
            meta?.name, logWithTime
        );
        return result;
    };
}

if (cluster.isPrimary) {
    utilitas.log(`${meta.homepage}`, `${meta?.title}.*`);

    if (_socrates.https) {
        globalThis.httpd = http.createServer(request);
        httpd.listen(consts.HTTP_PORT, argv.address, async () => {
            const { add } = getAddress(consts.HTTP, httpd);
            utilitas.log(`HTTP Server started at ${add}.`, meta?.name);
        });
        if (['127.0.0.1', '::1', 'localhost'].includes(_socrates.domain)) {
            warning('A public domain is required to get an ACME certs.');
        } else {
            await ssl.init(_socrates.domain,
                async (url, key) => Object.assign(acmeChallenge, { url, key }),
                async (url) => Object.assign(acmeChallenge, { url: '', key: '' }),
                { debug: argv.debug }
            );
        }
    } else { warning('HTTP-only mode is not recommended.'); }

    let webAdd = `${_socrates.https ? consts.HTTPS : consts.HTTP}://`
        + _socrates.domain;
    if (_socrates.https && port === consts.HTTPS_PORT) { }
    else if (!_socrates.https && port === consts.HTTP_PORT) { }
    else { webAdd += `:${port}`; }
    utilitas.log(`PAC:  ${webAdd}/proxy.pac?token=${_socrates.token}`, meta?.name);
    utilitas.log(`WPAD: ${webAdd}/wpad.dat?token=${_socrates.token}`, meta?.name);
    utilitas.log(`Log:  ${webAdd}/log?token=${_socrates.token}`, meta?.name);
    cluster.on('exit', (worker, code, signal) => {
        utilitas.log(`Process ${worker.process.pid} ended: ${code}.`, meta?.name);
        for (let i = _socrates.processes.length - 1; i >= 0; i--) {
            _socrates.processes[i].isDead() && _socrates.processes.splice(i, 1);
        }
    });
    _socrates.processes = [];
    let [responded, cpuCount] = [0, cpus().length];
    await event.loop(async () => {
        while (Object.keys(_socrates.processes).length < cpuCount) {
            _socrates.processes.push(cluster.fork());
        }
    }, 1, 10, 0, utilitas.basename(import.meta.url), { silent: true });
    cluster.on('listening', (_) => (++responded >= cpuCount) && web.init(argv));
    argv.repl && (await import('repl')).start('> ');
} else {
    globalThis.socrates = new Socrates(argv);
    socrates.listen(port, argv.address, async () => {
        const { add } = getAddress(
            _socrates.https ? consts.HTTPS : consts.HTTP, socrates
        );
        utilitas.log(
            `${_socrates.https ? 'Secure ' : ''}Web Proxy started at ${add}.`,
            `PID-${process.pid}`
        );
    });
}
