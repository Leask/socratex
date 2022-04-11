import { readJson } from './storage.mjs';
import color from './color.mjs';
import path from 'path';

const fileURLToPath = (await import('url')).fileURLToPath
    || (url => new URL('', url).pathname);
const is = (type, any) => getType(any) === type;
const isUndefined = (any) => is('Undefined', any);
const extError = (err, status, opt = {}) => Object.assign(err, { status }, opt);
const newError = (msg, status, opt) => extError(new Error(msg), status, opt);
const throwError = (msg, status, opt) => { throw newError(msg, status, opt); };
const trim = (str, opts) => ensureString(str, { trim: true, ...opts || {} });
const resolve = async (resp) => resp instanceof Promise ? await resp : resp;
const base64Encode = (object, isBuf) => encode(object, isBuf, 'base64');
const isNull = (object) => is('Null', object);
const isSet = (o, strict) => !isUndefined(o) && (strict ? !isNull(o) : true);
const ensureArray = a => isSet(a, true) ? (Array.isArray(a) ? a : [a]) : [];
const logCache = [];
const getLogCache = () => logCache;

const __ = (url) => {
    assert(url, 'Invalid URL.', 500);
    const __filename = fileURLToPath(url);
    const __dirname = path.dirname(__filename);
    return { __filename, __dirname };
};

const { __filename } = __(import.meta.url);

const toString = (any, options) => {
    if (Object.isObject(any)) { return JSON.stringify(any); }
    else if (Date.isDate(any)) { return any.toISOString(); }
    else if (Error.isError(any)) {
        return options?.trace ? any.stack : any.message;
    }
    return String(any ?? '');
};

const ensureString = (str, options) => {
    str = toString(str, options);
    if (options?.case) {
        switch (toString(options?.case).trim().toUpperCase()) {
            case 'UP':
                str = str.toUpperCase();
                break;
            case 'LOW':
                str = str.toLowerCase();
                break;
            case 'CAP': // capitalize
                str = `${str.charAt(0).toUpperCase()}${str.slice(1)}`;
                break;
            default:
                throwError(`Invalid case option: '${options?.case}'.`, 500);
        }
    }
    options?.trim && (str = str.trim());
    options?.singleLine && (str = str.replace(/[\r\n]+/g, ' '));
    return str;
};

const isAscii = (str) => {
    if (String.isString(str)) {
        for (let i = 0; i < str.length; i++) {
            if (str.charCodeAt(i) > 127) { return false; }
        }
    }
    return true;
};

const basename = (filename) => path.basename(
    String(filename || __filename)
).replace(/\.[^\.]*$/, '').trim();

const log = (content, filename, options) => {
    options = options || [];
    const isErr = Error.isError(content);
    content = Object.isObject(content) ? JSON.stringify(content) : content;
    const strTime = options.time ? ` ${(Date.isDate(
        options.time, true
    ) ? options.time : new Date()).toISOString()}` : '';
    const args = ['['
        + color.red(basename(filename).toUpperCase()) + color.yellow(strTime)
        + ']' + (isErr ? '' : ` ${content}`)];
    if (isErr) { args.push(content); }
    args.map(item => { logCache.push(color.strip(toString(item))); });
    while (logCache.length > 1000) { logCache.shift(); }
    return console.info.apply(null, args);
};

const parseVersion = (verstr) => {
    verstr = ensureString(verstr, { case: 'UP' });
    const [rules, result, s] = [{
        version: [
            [/^[^\.\d]*([\.\d]+).*$/i, '$1']
        ],
        build: [
            [/^[^\.\d]*[\.\d]+.*\-([0-9a-z]*).*/i, '$1'],
            [/^[^\.\d]*[\.\d]+.*\(([0-9a-z]*)\).*/i, '$1'],
        ],
        channel: [
            'INTERNAL', 'DEV', 'ALPHA', 'TESTING',
            'STAGING', 'BETA', 'PRODUCTION', 'STABLE',
        ],
    }, { normalized: 0 }, 5];
    for (let i in rules) {
        let resp = '';
        for (let j in rules[i]) {
            const [reg, cth] = Array.isArray(rules[i][j])
                ? [rules[i][j][0], rules[i][j][1]]
                : [new RegExp(`^.*(${rules[i][j]}).*$`, 'i'), '$1'];
            if (reg.test(verstr)) { resp = verstr.replace(reg, cth); break; }
        }
        result[i] = resp;
    }
    if (result.version) {
        const ver = result.version.split('.');
        while (ver.length < s) { ver.push(0); }
        while (ver.length) {
            result.normalized += Math.pow(10, (s - ver.length) * 5) * ver.pop();
        }
    }
    return result;
};

const which = async (pack) => {
    const pwd = process.cwd();
    pack = pack || path.join(pwd, 'package.json');
    const data = Object.isObject(pack) ? pack : await readJson(pack);
    data.name = data.name || path.basename(pwd) || '';
    data.versionNormalized = parseVersion(data.version = data.version || '');
    data.title = `${data.name}${data.version ? (' v' + data.version) : ''}`;
    data.userAgent = `${data.name}${data.version ? `/${data.version}` : ''}`;
    return data;
};

const mask = (str, options) => {
    options = options || {};
    str = ensureString(str);
    options.kepp = (options.kepp = ~~options.kepp || 1) >= str.length
        ? str.length - 1 : options.kepp;
    return str.replace(/.{1}/g, options.replace || '*').replace(
        new RegExp(`^.{${options.kepp}}`), str.substr(0, options.kepp)
    );
};

const insensitiveCompare = (strA, strB, options) => {
    options = { case: 'UP', ...options || {} };
    let [cmpA, cmpB] = [strA, strB].map(str => {
        str = trim(str, options);
        options.w && (str = str.replace(/[^\w]*/gi, ''));
        return str;
    });
    return cmpA === cmpB;
};

const getType = (any) => {
    return typeof any === 'undefined' ? 'Undefined'
        : Object.prototype.toString.call(any).replace(
            /^\[[^\ ]*\ (.*)\]$/, '$1'
        );
};

const ignoreErrFunc = async (func, options) => {
    try { return await func(); } catch (e) { options?.log && console.error(e); }
};

const mergeAtoB = (objA, objB, o) => {
    objA = objA || {};
    objB = objB || {};
    for (let i in objA) {
        if (isUndefined(objA[i])) { if (o?.mergeUndefined) { delete objB[i]; } }
        else { objB[i] = objA[i]; }
    }
    return objB;
};

const encode = (object, isBuf, encoding) => {
    return (isBuf ? object : Buffer.from(object)).toString(encoding);
};

class Logger {
    _name = '';
    _logLevels = ['log', 'info', 'debug', 'warn', 'error'];
    _logLevel = 0;
    _options = { time: true };
    _shouldLog(lv) { return ~~this._logLevels.indexOf(lv) >= ~~this._logLevel };
    _log(args) { return log(args, this._name, this._options); };
    log(args) { return this._shouldLog('log') && this._log(args); };
    error(args) { return this._shouldLog('error') && this._log(args); };
    constructor({ name = '', logLevel = 0 }) {
        Object.assign(this, { _name: name, _logLevel: ~~logLevel });
    };
};

export {
    __,
    base64Encode,
    basename,
    encode,
    ensureArray,
    ensureString,
    extError,
    fileURLToPath,
    getLogCache,
    getType,
    ignoreErrFunc,
    insensitiveCompare,
    is,
    isAscii,
    isNull,
    isSet,
    isUndefined,
    log,
    Logger,
    mask,
    mergeAtoB,
    newError,
    parseVersion,
    resolve,
    throwError,
    toString,
    trim,
    which,
};
