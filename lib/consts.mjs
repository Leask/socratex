const EVENTS = { CLOSE: 'close', DATA: 'data', ERROR: 'error', EXIT: 'exit' };
const HTTP = 'http';
const HTTP_METHODS = { CONNECT: 'CONNECT', GET: 'GET' };
const HTTP_PORT = 80;
const HTTPS = 'https';
const HTTPS_PORT = 443;
const SLASH = '/';
const SLASH_REGEXP = /\//gmi;
const SLASH_REGEXP_ONCE = /\//g;

const DEFAULT_OPTIONS = {
    auth: false,
    injectData: false,
    injectResponse: false,
    intercept: false,
    keys: false,
    logLevel: 0,
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
    AUTH_REQUIRED: 'Proxy Authorization Required!',
    NOT_FOUND: 'Not Found!'
};

const HTTP_RESPONSES = {
    AUTH_REQUIRED: 'HTTP/1.0 407 Proxy Authorization Required' + '\r\nProxy-Authenticate: Basic realm=""',
    NOT_FOUND: 'HTTP/1.0 404 Not Found',
    NOT_OK: 'HTTP/1.0 400 Bad Request',
    OK: 'HTTP/1.0 200 OK',
    TIMED_OUT: 'HTTP/1.0 408 Request Timeout'
};

const STRINGS = {
    AT: '@',
    BLANK: ' ',
    CLRF: '\r\n',
    EMPTY: '',
    PROXY_AUTH_BASIC: 'Basic',
    PROXY_AUTH: 'Proxy-Authorization',
    SEPARATOR: ':',
};

// openssl req -x509 -sha256 -nodes -days 3650 -newkey rsa:2048 -keyout privateKey.key -out certificate.crt
// Country Name (2 letter code) []:CA
// State or Province Name (full name) []:Ontario
// Locality Name (eg, city) []:Ottawa
// Organization Name (eg, company) []:Leask Wong
// Organizational Unit Name (eg, section) []:DEV
// Common Name (eg, fully qualified host name) []:127.0.0.1
// Email Address []:i@leaskh.com

const DEFAULT_KEYS = {
    key: ['-----BEGIN PRIVATE KEY-----',
        'MIIEuwIBADANBgkqhkiG9w0BAQEFAASCBKUwggShAgEAAoIBAQDdD3re814HL6dz',
        'sjoYRW2aP85b4cwKwdnyzVqOIYhX3TCiSvkJJJaCqhV1FUIHJ59qN4RvgcK2g1IN',
        'HRuEMRQxOIvtSR+GHZHUtmWV6nRbZr/kyxbOWYXDSc/g1XgAon7wqj2p9yq49myn',
        '6hRK/CEnAAP41kNLri8NWUDayEeRYeOlzxrx6JQ6XhZS5zclrfJTSUaw7S7ZvuZm',
        '8IZPutwlF3EshFRTniGaguWaN58ujv6pENcHxtW4rog6qyIu84FBdQkiqB3ziw6O',
        'Ghv6XYgEUPyki2QWRvscERCHTsS1vVEr43CLXxUhfeSkAlmxVDEwaNlUw+I+aExM',
        'kR2WreW9AgMBAAECggEAbCWsmPI66A0aQPHKliExM6tPi4f1yLV5qN1qFeq1xzaB',
        'GoTPPPfXYmlPQg56VQG/bblnYx36YkvwklXRJmTUWhgt7JI/h99jfssU+7jN4AFu',
        'k8H/kEgftqCfwIDuynC05YyDymkPT5nPIn7UGrMqjOfnCY/ZMGcwwbkOj3o3+Rkf',
        '6x9eZbXt6GMQYTVVxB62/y7rYlEFn1YRJoLdrMy0vVQOaR/4tBhh3MkJkn/q4lEN',
        'BUNpMLTvJDn+lXWEjV7wa15t8GXX+l0i5fOfyGx8lAMKUvoPKIXbCyXk3G1i3OPm',
        '6zvA3N6iiniKa9f2q8Ty5SFYYFcr64IAiyO5Z9/3CQKBgQD0UndJwHErNoqnuQKX',
        'wciHuXs75Ww2X0lC8zXkcNvMzMtiobrz+w4+vMts7DKHIX/7BpMXgoJV1wdu1pV5',
        'T1EAuJJid35h+2ftvqIm2y9NzCu2uqXcH15BrjfO+i3lhJsIWjUlZwg8gu0+9leE',
        'P+Wt0W2C93HlUAdV+FE1TC7sYwKBgQDnoGIrQAcSKB2mbUMGH5/k6Jzihu3tkZG5',
        'Y5F2a+QcHrC6U+4K7UoJsYoBL95PXa/cH/DRSw8yLsYzUCeHaUrJJMCoj/QXV7QB',
        'X+eRQDwALwvZASkUQ5Wb3MMjivh5zVpmuFUjMsd/IsvSRuMrIpyH25IKk/AkvJJm',
        '6vanKAovXwJ/OjdsNSal0KYuY8ix1XdXUP/hXWRNZKdPzaQmM0ixFxu1WssuwPQR',
        'cOGLl2iwoYJZ/HaUlgWDCPEz1DVNaJp9sq5IMy5F7xL4sK279YZEv0TnJaNT4h+X',
        'Vg8tPSRfy1DNoC/eegsS61hHL7mDIQAYulIsxggwG3P2S4Xf09NTWwKBgQDDmC4N',
        '872E2ZdgKLgGfcIaHUwOBn74tIpoEOqPI8C29juqvKExXPu+f8vYAMIsJyMQMXC8',
        'bDPi3pjEUBVxRbq/bGe8cANhitAYsRHtGF8SkKfikhZMZF38BkpKw1ncEUsbnuFW',
        'HdVVSN7xLKc8j7e7CfGjORX7D7pZamTq9ubS5QKBgBDJtlHsRogm9L7HL0V1ZX6I',
        'oJbOLylri4aEE/+feK1z3f0IJq7oh4aj3E+jxOYPaxwTC/MSH81gFe60Ga5jQ9Vh',
        'FCtB06RW+3/qFWaowdNQjnYgLuR85wZGu3/5TTRHpqz5ROfhfe67m/cKaOYJchAV',
        'OoUjZZpIsZeJHito68KX',
        '-----END PRIVATE KEY-----'].join('\n'),
    cert: ['-----BEGIN CERTIFICATE-----',
        'MIIDhjCCAm4CCQCCcAzt++yiATANBgkqhkiG9w0BAQsFADCBhDELMAkGA1UEBhMC',
        'Q0ExEDAOBgNVBAgMB09udGFyaW8xDzANBgNVBAcMBk90dGF3YTETMBEGA1UECgwK',
        'TGVhc2sgV29uZzEMMAoGA1UECwwDREVWMRIwEAYDVQQDDAkxMjcuMC4wLjExGzAZ',
        'BgkqhkiG9w0BCQEWDGlAbGVhc2toLmNvbTAeFw0yMjA0MDUwNDUwMDFaFw0zMjA0',
        'MDIwNDUwMDFaMIGEMQswCQYDVQQGEwJDQTEQMA4GA1UECAwHT250YXJpbzEPMA0G',
        'A1UEBwwGT3R0YXdhMRMwEQYDVQQKDApMZWFzayBXb25nMQwwCgYDVQQLDANERVYx',
        'EjAQBgNVBAMMCTEyNy4wLjAuMTEbMBkGCSqGSIb3DQEJARYMaUBsZWFza2guY29t',
        'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA3Q963vNeBy+nc7I6GEVt',
        'mj/OW+HMCsHZ8s1ajiGIV90wokr5CSSWgqoVdRVCByefajeEb4HCtoNSDR0bhDEU',
        'MTiL7Ukfhh2R1LZllep0W2a/5MsWzlmFw0nP4NV4AKJ+8Ko9qfcquPZsp+oUSvwh',
        'JwAD+NZDS64vDVlA2shHkWHjpc8a8eiUOl4WUuc3Ja3yU0lGsO0u2b7mZvCGT7rc',
        'JRdxLIRUU54hmoLlmjefLo7+qRDXB8bVuK6IOqsiLvOBQXUJIqgd84sOjhob+l2I',
        'BFD8pItkFkb7HBEQh07Etb1RK+Nwi18VIX3kpAJZsVQxMGjZVMPiPmhMTJEdlq3l',
        'vQIDAQABMA0GCSqGSIb3DQEBCwUAA4IBAQDFYCXa9oZFv0fEyQ5Zx8u2Qf28ktoq',
        'FPLRQ6tFFyvs8yOO3DJ/4bjS/lVAvrafl4IP8c62pz1+OmdhtVouPlwwSSYA+39Q',
        '9NiuEJABY/RtMmNmsZZvKdmGAvh8zfzsd06W9lD/5colM2szvKkXDb9Q6Az84ifJ',
        'SivCGStMuXcXxREgQsm1yeUEQnnigy0uzxMC2hL3hxmvwEk5T5TRuMRjCHmxQRQC',
        '7woT/bq/y2iUNMmK10obchG5G96C/2ko09rzOhxhevFJ0MqEtAX4gvPSpOll6PHv',
        'Hl8RmiBRd/1tCHJgwx+EnJUl3thc2Qk3dzQXFlKESnx3oqwZOsW5TknX',
        '-----END CERTIFICATE-----'].join('\n'),
};

export {
    DEFAULT_KEYS,
    DEFAULT_OPTIONS,
    ERROR_CODES,
    EVENTS,
    HTTP_BODIES,
    HTTP_METHODS,
    HTTP_PORT,
    HTTP_RESPONSES,
    HTTP,
    HTTPS_PORT,
    HTTPS,
    SLASH_REGEXP_ONCE,
    SLASH_REGEXP,
    SLASH,
    STRINGS,
};
