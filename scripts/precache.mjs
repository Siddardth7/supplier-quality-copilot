// issue 169: the offline precache list (decisions 247, 248). node scripts/precache.mjs  ->  rewrites the
// BEGIN/END precache block in sw.js and prints "N files". precacheList() is also used by scripts/pwa.test.mjs.
// Built from disk: the shell plus exactly the data files the app can fetch (data.js loadData, packet.js viewer,
// the + New supplier sample packet).
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACKET_FILES } from '../app/packet.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SHELL = ['./', 'index.html', 'manifest.json', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'app/', 'app/index.html', 'app/app.css', 'design/tokens.css'];
const IMPORT = /\bimport\s*(?:[^'"()]*?\bfrom\s*)?['"](\.{1,2}\/[^'"]+)['"]/g;

/** Root-relative paths of app/main.js and every module in its static relative import closure. */
function moduleClosure(root) {
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const m of readFileSync(file, 'utf8').matchAll(IMPORT)) visit(join(dirname(file), m[1]));
  };
  visit(join(root, 'app', 'main.js'));
  return [...seen].map((f) => relative(root, f).split(sep).join('/'));
}

const dirs = (path) => existsSync(path) ? readdirSync(path, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : [];

/** Sorted unique root-relative paths to precache. Only paths that exist are added. */
export function precacheList(root = ROOT) {
  const data = join(root, 'data');
  const out = [];
  const { candidates = [], active = [] } = JSON.parse(readFileSync(join(data, 'suppliers.json'), 'utf8'));
  out.push('data/suppliers.json', 'data/history.csv', 'data/eval.json');
  for (const c of candidates) out.push(`data/extracted/${c.id}.json`);
  for (const k of new Set([...candidates, ...active].map((c) => c.commodity))) out.push(`data/requirements/${k}.json`);
  const packets = [
    ...dirs(join(data, 'suppliers')).map((id) => `data/suppliers/${id}/`),
    ...dirs(join(data, 'worlds')).flatMap((n) => dirs(join(data, 'worlds', n, 'packets')).map((id) => `data/worlds/${n}/packets/${id}/`)),
  ];
  packets.push('data/samples/brand-corporation/');  // issue 172: the "Use the sample packet" button fetches it
  for (const dir of packets) for (const f of PACKET_FILES) out.push(dir + f);
  const files = [...SHELL, ...moduleClosure(root), ...out].filter((p) => p.endsWith('/') || existsSync(join(root, p)));
  return [...new Set(files)].sort();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const list = precacheList();
  const swPath = join(ROOT, 'sw.js');
  const sw = readFileSync(swPath, 'utf8');
  const block = /(\/\/ BEGIN precache[^\n]*\n)[\s\S]*?(\/\/ END precache)/;
  if (!block.test(sw)) { console.error('sw.js: BEGIN/END precache markers not found'); process.exit(1); }
  writeFileSync(swPath, sw.replace(block, (_, begin, end) => `${begin}const PRECACHE = ${JSON.stringify(list, null, 2)};\n${end}`));
  console.log(`${list.length} files`);
}
