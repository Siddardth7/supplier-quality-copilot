// Static checks on the shell source (#37; DS-FR-01, DS-FR-06, DS-AC-03, DS-NFR-02, UIQ-FR-13, OVR-NFR-03).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { chipView, resolvePolicy } from './policy.js';
import { announcementKey, roleSwitch } from './shell.js';
import { VIEWS } from './views/index.js';
import { STARK_REFERENCE } from './engine.js';

const APP = fileURLToPath(new URL('./', import.meta.url));
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const HTML = read('app/index.html');
const TOKENS = read('design/tokens.css');
const PRD05 = read('docs/product/PRD-05-ui-qualify.md');

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
const isTest = (p) => /\.test\.(m?js)$|\.testkit\.js$/.test(p);
// Every non-test source file the browser can load from app/.
const SOURCES = walk(APP).filter((p) => /\.(js|html|css)$/.test(p) && !isTest(p)).map((p) => relative(ROOT, p));

// The two UIQ-FR-13 strings, read from the requirement so doc and app can't drift.
const fr13 = PRD05.split('\n').find((l) => l.startsWith('| UIQ-FR-13 |'));
const [BADGE, FOOTER] = [...fr13.matchAll(/"([^"]+)"/g)].map((m) => m[1]);

test('DS-FR-06: six role=tab buttons in order, Today selected with tabindex 0, the rest -1', () => {
  assert.match(HTML, /role="tablist"/);
  const tabs = [...HTML.matchAll(/<button([^>]*role="tab"[^>]*)>([\s\S]*?)<\/button>/g)].map(([, attrs, inner]) => ({
    view: attrs.match(/data-view="([^"]+)"/)[1],
    selected: attrs.match(/aria-selected="([^"]+)"/)[1],
    tabindex: attrs.match(/tabindex="([^"]+)"/)[1],
    controls: attrs.match(/aria-controls="([^"]+)"/)[1],
    id: attrs.match(/id="([^"]+)"/)[1],
    label: inner.replace(/<span class="num" aria-hidden="true">\d\d<\/span>/, '').trim(),
  }));
  assert.equal([...HTML.matchAll(/role="tab"/g)].length, 6);
  assert.deepEqual(tabs.map((t) => t.label), ['Today', 'Qualify', 'Compare', 'Monitor', 'Standards', 'Eval']);
  assert.deepEqual(tabs.map((t) => t.view), VIEWS.map((v) => v.meta.name));
  assert.deepEqual(tabs.map((t) => t.label), VIEWS.map((v) => v.meta.title));
  assert.deepEqual(tabs.map((t) => t.selected), ['true', 'false', 'false', 'false', 'false', 'false']);
  assert.deepEqual(tabs.map((t) => t.tabindex), ['0', '-1', '-1', '-1', '-1', '-1']);
  for (const t of tabs) {
    assert.equal(t.id, `tab-${t.view}`);
    assert.equal(t.controls, `view-${t.view}`);
    assert.match(HTML, new RegExp(`<section id="view-${t.view}"[^>]*role="tabpanel"[^>]*aria-labelledby="tab-${t.view}"`));
  }
});

test('DS-FR-06: brand is text, skip link targets main, and Senior is the default role', () => {
  assert.match(HTML, /<a class="skip-link" href="#main">/);
  assert.match(HTML, /<main id="main"[^>]*tabindex="-1"/);
  assert.ok(HTML.indexOf('skip-link') < HTML.indexOf('<header'), 'skip link comes first');
  assert.match(HTML, /Stark Industries <small>Supplier Quality Copilot<\/small>/);
  assert.doesNotMatch(HTML, /<img|<svg/i, 'no artwork or logos');
  assert.match(HTML, /id="policy-chip" class="policy-chip cyan" href="#view=standards"/);
  assert.match(HTML, /role="radiogroup" aria-label="Viewing as"/);
  assert.match(roleSwitch('senior'), /data-role="senior" aria-checked="true" tabindex="0">Senior/);
  assert.match(roleSwitch('senior'), /data-role="junior" aria-checked="false" tabindex="-1">Junior/);
});

test('DS-FR-06: the chip label comes from STARK_REFERENCE.name, not a literal in the HTML', () => {
  assert.equal(chipView(resolvePolicy()).label, `Policy: ${STARK_REFERENCE.name}`);
  assert.doesNotMatch(HTML, /Stark Reference/);
});

test('UIQ-FR-13: exact synthetic badge and footer text', () => {
  assert.equal(BADGE, 'Synthetic data. Fictional suppliers.');
  assert.equal(FOOTER, 'Fan-made demo. Not affiliated with Marvel.');
  assert.match(HTML, new RegExp(`<span class="badge"><span class="live-dot"></span>${BADGE.replaceAll('.', '\\.')}</span>`));
  const footer = HTML.match(/<footer[^>]*>([\s\S]*?)<\/footer>/)[1];
  assert.equal(footer.replace(/<[^>]+>/g, '').trim(), FOOTER);
});

test('DS-AC-03: no hex colour literal in app/ outside tests', () => {
  const hits = [];
  for (const p of SOURCES) {
    const text = read(p).replace(/href="#[^"]*"/g, '').replace(/#view=/g, '');
    for (const m of text.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) hits.push(`${p}: ${m[0]}`);
  }
  assert.deepEqual(hits, []);
});

test('DS-FR-01: index.html loads design/tokens.css, then app.css', () => {
  const links = [...HTML.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]);
  assert.deepEqual(links, ['../design/tokens.css', 'app.css']);
});

test('OVR-NFR-03: no external URL and only relative imports in app/', () => {
  assert.ok(SOURCES.includes('app/main.js') && SOURCES.includes('app/views/today.js'));
  const bad = [];
  for (const p of SOURCES) {
    const text = read(p);
    if (/https?:\/\/|\/\/cdn|@import\s+url\(\s*['"]?[a-z]+:/i.test(text)) bad.push(`${p}: external URL`);
    const specs = [
      ...text.matchAll(/^\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]/gm),
      ...text.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm),
      ...text.matchAll(/\bimport\(\s*['"]([^'"]+)['"]/g),
      ...text.matchAll(/<(?:script|link)[^>]*(?:src|href)="([^"]+)"/g),
    ].map((m) => m[1]);
    for (const s of specs) if (!/^\.\.?\//.test(s) && !/^[\w-]+\.(js|css)$/.test(s) && s !== 'data:,') bad.push(`${p}: ${s}`);
  }
  assert.deepEqual(bad, []);
});

test('DS-NFR-02: tokens define --ok and --bad, and no font size under 11px in tokens or app.css', () => {
  assert.match(TOKENS, /--ok:\s*#7fd7a8;/i);
  assert.match(TOKENS, /--bad:\s*#ff9b9b;/i);
  const small = [];
  for (const [name, css] of [['tokens.css', TOKENS], ['app.css', read('app/app.css')]]) {
    for (const m of css.matchAll(/font(?:-size)?\s*:\s*([^;}]*)/g)) {
      const px = m[1].match(/(\d+(?:\.\d+)?)px/);
      if (px && Number(px[1]) < 11) small.push(`${name}: ${m[0]}`);
    }
  }
  assert.deepEqual(small, []);
});

// WCAG 2.2 relative luminance and contrast ratio, from the token hex values.
const hexOf = (name) => TOKENS.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1];
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('issue 46 DS-NFR-01: the JSON textarea border is >= 3:1 on its own fill and on the panel behind it', () => {
  assert.equal(Math.round(ratio('#000000', '#ffffff') * 100) / 100, 21);  // the formula itself
  const rule = read('app/app.css').match(/^\.sheet-json\{([^}]*)\}/m);
  assert.ok(rule, '.sheet-json rule found');
  const fill = rule[1].match(/(?:^|;)background:var\(--([\w-]+)\)/)[1];
  const border = rule[1].match(/(?:^|;)border:1px solid var\(--([\w-]+)\)/)[1];
  for (const bg of [fill, 'surface-1']) {
    const r = ratio(hexOf(border), hexOf(bg));
    assert.ok(r >= 3, `--${border} on --${bg} is ${r.toFixed(2)}:1, under the 3:1 non-text minimum`);
  }
});

test('no real company names: legal-entity suffixes absent; .scrub-terms applied when present', () => {
  const files = [...SOURCES, 'scripts/dev-world.mjs', 'scripts/serve.mjs'];
  // ponytail: generic deny-list only; the real terms live in the untracked .scrub-terms.
  const deny = [/\bInc\./, /\bLLC\b/, /\bLtd\b/, /\bGmbH\b/, /\bCorp\./];
  const scrub = join(ROOT, '.scrub-terms');
  if (existsSync(scrub)) {
    for (const t of readFileSync(scrub, 'utf8').split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#'))) {
      deny.push(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    }
  }
  const hits = files.flatMap((p) => deny.filter((re) => re.test(read(p))).map((re) => `${p}: ${re}`));
  assert.deepEqual(hits, []);
});

const base = { notFound: { key: 'supplier', value: 'SUP-99' }, params: { supplier: 'SUP-07', part: 'SI-CP-0007' } };
test('issue 140: announcement key preserves exact serialization and quiet role/policy/sub-tabs', () => {
  assert.equal(announcementKey('qualify', base), 'qualify|supplier=SUP-99|SUP-07|SI-CP-0007');
  assert.equal(announcementKey('today'), 'today|||');
  assert.equal(announcementKey('qualify', {
    ...base, role: 'junior', params: { ...base.params, role: 'junior', policy: 'edited', tab: 'drafts' }
  }), announcementKey('qualify', base));
});
const variants = {
  view: ['compare', base],
  'not-found key': ['qualify', { ...base, notFound: { ...base.notFound, key: 'active' } }],
  'not-found value': ['qualify', { ...base, notFound: { ...base.notFound, value: 'SUP-98' } }],
  supplier: ['qualify', { ...base, params: { ...base.params, supplier: 'SUP-08' } }],
  part: ['qualify', { ...base, params: { ...base.params, part: 'SI-PC-0004' } }],
};
for (const [name, args] of Object.entries(variants))
  test('issue 140: announcement key distinguishes ' + name, () => {
    assert.notEqual(announcementKey(...args), announcementKey('qualify', base));
  });
