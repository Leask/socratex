import { callosum, color, manifest, utilitas } from 'utilitas';

const [MAX_LOG_CACHE, LOG_KEY] = [50, 'LOG'];
const get = async () => (await callosum.get(LOG_KEY)) || [];

const push = (content, filename, options) => {
    options = options || [];
    const isErr = Error.isError(content);
    content = Object.isObject(content) ? JSON.stringify(content) : content;
    const strTime = options.time ? ` ${(Date.isDate(
        options.time, true
    ) ? options.time : new Date()).toISOString()}` : '';
    const args = ['[' + color.red(
        utilitas.basename(filename).toUpperCase()
    ) + color.yellow(strTime) + ']' + (isErr ? '' : ` ${content}`)];
    if (isErr) { args.push(content); }
    callosum.push(LOG_KEY, args.map(
        item => color.strip(utilitas.toString(item))
    ), { bulk: true, shift: MAX_LOG_CACHE });
    return console.info.apply(null, args);
};

class Log {
    _name = '';
    _logLevels = ['log', 'info', 'debug', 'warn', 'error'];
    _logLevel = 0;
    _options = { time: true };
    _shouldLog(lv) { return ~~this._logLevels.indexOf(lv) >= ~~this._logLevel };
    _log(args) { return push(args, this._name, this._options); };
    log(args) { return this._shouldLog('log') && this._log(args); };
    error(args) { return this._shouldLog('error') && this._log(args); };
    constructor({ name = '', logLevel = 0 }) {
        Object.assign(this, { _name: name, _logLevel: ~~logLevel });
    };
};

const render = async (log) => {
    const [pack, asArray, rM] = [await utilitas.which(), { asArray: true }, {}];
    ['description', 'homepage', 'author', 'license'].map(k => rM[k] = pack[k]);
    const [content, rndOpt] = [
        utilitas.renderObject({ ...rM, utilitas: manifest.version }, asArray),
        { title: `${pack.title} Console `, ...asArray },
    ];
    return [
        '<!DOCTYPE html>',
        '<html lang="en">',
        '<head>',
        '    <meta charset="utf-8">',
        '    <title>Socratex Console</title>',
        '    <script>setInterval(() => location.reload(), 1000 * 1);</script>',
        '</head>',
        '<body bgcolor="black" style="color:white">',
        '    <pre>',
        ...utilitas.renderBox(content, rndOpt).map(utilitas.escapeHtml),
        '',
        `latest ${MAX_LOG_CACHE} logs:`,
        ...utilitas.renderCode([...log || await get()], asArray),
        '    </pre>',
        '</body>',
        '</html>',
    ].join('\n');
};

export default Log;
export {
    MAX_LOG_CACHE,
    get,
    Log,
    push,
    render,
};
