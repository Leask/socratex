#!/usr/bin/env node

import { callosum, manifest, ssl, storage, uoid, utilitas } from 'utilitas';
import { consts, Socratex, web } from './index.mjs';
import { parseArgs } from 'node:util'; // https://kgrz.io/node-has-native-arg-parsing.html

// parse args
const argsOptions = {
    address: { type: 'string', short: 'a', default: '' },
    bypass: { type: 'string', short: 'b', default: '' },
    debug: { type: 'boolean', short: 'd', default: false },
    domain: { type: 'string', short: 'o', default: '' },
    help: { type: 'boolean', short: 'h', default: false },
    http: { type: 'boolean', short: 't', default: false },
    password: { type: 'string', short: 'p', default: '' },
    port: { type: 'string', short: 'o', default: '0' },
    repl: { type: 'boolean', short: 'r', default: false },
    user: { type: 'string', short: 'u', default: '' },
    version: { type: 'boolean', short: 'v', default: false },
};
const { values } = parseArgs({ options: argsOptions });
const argv = {
    ...values, port: ~~values.port,
    getStatus: storage.getConfig,
    setStatus: storage.setConfig,
    bypass: values.bypass && utilitas.uniqueArray(values.bypass).map(i => i.toUpperCase()),
};

// constants
await utilitas.locate(utilitas.__(import.meta.url, 'package.json')); // keep 1st
const meta = await utilitas.which();
const setConfig = async cf => callosum.isPrimary && await storage.setConfig(cf);
const renderObject = obj => utilitas.renderObject(obj, { asArray: true });
const log = message => utilitas.log(message, meta.name);
const logWithTime = message => utilitas.log(message, meta.name, { time: true });
const warning = message => utilitas.log(message, 'WARNING');

const getAddress = (ptcl, server) => {
    const { address, family, port } = server.address();
    const add = `${ptcl}://${_socratex.domain}:${port} (${family} ${address})`;
    return { address, family, port, add };
};

const ensureDomain = async () => {
    if (argv.domain) {
        await setConfig({ domain: argv.domain });
        return argv.domain;
    }
    return (await storage.getConfig())?.config?.domain || '127.0.0.1';
};

const ensureToken = async () => {
    let token = (await storage.getConfig())?.config?.token;
    if (!token) {
        token = uoid.fakeUuid();
        await setConfig({ token });
    }
    return token;
};

const ensureBasicAuth = async () => {
    const optsTrim = { trim: true };
    argv.user = utilitas.ensureString(argv.user, optsTrim);
    argv.password = utilitas.ensureString(argv.password, optsTrim);
    if (argv.user && argv.password) {
        const basicAuth = { user: argv.user, password: argv.password };
        await setConfig(basicAuth);
        return basicAuth;
    }
    const { user, password } = (await storage.getConfig())?.config || {};
    return { user, password };
};

// commands
if (argv.help) {
    [meta.title, '', `Usage: ${meta.name} [options]`, ''].map(x => console.log(x));
    console.table(argsOptions);
    process.exit();
} else if (argv.version) {
    [meta.title, `${manifest.name} v${manifest.version}`].map(x => console.log(x));
    process.exit();
}

// init
globalThis._socratex = {
    https: argv.https = !argv.http, domain: await ensureDomain(),
};
const port = argv.port || (_socratex.https ? consts.HTTPS_PORT : consts.HTTP_PORT);
Object.assign(_socratex, {
    token: await ensureToken(), ...await ensureBasicAuth(), address: (
        _socratex.https ? consts.HTTPS.toUpperCase() : consts.PROXY
    ) + ` ${_socratex.domain}:${port}`,
});
_socratex.user && _socratex.password && (
    argv.basicAuth = async (username, password) => {
        const result = utilitas.insensitiveCompare(username, _socratex.user)
            && password === _socratex.password;
        logWithTime(
            `Authenticate ${result ? 'SUCCESS' : 'FAILED'} => `
            + `${username}:${utilitas.mask(password)}.`
        );
        return result;
    }
);
_socratex.token && (
    argv.tokenAuth = async (token) => {
        const result = token === _socratex.token;
        logWithTime(
            `Authenticate ${result ? 'SUCCESS' : 'FAILED'} => `
            + `TOKEN:${utilitas.mask(token)}.`
        );
        return result;
    }
);

// launch
await callosum.init({
    initPrimary: async () => {
        const subAdd = `${_socratex.https ? consts.HTTPS : consts.HTTP}://`;
        let webAdd = `${subAdd}${_socratex.domain}`;
        let bscAdd = `${subAdd}${_socratex.user}:${_socratex.password}@${_socratex.domain}`;
        if (_socratex.https && port === consts.HTTPS_PORT) { }
        else if (!_socratex.https && port === consts.HTTP_PORT) { }
        else {
            const tailPort = `:${port}`;
            webAdd += tailPort;
            bscAdd += tailPort;
        }
        const content = [];
        [[true, 'Token authentication', {
            '  - PAC': `${webAdd}/proxy.pac?token=${_socratex.token}`,
            '  - WPAD': `${webAdd}/wpad.dat?token=${_socratex.token}`,
            '  - Log': `${webAdd}/console?token=${_socratex.token}`,
        }], [_socratex.user && _socratex.password, 'Basic authentication', {
            '  - PAC': `${bscAdd}/proxy.pac`,
            '  - WPAD': `${bscAdd}/wpad.dat`,
            '  - Log': `${bscAdd}/console`,
            '  - Proxy': `${bscAdd}`,
        }], [true, 'Get help', {
            '  - GitHub': 'https://github.com/Leask/socratex',
            '  - Email': 'Leask Wong <i@leaskh.com>',
        }]].map((x, k) => x[0] && content.push(
            ...~~k ? [''] : [], `* ${x[1]}:`, ...renderObject(x[2]))
        );
        console.log(utilitas.renderBox(content, { title: meta?.title, width: 120 }));
    },
    initWorker: async () => {
        globalThis.socratex = new Socratex(argv);
        return await new Promise((resolve, _) => {
            socratex.listen(port, argv.address, () => {
                const { add } = getAddress(
                    _socratex.https ? consts.HTTPS : consts.HTTP, socratex
                );
                return resolve({
                    message: `${_socratex.https
                        ? 'Secure ' : ''}Web Proxy started at ${add}.`
                });
            });
        });
    },
    onReady: async () => {
        if (_socratex.https) {
            ssl.isLocalhost(_socratex.domain)
                ? warning(`Using self-signed certificate for ${_socratex.domain}.`)
                : await ssl.init(_socratex.domain, { debug: argv.debug });
        } else { warning('HTTP-only mode is not recommended.'); }
        web.init(argv);
        argv.repl && (await import('repl')).start('> ');
    },
});
