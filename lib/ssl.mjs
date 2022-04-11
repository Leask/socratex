import { getConfig, setConfig, readFile, relative } from './storage.mjs';
import acme from 'acme-client';
import path from 'path';

import {
    __, insensitiveCompare, log as modLog, ignoreErrFunc,
} from './utilitas.mjs';

const { __filename } = __(import.meta.url);
const [HTTP01, termsOfServiceAgreed, curCert] = ['http-01', true, {}];
const assertDomain = domain => assert(domain, 'Invalid fomain.', 400);
const assertChlnge = t => assert(t === HTTP01, 'Only HTTP-auth is supported.');
const getPathByToken = token => `/.well-known/acme-challenge/${token}`;
const log = content => modLog(content, __filename);
const resetCurCert = () => Object.assign(curCert, { key: null, cert: null });
const __keys = relative(import.meta.url, '../keys');

const getCert = async () => {
    if (curCert.key && curCert.cert) { return curCert; }
    let { key, cert } = (await _getCert(null, true)) || {};
    if (!key || !cert) {
        const pms = [
            readFile(path.join(__keys, 'private.key')),
            readFile(path.join(__keys, 'certificate.crt')),
        ];
        [key, cert] = await Promise.all(pms);
    }
    if (key && cert) { return Object.assign(curCert, { key, cert }); }
    return { key, cert };
};

const _getCert = async (name, force) => {
    force || assertDomain(name);
    const { csr, key, cert, domain } = (await getConfig())?.config || {};
    return (force ? true : insensitiveCompare(domain, name))
        ? { csr, key, cert, domain } : null;
};

const createCsr = async (commonName) => {
    assertDomain(commonName);
    const [key, csr] = await acme.forge.createCsr({ commonName });
    return { key: key.toString(), csr: csr.toString() };
};

const requestCert = async (domain, challengeCreate, challengeRemove, option) => {

    const challengeCreateFn = async (authz, challenge, keyAuthorization) => {
        assertChlnge(challenge.type);
        await challengeCreate(getPathByToken(
            challenge.token), keyAuthorization
        );
    };

    const challengeRemoveFn = async (authz, challenge, keyAuthorization) => {
        assertChlnge(challenge.type);
        await challengeRemove(getPathByToken(challenge.token));
    };

    let { csr, key, cert } = (await _getCert(domain)) || {};
    if (csr && key) { log('Found private-key and CSR.'); } else {
        log('Creating new private-key and CSR...');
        const newCsr = await createCsr(domain);
        await setConfig({ csr, key, cert: cert = null, domain });
        resetCurCert();
        csr = newCsr.csr;
        key = newCsr.key;
        log('Done.');
    }
    if (cert) {
        log('Found certificate.');
        const curCrt = await acme.forge.readCertificateInfo(cert);
        if (curCrt.notAfter.getTime() - 1000 * 60 * 60 * 24 * 30 < Date.now()) {
            log('Certificate will expire soon.');
            cert = null;
        }
    }
    if (!cert) {
        log('Updating certificate...');
        const client = new acme.Client({
            directoryUrl: acme.directory.letsencrypt[
                option?.debug ? 'staging' : 'production'
            ], accountKey: await acme.forge.createPrivateKey(),
        });
        cert = await client.auto({
            csr, email: `i@${domain}`, termsOfServiceAgreed,
            challengePriority: [HTTP01], challengeCreateFn, challengeRemoveFn
        });
        assert(cert, 'Failed to update certificate.', 500);
        await setConfig({ csr, key, cert: cert = cert.toString(), domain });
        resetCurCert();
        log('Done.');
    }
    return { csr, key, cert, domain };
};

const ensureCert = async (domain, challengeCreate, challengeRemove, option) => {
    const _requestCert = async () => await ssl.ensureCert(
        domain, challengeCreate, challengeRemove, option
    );
    await _requestCert();
    setInterval(async () => {
        await ignoreErrFunc(_requestCert, { log: true });
    }, 1000 * 60 * 60 * 24 * 7); // https://letsencrypt.org/docs/rate-limits/
};

export default ensureCert;
export { createCsr, ensureCert, getCert, requestCert };
