import { createConnection, createServer } from 'net';
import { getCert } from './ssl.mjs';
import { lookup } from 'fast-geoip';
import { TLSSocket } from 'tls';
import { utilitas } from 'utilitas';
import Log from './log.mjs';

import {
    AT, BLANK, CLRF, DEFAULT_OPTIONS, DOUBLE_CLRF, EMPTY, EVENTS,
    HTTP_AUTH_BASIC, HTTP_AUTH, HTTP_BODIES, HTTP_METHODS, HTTP_PORT,
    HTTP_RESPONSES, HTTP, HTTPS_PORT, HTTPS, PROXY_AUTH, SEPARATOR,
    SLASH_REGEXP, SLASH, STATUS,
} from './consts.mjs';

import {
    error, getSecurityLog as _getSecurityLog, route, setBypassList,
    setSecurityLog as _setSecurityLog,
} from './web.mjs';

const { CLOSE, DATA, ERROR, EXIT } = EVENTS;
const { CONNECT } = HTTP_METHODS;
const { AUTH_REQUIRED, OK, UNAUTHORIZED } = HTTP_RESPONSES;
const socketCheck = socket => socket && !socket.destroyed ? socket : null;
const socketWrite = (socket, dt) => dt && socketCheck(socket)?.write?.(dt);
const socketDestroy = socket => socketCheck(socket)?.destroy?.();
const getTokenRegExp = () => new RegExp('^.*token=([\\da-z\-]*).*$', 'ig');

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
    Object.keys(headersObject).map(key =>
        newData += `${key}${SEPARATOR}${BLANK}${headersObject[key]}${CLRF}`
    );
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
    if (!targetHost) { [targetHost, credentials] = [credentials, '']; }
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
    if (!utilitas.isAscii(upstreamHost)) { return false; }
    const upstreamed = !!proxyToUse;
    const upstreamToUse = upstreamed ? proxyToUse : upstreamHost;
    const config = getAddressAndPortFromString(upstreamToUse);
    const result = { ...config, ...{ upstreamed } };
    if (result.upstreamed) {
        result.upstream = getAddressAndPortFromString(upstreamHost);
    }
    return result.port >= 0 && result.port < 65536 ? result : false;
};

const onConnect = async (clientSocket, connections, options, logger) => {
    const {
        basicAuth, https, injectData, injectResponse, intercept,
        keys, tcpOutgoingAddress, tokenAuth, upstream,
    } = options;
    const remoteId = [
        clientSocket.remoteAddress, clientSocket.remotePort
    ].join(SEPARATOR);
    const querySession = () => connections[remoteId];
    const getSecurityLog = async () => await _getSecurityLog(clientSocket.remoteAddress);
    const getStatus = () => `(${Object.keys(connections).length}) ${remoteId} `;
    // options.debug && logger.log(`New connection from: ${remoteId}`);

    const setSecurityLog = async user => {
        querySession().setUserAuthentication(user);
        return await _setSecurityLog(clientSocket.remoteAddress);
    };

    const isAuthenticated = async () => {
        return querySession()?.isAuthenticated?.() || await getSecurityLog();
    };

    const throwUnauted = () => utilitas.throwError(
        HTTP_BODIES.UNAUTHORIZED, STATUS.UNAUTH, { code: UNAUTHORIZED }
    );

    const throwAuth = () => utilitas.throwError(
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
            const country = (await lookup(tunnel._dst.remoteAddress))?.country;
            options?.bypass?.has?.(country) && await setBypassList(ADDRESS);
            logger.log(`${getStatus()}=> [${country}] `
                + `${tunnel._dst.remoteAddress}:${PORT} ~ ${ADDRESS}`);
            if (connectionError) { return await onClose(connectionError); }
            if (isConnectMethod && !connectionOpt.upstreamed) {
                tunnel.clientResponseWrite(OK + CLRF + CLRF);
                return await updateSockets(); // response as normal http-proxy
            }
            if (!connectionOpt.credentials) {
                return onDirectConnectionOpen(data);
            }
            const headers = parseHeaders(data);
            const basedCredentials
                = utilitas.base64Encode(connectionOpt.credentials);
            headers[PROXY_AUTH.toLowerCase()]
                = HTTP_AUTH_BASIC + BLANK + basedCredentials;
            tunnel.clientRequestWrite(rebuildHeaders(headers, data));
        };

        if (connectionOpt?.host && connectionOpt?.port) {
            const responseSocket = createConnection(connectionOpt, onOpen);
            tunnel.setRequestSocket(responseSocket
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
            const token = getTokenRegExp().test(split[0])
                && split[0].replace(getTokenRegExp(), '$1');
            const pxAth = headers[PROXY_AUTH.toLowerCase()]
                || headers[HTTP_AUTH.toLowerCase()];
            if (await isAuthenticated()) {
                await setSecurityLog('[TRANSFERRED]');
            } else if (Function.isFunction(tokenAuth) && token) {
                (await utilitas.resolve(tokenAuth(token, tunnel))) || throwUnauted();
                await setSecurityLog('[TOKEN]');
            } else if (Function.isFunction(basicAuth) && pxAth) {
                pxAth || throwUnauted();
                const credentials = pxAth.replace(HTTP_AUTH_BASIC, EMPTY);
                const parsedCdt = Buffer.from(credentials, 'base64').toString();
                const [user, passwd] = parsedCdt.split(SEPARATOR);
                (await utilitas.resolve(basicAuth(user, passwd, tunnel))) || throwUnauted();
                await setSecurityLog(user);       // @todo: split can be limited
            } else if (Function.isFunction(tokenAuth) || Function.isFunction(basicAuth)) {
                throwAuth();
            };
            return handleProxyTunnel(split, data);
        } catch (err) { return await onClose(err); }
    };

    connections[remoteId] = new Session(remoteId); // initializing connection
    querySession().setResponseSocket(
        (https ? new TLSSocket(clientSocket, {
            rejectUnauthorized: false, requestCert: false, isServer: true,
            ...await getCert(),
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
                this.setResponseSocket(new TLSSocket(this._src, {
                    rejectUnauthorized: false, requestCert: false,
                    isServer: true, ...keys || await getCert(),
                }).on(DATA, onDataFromClient)
                    .on(CLOSE, onClose)
                    .on(ERROR, onClose));
            }
            this.setRequestSocket(new TLSSocket(this._dst, {
                rejectUnauthorized: false, requestCert: false, isServer: false,
            }).on(DATA, onDataFromUpstream)
                .on(CLOSE, onClose)
                .on(ERROR, onClose));
            this._updated = true;
        }
        return this;
    };
};

class Socratex extends createServer {
    getConnections() { return this.connections; };

    constructor(options) {
        options = { ...DEFAULT_OPTIONS, ...options || {} };
        const logger = new Log({
            logLevel: ~~options.logLevel, name: options?.name || import.meta.url
        });
        const connections = {};
        super(clntSocket => onConnect(clntSocket, connections, options, logger));
        this.connections = connections;
    };
};

export default Socratex;
