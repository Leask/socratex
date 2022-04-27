import { loop } from './event.mjs';
import cluster from 'cluster';

import {
    basename, boardcast, getLogCache, log as _log, resolve
} from './utilitas.mjs';

import {
    CLRF, HEADERS, HTTP_BODIES, HTTP_METHODS, HTTP_RESPONSES,
    IDLE_CLIENT_TIMEOUT, MAX_CLIENT_COUNT
} from './consts.mjs';

const [WEB_BYPASS_ADD, WEB_BYPASS_UPDATE, WEB_AUTH_ADD, WEB_AUTH_UPDATE]
    = ['WEB_BYPASS_ADD', 'WEB_BYPASS_UPDATE', 'WEB_AUTH_ADD', 'WEB_AUTH_UPDATE'];
const { GET } = HTTP_METHODS;
const [MESSAGE, MAX_BYPASS_COUNT] = ['message', 1000];
const packResult = (status, body) => { return { status, body: body || '' } };
const getBypassList = lite => lite ? Object.keys(bypassList) : bypassList;
const log = message => _log(message, import.meta.url, { time: true });
const isLocalhost = host => ['127.0.0.1', '::1', 'localhost'].includes(host);
const bypass = async (host) => bypassList[host] = { lastVisit: new Date() };
const querySecurityLog = address => securityLog[address];
const castBypassList = () => boardcast(WEB_BYPASS_UPDATE, getBypassList());
const castSecurityLog = () => boardcast(WEB_AUTH_UPDATE, securityLog);

const {
    AUTH_REQUIRED, ENOTFOUND, EPIPE, EPROTO, ETIMEDOUT, NOT_FOUND,
    OK, UNAUTHORIZED, NOT_OK, TIMED_OUT
} = HTTP_RESPONSES;

let [bypassList, securityLog] = [{}, {}];

function FindProxyForURL(url, host) {

    // Socrates by @LeaskH
    // https://github.com/Leask/socrates

    const [local, bypass] = [[
        '*.local', '10.*.*.*', '127.0.0.1', '172.16.*.*', '192.168.*.*',
    ], {
        /*BYPASS*/
    }];

    for (let item of local) { if (shExpMatch(host, item)) { return 'DIRECT'; } }
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

const makeLog = (log) => [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '    <meta charset="utf-8">',
    '    <title>Socrates Console</title>',
    '    <script>setInterval(() => location.reload(), 1000 * 1);</script>',
    '</head>',
    '<body>',
    '    <pre>',
    ...log,
    '    </pre>',
    '</body>',
    '</html>',
].join('\n');

const route = async (method, path, protocol, req) => {
    const token = _socrates.token;
    const tokenQuery = token ? `?token=${token}` : '';
    switch (`${String(method).toUpperCase()} ${String(path).toLowerCase()}`) {
        case `${GET} /`: return packResult(OK, '42');
        case `${GET} /favicon.ico`: return packResult(OK, '');
        case `${GET} /log${token ? `?token=${token}` : ''}`:
            return token ? packResult(OK,
                makeLog(getLogCache())
            ) : packResult(NOT_FOUND, HTTP_BODIES.NOT_FOUND);
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
        case EPIPE: default:
            return packResult(NOT_OK);
    }
};

const init = async (options) => {
    Function.isFunction(options.getStatus) && (async () => {
        const config = (await resolve(options.getStatus()))?.config;
        const list = config?.bypassList || {};
        const sLog = config?.securityLog || {};
        for (let i in list) {
            list[i].lastVisit = new Date(list[i].lastVisit);
            bypassList[i] = list[i];
        }
        for (let i in sLog) {
            sLog[i].firstVisit = new Date(sLog[i].firstVisit);
            sLog[i].lastVisit = new Date(sLog[i].lastVisit);
            securityLog[i] = sLog[i];
        }
        castSecurityLog(); castBypassList();
        log(`Restored ${Object.keys(securityLog).length} session(s), `
            + `${Object.keys(bypassList).length} bypass-item(s).`);
    })();
    const removeBypass = (host) => {
        delete bypassList[host]; log(`Remove bypass-item: ${host}.`);
    };
    const releaseClient = (add) => {
        delete securityLog[add]; log(`Released idle client: ${add}.`);
    };
    const cleanStatus = async () => {
        // clean bypass list
        const hosts = [];
        for (let h in bypassList) { hosts.push([bypassList[h].lastVisit, h]); }
        hosts.sort((a, b) => a[0] - b[0]);
        while (hosts.length > MAX_BYPASS_COUNT) removeBypass(hosts.shift()[1]);
        // clean security log
        const [now, ips] = [new Date().getTime(), []];
        for (let key in securityLog) {
            const lastVisit = securityLog[key].lastVisit.getTime();
            if (lastVisit + IDLE_CLIENT_TIMEOUT < now) {
                releaseClient(key);
            } else { ips.push([lastVisit, key]); }
        }
        ips.sort((a, b) => a[0] - b[0]);
        while (ips.length > MAX_CLIENT_COUNT) releaseClient(ips.shift()[1])
        // save
        if (!Function.isFunction(options.setStatus)) { return; }
        await options.setStatus({ bypassList, securityLog });
        log(`Saved ${Object.keys(securityLog).length} session(s), `
            + `${Object.keys(bypassList).length} bypass-item(s).`);
    };
    return await loop(
        cleanStatus, 60, 60, 0, basename(import.meta.url), { silent: true }
    );
};

const eventHandler = async (msg) => {
    switch (msg?.action) {
        case WEB_BYPASS_ADD:
            return await bypass(msg?.data) && castBypassList();
        case WEB_BYPASS_UPDATE:
            return bypassList = msg?.data;
        case WEB_AUTH_ADD:
            return (securityLog[msg?.data] = Object.assign(
                querySecurityLog(msg?.data) || { firstVisit: new Date() },
                { lastVisit: new Date() }
            )) && castSecurityLog();
        case WEB_AUTH_UPDATE:
            return securityLog = msg?.data;
    }
};

process.on(MESSAGE, eventHandler);
cluster.on(MESSAGE, (worker, msg) => eventHandler(msg));

export default init;
export {
    WEB_AUTH_ADD,
    WEB_BYPASS_ADD,
    bypass,
    error,
    getBypassList,
    init,
    isLocalhost,
    querySecurityLog,
    route,
};
