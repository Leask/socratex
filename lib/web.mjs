import { callosum, event, utilitas } from 'utilitas';
import { render } from './log.mjs';
import url from 'node:url';

import {
    CLRF, ERROR_CODES, HEADERS, HTTP_BODIES, HTTP_METHODS, HTTP_RESPONSES,
    IDLE_CLIENT_TIMEOUT, MAX_CLIENT_COUNT
} from './consts.mjs';

const [SECURITY_LOG, BYPASS_LIST, MAX_BYPASS_COUNT]
    = ['SECURITY_LOG', 'BYPASS_LIST', 1000];
const { AUTH_REQUIRED, NOT_FOUND, NOT_OK, OK, TIMED_OUT, UNAUTHORIZED, }
    = HTTP_RESPONSES;
const { ENOTFOUND, EPIPE, EPROTO, ETIMEDOUT } = ERROR_CODES;
const { GET } = HTTP_METHODS;
const packResult = (status, body) => ({ status, body: body || '' });
const log = message => utilitas.log(message, import.meta.url, { time: true });
const isLocalhost = host => ['127.0.0.1', '::1', 'localhost'].includes(host);
const lastVisit = date => ({ lastVisit: date ? new Date(date) : new Date() });
const getSecurityLog = async address => await getMapping(SECURITY_LOG, address);
const getBypassList = async address => await getMapping(BYPASS_LIST, address);
const getBypassHost = async () => Object.keys(await getBypassList());
const setSecurityLog = async (add, d) => await setMapping(SECURITY_LOG, add, d);
const setBypassList = async (add, d) => await setMapping(BYPASS_LIST, add, d);
const getAllMapping = () => Promise.all([getSecurityLog(), getBypassList()]);

function FindProxyForURL(url, host) {

    // Socratex by @LeaskH
    // https://github.com/Leask/socratex

    const [local, bypass] = [[
        '*.lan', '*.local', '*.internal',
        '10.*.*.*', '127.*.*.*', '172.16.*.*', '192.168.*.*',
    ], {
        /*BYPASS*/
    }];

    for (let item of local) { if (shExpMatch(host, item)) { return 'DIRECT'; } }
    if (isPlainHostName(host) || bypass[host]) { return 'DIRECT'; }
    return '/*PROXY*/';

};

const setMapping = async (key, address, date) => await callosum.assign(
    key, { [address]: lastVisit(date) }
);

const getMapping = async (key, address) => {
    const resp = await callosum.get(key, ...address ? [address] : []);
    return resp || (address ? null : {});
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
    const objUrl = new URL(path, `https://${globalThis._socratex?.domain}`);
    const token = objUrl.searchParams.get('token');
    const authenticated = token === globalThis._socratex?.token;
    const reeStr = [
        String(method).toUpperCase(), String(objUrl.pathname).toLowerCase(),
    ].join(' ');
    switch (reeStr) {
        case `${GET} /`:
            return packResult(OK, '42');
        case `${GET} /favicon.ico`:
            return packResult(OK, '');
        case `${GET} /console`:
            return authenticated
                ? packResult(OK, await render())
                : await error({ code: UNAUTHORIZED });
        case `${GET} /proxy.pac`:
        case `${GET} /wpad.dat`:
            return authenticated ? packResult(`${OK}${CLRF}${HEADERS.PAC}`,
                makePac(await getBypassHost(), _socratex.address)
            ) : await error({ code: UNAUTHORIZED });
        default:
            return await error({ code: ENOTFOUND });
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
        const config = (await utilitas.resolve(options.getStatus()))?.config;
        const sLog = config?.securityLog || {};
        const list = config?.bypassList || {};
        for (let i in sLog) { await setSecurityLog(i, sLog[i].lastVisit); }
        for (let i in list) { await setBypassList(i, list[i].lastVisit); }
        const [securityLog, bypassList] = await getAllMapping();
        log(`Restored ${Object.keys(securityLog).length} session(s), `
            + `${Object.keys(bypassList).length} bypass-item(s).`);
    })();
    const releaseClient = async (add) => {
        await callosum.del(SECURITY_LOG, add);
        log(`Released inactive client: ${add}.`);
    };
    const removeBypass = async (host) => {
        await callosum.del(BYPASS_LIST, host);
        log(`Remove inactive bypass-item: ${host}.`);
    };
    const cleanStatus = async () => {
        const [now, ips, hosts] = [new Date(), [], []];
        let [securityLog, bypassList] = await getAllMapping();
        // clean security log
        for (let a in securityLog) {
            if (securityLog[a].lastVisit + IDLE_CLIENT_TIMEOUT < now) {
                await releaseClient(a);
            } else { ips.push([securityLog[a].lastVisit, a]); }
        }
        ips.sort((a, b) => a[0] - b[0]);
        while (ips.length > MAX_CLIENT_COUNT) {
            await releaseClient(ips.shift()[1]);
        }
        // clean bypass list
        for (let h in bypassList) { hosts.push([bypassList[h].lastVisit, h]); }
        hosts.sort((a, b) => a[0] - b[0]);
        while (hosts.length > MAX_BYPASS_COUNT) {
            await removeBypass(hosts.shift()[1]);
        }
        // save
        [securityLog, bypassList] = await getAllMapping();
        if (!Function.isFunction(options.setStatus)) { return; }
        await options.setStatus({ securityLog, bypassList });
        log(`Saved ${Object.keys(securityLog).length} session(s), `
            + `${Object.keys(bypassList).length} bypass-item(s).`);
    };
    return await event.loop(
        cleanStatus, 60, 60, 0, utilitas.basename(import.meta.url),
        { silent: true }
    );
};

export default init;
export {
    error,
    getBypassHost,
    getBypassList,
    getSecurityLog,
    init,
    isLocalhost,
    route,
    setBypassList,
    setSecurityLog,
};
