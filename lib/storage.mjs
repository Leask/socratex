import { promises as fs } from 'fs';

const [encoding] = ['utf8'];

const handleError = (err, opts) => {
    if (opts?.throw) { throw err; } else if (opts?.log) { console.log(err); }
};

const readFile = async (filename, options) => {
    return await fs.readFile(filename, options?.encoding || encoding);
};

const readJson = async (filename, options) => {
    let data = {};
    try { data = JSON.parse(await readFile(filename, options)); }
    catch (e) { handleError(e, options); }
    return data;
};

const writeFile = async (name, data, opts) => {
    return await fs.writeFile(name, data, opts?.encoding || encoding);
};

export {
    readFile,
    readJson,
    writeFile,
};
