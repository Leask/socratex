import { HTTP_METHODS, HTTP_RESPONSES, HTTP_BODIES } from './consts.mjs';

const { OK, NOT_FOUND } = HTTP_RESPONSES;
const { GET } = HTTP_METHODS;

const packResult = (status, body) => { return { status, body } };

const route = async (method, path, protocol, req) => {
    switch (`${String(method).toUpperCase()} ${String(path).toLowerCase()}`) {
        case `${GET} /`: return packResult(OK, 'Hello World!');
        case `${GET} /favicon.ico`: return packResult(OK, '');
        case `${GET} /wpad.dat${_socrates.token ? `?token=${_socrates.token}` : ''}`:
            if (_socrates.token) {
                return packResult(OK, [
                    'function FindProxyForURL(url, host) {',
                    `    return '${_socrates.address}';`, // '; DIRECT'
                    '}',
                ].join('\n'));
            }
        default: return packResult(NOT_FOUND, HTTP_BODIES.NOT_FOUND);
    }
};

export default route;
export { route };
