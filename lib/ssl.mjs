import { callosum, event, storage, utilitas } from 'utilitas';
import { Client, directory, forge } from 'acme-client';
import { join } from 'path';

const [HTTP01, termsOfServiceAgreed, curCert] = ['http-01', true, {}];
const assertDomain = domain => assert(domain, 'Invalid fomain.', 400);
const assertChlnge = t => assert(t === HTTP01, 'Only HTTP-auth is supported.');
const getPathByToken = token => `/.well-known/acme-challenge/${token}`;
const log = content => utilitas.log(content, import.meta.url);
const resetCurCert = () => Object.assign(curCert, { key: null, cert: null });
const __keys = utilitas.__(import.meta.url, '../keys');
const SSL_RESET = 'SSL_RESET';

const getCert = async () => {
    if (curCert.key && curCert.cert) { return curCert; }
    let { key, cert } = (await _getCert(null, true)) || {};
    if (!key || !cert) {
        [key, cert] = await Promise.all([
            storage.readFile(join(__keys, 'private.key')),
            storage.readFile(join(__keys, 'certificate.crt')),
        ]);
    }
    if (key && cert) { return Object.assign(curCert, { key, cert }); }
    return { key, cert };
};

const _getCert = async (name, force) => {
    force || assertDomain(name);
    const { csr, key, cert, domain } = (await storage.getConfig())?.config || {};
    return (force ? true : utilitas.insensitiveCompare(domain, name))
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
        await storage.setConfig({ csr, key, cert: cert = null, domain });
        resetCurCert(); callosum.boardcast(SSL_RESET);
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
        await storage.setConfig({ csr, key, cert: cert = cert.toString(), domain });
        resetCurCert(); callosum.boardcast(SSL_RESET);
        log('Done.');
    }
    return { csr, key, cert, domain };
};

const init = (domain, challengeCreate, challengeRemove, options) => event.loop(
    () => ensureCert( // https://letsencrypt.org/docs/rate-limits/
        domain, challengeCreate, challengeRemove, options
    ), 60 * 60 * 24 * 7, 60 * 10, 0, utilitas.basename(import.meta.url),
    { silent: true }
);

// @todo: debug!? can this trigger?
callosum.on(SSL_RESET, resetCurCert);

export default init;
export { createCsr, ensureCert, getCert, init };
