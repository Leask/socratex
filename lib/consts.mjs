const [AT, BLANK, CLRF] = ['@', ' ', '\r\n'];
const [DOUBLE_CLRF, EMPTY, SEPARATOR] = [CLRF + CLRF, '', ':'];
const EVENTS = { CLOSE: 'close', DATA: 'data', ERROR: 'error', EXIT: 'exit' };
const [HTTP, HTTPS, PROXY] = ['http', 'https', 'PROXY'];
const HTTP_METHODS = { CONNECT: 'CONNECT', GET: 'GET' };
const [HTTP_PORT, HTTPS_PORT] = [80, 443];
const [PROXY_AUTH, PROXY_AUTH_BASIC] = ['Proxy-Authorization', 'Basic'];
const [SLASH, SLASH_REGEXP, SLASH_REGEXP_ONCE] = ['/', /\//gmi, /\//g];
const STATUS = { AUTH: 407, UNAUTH: 401 };
const IDLE_CLIENT_TIMEOUT = 1000 * 60 * 60 * 24 * 7;
const MAX_CLIENT_COUNT = 1000;

const DEFAULT_OPTIONS = {
    auth: false,
    https: false,
    injectData: false,
    injectResponse: false,
    intercept: false,
    keys: false,
    logLevel: 0,
    port: HTTP_PORT,
    tcpOutgoingAddress: false,
    upstream: false,
};

const ERROR_CODES = {
    ENOTFOUND: 'ENOTFOUND',
    EPIPE: 'EPIPE',
    EPROTO: 'EPROTO',
    ETIMEDOUT: 'ETIMEDOUT',
};

const HTTP_BODIES = {
    UNAUTHORIZED: 'Unauthorized',
    AUTH_REQUIRED: 'Proxy Authorization Required',
    NOT_FOUND: 'Not Found',
    TOO_MANY_REQ: 'Too Many Requests',
};

const HTTP_RESPONSES = {
    NOT_FOUND: 'HTTP/1.1 404 Not Found',
    NOT_OK: 'HTTP/1.1 400 Bad Request',
    OK: 'HTTP/1.1 200 OK',
    TIMED_OUT: 'HTTP/1.1 408 Request Timeout',
    UNAUTHORIZED: `HTTP/1.1 ${STATUS.UNAUTH} Unauthorized`,
    TOO_MANY_REQ: 'HTTP/1.1 429 Too Many Requests',
    AUTH_REQUIRED: `HTTP/1.1 ${STATUS.AUTH} Proxy Authorization Required`
        + `${CLRF}Proxy-Authenticate: Basic realm=""`,
};

export {
    AT,
    BLANK,
    CLRF,
    DEFAULT_OPTIONS,
    DOUBLE_CLRF,
    EMPTY,
    ERROR_CODES,
    EVENTS,
    HTTP_BODIES,
    HTTP_METHODS,
    HTTP_PORT,
    HTTP_RESPONSES,
    HTTP,
    HTTPS_PORT,
    HTTPS,
    IDLE_CLIENT_TIMEOUT,
    MAX_CLIENT_COUNT,
    PROXY_AUTH_BASIC,
    PROXY_AUTH,
    PROXY,
    SEPARATOR,
    SLASH_REGEXP_ONCE,
    SLASH_REGEXP,
    SLASH,
    STATUS,
};
