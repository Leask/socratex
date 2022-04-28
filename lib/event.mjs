import { basename, log as _log, timeout } from './utilitas.mjs';
import { join } from 'path';
import { readdirSync } from 'fs';
// patched: import { v4 as uuidv4 } from 'uuid';

const jobs = {};
const sToMs = sec => 1000 * (isNaN(sec = Number(sec)) ? 0 : sec);
const unLock = name => jobs[name].lock = 0;
const list = () => jobs;

let timer = null;

const log = (content, job, options) => {
    options = Object.assign({ time: true }, options || {});
    if (!job || !jobs[job] || !jobs[job].silent
        || options.force || content instanceof Error) {
        _log(content, basename(
            import.meta.url
        ) + (job ? ` > ${job}` : ''), options);
    }
};

const tryLock = (name, now, tmout) => (jobs[name].lock + tmout > now)
    ? jobs[name].lock : !(jobs[name].lock = now);

const exec = async () => {
    const now = Date.now();
    for (let i in jobs) {
        if (jobs[i].lastRun + jobs[i].interval < now) {
            jobs[i].lastRun = now;
            try {
                if (tryLock(i, now, jobs[i].timeout)) {
                    log('Locked, skipped.', i); continue;
                }
                log('Emit...', i);
                await jobs[i].function();
            } catch (err) { log(err, i); }
            log('Done.', i);
            unLock(i);
        }
    }
};

const loop = async (func, interval, tout, delay, name, options) => {
    // patched: {
    timer = timer /* || log('Initialized.') */ || setInterval(exec, 1000 * 1);
    // log('Scheduled.', (name = name || uuidv4()), { force: true });
    assert(name, 'Event name is required.', 500);
    // }
    jobs[name] = {
        function: func,
        interval: sToMs(interval),
        timeout: sToMs(tout),
        delay: delay,
        lastRun: Date.now() + sToMs(delay - interval),
        lock: 0,
        silent: !!options?.silent,
        end: options?.end,
    };
    return timer;
};

const load = async (module, options) => {
    assert(module && module.func, 'Event function is required.', 500);
    return await loop(
        module.func, module.interval, module.tout, module.delay, module.name,
        options
    );
};

const bulk = async (absDir, options) => {
    options = options || {};
    log(`SERVICES: ${absDir}`);
    const [files, pmsRun] = [(readdirSync(absDir) || []).filter(
        file => /\.mjs$/i.test(file) && !file.startsWith('.')
    ), []];
    for (let file of files) {
        const mod = { ...await import(join(absDir, file)) };
        if (!mod.run) { continue; }
        mod.name = mod.name || file.replace(/^(.*)\.mjs$/i, '$1');
        pmsRun.push(load(mod, options));
    }
    return await Promise.all(pmsRun);
};

const end = async (name) => {
    if (name) { delete jobs[name]; if (jobs.length) { return; } }
    clearInterval(timer);
    timer = -1;
    const now = Date.now();
    for (let i in jobs) {
        if (jobs[i].end) { try { await jobs[i].end(); } catch (e) { }; }
        while (tryLock(i, now, jobs[i].timeout)) {
            log('Waiting...', i); await timeout(1000);
        }
        log('End.', i);
    }
    log('Terminated.');
};

export default loop;
export {
    bulk,
    end,
    list,
    load,
    loop,
};
