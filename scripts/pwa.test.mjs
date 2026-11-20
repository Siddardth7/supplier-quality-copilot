// Installable app and offline mode (issue 169, SHIP-FR-08): manifest, icons, sw.js, the precache pin and the
// service worker's behaviour in a vm sandbox. Follows the scripts/pages.test.mjs style.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { precacheList } from './precache.mjs';
import { PACKET_FILES } from '../app/packet.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const SW = read('sw.js');
const BG = read('design/tokens.css').match(/--bg:\s*(#[0-9a-f]{3,8})/i)[1];
const manifest = JSON.parse(read('manifest.json'));
const block = SW.slice(SW.indexOf('// BEGIN precache'), SW.indexOf('// END precache'));
const PRECACHE = JSON.parse(block.slice(block.indexOf('['), block.lastIndexOf(']') + 1));
const VERSION = SW.match(/const VERSION = '([^']+)'/)[1];
const dirs = (p) => readdirSync(join(ROOT, p), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
const files = (p) => readdirSync(join(ROOT, p), { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
const walk = (p) => readdirSync(join(ROOT, p), { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(`${p}/${e.name}`) : [`${p}/${e.name}`]);

test('manifest: required fields, colours equal the --bg token, synthetic and fan-made description', () => {
  for (const f of ['id', 'name', 'short_name', 'start_url', 'scope', 'description']) assert.ok(manifest[f], `manifest.${f}`);
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.theme_color.toLowerCase(), BG.toLowerCase());
  assert.equal(manifest.background_color.toLowerCase(), BG.toLowerCase());
  const base = 'http://h/supplier-quality-copilot/manifest.json';
  assert.ok(new URL(manifest.start_url, base).href.startsWith(new URL(manifest.scope, base).href), 'start_url within scope');
  assert.match(manifest.description, /Synthetic/);
  assert.match(manifest.description, /not affiliated with Marvel/);
  assert.match(manifest.name, /Stark Industries/);
});

test('manifest: every icon exists, with PNG 192x192 and 512x512 entries', () => {
  for (const i of manifest.icons) assert.ok(existsSync(join(ROOT, i.src)), i.src);
  for (const s of ['192x192', '512x512']) assert.ok(manifest.icons.some((i) => i.sizes === s && i.type === 'image/png'), s);
});

test('icons: PNG signature, IHDR size 192 and 512, under 20 KB; SVG starts <svg', () => {
  for (const n of [192, 512]) {
    const p = join(ROOT, `icons/icon-${n}.png`);
    const b = readFileSync(p);
    assert.deepEqual([...b.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `icon-${n} signature`);
    assert.equal(b.toString('latin1', 12, 16), 'IHDR');
    assert.equal(b.readUInt32BE(16), n, `icon-${n} width`);
    assert.equal(b.readUInt32BE(20), n, `icon-${n} height`);
    assert.ok(statSync(p).size < 20 * 1024, `icon-${n} under 20 KB`);
  }
  assert.match(read('icons/icon.svg'), /^<svg[\s>]/);
});

test('sw.js parses, has install/activate/fetch handlers, VERSION format, sqc- cache name', () => {
  assert.doesNotThrow(() => new vm.Script(SW));
  for (const ev of ["addEventListener('fetch'", "addEventListener('install'", "addEventListener('activate'"]) assert.ok(SW.includes(ev), ev);
  assert.match(VERSION, /^v\d+\.\d+\.\d+(-[\w.]+)?$/);
  assert.match(SW, /const CACHE = `sqc-\$\{VERSION\}`/);
});

test('precache block equals precacheList() (run node scripts/precache.mjs if stale)', () => {
  assert.deepEqual(PRECACHE, precacheList(), 'sw.js precache block is stale: run node scripts/precache.mjs');
});

// Independent oracle: recomputed here from disk, not from scripts/precache.mjs. Packet files come from the
// directory listing, not PACKET_FILES, and shell modules from a walk of app/ (every non-test module).
function fetchable() {
  const { candidates, active } = JSON.parse(read('data/suppliers.json'));
  const data = ['data/suppliers.json', 'data/history.csv', 'data/eval.json',
    ...candidates.map((c) => `data/extracted/${c.id}.json`),
    ...[...candidates, ...active].map((c) => `data/requirements/${c.commodity}.json`)];
  for (const id of dirs('data/suppliers')) data.push(...files(`data/suppliers/${id}`).map((f) => `data/suppliers/${id}/${f}`));
  for (const n of dirs('data/worlds')) {
    if (!existsSync(join(ROOT, 'data/worlds', n, 'packets'))) continue;
    for (const id of dirs(`data/worlds/${n}/packets`)) data.push(...files(`data/worlds/${n}/packets/${id}`).map((f) => `data/worlds/${n}/packets/${id}/${f}`));
  }
  // issue 172: the sample packet the + New supplier button fetches (its README is never fetched).
  data.push(...files('data/samples/brand-corporation').filter((f) => f !== 'README.md').map((f) => `data/samples/brand-corporation/${f}`));
  const modules = walk('app').filter((p) => p.endsWith('.js') && !/\.test\.js$|\.testkit\.js$/.test(p));
  const shell = ['./', 'index.html', 'manifest.json', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
    'app/', 'app/index.html', 'app/app.css', 'design/tokens.css'];
  return new Set([...shell, ...modules, ...data]);
}

test('precache list equals the independently recomputed fetchable set (no missing, no extra file)', () => {
  const want = fetchable();
  const have = new Set(PRECACHE);
  const missing = [...want].filter((p) => !have.has(p));
  const extra = [...have].filter((p) => !want.has(p));
  assert.deepEqual(missing, [], 'fetchable but not precached: run node scripts/precache.mjs');
  assert.deepEqual(extra, [], 'precached but never fetched');
  assert.ok(PRECACHE.filter((p) => p.startsWith('data/')).length >= 560, 'at least 560 data files');
});

test('every packet directory holds exactly PACKET_FILES (the oracle above lists files, the app uses the constant)', () => {
  const packetDirs = [...dirs('data/suppliers').map((id) => `data/suppliers/${id}`),
    ...dirs('data/worlds').filter((n) => existsSync(join(ROOT, 'data/worlds', n, 'packets')))
      .flatMap((n) => dirs(`data/worlds/${n}/packets`).map((id) => `data/worlds/${n}/packets/${id}`))];
  for (const d of packetDirs) assert.deepEqual(files(d).sort(), [...PACKET_FILES].sort(), d);
});

test('precache list: sorted, unique, on disk, no answer keys, facts, simulation, other samples or tests', () => {
  assert.deepEqual(PRECACHE, [...PRECACHE].sort(), 'sorted');
  assert.equal(new Set(PRECACHE).size, PRECACHE.length, 'no duplicates');
  for (const p of PRECACHE) if (p !== './' && p !== 'app/') assert.ok(existsSync(join(ROOT, p)), `${p} exists`);
  for (const p of PRECACHE) assert.doesNotMatch(p, /answer_key|facts\/|simulation\/|samples\/(?!brand-corporation\/)|\.test\.|\.testkit\./, p);
  for (const f of PACKET_FILES) assert.ok(PRECACHE.includes(`data/samples/brand-corporation/${f}`), `sample ${f}`);
  assert.ok(!PRECACHE.includes('data/samples/brand-corporation/README.md'), 'sample README is not fetched');
  assert.ok(PRECACHE.includes('app/views/today.js') && PRECACHE.includes('app/offline.js'), 'module closure');
});

test('app/index.html links the manifest and SVG icon, keeps the labels, has no theme-color or inline registration', () => {
  const html = read('app/index.html');
  assert.ok(html.includes('<link rel="manifest" href="../manifest.json">'));
  assert.ok(html.includes('<link rel="icon" href="../icons/icon.svg" type="image/svg+xml">'));
  assert.ok(html.includes('Synthetic data. Fictional suppliers.') && html.includes('Fan-made demo. Not affiliated with Marvel.'));
  assert.doesNotMatch(html, /theme-color/);
  assert.doesNotMatch(html, /serviceWorker/);
  assert.match(read('app/main.js'), /import \{ registerOffline \} from '\.\/offline\.js'/);
});

// --- Behaviour harness: sw.js in a vm sandbox with stubbed self, caches, fetch, Request, AbortSignal. ---
const HREF = 'http://h/sqc/sw.js';
const CACHE = `sqc-${VERSION}`;
const abs = (p) => new URL(p, HREF).href;
const flush = () => new Promise((r) => setImmediate(r));

function load({ net = async () => ({ ok: true, status: 200, clone() { return { copy: true }; } }), stored = {}, keys = [], timer = setTimeout } = {}) {
  const log = { addAll: [], put: [], deleted: [], match: [], fetch: [], order: [] };
  const handlers = {};
  const cache = (name) => ({
    addAll: async (reqs) => { log.addAll.push({ name, reqs }); log.order.push('addAll'); },
    put: async (url, res) => { log.put.push({ name, url: String(url), res }); },
  });
  const sandbox = {
    URL, console, setTimeout: timer, Symbol,
    Request: class { constructor(u, o = {}) { this.url = String(u); Object.assign(this, o); } },
    AbortSignal: { timeout: (ms) => ({ timeoutMs: ms }) },
    fetch: (req, opts) => { log.fetch.push({ req, opts }); return net(req, opts); },
    caches: {
      open: async (name) => cache(name),
      keys: async () => keys,
      delete: async (k) => { log.deleted.push(k); return true; },
      match: async (req, opts) => {
        const url = typeof req === 'string' ? req : req.url;
        log.match.push({ url, opts });
        const u = new URL(url);
        return stored[opts?.ignoreSearch ? u.origin + u.pathname : url];
      },
    },
    self: {
      location: { href: HREF, origin: 'http://h' },
      addEventListener: (t, fn) => { handlers[t] = fn; },
      skipWaiting: async () => { log.order.push('skipWaiting'); },
      clients: { claim: async () => { log.order.push('claim'); } },
    },
  };
  vm.runInNewContext(SW, sandbox);
  const fire = (type, extra = {}) => {
    const ev = { ...extra, waitUntil(p) { this.done = p; }, respondWith(p) { this.responded = p; } };
    handlers[type](ev);
    return ev;
  };
  const get = (path, extra = {}) => fire('fetch', { request: { method: 'GET', url: path.startsWith('http') ? path : abs(path), mode: 'cors', ...extra } });
  return { log, fire, get };
}

test('sw install: addAll of every precache entry as a reload Request into sqc-VERSION, then skipWaiting', async () => {
  const { log, fire } = load();
  await fire('install').done;
  assert.equal(log.addAll.length, 1);
  assert.equal(log.addAll[0].name, CACHE);
  assert.deepEqual(Array.from(log.addAll[0].reqs, (r) => r.url), PRECACHE.map(abs));  // host-realm array
  assert.ok(log.addAll[0].reqs.every((r) => r.cache === 'reload'), 'bypass HTTP cache at install');
  assert.deepEqual(log.order, ['addAll', 'skipWaiting']);
});

test('sw activate: deletes older sqc- caches, keeps the current and non-sqc caches, then claims', async () => {
  const { log, fire } = load({ keys: ['sqc-old', `${CACHE}-x`, CACHE, 'other', 'my-sqc-thing'] });
  await fire('activate').done;
  assert.deepEqual(log.deleted, ['sqc-old', `${CACHE}-x`]);
  assert.deepEqual(log.order, ['claim']);
});

test('sw fetch: network-first with no-cache and no abort signal; a precache path is put under its bare URL', async () => {
  const res = { ok: true, status: 200, clone() { return { copy: true }; } };
  const { log, get } = load({ net: async () => res });
  const ev = get('data/eval.json?v=2');
  assert.equal(await ev.responded, res);
  assert.equal(log.fetch[0].opts.cache, 'no-cache');
  assert.equal(log.fetch[0].opts.signal, undefined, 'a slow body must never be aborted (issue 169 review M1)');
  await flush();
  assert.deepEqual(log.put.map((p) => [p.name, p.url, p.res.copy]), [[CACHE, abs('data/eval.json'), true]]);
});

test('sw fetch: ?data= dev paths and other non-precache paths are network only, never put', async () => {
  const { log, get } = load();
  await get('dev-data/w1/suppliers.json').responded;
  await get('docs/DEMO.md').responded;
  await get('data/answer_key.json').responded;
  await flush();
  assert.equal(log.fetch.length, 3);
  assert.deepEqual(log.put, []);
});

test('sw fetch: offline serves the cached entry with ignoreSearch', async () => {
  const hit = { cached: 'eval' };
  const { log, get } = load({ net: async () => { throw new TypeError('Failed to fetch'); }, stored: { [abs('data/eval.json')]: hit } });
  assert.equal(await get('data/eval.json?x=1').responded, hit);
  assert.equal(log.match[0].opts?.ignoreSearch, true);
});

test('sw fetch: a hung network with a cached copy serves the copy after the slow timer', async () => {
  const copy = { cached: true };
  const timers = [];
  const { get } = load({ net: () => new Promise(() => {}), stored: { [abs('data/eval.json')]: copy }, timer: (fn, ms, v) => { timers.push(ms); fn(v); } });
  assert.equal(await get('data/eval.json').responded, copy);
  assert.deepEqual(timers, [3000]);
});

test('sw fetch: a slow network with nothing cached still resolves with the network response', async () => {
  const res = { ok: true, status: 200, clone() { return { copy: true }; } };
  const { get } = load({ net: () => new Promise((r) => setTimeout(r, 5, res)), timer: (fn, ms, v) => fn(v) });
  assert.equal(await get('data/eval.json').responded, res);
});

test('sw fetch: offline navigation outside app/ (docs/EVAL.md) never gets the app shell', async () => {
  const shell = { shell: true };
  const { get } = load({ net: async () => { throw new TypeError('offline'); }, stored: { [abs('app/')]: shell } });
  await assert.rejects(get('docs/EVAL.md', { mode: 'navigate' }).responded, /offline/);
});

test('sw fetch: offline navigation with no match falls back to the cached app/ shell', async () => {
  const shell = { cached: 'app' };
  const { get } = load({ net: async () => { throw new TypeError('offline'); }, stored: { [abs('app/')]: shell } });
  assert.equal(await get('app/somewhere-else', { mode: 'navigate' }).responded, shell);
});

test('sw fetch: offline non-navigation miss rejects with the network error (no shell substitution)', async () => {
  const err = new TypeError('offline');
  const { get } = load({ net: async () => { throw err; }, stored: { [abs('app/')]: { cached: 'app' } } });
  await assert.rejects(get('data/worlds/999/packets/X/rfq.md').responded, (e) => e === err);
});

test('sw fetch: a server 404 passes through, is not masked by the cache and is not put', async () => {
  const notFound = { ok: false, status: 404, clone() { return {}; } };
  const { log, get } = load({ net: async () => notFound, stored: { [abs('data/eval.json')]: { cached: 'eval' } } });
  assert.equal(await get('data/eval.json').responded, notFound);
  await flush();
  assert.deepEqual(log.put, []);
  assert.deepEqual(log.match, []);
});

test('sw fetch: non-GET and cross-origin requests are not handled', () => {
  const { log, get } = load();
  assert.equal(get('data/eval.json', { method: 'POST' }).responded, undefined);
  assert.equal(get('http://other.example/data/eval.json').responded, undefined);
  assert.equal(log.fetch.length, 0);
});
