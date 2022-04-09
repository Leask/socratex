import { route, error, bypass } from './web.mjs';
import * as ssl from './ssl.mjs';
import geoIp from 'fast-geoip';
import net from 'net';
import tls from 'tls';

import {
    AT, BLANK, CLRF, DEFAULT_OPTIONS, DOUBLE_CLRF, EMPTY, EVENTS, HTTP_BODIES,
    HTTP_METHODS, HTTP_PORT, HTTP_RESPONSES, HTTP, HTTPS_PORT, HTTPS,
    PROXY_AUTH_BASIC, PROXY_AUTH, SEPARATOR, SLASH_REGEXP, SLASH, STATUS,
    IDLE_CLIENT_TIMEOUT, MAX_CLIENT_COUNT,
} from './consts.mjs';

import {
    __, isAscii, Logger, throwError, resolve, ignoreErrFunc, base64Encode,
} from './utilitas.mjs';

const { __filename } = __(import.meta.url);
const { CLOSE, DATA, ERROR, EXIT } = EVENTS;
const { CONNECT } = HTTP_METHODS;
const { AUTH_REQUIRED, OK, UNAUTHORIZED } = HTTP_RESPONSES;
const socketCheck = socket => socket && !socket.destroyed ? socket : null;
const socketWrite = (socket, dt) => dt && socketCheck(socket)?.write?.(dt);
const socketDestroy = socket => socketCheck(socket)?.destroy?.();
const getTokenRegExp = () => new RegExp('^.*token=([\\da-z]*).*$', 'ig');

const parseHeaders = (data) => {
    // @todo: make secure
    const [headers, body] = data.toString().split(CLRF + CLRF + CLRF);
    const [headerRows, headerObject] = [headers.split(CLRF), {}];
    for (let i = 0; i < headerRows.length; i++) {
        const headerRow = headerRows[i];
        if (i === 0) {
            // first row contain method, path and type
            // const [method, path, version] = headerRow.split(BLANK);
            // headerObject.method = method;
            // headerObject.path = path;
            // headerObject.version = version;
        } else {
            const [attribute, value] = headerRow.split(SEPARATOR);
            if (attribute && value) {
                const lowerAttribute = attribute.trim().toLowerCase();
                headerObject[lowerAttribute] = value.trim();
            }
        }
    }
    return headerObject;
};

const rebuildHeaders = (headersObject, dataBuffer) => {
    const [headers, body] = dataBuffer.toString().split(DOUBLE_CLRF + CLRF, 2);
    const firstRow = headers.split(CLRF, 1)[0];
    let newData = `${firstRow}${CLRF}`;
    Object.keys(headersObject).map(key => {
        newData += `${key}${SEPARATOR}${BLANK}${headersObject[key]}${CLRF}`;
    });
    newData += `${DOUBLE_CLRF}${body || ''}`;
    return Buffer.from(newData);
};

const select = async (upstream, { data, connection }) => {
    if (Function.isFunction(upstream)) {
        let returnValue = upstream(data, connection);
        if (returnValue instanceof Promise) {
            returnValue = await returnValue;
        }
        if (returnValue !== 'localhost') {
            return returnValue;
        }
    }
    return false;
};

const getAddressAndPortFromString = (ipStringWithPort) => {
    let [credentials, targetHost] = ipStringWithPort.split(AT);
    if (!targetHost) {
        [targetHost, credentials] = [credentials, ''];
    }
    let [protocol, host, port] = targetHost.split(SEPARATOR);
    if (protocol.indexOf(HTTP) === -1) {
        [port, host] = [host, protocol];
        protocol = (port && parseInt(port) === HTTPS_PORT) ? HTTPS : HTTP;
    }
    host = (host) ? host : protocol.replace(SLASH_REGEXP, EMPTY);
    if (host.indexOf(SLASH + SLASH) === 0) { host = host.split(SLASH)[2]; }
    else { host = host.split(SLASH)[0]; }
    port = port || (
        protocol && ~protocol.indexOf(HTTPS) ? HTTPS_PORT : HTTP_PORT
    );
    return JSON.parse(JSON.stringify({
        host, port: parseInt(port), protocol,
        credentials: credentials || undefined
    }));
};

// Build options for native nodejs tcp-connection.
const getConnectionOptions = (proxyToUse, upstreamHost) => {
    if (!isAscii(upstreamHost)) { return false; }
    const upstreamed = !!proxyToUse;
    const upstreamToUse = upstreamed ? proxyToUse : upstreamHost;
    const config = getAddressAndPortFromString(upstreamToUse);
    const result = { ...config, ...{ upstreamed } };
    if (result.upstreamed) {
        result.upstream = getAddressAndPortFromString(upstreamHost);
    }
    return result.port >= 0 && result.port < 65536 ? result : false;
};

const onConnect = async (
    clientSocket, connections, securityLog, options, logger
) => {
    const {
        basicAuth, https, injectData, injectResponse, intercept,
        keys, tcpOutgoingAddress, tokenAuth, upstream,
    } = options;
    const remoteId = [
        clientSocket.remoteAddress, clientSocket.remotePort
    ].join(SEPARATOR);
    const querySession = () => connections[remoteId];
    const querySecurityLog = () => securityLog[clientSocket.remoteAddress];
    const getStatus = () => `(${Object.keys(connections).length}) ${remoteId} `;
    // options.debug && logger.log(`New connection from: ${remoteId}`);

    const setSecurityLog = (user) => {
        querySession().setUserAuthentication(user);
        return securityLog[clientSocket.remoteAddress] = Object.assign(
            querySecurityLog() || { firstVisit: new Date() },
            { lastVisit: new Date() }
        );
    };

    const isAuthenticated = () => {
        return querySession()?.isAuthenticated?.() || querySecurityLog();
    };

    const throwUnauted = () => throwError(
        HTTP_BODIES.UNAUTHORIZED, STATUS.UNAUTH, { code: UNAUTHORIZED }
    );

    const throwAuth = () => throwError(
        HTTP_BODIES.AUTH_REQUIRED, STATUS.AUTH, { code: AUTH_REQUIRED }
    );

    const destroy = () => {
        if (querySession()) {
            querySession().destroy();
            delete connections[remoteId];
        }
        return querySession();
    };

    const onClose = async (err) => {
        const tunnel = querySession();
        if (err && err instanceof Error) {
            const { status, body } = await error(err);
            tunnel.clientResponseWrite(`${status}${DOUBLE_CLRF}${body}`);
            logger.error(`${getStatus()}E: ${err?.message || err}`);
            options?.debug && console.error(err);
        }
        destroy();
    };

    const onDataFromUpstream = async (dataFromUpStream) => {
        const tunnel = querySession();
        const responseData = Function.isFunction(injectResponse)
            ? injectResponse(dataFromUpStream, tunnel) : dataFromUpStream;
        tunnel.clientResponseWrite(responseData);
        await updateSockets(); // updateSockets if needed after first response
    };

    const onDirectConnectionOpen = (srcData) => {
        const tunnel = querySession();
        const requestData = Function.isFunction(injectData)
            ? injectData(srcData, tunnel) : srcData;
        tunnel.clientRequestWrite(requestData);
    };

    const updateSockets = async () => {
        const tunnel = querySession();
        if (intercept && tunnel && tunnel.isHttps && !tunnel._updated) {
            const keysObject = Function.isFunction(keys) ? keys(tunnel) : false;
            const keyToUse = (
                keysObject
                && typeof keysObject === 'object'
                && Object.keys(keysObject).length === 2
            ) ? keysObject : undefined;
            await tunnel._updateSockets({
                onDataFromClient, onDataFromUpstream, onClose
            }, keyToUse);
        }
    };

    const prepareTunnel = async (data, firstHeaderRow, isConnectMethod = 0) => {
        const tunnel = querySession();
        const firstHeaders = firstHeaderRow.split(BLANK);
        const upstreamHost = firstHeaders[1];
        const initOpt = getConnectionOptions(false, upstreamHost);
        tunnel.setTunnelOpt(initOpt); //settings opt before callback
        const proxy = await select(upstream, { data, connection: tunnel });
        //initializing socket and forwarding received request
        const connectionOpt = getConnectionOptions(proxy, upstreamHost);
        tunnel.isHttps = !!(isConnectMethod || (
            connectionOpt.upstream && connectionOpt.upstream.protocol === HTTPS
        ));
        tunnel.setTunnelOpt(connectionOpt); // updating tunnel opt
        // ONLY work if server-listener is not 0.0.0.0 but specific iFace/IP
        if (Function.isFunction(tcpOutgoingAddress)) {
            connectionOpt.localAddress = tcpOutgoingAddress(data, tunnel);
        }

        const onOpen = async (connectionError) => {
            const { ADDRESS, PORT } = tunnel.getTunnelStats();
            const ct = (await geoIp.lookup(tunnel._dst.remoteAddress))?.country;
            options?.bypass?.has?.(ct) && bypass(ADDRESS);
            logger.log(`${getStatus()}=> [${ct}] ${tunnel._dst.remoteAddress}:${PORT} ~ ${ADDRESS}`);
            if (connectionError) { return await onClose(connectionError); }
            if (isConnectMethod && !connectionOpt.upstreamed) {
                tunnel.clientResponseWrite(OK + CLRF + CLRF);
                return await updateSockets(); // response as normal http-proxy
            }
            if (!connectionOpt.credentials) {
                return onDirectConnectionOpen(data);
            }
            const headers = parseHeaders(data);
            const basedCredentials = base64Encode(connectionOpt.credentials);
            headers[PROXY_AUTH.toLowerCase()]
                = PROXY_AUTH_BASIC + BLANK + basedCredentials;
            tunnel.clientRequestWrite(rebuildHeaders(headers, data));
        };

        if (connectionOpt?.host && connectionOpt?.port) {
            const responseSocket = net.createConnection(connectionOpt, onOpen);
            tunnel.setRequestSocket(
                responseSocket
                    .on(DATA, onDataFromUpstream)
                    .on(CLOSE, onClose)
                    .on(ERROR, onClose)
            );
        } else {
            const { status, body } = await route(...firstHeaders);
            tunnel.clientResponseWrite(`${status}${DOUBLE_CLRF}${body}`);
            destroy();
        }
        return connectionOpt;
    };

    const handleProxyTunnel = (split, data) => {
        const firstHeaderRow = split[0];
        const tunnel = querySession(); // managing HTTP-Tunnel(upstream) & HTTPs
        if (~firstHeaderRow.indexOf(CONNECT)) {
            return prepareTunnel(data, firstHeaderRow, true);
        } else if (firstHeaderRow.indexOf(CONNECT) === -1 && !tunnel._dst) {
            return prepareTunnel(data, firstHeaderRow); // managing http
        } else if (tunnel && tunnel._dst) {
            return onDirectConnectionOpen(data);
        }
    };

    const onDataFromClient = async (data) => {
        const dataString = data.toString();
        const tunnel = querySession();
        try {                        // @todo: make secure, split can be limited
            if (!dataString || !dataString.length) { return; }
            const headers = parseHeaders(data);
            const split = dataString.split(CLRF);
            if ((!Function.isFunction(basicAuth)
                && !Function.isFunction(tokenAuth))
                || isAuthenticated()) {
                setSecurityLog('[TRANSFERRED]');
                return handleProxyTunnel(split, data);
            }
            if (Function.isFunction(tokenAuth)) {
                const token = getTokenRegExp().test(split[0])
                    && split[0].replace(getTokenRegExp(), '$1');
                (await resolve(tokenAuth(token, tunnel))) || throwUnauted();
                setSecurityLog('[TOKEN]');
            } else if (Function.isFunction(basicAuth)) {
                const pA = headers[PROXY_AUTH.toLowerCase()] || throwAuth();
                const credentials = pA.replace(PROXY_AUTH_BASIC, EMPTY);
                const parsedCdt = Buffer.from(credentials, 'base64').toString();
                const [user, passwd] = parsedCdt.split(SEPARATOR);
                (await resolve(basicAuth(user, passwd, tunnel))) || throwAuth();
                setSecurityLog(user);         // @todo: split can be limited
            }
            return handleProxyTunnel(split, data);
        } catch (err) { return await onClose(err); }
    };

    connections[remoteId] = new Session(remoteId); // initializing connection
    querySession().setResponseSocket(
        (https ? new tls.TLSSocket(clientSocket, {
            rejectUnauthorized: false, requestCert: false, isServer: true,
            ...await ssl.getCert(),
        }) : clientSocket).on(DATA, onDataFromClient)
            .on(ERROR, onClose)
            .on(CLOSE, onClose)
            .on(EXIT, onClose)
    );
};

class Session extends Object {
    clientRequestWrite(data) { socketWrite(this._dst, data); return this; };
    clientResponseWrite(data) { socketWrite(this._src, data); return this; };
    isAuthenticated() { return this.authenticated; }
    setResponseSocket(socket) { this._src = socket; return this; }
    setRequestSocket(socket) { this._dst = socket; return this; }
    getId() { return this._id; }
    getTunnelStats() { return this._tunnel; }
    destroy() {
        socketDestroy(this._dst); socketDestroy(this._src); return this;
    };
    constructor(id) {
        super();
        Object.assign(this, {
            _dst: null, _id: id, _src: null, _tunnel: {},
            authenticated: false, isHttps: false, user: null,
        });
    };
    setUserAuthentication(user) {
        return Object.assign(
            this, user ? { authenticated: true, user: this.user || user } : {}
        );
    };
    setTunnelOpt(options) {
        if (options) {
            const { host, port, upstream } = options;
            this._tunnel.ADDRESS = host;
            this._tunnel.PORT = port;
            if (!!upstream) { this._tunnel.UPSTREAM = upstream; }
        }
        return this;
    };
    _updateSockets = async (events, keys) => {
        const { onDataFromClient, onDataFromUpstream, onClose } = events;
        if (!this._updated) {   // no need to update if working as a https proxy
            if (!this._src.ssl) {
                this.setResponseSocket(new tls.TLSSocket(this._src, {
                    rejectUnauthorized: false, requestCert: false,
                    isServer: true, ...keys || await ssl.getCert(),
                }).on(DATA, onDataFromClient)
                    .on(CLOSE, onClose)
                    .on(ERROR, onClose));
            }
            this.setRequestSocket(new tls.TLSSocket(this._dst, {
                rejectUnauthorized: false, requestCert: false, isServer: false,
            }).on(DATA, onDataFromUpstream)
                .on(CLOSE, onClose)
                .on(ERROR, onClose));
            this._updated = true;
        }
        return this;
    };
};

class Socrates extends net.createServer {
    getConnections() { return this.connections; };
    getSecurityLog() { return this.securityLog; };

    constructor(options) {
        options = { ...DEFAULT_OPTIONS, ...options || {} };
        const logger = new Logger({
            logLevel: ~~options.logLevel, name: options?.name || __filename
        });
        const [connections, securityLog] = [{}, {}];
        super(clientSocket => onConnect(
            clientSocket, connections, securityLog, options, logger
        ));
        this.connections = connections;
        this.securityLog = securityLog;
        Function.isFunction(options.getStatus) && (async () => {
            const sLog = (
                await resolve(options.getStatus())
            )?.config?.securityLog || {};
            for (let i in sLog) {
                sLog[i].firstVisit = new Date(sLog[i].firstVisit);
                sLog[i].lastVisit = new Date(sLog[i].lastVisit);
                securityLog[i] = sLog[i];
            }
            logger.log(
                `Restored ${Object.keys(securityLog).length} session(s).`
            );
        })();
        const releaseClient = (add) => {
            delete securityLog[add];
            logger.log(`Released idle client: ${add}.`);
        };
        const cleanSecurityLog = async () => {
            const [now, ips] = [new Date().getTime(), []];
            for (let key in securityLog) {
                const lastVisit = securityLog[key].lastVisit.getTime();
                if (lastVisit + IDLE_CLIENT_TIMEOUT < now) {
                    releaseClient(key);
                } else { ips.push([lastVisit, key]); }
            }
            ips.sort((a, b) => a[0] - b[0]);
            while (ips.length > MAX_CLIENT_COUNT) releaseClient(ips.shift()[1])
            if (!Function.isFunction(options.setStatus)) { return; }
            await options.setStatus({ securityLog });
            logger.log(`Saved ${Object.keys(securityLog).length} session(s).`);
        };
        setInterval(async () => {
            await ignoreErrFunc(cleanSecurityLog, { log: true })
        }, 1000 * 30);
    };
};

export default Socrates;
