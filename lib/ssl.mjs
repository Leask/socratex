import { __, basename, insensitiveCompare, log as _log } from './utilitas.mjs';
import { Client, directory, forge } from 'acme-client';
import { getConfig, readFile, setConfig } from './storage.mjs';
import { join } from 'path';
import { loop } from './event.mjs';
import cluster from 'cluster';

const [HTTP01, termsOfServiceAgreed, curCert] = ['http-01', true, {}];
const assertDomain = domain => assert(domain, 'Invalid fomain.', 400);
const assertChlnge = t => assert(t === HTTP01, 'Only HTTP-auth is supported.');
const getPathByToken = token => `/.well-known/acme-challenge/${token}`;
const log = content => _log(content, import.meta.url);
const resetCurCert = () => Object.assign(curCert, { key: null, cert: null });
const __keys = __(import.meta.url, '../keys');
const [MESSAGE, action] = ['message', 'SSL_RESET'];

const getCert = async () => {
    if (curCert.key && curCert.cert) { return curCert; }
    let { key, cert } = (await _getCert(null, true)) || {};
    if (!key || !cert) {
        const pms = [
            readFile(join(__keys, 'private.key')),
            readFile(join(__keys, 'certificate.crt')),
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
    const [key, csr] = await forge.createCsr({ commonName });
    return { key: key.toString(), csr: csr.toString() };
};

const ensureCert = async (domain, challengeCreate, challengeRemove, option) => {

    const challengeCreateFn = async (authz, challenge, keyAuthorization) => {
        assertChlnge(challenge.type);
        await challengeCreate(getPathByToken(challenge.token), keyAuthorization);
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
        cluster.isPrimary && _socrates.processes.map(x => x.send({ action }));
        csr = newCsr.csr; key = newCsr.key; log('Done.');
    }
    if (cert) {
        log('Found certificate.');
        const curCrt = await forge.readCertificateInfo(cert);
        if (curCrt.notAfter.getTime() - 1000 * 60 * 60 * 24 * 30 < Date.now()) {
            cert = null; log('Certificate will expire soon.');
        }
    }
    if (!cert) {
        log('Updating certificate...');
        const client = new Client({
            directoryUrl: directory.letsencrypt[
                option?.debug ? 'staging' : 'production'
            ], accountKey: await forge.createPrivateKey(),
        });
        cert = await client.auto({
            csr, email: `i@${domain}`, termsOfServiceAgreed,
            challengePriority: [HTTP01], challengeCreateFn, challengeRemoveFn
        });
        assert(cert, 'Failed to update certificate.', 500);
        await setConfig({ csr, key, cert: cert = cert.toString(), domain });
        resetCurCert();
        cluster.isPrimary && _socrates.processes.map(x => x.send({ action }));
        log('Done.');
    }
    return { csr, key, cert, domain };
};

const init = (domain, challengeCreate, challengeRemove, options) => loop(
    () => ensureCert( // https://letsencrypt.org/docs/rate-limits/
        domain, challengeCreate, challengeRemove, options
    ), 60 * 60 * 24 * 7, 60 * 10, 0, basename(import.meta.url), { silent: true }
);

cluster.isWorker && process.on(MESSAGE, (msg) => {
    switch (msg?.action) { case action: return resetCurCert(); }
});

export default init;
export { createCsr, ensureCert, getCert, init };
