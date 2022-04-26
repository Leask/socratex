import { constants as consts, promises as fs } from 'fs';
import { join } from 'path';
import { mergeAtoB, throwError, which } from './utilitas.mjs';
import os from 'os';

const [encoding] = ['utf8'];
const readFile = (name, opts) => fs.readFile(name, opts?.encoding || encoding);
const writeFile = (f, data, o) => fs.writeFile(f, data, o?.encoding || encoding);
const writeJson = (f, data, opts) => writeFile(f, stringify(data, opts), opts);

const handleError = (err, opts) => {
    if (opts?.throw) { throw err; } else if (opts?.log) { console.log(err); }
};

const stringify = (data, opts) =>
    JSON.stringify(data || {}, opts?.replacer || null, opts?.space || 4);

const readJson = async (filename, options) => {
    let data = {};
    try { data = JSON.parse(await readFile(filename, options)); }
    catch (e) { handleError(e, options); }
    return data;
};

const getConfigFilename = async (options) => {
    options = options || {};
    const file = options.config || join(os.homedir(
    ), `.${(await which(options.pack)).name}.json`);
    assert(file, 'Error getting config filename.', 500);
    return file;
};

const getConfig = async (options) => {
    const filename = await getConfigFilename(options);
    const config = await readJson(filename);
    return { filename, config };
};

const setConfig = async (data, options) => {
    data = data || {};
    assert(Object.keys(data).length, 'Empty config.', 400);
    let [filename, config] = [null, {}];
    if (options?.overwrite) {
        filename = await getConfigFilename(options);
    } else {
        const { filename: curFile, config: curConf } = await getConfig(options);
        filename = curFile;
        config = curConf;
    }
    await writeJson(filename, mergeAtoB(
        data, config, { mergeUndefined: true }
    ), options);
    return { filename, config };
};

const assertPath = async (path, type, mode, msg, code, options) => {
    var [code, b, E, s, err] = [code || 500, 'Path is not', m => err = msg || m];
    try { s = await fs.stat(path); }
    catch (e) { throwError(msg || e.message, code, options); }
    switch (String(type || '').toUpperCase()) {
        case '*': case '': break;
        case 'F': s.isFile() || E(`${b} a file: '${path}'.`); break;
        case 'D': s.isDirectory() || E(`${b} a directory: '${path}'.`); break;
        default: E(`Unsupported path type: '${type}'.`);
    }
    assert(!err, err, code, options);
    try {
        switch (String(mode || '').toUpperCase()) {
            case '*': case '': break;
            case 'R': await fs.access(path, consts.R_OK); break;
            case 'W': await fs.access(path, consts.R_OK | consts.W_OK); break;
            default: E(`Unsupported access mode: '${mode}'.`);
        };
    } catch (e) { E(e.message); }
    assert(!err, err, code, options);
    return s;
};

export {
    assertPath,
    getConfig,
    getConfigFilename,
    readFile,
    readJson,
    setConfig,
    stringify,
    writeFile,
};
