import {
    HTTPS_PORT, HTTP_METHODS, HTTP_RESPONSES, HTTP_BODIES, DEFAULT_OPTIONS
} from './consts.mjs';

const { OK, NOT_FOUND } = HTTP_RESPONSES;
const { GET } = HTTP_METHODS;
const packResult = (status, body) => { return { status, body } };
const setDomain = name => domain = name;
const setToken = tkn => token = tkn;

let [domain, token] = ['', ''];

const route = async (method, path, protocol, req) => {
    switch (`${String(method).toUpperCase()} ${String(path).toLowerCase()}`) {
        case `${GET} /`:
            return packResult(OK, 'Hello World!');
        case `${GET} /favicon.ico`:
            return packResult(OK, '');
        case `${GET} /wpad.dat${token ? `?token=${token}` : ''}`:
            return packResult(OK, [
                'function FindProxyForURL(url, host) {',
                `    return 'HTTPS ${domain || DEFAULT_OPTIONS.domain}:${HTTPS_PORT}; DIRECT';`,
                '}',
            ].join('\n'));
        default:
            return packResult(NOT_FOUND, HTTP_BODIES.NOT_FOUND);
    }
};

export default route;
export { route, setDomain, setToken };
