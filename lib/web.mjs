import {
    getLogCache, ignoreErrFunc, log as _log, resolve
} from './utilitas.mjs';

import {
    CLRF, HEADERS, HTTP_BODIES, HTTP_METHODS, HTTP_RESPONSES
} from './consts.mjs';

const { GET } = HTTP_METHODS;
const [bypassList, MAX_BYPASS_COUNT] = [{}, 1000];
const packResult = (status, body) => { return { status, body: body || '' } };
const bypass = async (host) => bypassList[host] = { lastVisit: new Date() };
const getBypassList = (lite) => lite ? Object.keys(bypassList) : bypassList;
const log = (message) => _log(message, import.meta.url, { time: true });

const {
    AUTH_REQUIRED, ENOTFOUND, EPIPE, EPROTO, ETIMEDOUT, NOT_FOUND,
    OK, UNAUTHORIZED, NOT_OK, TIMED_OUT, TOO_MANY_REQ,
} = HTTP_RESPONSES;

function FindProxyForURL(url, host) {

    // Socrates by @LeaskH
    // https://github.com/Leask/socrates

    var lcl = ['127.0.0.1', '10.*.*.*', '172.16.*.*', '192.168.*.*', '*.local'];
    for (var i in lcl) { if (shExpMatch(host, match[i])) { return 'DIRECT'; } }

    var bypass = {
        /*BYPASS*/
    };

    if (isPlainHostName(host) || bypass[host]) { return 'DIRECT'; }

    return '/*PROXY*/';

};

const makePac = (bypass, proxy) => {
    let [rules, pac] = [{
        '/*BYPASS*/': bypass.map(x => `'${x}': 1`).join(',\n        '),
        '/*PROXY*/': proxy,  // '; DIRECT' // @todo by @LeaskH
    }, FindProxyForURL.toString()];
    for (let i in rules) {
        pac = pac.replace(new RegExp(RegExp.escape(i), 'ig'), rules[i]);
    }
    return pac;
};

const route = async (method, path, protocol, req) => {
    const token = _socrates.token;
    const tokenQuery = token ? `?token=${token}` : '';
    switch (`${String(method).toUpperCase()} ${String(path).toLowerCase()}`) {
        case `${GET} /`: return packResult(OK, '42');
        case `${GET} /favicon.ico`: return packResult(OK, '');
        case `${GET} /log${token ? `?token=${token}` : ''}`:
            return token ? packResult(OK, getLogCache().join('\n'))
                : packResult(NOT_FOUND, HTTP_BODIES.NOT_FOUND);
        case `${GET} /proxy.pac${tokenQuery}`:
        case `${GET} /wpad.dat${tokenQuery}`:
            return token ? packResult(`${OK}${CLRF}${HEADERS.PAC}`,
                makePac(getBypassList(true), _socrates.address)
            ) : packResult(NOT_FOUND, HTTP_BODIES.NOT_FOUND);
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
