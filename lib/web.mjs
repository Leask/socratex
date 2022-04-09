import { __, resolve, ignoreErrFunc, log as modLog } from './utilitas.mjs';
import { HTTP_METHODS, HTTP_RESPONSES, HTTP_BODIES } from './consts.mjs';

const { __filename } = __(import.meta.url);
const { GET } = HTTP_METHODS;
const [bypassList, MAX_BYPASS_COUNT] = [{}, 1000];
const packResult = (status, body) => { return { status, body: body || '' } };
const bypass = async (host) => bypassList[host] = { lastVisit: new Date() };
const getBypassList = (lite) => lite ? Object.keys(bypassList) : bypassList;
const log = (message) => modLog(message, __filename, { time: true });

const {
    AUTH_REQUIRED, ENOTFOUND, EPIPE, EPROTO, ETIMEDOUT, NOT_FOUND,
    OK, UNAUTHORIZED, NOT_OK, TIMED_OUT, TOO_MANY_REQ,
} = HTTP_RESPONSES;

const route = async (method, path, protocol, req) => {
    const token = _socrates.token;
    switch (`${String(method).toUpperCase()} ${String(path).toLowerCase()}`) {
        case `${GET} /`: return packResult(OK, '42');
        case `${GET} /favicon.ico`: return packResult(OK, '');
        case `${GET} /wpad.dat${token ? `?token=${token}` : ''}`:
            if (token) {
                return packResult(OK, [
                    '// Socrates by @LeaskH',
                    '// https://github.com/Leask/socrates',
                    'function FindProxyForURL(url, host) {',
                    '    var bypass = {',
                    ...getBypassList(true).map(host => `        '${host}': 1,`),
                    "        '127.0.0.1': 1,",
                    "        'localhost': 1",
                    '    };',
                    '    if (isPlainHostName(host) || bypass[host]) {',
                    "        return 'DIRECT';",
                    '    }',
                    `    return '${_socrates.address}';`, // '; DIRECT'
                    '}',
                ].join('\n'));
            }
        default: return packResult(NOT_FOUND, HTTP_BODIES.NOT_FOUND);
    }
};

const error = async (err) => {
    switch (err.code) {
        case ETIMEDOUT:
            return packResult(TIMED_OUT);
        case ENOTFOUND:
            return packResult(NOT_FOUND, HTTP_BODIES.NOT_FOUND);
        case EPROTO:
            return packResult(NOT_OK, HTTP_BODIES.NOT_FOUND);
        case UNAUTHORIZED:
            return packResult(UNAUTHORIZED, HTTP_BODIES.UNAUTHORIZED);
        case AUTH_REQUIRED:
            return packResult(AUTH_REQUIRED, HTTP_BODIES.AUTH_REQUIRED);
        case EPIPE:
        default:
            return packResult(NOT_OK);
    }
};

const init = async (options) => {
    Function.isFunction(options.getStatus) && (async () => {
        const list = (
            await resolve(options.getStatus())
        )?.config?.bypassList || {};
        for (let i in list) {
            list[i].lastVisit = new Date(list[i].lastVisit);
            bypassList[i] = list[i];
        }
        log(`Restored ${Object.keys(bypassList).length} bypass-item(s).`);
    })();
    const removeBypass = (host) => {
        delete bypassList[host];
        log(`Remove bypass-item: ${host}.`);
    };
    const cleanBypassList = async () => {
        const hosts = [];
        for (let h in bypassList) { hosts.push([bypassList[h].lastVisit, h]); }
        hosts.sort((a, b) => a[0] - b[0]);
        while (hosts.length > MAX_BYPASS_COUNT) removeBypass(hosts.shift()[1]);
        if (!Function.isFunction(options.setStatus)) { return; }
        await options.setStatus({ bypassList });
        log(`Saved ${Object.keys(bypassList).length} bypass-item(s).`);
    };
    setInterval(async () => {
        await ignoreErrFunc(cleanBypassList, { log: true });
    }, 1000 * 64);
};

export {
    bypass,
    error,
    getBypassList,
    init,
    route,
};
