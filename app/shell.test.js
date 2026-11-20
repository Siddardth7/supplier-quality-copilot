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
  assert.match(TOKENS, /--ok:\s*#6dffc2;/i);
  assert.match(TOKENS, /--bad:\s*#ff8fa3;/i);
  const small = [];
  for (const [name, css] of [['tokens.css', TOKENS], ['app.css', read('app/app.css')]]) {
    for (const m of css.matchAll(/font(?:-size)?\s*:\s*([^;}]*)/g)) {
      const px = m[1].match(/(\d+(?:\.\d+)?)px/);
      if (px && Number(px[1]) < 11) small.push(`${name}: ${m[0]}`);
    }
  }
  assert.deepEqual(small, []);
});

// WCAG 2.2 contrast against the composited background each token actually sits on (issue 178, DS-NFR-04, DS-NFR-01).
// Colours are [r,g,b,a] in 0..1, alpha-composited in sRGB space. A translucent colour can only be read through over():
// lum() refuses it, so a token like #08182be6 can never again be silently read as its first six digits.
const parseColor = (s) => {
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(String(s ?? '').trim());
  if (!m) throw new Error(`not a #rrggbb or #rrggbbaa colour: ${s}`);
  const h = m[1] + (m[2] ?? 'ff');
  return [0, 2, 4, 6].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
};
const opaque = (c) => { if (c[3] !== 1) throw new Error(`translucent colour used as opaque: alpha ${c[3]}`); return c; };
const over = (top, bottom) => { opaque(bottom); const a = top[3]; return [0, 1, 2].map((i) => top[i] * a + bottom[i] * (1 - a)).concat(1); };
const lum = (c) => {
  const [r, g, b] = opaque(c).slice(0, 3).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// Token blocks, found by selector (comments stripped; each body ends at its first `}`).
const CSS = TOKENS.replace(/\/\*[\s\S]*?\*\//g, '');
const bodyOf = (sel) => { const i = CSS.indexOf(sel + '{'); assert.ok(i >= 0, `${sel} block found`); return CSS.slice(i + sel.length + 1, CSS.indexOf('}', i)); };
const decls = (body) => body.split(';').map((d) => d.trim()).filter(Boolean);
const tokensOf = (body) => Object.fromEntries(decls(body).filter((d) => d.startsWith('--')).map((d) => [d.slice(2, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim()]));
const DARK = tokensOf(bodyOf(':root'));
const LIGHT_EXPLICIT = bodyOf(':root[data-theme="light"]');
const LIGHT_MEDIA = bodyOf(':root:not([data-theme="dark"])');
const THEMES = { dark: DARK, light: { ...DARK, ...tokensOf(LIGHT_EXPLICIT) } };
const TEXT = ['ink', 'ink-soft', 'ink-lede', 'muted', 'cyan', 'amber', 'ok', 'bad'];

/** Every background layer of one theme (spec D3/D4). */
const layersOf = (T) => {
  const c = (n) => { assert.ok(T[n] !== undefined, `--${n} defined`); return parseColor(T[n]); };
  const bg = opaque(c('bg'));
  const blobs = [1, 2, 3, 4].map((i) => c(`blob-${i}`));
  const strongest = [0, 1, 2, 3].sort((i, j) => ratio(over(blobs[j], bg), bg) - ratio(over(blobs[i], bg), bg)).slice(0, 2).sort();
  const pair = strongest.reduce((acc, i) => over(blobs[i], acc), bg);
  const flowAlpha = Number(T['flow-alpha']);
  assert.ok(flowAlpha > 0 && flowAlpha <= 1, `--flow-alpha ${T['flow-alpha']} is a number in (0,1]`);
  const flow = c('flow-1');
  const particle = (base) => over([...flow.slice(0, 3), flow[3] * flowAlpha], base);
  const bare = { bg, pair };
  const all = { bg, pair, 'bg+particle': particle(bg), 'pair+particle': particle(pair) };
  const stack4 = blobs.reduce((acc, b) => over(b, acc), bg);
  return { c, bg, bare, all, stack4, strongest };
};
const check = (fails, min, fg, bgc, label) => { const r = ratio(fg, bgc); if (!(r >= min)) fails.push(`${label}: ${r.toFixed(2)}:1 < ${min}`); };

test('issue 178: colour parser takes #rrggbb and #rrggbbaa, rejects anything else, and refuses translucent colours as opaque', () => {
  assert.deepEqual(parseColor('#ff000080').map((v) => Math.round(v * 255)), [255, 0, 0, 128]);
  assert.deepEqual(parseColor('#00ff00'), [0, 1, 0, 1]);
  for (const bad of ['#fff', '#0009', 'red', '', undefined, '#12345', '#1234567']) assert.throws(() => parseColor(bad), /colour/, String(bad));
  assert.throws(() => lum(parseColor('#08182be6')), /translucent/);       // the old hexOf bug: never read as #08182b
  assert.throws(() => over(parseColor('#ffffff80'), parseColor('#00000080')), /translucent/);
  assert.equal(Math.round(ratio(parseColor('#000000'), parseColor('#ffffff')) * 100) / 100, 21);  // the formula itself
  const half = over(parseColor('#ffffff80'), parseColor('#000000'));
  assert.ok(Math.abs(half[0] - 128 / 255) < 1e-12 && half[3] === 1, 'sRGB-space composite');
});

test('issue 178 DS-NFR-02: --ok and --bad per theme (dark #6dffc2 / #ff8fa3, light #08603e / #a31d39)', () => {
  assert.equal(DARK.ok, '#6dffc2');
  assert.equal(DARK.bad, '#ff8fa3');
  assert.equal(THEMES.light.ok, '#08603e');
  assert.equal(THEMES.light.bad, '#a31d39');
});

test('issue 178: dark :root is the first block, light overrides are screen-only and the two light blocks are identical', () => {
  assert.equal(TOKENS.indexOf(':root{'), TOKENS.indexOf(':root'), 'the first :root selector is the dark block');
  assert.match(bodyOf(':root'), /color-scheme:dark/);
  assert.equal(TOKENS.match(/--bg:\s*(#[0-9a-f]{3,8})/i)[1], DARK.bg, 'first --bg (manifest, icons) is the dark one');
  assert.deepEqual(decls(LIGHT_MEDIA), decls(LIGHT_EXPLICIT), 'explicit and prefers-color-scheme light blocks hold the same declarations');
  assert.match(LIGHT_EXPLICIT, /color-scheme:light/);
  // D5: both light blocks sit inside @media screen{...} (print keeps the dark tokens), the media one inside prefers-color-scheme:light.
  const screenAt = CSS.indexOf('@media screen{');
  assert.ok(screenAt >= 0, '@media screen block present');
  let depth = 0, end = -1;
  for (let i = CSS.indexOf('{', screenAt); i < CSS.length; i += 1) {
    if (CSS[i] === '{') depth += 1; else if (CSS[i] === '}' && --depth === 0) { end = i; break; }
  }
  const screen = CSS.slice(screenAt, end);
  assert.ok(screen.includes(':root[data-theme="light"]{'), 'explicit light block is screen-only');
  assert.match(screen, /@media \(prefers-color-scheme:light\)\{\s*:root:not\(\[data-theme="dark"\]\)\{/);
  assert.equal(CSS.split(':root[data-theme="light"]{').length, 2, 'exactly one explicit light block');
  const names = ['bg', 'surface-1', 'surface-dense', 'surface-3', 'panel', 'hover', 'selected', 'badge-bg', 'line-input', 'line-active',
    'ink', 'muted', 'cyan', 'on-cyan', 'amber', 'ok', 'bad', 'blob-1', 'blob-2', 'blob-3', 'blob-4', 'flow-1', 'flow-2', 'flow-alpha'];
  const light = tokensOf(LIGHT_EXPLICIT);
  assert.deepEqual(names.filter((n) => !(n in DARK)), [], 'dark defines every themed token');
  assert.deepEqual(names.filter((n) => !(n in light)), [], 'light overrides every themed token');
  assert.equal(DARK['surface-2'], undefined, '--surface-2 removed');
});

for (const theme of ['dark', 'light']) {
  const T = THEMES[theme];

  test(`issue 178 DS-NFR-04 (${theme}): bare-page text >= 4.5:1 over --bg and the strongest blob pair (no particle, D4)`, () => {
    const L = layersOf(T);
    const fails = [];
    for (const t of TEXT) for (const [b, bgc] of Object.entries(L.bare)) check(fails, 4.5, L.c(t), bgc, `--${t} on ${b}`);
    assert.deepEqual(fails, []);
  });

  test(`review 178 (${theme}): pressed controls on the bare page (--cyan on --pressed over --surface-dense) >= 4.5:1`, () => {
    const L = layersOf(T);
    const fails = [];
    for (const [b, base] of Object.entries(L.all)) check(fails, 4.5, L.c('cyan'), over(L.c('pressed'), over(L.c('surface-dense'), base)), `--cyan on --pressed + --surface-dense over ${b}`);
    assert.deepEqual(fails, []);
    for (const sel of ['.theme-toggle[aria-pressed=true]{', '.pills button[aria-checked=true]{', '.compare-parts a[aria-current=true]{'])
      assert.ok(APPCSS.includes(sel + 'background:linear-gradient(var(--pressed),var(--pressed)) var(--surface-dense)'), `${sel} has a dense layer under --pressed`);
    assert.ok(CSS.includes('.pills button[aria-pressed=true]{background:linear-gradient(var(--pressed),var(--pressed)) var(--surface-dense)'), 'tokens pills have a dense layer');
  });

  test(`review 178 (${theme}): Monitor detail head and metrics sit on a dense surface, not the bare page`, () => {
    assert.match(APPCSS, /\.monitor-detail \.detail-head,\.monitor-metrics\{background:var\(--surface-dense\)/);
  });

  test(`issue 178 DS-NFR-04 (${theme}): text >= 4.5:1 on glass and dense, under every overlay, over every base incl. particles`, () => {
    const L = layersOf(T);
    const fails = [];
    let combos = 0;
    for (const s of ['surface-1', 'surface-dense']) for (const [b, base] of Object.entries(L.all)) {
      const eff = over(L.c(s), base);
      for (const o of [null, 'hover', 'selected', 'pressed', 'badge-bg', 'surface-3']) {
        const bgc = o ? over(L.c(o), eff) : eff;
        for (const t of TEXT) { combos += 1; check(fails, 4.5, L.c(t), bgc, `--${t} on --${s}${o ? ' + --' + o : ''} over ${b}`); }
      }
    }
    assert.equal(combos, 2 * 4 * 6 * TEXT.length);
    assert.deepEqual(fails, []);
  });

  test(`issue 178 DS-NFR-04 (${theme}): text >= 4.5:1 on opaque --panel and --bg-plot; --on-cyan on --cyan and --cyan-hover`, () => {
    const L = layersOf(T);
    const fails = [];
    for (const s of ['panel', 'bg-plot']) for (const t of TEXT) check(fails, 4.5, L.c(t), opaque(L.c(s)), `--${t} on --${s}`);
    for (const s of ['cyan', 'cyan-hover']) check(fails, 4.5, L.c('on-cyan'), opaque(L.c(s)), `--on-cyan on --${s}`);
    assert.deepEqual(fails, []);
  });

  test(`issue 178 DS-NFR-01 (${theme}): borders and focus ring >= 3:1 against glass and dense on every base, inputs on their --bg fill`, () => {
    const L = layersOf(T);
    const fails = [];
    for (const s of ['surface-1', 'surface-dense']) for (const [b, base] of Object.entries(L.all)) {
      const eff = over(L.c(s), base);
      for (const ui of ['line-active', 'line-input', 'cyan']) check(fails, 3, over(L.c(ui), eff), eff, `--${ui} on --${s} over ${b}`);
    }
    for (const ui of ['line-active', 'line-input']) check(fails, 3, over(L.c(ui), L.bg), L.bg, `--${ui} on input fill --bg`);
    assert.deepEqual(fails, []);
  });

  test(`issue 178 DS-NFR-01 (${theme}): view title (large text) --ink and --cyan >= 3:1 on the four-blob stack`, () => {
    const L = layersOf(T);
    const fails = [];
    for (const t of ['ink', 'cyan']) check(fails, 3, L.c(t), L.stack4, `--${t} on 4-blob stack`);
    assert.deepEqual(fails, []);
  });

  test(`issue 46 DS-NFR-01 (${theme}): the JSON textarea border is >= 3:1 on its own fill and on glass over every base`, () => {
    const rule = read('app/app.css').match(/^\.sheet-json\{([^}]*)\}/m);
    assert.ok(rule, '.sheet-json rule found');
    const fill = rule[1].match(/(?:^|;)background:var\(--([\w-]+)\)/)[1];
    const border = rule[1].match(/(?:^|;)border:1px solid var\(--([\w-]+)\)/)[1];
    const L = layersOf(T);
    const backs = { [`--${fill}`]: over(L.c(fill), L.bg), ...Object.fromEntries(Object.entries(L.all).map(([b, base]) => [`--surface-1 over ${b}`, over(L.c('surface-1'), base)])) };
    const fails = [];
    for (const [name, bgc] of Object.entries(backs)) check(fails, 3, over(L.c(border), bgc), bgc, `--${border} on ${name}`);
    assert.deepEqual(fails, []);
  });
}

// Coolant Loop structure (issue 178, DS-FR-08, DS-FR-09, DS-NFR-03).
const APPCSS = read('app/app.css');
const ruleOf = (css, sel) => css.match(new RegExp(`(?:^|[}\\s])${sel.replace(/[.*+?^${}()|[\]\\:]/g, '\\$&')}\\{([^}]*)\\}`, 'm'))?.[1];

test('issue 178 DS-FR-09: canvas and blob layer are fixed, behind the page and never take pointer input', () => {
  const canvas = ruleOf(APPCSS, '.coolant');
  assert.ok(canvas, '.coolant rule');
  for (const d of ['position:fixed', 'pointer-events:none', 'z-index:-1', 'opacity:var(--flow-alpha)']) assert.ok(canvas.includes(d), `.coolant ${d}`);
  const blobs = ruleOf(APPCSS, 'body::before');
  assert.ok(blobs, 'body::before rule');
  for (const d of ['position:fixed', 'pointer-events:none', 'z-index:-2']) assert.ok(blobs.includes(d), `body::before ${d}`);
  for (const i of [1, 2, 3, 4]) assert.ok(blobs.includes(`var(--blob-${i})`), `blob ${i} from its token`);
});

test('issue 178 DS-NFR-03: reduced motion kills every animation and hides the canvas', () => {
  const rm = TOKENS.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\{(.*)\}\s*$/m)?.[1];
  assert.ok(rm, 'reduced-motion block');
  assert.match(rm, /\*,\*::before,\*::after\{[^}]*transition:none!important;animation:none!important/);
  assert.match(rm, /\.coolant\{display:none\}/);
});

test('issue 178: print drops the blobs and canvas without a new display:none, and headings print solid', () => {
  const print = APPCSS.slice(APPCSS.indexOf('@media print{')).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(print, /body::before\{content:none!important\}/);
  assert.match(print, /\.coolant\{opacity:0!important\}/);
  assert.match(print, /\.view h2\{-webkit-text-fill-color:currentColor!important\}/);
  assert.doesNotMatch(print, /(?:body::before|\.coolant)[^{]*\{[^}]*(?:display:none|visibility:hidden)/);
});

test('issue 178 DS-FR-08/09: index.html wires the pre-paint script, the canvas and the toggle', async () => {
  const { THEME_KEY } = await import('./theme.js');
  const inline = HTML.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(inline, 'inline pre-paint script');
  assert.ok(inline[1].includes(`'${THEME_KEY}'`), 'inline script reads THEME_KEY');
  assert.ok(inline.index < HTML.indexOf('<link rel="stylesheet"'), 'inline script runs before the stylesheets');
  const canvasAt = HTML.indexOf('<canvas id="coolant" class="coolant" aria-hidden="true"></canvas>');
  assert.ok(canvasAt > HTML.indexOf('class="skip-link"') && canvasAt < HTML.indexOf('<header'), 'canvas after the skip link, before the header');
  const btn = HTML.match(/<button([^>]*id="theme-toggle"[^>]*)>([\s\S]*?)<\/button>/);
  assert.ok(btn, '#theme-toggle button');
  assert.match(btn[1], /type="button"/);
  assert.match(btn[1], /aria-pressed="false"/);
  assert.doesNotMatch(btn[1], /role=/);
  assert.equal(btn[2].replace(/<span[^>]*aria-hidden="true"[^>]*>[^<]*<\/span>/g, '').replace(/<[^>]+>/g, '').trim(), 'Light mode');
  const tools = HTML.slice(HTML.indexOf('<div class="header-tools">'), HTML.indexOf('<p id="dev-note"'));
  assert.ok(tools.indexOf('id="theme-toggle"') > tools.indexOf('class="role"'), 'toggle in .header-tools after .role (D1)');
});

test('issue 178 OVR-NFR-03: hex scan and precache cover the new modules', () => {
  for (const f of ['app/coolant.js', 'app/theme.js', 'app/index.html', 'app/app.css']) assert.ok(SOURCES.includes(f), `${f} scanned by DS-AC-03`);
  const sw = read('sw.js');
  for (const f of ['app/coolant.js', 'app/theme.js']) assert.ok(sw.includes(`"${f}"`), `${f} precached`);
  assert.match(read('app/main.js'), /initTheme\(\); startCoolant\(\); boot\(\);/, 'theme before canvas before boot');
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
