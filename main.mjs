import { Socrates, utilitas } from './index.mjs';

const meta = await utilitas.which();
const opts = { time: true };

globalThis.socrates = new Socrates({
    // auth: (username, password) => {
    //     utilitas.modLog(`Authenticate: ${username}:${password}.`, meta?.name, opts);
    //     return username === 'leask' && password === 'nopassword';
    // },
    // intercept: true,
});

socrates.listen(443, '', async () => {
    const { address, family, port } = socrates.address();
    utilitas.modLog(`Server started at ${address}${port} (${family}).`, meta?.title);
});

// (await import('repl')).start('> ');
