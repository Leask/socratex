import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { __, which, mergeAtoB } from './utilitas.mjs';

const [encoding] = ['utf8'];
const relative = (url, sub) => path.join(__(url).__dirname, sub);

const handleError = (err, opts) => {
    if (opts?.throw) { throw err; } else if (opts?.log) { console.log(err); }
};

const stringify = (data, opts) => JSON.stringify(
    data || {}, opts?.replacer || null, opts?.space || 4
);

const readFile = async (filename, options) => await fs.readFile(
    filename, options?.encoding || encoding
);

const readJson = async (filename, options) => {
    let data = {};
    try { data = JSON.parse(await readFile(filename, options)); }
    catch (e) { handleError(e, options); }
    return data;
};

const writeJson = async (name, data, options) => await writeFile(
    name, stringify(data, options), options
);

const writeFile = async (name, data, opts) => await fs.writeFile(
    name, data, opts?.encoding || encoding
);

const getConfigFilename = async (options) => {
    options = options || {};
    const file = options.config || path.join(os.homedir(
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

export {
    getConfig,
    getConfigFilename,
    readFile,
    readJson,
    setConfig,
    relative,
    stringify,
    writeFile,
};
