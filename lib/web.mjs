import { HTTP_METHODS, HTTP_RESPONSES, HTTP_BODIES } from './consts.mjs';

const { OK, NOT_FOUND } = HTTP_RESPONSES;
const { GET } = HTTP_METHODS;
const packResult = (status, body) => { return { status, body } };

const route = async (method, path, protocol, req) => {
    switch (`${String(method).toUpperCase()} ${String(path).toLowerCase()}`) {
        case `${GET} /`:
            return packResult(OK, 'Hello World!');
        case `${GET} /favicon.ico`:
            return packResult(OK, '');
        case `${GET} /wpad.dat`:
            return packResult(OK, [
                'function FindProxyForURL(url, host) {',
                "    return 'PROXY 127.0.0.1:8964; DIRECT';",
                '}',
            ].join('\n'));
        default:
            return packResult(NOT_FOUND, HTTP_BODIES.NOT_FOUND);
    }
};

export default route;
