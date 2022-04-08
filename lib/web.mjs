import { HTTP_METHODS, HTTP_RESPONSES, HTTP_BODIES } from './consts.mjs';

const { GET } = HTTP_METHODS;
const packResult = (status, body) => { return { status, body: body || '' } };

const {
    AUTH_REQUIRED, ENOTFOUND, EPIPE, EPROTO, ETIMEDOUT, NOT_FOUND,
    OK, UNAUTHORIZED, NOT_OK, TIMED_OUT, TOO_MANY_REQ,
} = HTTP_RESPONSES;

const route = async (method, path, protocol, req) => {
    const token = _socrates.token;
    switch (`${String(method).toUpperCase()} ${String(path).toLowerCase()}`) {
        case `${GET} /`: return packResult(OK, 'Hello World!');
        case `${GET} /favicon.ico`: return packResult(OK, '');
        case `${GET} /wpad.dat${token ? `?token=${token}` : ''}`:
            if (token) {
                return packResult(OK, [
                    'function FindProxyForURL(url, host) {',
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

export { route, error };
