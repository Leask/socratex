import { __, isAscii, Logger } from './utilitas.mjs';
import net from 'net';
import route from './route.mjs';
import tls from 'tls';

import {
    DEFAULT_KEYS, DEFAULT_OPTIONS, ERROR_CODES, EVENTS, HTTP_BODIES,
    HTTP_METHODS, HTTP_PORT, HTTP_RESPONSES, HTTP, HTTPS_PORT, HTTPS,
    SLASH_REGEXP, SLASH, STRINGS,
} from './consts.mjs';

const { __filename } = __(import.meta.url);
const { AUTH_REQUIRED, NOT_FOUND, NOT_OK, OK, TIMED_OUT } = HTTP_RESPONSES;
const { BLANK, CLRF, EMPTY, PROXY_AUTH_BASIC, PROXY_AUTH, SEPARATOR } = STRINGS;
const { CLOSE, DATA, ERROR, EXIT } = EVENTS;
const { CONNECT, GET } = HTTP_METHODS;
const { ENOTFOUND, EPIPE, EPROTO, ETIMEDOUT } = ERROR_CODES;
const DOUBLE_CLRF = CLRF + CLRF;
const socketCheck = socket => socket && !socket.destroyed ? socket : null;
const socketWrite = (socket, data) => data && socketCheck(socket)?.write?.(data);
const socketDestroy = socket => socketCheck(socket)?.destroy?.();
const getAddressByRemoteId = remoteId => remoteId.replace(/(\:[0-9]*)$/, '');

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

/**
 * @param {Object} headersObject
 * @param {buffer} dataBuffer
 * @returns {buffer}
 */
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

/**
 * @param ipStringWithPort
 * @returns {{host: string, port: number, protocol: string, credentials: string}}
 */
const getAddressAndPortFromString = (ipStringWithPort) => {
    let [credentials, targetHost] = ipStringWithPort.split(STRINGS.AT);
    if (!targetHost) {
        targetHost = credentials;
        credentials = '';
    }
    let [protocol, host, port] = targetHost.split(STRINGS.SEPARATOR);
    if (protocol.indexOf(HTTP) === -1) {
        port = host;
        host = protocol;
        protocol = (port && parseInt(port) === HTTPS_PORT) ? HTTPS : HTTP;
    }
    host = (host) ? host : protocol.replace(SLASH_REGEXP, STRINGS.EMPTY);
    if (host.indexOf(SLASH + SLASH) === 0) { host = host.split(SLASH)[2]; }
    else { host = host.split(SLASH)[0]; }
    port = port || (protocol && ~protocol.indexOf(HTTPS) ? HTTPS_PORT : HTTP_PORT);
    return JSON.parse(JSON.stringify({
        host, port: parseInt(port), protocol,
        credentials: credentials || undefined
    }));
};

/**
 * Build options for native nodejs tcp-connection.
 * @param proxyToUse
 * @param upstreamHost
 * @returns {boolean|{host: string, port: number, protocol: string, credentials: string, upstreamed:boolean}}
 */
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

/**
 * @param clientSocket
 * @param bridgedConnections
 * @param options
 * @param logger
 */
const onConnectedClientHandling = (clientSocket, bridgedConnections, options, logger) => {
    const {
        upstream, tcpOutgoingAddress, injectData,
        injectResponse, auth, intercept, keys
    } = options;
    const remoteId = `${clientSocket.remoteAddress}${SEPARATOR}${clientSocket.remotePort}`;
    // logger.log(`Received request from: ${remoteId}`);
    const onClose = (err) => {
        const tunnel = bridgedConnections[remoteId];
        const count = Object.keys(bridgedConnections).length;
        if (err && err instanceof Error) {
            // @todo: handle more the errorCodes
            switch (err.code) {
                case ETIMEDOUT:
                    tunnel.clientResponseWrite(TIMED_OUT + DOUBLE_CLRF);
                    break;
                case ENOTFOUND:
                    tunnel.clientResponseWrite(NOT_FOUND + DOUBLE_CLRF + HTTP_BODIES.NOT_FOUND);
                    break;
                case EPIPE:
                    logger.error(`(${count}) ${remoteId} E: ${err.message}`);
                    // console.error(err);
                    break;
                case EPROTO: // @todo: need more test
                    tunnel.clientResponseWrite(NOT_OK + DOUBLE_CLRF + HTTP_BODIES.NOT_FOUND);
                    break;
                default:
                    logger.error(`(${count}) ${remoteId} E: ${err.message}`);
                    // console.error(err);
                    tunnel.clientResponseWrite(NOT_OK + DOUBLE_CLRF);
            }
        }
        if (tunnel) { tunnel.destroy(); delete bridgedConnections[remoteId]; }
    };

    const onDataFromUpstream = (dataFromUpStream) => {
        const tunnel = bridgedConnections[remoteId];
        const responseData = Function.isFunction(injectResponse)
            ? injectResponse(dataFromUpStream, tunnel) : dataFromUpStream;
        tunnel.clientResponseWrite(responseData);
        updateSockets(); // updateSockets if needed after first response
    };

    const onDirectConnectionOpen = (srcData) => {
        const tunnel = bridgedConnections[remoteId];
        const requestData = Function.isFunction(injectData)
            ? injectData(srcData, tunnel) : srcData;
        tunnel.clientRequestWrite(requestData);
    };

    const updateSockets = () => {
        const tunnel = bridgedConnections[remoteId];
        if (intercept && tunnel && tunnel.isHttps && !tunnel._updated) {
            const keysObject = Function.isFunction(keys) ? keys(tunnel) : false;
            const keyToUse = (
                keysObject
                && typeof keysObject === 'object'
                && Object.keys(keysObject).length === 2
            ) ? keysObject : undefined;
            tunnel._updateSockets({
                onDataFromClient, onDataFromUpstream, onClose
            }, keyToUse);
        }
    };

    /**
     * @param {buffer} data
     * @param {string} firstHeaderRow
     * @param {boolean} isConnectMethod - false as default.
     * @returns Promise{boolean|{host: string, port: number, protocol: string, credentials: string, upstreamed: boolean}}
     */
    const prepareTunnel = async (data, firstHeaderRow, isConnectMethod = false) => {
        const tunnel = bridgedConnections[remoteId];
        const upstreamHost = firstHeaderRow.split(BLANK)[1];
        const initOpt = getConnectionOptions(false, upstreamHost);
        tunnel.setTunnelOpt(initOpt); //settings opt before callback
        const proxy = await route(upstream, { data, bridgedConnection: tunnel });
        //initializing socket and forwarding received request
        const connectionOpt = getConnectionOptions(proxy, upstreamHost);
        tunnel.isHttps = !!(isConnectMethod || (
            connectionOpt.upstream && connectionOpt.upstream.protocol === HTTPS
        ));
        tunnel.setTunnelOpt(connectionOpt); // updating tunnel opt
        if (Function.isFunction(tcpOutgoingAddress)) {
            //THIS ONLY work if server-listener is not 0.0.0.0 but specific iFace/IP
            connectionOpt.localAddress = tcpOutgoingAddress(data, tunnel);
        }

        const onTunnelHTTPConnectionOpen = (connectionError) => {
            if (connectionError) { return onClose(connectionError); }
            if (connectionOpt.credentials) {
                const headers = parseHeaders(data);
                const basedCredentials = Buffer.from(
                    connectionOpt.credentials
                ).toString('base64'); //converting to base64
                headers[PROXY_AUTH.toLowerCase()] = PROXY_AUTH_BASIC + BLANK + basedCredentials;
                const newData = rebuildHeaders(headers, data);
                tunnel.clientRequestWrite(newData)
            } else { onDirectConnectionOpen(data); }
        };

        const onTunnelHTTPSConnectionOpen = async (connectionError) => {
            if (connectionError) { return onClose(connectionError); }
            if (connectionOpt.upstreamed) {
                if (connectionOpt.credentials) {
                    const headers = parseHeaders(data);
                    const basedCredentials = Buffer.from(connectionOpt.credentials).toString('base64'); //converting to base64
                    headers[PROXY_AUTH.toLowerCase()] = PROXY_AUTH_BASIC + BLANK + basedCredentials;
                    const newData = rebuildHeaders(headers, data);
                    tunnel.clientRequestWrite(newData)
                } else { onDirectConnectionOpen(data); }
            } else {
                // response as normal http-proxy
                tunnel.clientResponseWrite(OK + CLRF + CLRF);
                updateSockets();
            }
        };

        const callbackOnConnect = (isConnectMethod)
            ? onTunnelHTTPSConnectionOpen : onTunnelHTTPConnectionOpen;
        const isGet = firstHeaderRow.startsWith(GET);
        const url = isGet ? firstHeaderRow.split(BLANK)[1] : null;
        if (connectionOpt?.host && connectionOpt?.port) {
            const { ADDRESS, PORT } = tunnel.getTunnelStats();
            const count = Object.keys(bridgedConnections).length;
            logger.log(`(${count}) ${remoteId} => ${ADDRESS}:${PORT}`);
            const responseSocket = net.createConnection(
                connectionOpt, callbackOnConnect
            );
            tunnel.setRequestSocket(
                responseSocket
                    .on(DATA, onDataFromUpstream)
                    .on(CLOSE, onClose)
                    .on(ERROR, onClose)
            );
            // @todo: working on //////////////////////////////////////////////
            // } else if (isGet && url === '/wpad.dat') {
            //     tunnel.clientResponseWrite(OK + DOUBLE_CLRF + [
            //         'function FindProxyForURL(url, host) {',
            //         "    return 'PROXY 127.0.0.1:8964';", // ; DIRECT
            //         '}',
            //     ].join('\n'));
            //     // @todo: merge here! by @Leask
            //     if (tunnel) { tunnel.destroy(); delete bridgedConnections[remoteId]; }
            // } else if (isGet) {
            //     tunnel.clientResponseWrite(OK + DOUBLE_CLRF + 'Welcome to Socrates proxy!');
            //     if (tunnel) { tunnel.destroy(); delete bridgedConnections[remoteId]; }
            // } else {
            //     tunnel.clientResponseWrite(NOT_OK + DOUBLE_CLRF + 'Invalid Request!');
            //     // @todo: merge here! by @Leask
            //     if (tunnel) { tunnel.destroy(); delete bridgedConnections[remoteId]; }
        }
        return connectionOpt;
    };

    const handleProxyTunnel = (split, data) => {
        const firstHeaderRow = split[0];
        const tunnel = bridgedConnections[remoteId];
        if (~firstHeaderRow.indexOf(CONNECT)) { // managing HTTP-Tunnel(upstream) & HTTPs
            return prepareTunnel(data, firstHeaderRow, true);
        } else if (firstHeaderRow.indexOf(CONNECT) === -1 && !tunnel._dst) {
            return prepareTunnel(data, firstHeaderRow); // managing http
        } else if (tunnel && tunnel._dst) {
            return onDirectConnectionOpen(data);
        }
    };

    const onDataFromClient = async (data) => {
        const dataString = data.toString();
        const tunnel = bridgedConnections[remoteId];
        const rAdd = getAddressByRemoteId(remoteId);
        try {
            if (!dataString || !dataString.length) { return; }
            const headers = parseHeaders(data);
            const split = dataString.split(CLRF); // @todo: make secure, split can be limited
            if (!Function.isFunction(auth) || tunnel.isAuthenticated()) {
                return handleProxyTunnel(split, data);
            }
            let isAuthedIp = null;
            for (let i in bridgedConnections) {
                if (getAddressByRemoteId(bridgedConnections[i]._id) === rAdd) {
                    isAuthedIp = bridgedConnections[i].user; break;
                }
            }
            if (isAuthedIp) {
                tunnel.setUserAuthentication(isAuthedIp);
                return handleProxyTunnel(split, data);
            }
            const proxyAuth = headers[PROXY_AUTH.toLowerCase()];
            if (!proxyAuth) {
                return tunnel.clientResponseWrite(AUTH_REQUIRED + DOUBLE_CLRF);
            }
            const credentials = proxyAuth.replace(PROXY_AUTH_BASIC, EMPTY);
            const parsedCredentials = Buffer.from(credentials, 'base64').toString();
            const [username, password] = parsedCredentials.split(SEPARATOR); // @todo: split can be limited
            let isLogged = auth(username, password, tunnel);
            if (isLogged instanceof Promise ? await isLogged : isLogged) {
                tunnel.setUserAuthentication(username);
                return handleProxyTunnel(split, data);
            } else { // return auth-error and close all
                tunnel.clientResponseWrite(AUTH_REQUIRED + DOUBLE_CLRF + HTTP_BODIES.AUTH_REQUIRED);
                return onClose();
            }
        } catch (err) {
            return onClose(err);
        }
    };

    bridgedConnections[remoteId] = new Session(remoteId); //initializing bridged-connection
    // bridgedConnections[remoteId].setResponseSocket(
    //     new tls.TLSSocket(clientSocket, {
    //         rejectUnauthorized: false,
    //         requestCert: false,
    //         isServer: true,
    //         key: DEFAULT_KEYS.key,
    //         cert: DEFAULT_KEYS.cert
    //     })
    //         .on(DATA, onDataFromClient)
    //         .on(ERROR, onClose)
    //         .on(CLOSE, onClose)
    //         .on(EXIT, onClose)
    // );
    bridgedConnections[remoteId].setResponseSocket(
        clientSocket
            .on(DATA, onDataFromClient)
            .on(ERROR, onClose)
            .on(CLOSE, onClose)
            .on(EXIT, onClose)
    );
};

class Session extends Object {

    clientRequestWrite(data) { socketWrite(this._dst, data); return this; };
    clientResponseWrite(data) { socketWrite(this._src, data); return this; };
    destroy() { socketDestroy(this._dst); socketDestroy(this._src); return this; }
    isAuthenticated() { return this.authenticated; }
    setResponseSocket(socket) { this._src = socket; return this; }
    setRequestSocket(socket) { this._dst = socket; return this; }
    getId() { return this._id; }
    getTunnelStats() { return this._tunnel; }

    constructor(id) {
        super();
        Object.assign(this, {
            _id: id, _src: null, _dst: null, _tunnel: {},
            user: null, authenticated: false, isHttps: false,
        });
    };

    setUserAuthentication(user) {
        return Object.assign(this, user ? { authenticated: true, user } : {});
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

    /**
     * @param {object} callbacksObject
     * @param {object} KEYS - {key:{string},cert:{string}}
     * @returns {Session}
     * @private
     */
    _updateSockets(callbacksObject, KEYS = DEFAULT_KEYS) {
        const { onDataFromClient, onDataFromUpstream, onClose } = callbacksObject;
        KEYS = KEYS || DEFAULT_KEYS;
        if (!this._updated) {
            this.setResponseSocket(new tls.TLSSocket(this._src, {
                rejectUnauthorized: false,
                requestCert: false,
                isServer: true,
                key: KEYS.key,
                cert: KEYS.cert
            }).on(DATA, onDataFromClient)
                .on(CLOSE, onClose)
                .on(ERROR, onClose));
            this.setRequestSocket(new tls.TLSSocket(this._dst, {
                rejectUnauthorized: false,
                requestCert: false,
                isServer: false
            }).on(DATA, onDataFromUpstream)
                .on(CLOSE, onClose)
                .on(ERROR, onClose));
            this._updated = true;
        }
        return this;
    };

};

class Socrates extends net.createServer {
    getBridgedConnections() { return this.bridgedConnections; };

    constructor(options) {
        const { // merging with default options
            auth, injectData, injectResponse, intercept, keys,
            tcpOutgoingAddress, upstream, logLevel, modName,
        } = { ...DEFAULT_OPTIONS, ...options };
        const logger = new Logger({ logLevel, modName: modName || __filename });
        const bridgedConnections = {};
        super((clientSocket) => {
            onConnectedClientHandling(
                clientSocket,
                bridgedConnections,
                {
                    upstream, tcpOutgoingAddress,
                    injectData, injectResponse,
                    auth, intercept, keys
                },
                logger)
        });
        this.bridgedConnections = bridgedConnections;
    };
};

export default Socrates;
