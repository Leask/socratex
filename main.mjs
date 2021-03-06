#!/usr/bin/env node

import { cpus } from 'os';
import cluster from 'cluster';
import http from 'http';
import nopt from 'nopt';

import {
    consts, encryption, event, Socratex, ssl, storage, utilitas, web
} from './index.mjs';

const meta = await utilitas.which(import.meta.url);
const [logWithTime, acmeChallenge] = [{ time: true }, { url: null, key: null }];
const warning = message => utilitas.log(message, 'WARNING');
const cleanTitle = str => str.replace('-x', '');
const cpuCount = cpus().length;

const argv = {
    address: '', domain: '', http: false, port: 0, getStatus: storage.getConfig,
    setStatus: storage.setConfig, ...nopt(),
};

const getAddress = (ptcl, server) => {
    const { address, family, port } = server.address();
    const add = `${ptcl}://${_socratex.domain}:${port} (${family} ${address})`;
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
        Location: `${consts.HTTPS}://${_socratex.domain}${req.url}`
    }).end();
};

globalThis._socratex = { https: argv.https = !argv.http };
meta.name = cleanTitle(meta.name);
meta.title = cleanTitle(meta.title);

const port = argv.port || (
    _socratex.https ? consts.HTTPS_PORT : consts.HTTP_PORT
);

Object.assign(_socratex, {
    domain: await ensureDomain(), token: await ensureToken()
});

_socratex.address = (
    _socratex.https ? consts.HTTPS.toUpperCase() : consts.PROXY
) + ` ${_socratex.domain}:${port}`;

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

if (_socratex.token) {
    argv.tokenAuth = async (token) => {
        const result = token === _socratex.token;
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

    if (_socratex.https) {
        globalThis.httpd = http.createServer(request);
        httpd.listen(consts.HTTP_PORT, argv.address, async () => {
            const { add } = getAddress(consts.HTTP, httpd);
            utilitas.log(`HTTP Server started at ${add}.`, meta?.name);
        });
        if (web.isLocalhost(_socratex.domain)) {
            warning('A public domain is required to get an ACME certs.');
        } else {
            await ssl.init(_socratex.domain,
                async (url, key) => Object.assign(acmeChallenge, { url, key }),
                async (url) => Object.assign(acmeChallenge, { url: '', key: '' }),
                { debug: argv.debug }
            );
        }
    } else { warning('HTTP-only mode is not recommended.'); }

    let webAdd = `${_socratex.https ? consts.HTTPS : consts.HTTP}://`
        + _socratex.domain;
    if (_socratex.https && port === consts.HTTPS_PORT) { }
    else if (!_socratex.https && port === consts.HTTP_PORT) { }
    else { webAdd += `:${port}`; }
    utilitas.log(`PAC:  ${webAdd}/proxy.pac?token=${_socratex.token}`, meta?.name);
    utilitas.log(`WPAD: ${webAdd}/wpad.dat?token=${_socratex.token}`, meta?.name);
    utilitas.log(`Log:  ${webAdd}/log?token=${_socratex.token}`, meta?.name);
    cluster.on('exit', (worker, code, signal) => {
        utilitas.log(`Process ${worker.process.pid} ended: ${code}.`, meta?.name);
        for (let i = _socratex.processes.length - 1; i >= 0; i--) {
            _socratex.processes[i].isDead() && _socratex.processes.splice(i, 1);
        }
    });
    _socratex.processes = [];
    let responded = 0;
    await event.loop(async () => {
        while (Object.keys(_socratex.processes).length < cpuCount) {
            _socratex.processes.push(cluster.fork());
        }
    }, 3, 10, 0, utilitas.basename(import.meta.url), { silent: true });
    cluster.on('listening', _ => ++responded >= cpuCount && web.init(argv));
    argv.repl && (await import('repl')).start('> ');
} else {
    globalThis.socratex = new Socratex(argv);
    socratex.listen(port, argv.address, async () => {
        const { add } = getAddress(
            _socratex.https ? consts.HTTPS : consts.HTTP, socratex
        );
        utilitas.log(
            `${_socratex.https ? 'Secure ' : ''}Web Proxy started at ${add}.`,
            `PID-${process.pid}`
        );
    });
}
