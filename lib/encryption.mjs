import { createHash, randomBytes as random } from 'crypto';

const defaultAlgorithm = 'sha256';
const fakeUuid = any => expandUuid(hash(any ?? randomString(), 'md5'));

const expandUuid = str => str.replace(
    /^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5'
);

// algorithm = 'sha1', 'md5', 'sha256', 'sha512'...
const hash = (string, algorithm = defaultAlgorithm) =>
    createHash(algorithm).update(string).digest('hex');

const randomString = (length = 128, encoding = 'HEX') => {
    let byteLength = Math.ceil(~~length / 2);
    byteLength = byteLength > 0 ? byteLength : 1;
    return random(byteLength).toString(encoding).substring(0, length);
};

export {
    defaultAlgorithm,
    fakeUuid,
    hash as sha256,
    hash,
    random,
    randomString,
};
