// Citation viewer helpers (#42; PRD-05 UIQ-FR-09, -11, -12, UIQ-NFR-01; decisions 41-49).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packetDir, packetPath, findSection, renderPacket, sheetBody, PACKET_FILES, fileListBody, roundDecimals, ROUND_NOTE } from './packet.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SAMPLE = join(ROOT, 'data', 'samples', 'world-101', 'SUP-01', 'packets', 'SUP-01');
const FILES = readdirSync(SAMPLE).filter((f) => f.endsWith('.md')).sort();
const sample = (f) => readFileSync(join(SAMPLE, f), 'utf8');
const html = (md, sec) => renderPacket(md, sec).html;
const ALLOWED = new Set(['h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'blockquote', 'hr', 'strong', 'em', 'code', 'div', 'span']);
// Every tag is allowed and carries no attribute except the viewer's own class / data-cited.
const tagProblems = (out) => [...out.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g)]
  .filter(([, name, attrs]) => !ALLOWED.has(name) || attrs.replace(/\s+class="[a-z- ]+"|\s+data-cited/g, '') !== '')
  .map((m) => m[0]);

// The dev world's 32 SUP-01 citations (seed 101 reference extraction, decision 47).
const DEV_CITATIONS = ['certificates.md §1.1', 'certificates.md §1.2', 'quality_manual.md §1.1', 'quality_manual.md §1.2',
  'quality_manual.md §1.3', 'quality_manual.md §1.4', 'quality_manual.md §1.5', 'capability_study.md §1.1',
  'quality_manual.md §1.6', 'msa.md §1.1', 'quality_manual.md §9.1', 'reliability_report.md §1.1', 'reliability_report.md §9.1',
  'reliability_report.md §1.2', 'reliability_report.md §1.3', 'reliability_report.md §1.4', 'reliability_report.md §1.5',
  'reliability_report.md §1.6', 'reliability_report.md §1.7', 'quality_manual.md §1.7', 'quality_manual.md §1.8',
  'quality_manual.md §1.9', 'capacity.md §9.1', 'capacity.md §1.1', 'capacity.md §9.2', 'pcn_policy.md §1.1',
  'pcn_policy.md §1.2', 'subtier.md §1.1', 'subtier.md §1.2', 'subtier.md §9.1', 'cover_letter.md §1.1', 'cover_letter.md §1.2'];

// findSection reads only level and num: headings carry both, other blocks neither.
const H = (level, num) => ({ level, num });
const P = {};

// ---- Renderer (UIQ-NFR-01) ----

test('UIQ-NFR-01: banner quote, headings demoted two levels and capped at h6', () => {
  const out = html('> Synthetic document.\n\n# T\n\n## 1.1 X\n\n### 3.1 Y\n\n#### Z\n\n##### five\n\n###### six');
  assert.match(out, /<blockquote><p>Synthetic document\.<\/p><\/blockquote>/);
  assert.match(out, /<h3>T<\/h3>/);
  assert.match(out, /<h4>1\.1 X<\/h4>/);
  assert.match(out, /<h5>3\.1 Y<\/h5>/);
  assert.match(out, /<h6>Z<\/h6>/);
  assert.match(out, /<h6>five<\/h6>/);
  assert.match(out, /<h6>six<\/h6>/);
  assert.doesNotMatch(out, /<h[12]|<h7/);
  assert.match(html('## 1.2 Closed ##'), /<h4>1\.2 Closed<\/h4>/);
  assert.match(html('---'), /^<hr>$/);
});

test('UIQ-NFR-01: paragraphs join soft-wrapped lines; a blank line splits them', () => {
  assert.equal(html('one\ntwo\n\nthree'), '<p>one two</p>\n<p>three</p>');
  assert.equal(html('a\r\nb'), '<p>a b</p>');
});

test('UIQ-NFR-01: flat lists; a following paragraph is not swallowed', () => {
  assert.equal(html('- a\n* b\n+ c'), '<ul><li>a</li><li>b</li><li>c</li></ul>');
  assert.equal(html('1. a\n2) b'), '<ol><li>a</li><li>b</li></ol>');
  assert.equal(html('- a\n- b\n\nafter'), '<ul><li>a</li><li>b</li></ul>\n<p>after</p>');
  assert.equal(html('- a\nafter'), '<ul><li>a</li></ul>\n<p>after</p>');
  assert.equal(html('intro\n- a'), '<p>intro</p>\n<ul><li>a</li></ul>');
});

test('UIQ-NFR-01: tables pad short rows, drop extra cells, and need a separator row', () => {
  const out = html('| A | B | C |\n|---|:---:|---:|\n| 1 | 2 |\n| 1 | 2 | 3 | 4 |');
  assert.equal(out, '<div class="table-wrap"><table><thead><tr><th>A</th><th>B</th><th>C</th></tr></thead><tbody>'
    + '<tr><td>1</td><td>2</td><td></td></tr><tr><td>1</td><td>2</td><td>3</td></tr></tbody></table></div>');
  assert.equal(html('a | b\n| c | d |'), '<p>a | b | c | d |</p>');
  assert.equal(html('| a | b |\n| x | y |'), '<p>| a | b | | x | y |</p>');
  assert.equal(html('| A |\n|--|'), '<p>| A | |--|</p>', 'a two-dash row is not a separator');
  // A table ends at a blank line or a line without a pipe.
  assert.match(html('| A |\n|---|\n| 1 |\nafter'), /<\/table><\/div>\n<p>after<\/p>$/);
});

test('UIQ-NFR-01: inline strong, em, code; word-internal underscores stay literal', () => {
  assert.equal(html('**bold** and *it* and _it2_ and `co*de*`'),
    '<p><strong>bold</strong> and <em>it</em> and <em>it2</em> and <code>co*de*</code></p>');
  assert.equal(html('see capability_study.md and SI_X_Y'), '<p>see capability_study.md and SI_X_Y</p>');
  assert.equal(html('`**not bold**`'), '<p><code>**not bold**</code></p>');
  assert.equal(html('2 * 3 * 4'), '<p>2 * 3 * 4</p>');
  assert.equal(html('`a < b & c`'), '<p><code>a &lt; b &amp; c</code></p>');
});

test('UIQ-NFR-01: packet text can never inject a tag, attribute or link', () => {
  const cases = {
    '<script>alert(1)</script>': '&lt;script&gt;alert(1)&lt;/script&gt;',
    '<img src=x onerror=alert(1)>': '&lt;img src=x onerror=alert(1)&gt;',
    '[x](javascript:alert(1))': 'x',
    '![i](http://x/y.png)': 'i',
    '"quoted" & \'single\'': '&quot;quoted&quot; &amp; &#39;single&#39;',
    '[a **b**](https://e.x/(p)) `<b>`': 'a <strong>b</strong> <code>&lt;b&gt;</code>',
  };
  for (const [md, text] of Object.entries(cases)) {
    for (const out of [html(md), html(`# ${md}`), html(`- ${md}`), html(`> ${md}`), html(`| ${md} |\n|---|\n| ${md} |`)]) {
      assert.ok(out.includes(text), `${md} -> ${out}`);
      assert.doesNotMatch(out, /<script|<img|<a[\s>]|href=|javascript:/i, md);
      assert.deepEqual(tagProblems(out), [], md);
    }
  }
  // src= and onerror= survive only as escaped text, never inside a tag.
  assert.doesNotMatch(html('<img src=x onerror=alert(1)>'), /<[^>]*(src|onerror)=/);
  for (const f of FILES) assert.deepEqual(tagProblems(html(sample(f), '1.1')), [], f);
});

// The spec expected a table in capability_study.md; the sample has none (its Cpk values are prose), so the
// table check runs on rfq.md, the one sample file with tables: one <table> per |---| separator row.
test('UIQ-NFR-01: every sample packet renders; capability_study.md has its Cpk text, rfq.md its tables', () => {
  for (const f of FILES) assert.ok(html(sample(f)).length > 0, f);
  assert.equal(FILES.length, 10);
  // Issue 163: the viewer rounds numbers with more than 3 decimals to 3; the raw float stays in the file only.
  assert.ok(html(sample('capability_study.md')).includes('2.057'));
  assert.ok(!html(sample('capability_study.md')).includes('2.056587336187229'));
  const rfq = sample('rfq.md');
  assert.equal(html(rfq).match(/<table>/g)?.length, rfq.match(/^\|---/gm).length);
  assert.match(html(rfq), /<td>SI-CP-0007<\/td>/);
});

// ---- Section finder (UIQ-FR-09, decision 43) ----

test('decision 43: a section runs from its heading to the next heading of the same or higher level', () => {
  const flat = [H(1, null), P, H(2, '1.1'), P, H(2, '1.2'), P];
  assert.deepEqual(findSection(flat, '1.1'), { start: 2, end: 4 });
  assert.deepEqual(findSection(flat, '1.2'), { start: 4, end: 6 });
  const nested = [H(2, '3'), P, H(3, '3.1'), P, H(3, '3.2'), P, H(2, '4'), P];
  assert.deepEqual(findSection(nested, '3'), { start: 0, end: 6 });
  assert.deepEqual(findSection(nested, '3.1'), { start: 2, end: 4 });
  assert.deepEqual(findSection(nested, '3.2'), { start: 4, end: 6 });
  const unordered = [H(1, null), H(2, '9.1'), P, H(2, '1.1'), P, H(2, '9.2'), P];
  assert.deepEqual(findSection(unordered, '1.1'), { start: 3, end: 5 });
  assert.deepEqual(findSection(unordered, '9.1'), { start: 1, end: 3 });
});

test('decision 43: exact number match only; misses return null; the first duplicate wins', () => {
  const blocks = [H(1, null), H(2, '1.1'), P, H(2, '1.10'), H(2, '11'), H(2, '1.1.1'), H(2, '11.1'), H(2, null)];
  assert.equal(findSection(blocks, '9.9'), null);
  assert.equal(findSection(blocks, '1'), null);
  assert.deepEqual(findSection(blocks, '1.1'), { start: 1, end: 3 });
  assert.deepEqual(findSection([H(2, '1.10'), H(2, '11'), H(2, '1.1.1'), H(2, '11.1')], '1.1'), null);
  assert.equal(findSection(blocks, undefined), null);
  assert.equal(findSection(blocks, null), null);
  assert.deepEqual(findSection([H(2, '2'), P, H(2, '2'), P], '2'), { start: 0, end: 2 });
});

test('decision 43: heading numbers are parsed exactly; unnumbered headings never match', () => {
  const md = '# Process Capability Study\n\n## Appendix A\n\n## 1 Part\n\n## 1. Dot\n\n## 1.1 X\n\n## 1.10 Y\n\n## 11 Z\n\n## 1.1.1 W';
  assert.match(html(md, '1'), /data-cited><span class="sr-only">Cited section: <\/span><h4>1 Part<\/h4><\/div>/);
  assert.match(html(md, '1.1'), /data-cited><span class="sr-only">Cited section: <\/span><h4>1\.1 X<\/h4><\/div>/);
  assert.equal(renderPacket(md, 'A').found, false);
  assert.equal(renderPacket('## 1.1x Odd', '1.1').found, false);
});

test('UIQ-FR-09: renderPacket wraps exactly the cited blocks; misses show the whole file', () => {
  const md = '> banner\n\n# Title\n\n## 1.1 First\n\nalpha\n\n## 1.2 Second\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n## 1.3 Third\n\ngamma';
  const r = renderPacket(md, '1.2');
  assert.equal(r.found, true);
  assert.equal(r.title, '1.2 Second');
  assert.equal(r.html.match(/data-cited/g).length, 1);
  const cited = r.html.match(/<div class="cited" data-cited>([\s\S]*?)<\/div>\n/)[1];
  assert.ok(cited.startsWith('<span class="sr-only">Cited section: </span><h4>1.2 Second</h4>'));
  assert.match(cited, /<table>/);
  assert.doesNotMatch(cited, /1\.1 First|1\.3 Third|gamma/);
  const miss = renderPacket(md, '9.9');
  assert.equal(miss.found, false);
  assert.equal(miss.title, '');
  assert.doesNotMatch(miss.html, /data-cited/);
  assert.equal(miss.html, renderPacket(md).html);
  for (const t of ['banner', '1.1 First', '1.2 Second', '1.3 Third', 'gamma']) assert.ok(miss.html.includes(t), t);
  assert.equal(renderPacket(md).found, null);
  // The last section ends at the end of the file.
  assert.match(renderPacket(md, '1.3').html, /<p>gamma<\/p><\/div>$/);
});

test('UIQ-FR-09: empty or whitespace-only files say so', () => {
  for (const md of ['', '  \n\n\t', undefined]) {
    assert.equal(renderPacket(md).html, '<p class="quiet">This file is empty.</p>');
    assert.equal(renderPacket(md, '1').found, false);
  }
});

test('UIQ-FR-09: real sample sections (quality_manual 1.4, rfq 3 and 3.2, reliability 9.1)', () => {
  const qm = renderPacket(sample('quality_manual.md'), '1.4');
  const cited = qm.html.match(/data-cited>([\s\S]*?)<\/div>/)[1];
  assert.match(cited, /<h4>1\.4 Manufacturing failure-mode analysis<\/h4>\n<p>Manufacturing failure-mode analysis is present/);
  assert.doesNotMatch(cited, /1\.5|1\.3/);
  assert.match(qm.html, /<\/div>\n<h4>1\.5 Production control plan<\/h4>/);

  const rfq = renderPacket(sample('rfq.md'), '3').html;
  const sec3 = rfq.slice(rfq.indexOf('data-cited'), rfq.indexOf('<h4>4 Demand'));
  assert.ok(sec3.includes('<h5>3.1 Leak test</h5>') && sec3.includes('<h5>3.6 Coolant compatibility</h5>'));
  assert.match(rfq, /<\/div>\n<h4>4 Demand and need-by<\/h4>/);
  assert.match(renderPacket(sample('rfq.md'), '3.2').html, /<\/div>\n<h5>3\.3 Internal cleanliness<\/h5>/);
  // An appendix heading out of numeric order ends at the next ## heading (here 1.2).
  assert.match(renderPacket(sample('reliability_report.md'), '9.1').html, /<\/div>\n<h4>1\.2 Internal cleanliness<\/h4>/);
});

test('decision 47: every numbered sample heading resolves by its own number, and all 32 dev-world citations resolve', () => {
  for (const f of FILES) {
    for (const [, num] of sample(f).matchAll(/^#{1,6}\s+(\d+(?:\.\d+)*)\s/gm)) {
      assert.equal(renderPacket(sample(f), num).found, true, `${f} §${num}`);
    }
  }
  assert.equal(DEV_CITATIONS.length, 32);
  for (const c of DEV_CITATIONS) {
    const [, doc, sec] = c.match(/^(\S+) §(\S+)$/);
    assert.ok(FILES.includes(doc), c);
    assert.equal(renderPacket(sample(doc), sec).found, true, c);
  }
});

// ---- Paths, routing and sheet states ----

test('UIQ-FR-11: packetDir and packetPath', () => {
  const r = (view, params, notFound = null) => ({ view, role: 'senior', params, notFound });
  assert.equal(packetDir(r('qualify', { supplier: 'SUP-07', doc: 'msa.md' })), 'suppliers/SUP-07/');
  assert.equal(packetDir(r('qualify', { doc: 'msa.md' })), null);
  assert.equal(packetDir(r('qualify', { supplier: 'SUP-99' }, { key: 'supplier', value: 'SUP-99', label: 'Not found' })), null);
  assert.equal(packetDir(r('compare', { supplier: 'SUP-07' })), null);
  assert.equal(packetDir(r('eval', { supplier: 'SUP-07' })), null);
  assert.equal(packetPath('suppliers/SUP-07/', 'msa.md'), 'suppliers/SUP-07/msa.md');
  for (const bad of ['../x.md', 'a/b.md', 'msa.txt', '', undefined, 'MSA.md', 'msa.md#x']) assert.equal(packetPath('suppliers/SUP-07/', bad), null, String(bad));
  assert.equal(packetPath(null, 'msa.md'), null);
});

test('UIQ-FR-12: sheetBody states', () => {
  const base = { path: 'dev-data/suppliers/SUP-01/x<y>.md', doc: 'x<y>.md', sec: '1.2' };
  const loading = sheetBody({ ...base, status: 'loading' });
  assert.match(loading, /role="status"/);
  assert.ok(loading.includes('dev-data/suppliers/SUP-01/x&lt;y&gt;.md'));
  const missing = sheetBody({ ...base, status: 'missing' });
  assert.match(missing, /role="alert"/);
  assert.ok(missing.includes('FILE NOT IN PACKET') && missing.includes('dev-data/suppliers/SUP-01/x&lt;y&gt;.md'));
  assert.ok(missing.includes("This supplier's packet has no x&lt;y&gt;.md."));
  const error = sheetBody({ ...base, status: 'error', message: 'HTTP 500 <b>' });
  assert.ok(error.includes('COULD NOT LOAD') && error.includes('dev-data/suppliers/SUP-01/x&lt;y&gt;.md') && error.includes('HTTP 500 &lt;b&gt;'));
  assert.doesNotMatch(error, /FILE NOT IN PACKET/);
  const notFound = sheetBody({ ...base, status: 'ready', found: false, html: '<p>body</p>' });
  assert.equal(notFound, '<p class="quiet" role="status">Section §1.2 is not in this file. Showing the whole file.</p><p>body</p>');
  assert.equal(sheetBody({ ...base, status: 'ready', found: true, html: '<p>body</p>' }), '<p>body</p>');
  assert.equal(sheetBody({ ...base, sec: undefined, status: 'ready', found: null, html: '<p>body</p>' }), '<p>body</p>');
});

test('packet.js is DOM-free and imports only html.js', () => {
  const src = readFileSync(new URL('./packet.js', import.meta.url), 'utf8');
  assert.deepEqual([...src.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]), ['./html.js']);
  assert.doesNotMatch(src, /\b(document|window|localStorage)\.|\bfetch\(/);
  assert.equal(typeof globalThis.document, 'undefined');
});

// ---- Tester additions (#42 stage 3): edges the spec names that the tests above leave open ----

test('UIQ-NFR-01: quotes join lines; *** is a rule; a paragraph ends at any block start (no setext headings)', () => {
  assert.equal(html('> a\n> b'), '<blockquote><p>a b</p></blockquote>');
  assert.equal(html('***'), '<hr>');
  assert.equal(html('text\n---'), '<p>text</p>\n<hr>', '--- under text is a rule, not a setext heading');
  assert.equal(html('text\n## 1.1 X'), '<p>text</p>\n<h4>1.1 X</h4>');
  assert.equal(html('text\n> q'), '<p>text</p>\n<blockquote><p>q</p></blockquote>');
  assert.match(html('text\n| A |\n|---|\n| 1 |'), /^<p>text<\/p>\n<div class="table-wrap"><table>/);
  assert.equal(html('####### seven'), '<p>####### seven</p>', 'more than six # is not a heading');
});

test('UIQ-NFR-01: lists are flat; indentation is ignored and nothing nests', () => {
  assert.equal(html('- a\n  - b\n    - c'), '<ul><li>a</li><li>b</li><li>c</li></ul>');
  assert.equal(html('1. a\n   2. b'), '<ol><li>a</li><li>b</li></ol>');
});

test('UIQ-NFR-01: emphasis needs non-space text inside its markers', () => {
  for (const md of ['a ** b ** c', 'x **a ** y', 'x ** a** y', 'x *a * y', 'x * a* y', 'x _a _ y', 'x _ a_ y']) {
    assert.equal(html(md), `<p>${md}</p>`, md);
  }
});

test('UIQ-NFR-01: _em_ needs a non-word character on both sides', () => {
  assert.equal(html('a_b_ c'), '<p>a_b_ c</p>');
  assert.equal(html('_a_b'), '<p>_a_b</p>');
  assert.equal(html('(_a_)'), '<p>(<em>a</em>)</p>');
});

test('decision 44: images and links collapse to exactly their label text', () => {
  assert.equal(html('![i](http://x/y.png)'), '<p>i</p>');
  assert.equal(html('see [the msa](msa.md) now'), '<p>see the msa now</p>');
});

test('decision 43: a heading number may end in a dot ("## 1. Part" is section 1)', () => {
  const r = renderPacket('## 1. Part\n\nbody', '1');
  assert.equal(r.found, true);
  assert.equal(r.title, '1. Part');
});

test('decision 43: the cited range stops at a higher-level heading too', () => {
  assert.deepEqual(findSection([H(3, '3.1'), P, H(2, '4'), P], '3.1'), { start: 0, end: 2 });
});

test('UIQ-FR-11: packetDir encodes the supplier id; packetPath rejects non-strings', () => {
  assert.equal(packetDir({ view: 'qualify', params: { supplier: 'a/b c' }, notFound: null }), 'suppliers/a%2Fb%20c/');
  assert.equal(packetPath('suppliers/SUP-07/', ['msa.md']), null);
});

test('UIQ-FR-12: the not-found note escapes the section text', () => {
  assert.ok(sheetBody({ status: 'ready', path: 'p', doc: 'msa.md', sec: '<b>', found: false, html: '' }).includes('Section §&lt;b&gt; is not'));
});

test('UIQ-NFR-01: a list of the other kind starts a new list', () => {
  assert.equal(html('- a\n1. b'), '<ul><li>a</li></ul>\n<ol><li>b</li></ol>');
  assert.equal(html('1. a\n- b'), '<ol><li>a</li></ol>\n<ul><li>b</li></ul>');
});

// ---- Eval packets (issue 111; UIE-FR-06; decision 142) ----

test('issue 111: packetDir eval branch needs world and supplier; Qualify is unchanged', () => {
  const r = (view, params, notFound = null) => ({ view, role: 'senior', params, notFound });
  assert.equal(packetDir(r('eval', { supplier: 'SUP-03', world: 101 })), 'worlds/101/packets/SUP-03/');
  assert.equal(packetDir(r('eval', { supplier: 'SUP-03', world: 93, doc: 'msa.md', sec: '1.1', run: 2 })), 'worlds/93/packets/SUP-03/');
  assert.equal(packetDir(r('eval', { world: 101 })), null);
  assert.equal(packetDir(r('eval', { supplier: 'SUP-03' })), null);
  assert.equal(packetDir(r('eval', {})), null);
  assert.equal(packetDir(r('qualify', { supplier: 'SUP-03', world: 101 })), 'suppliers/SUP-03/');
  assert.equal(packetDir(r('qualify', { supplier: 'SUP-99', world: 101 }, { key: 'supplier', value: 'SUP-99', label: 'Not found' })), null);
  assert.equal(packetDir(r('compare', { supplier: 'SUP-03', world: 101 })), null);
  assert.equal(packetPath('worlds/101/packets/SUP-03/', 'msa.md'), 'worlds/101/packets/SUP-03/msa.md');
  assert.equal(packetPath('worlds/101/packets/SUP-03/', '../answer_key.json'), null);
});

test('issue 111: PACKET_FILES is exactly the ten files of every packet in worlds 93 and 101-104', () => {
  assert.equal(PACKET_FILES.length, 10);
  for (const w of ['93', '101', '102', '103', '104']) {
    const dir = join(ROOT, 'data', 'worlds', w, 'packets');
    for (const id of readdirSync(dir)) {
      assert.deepEqual(readdirSync(join(dir, id)).filter((f) => f.endsWith('.md')).sort(), [...PACKET_FILES].sort(), `${w}/${id}`);
    }
  }
  for (const f of PACKET_FILES) assert.equal(packetPath('worlds/101/packets/SUP-01/', f), `worlds/101/packets/SUP-01/${f}`, f);
});

test('issue 111: fileListBody lists the ten files as citation links built by hrefFor, escaped', () => {
  const seen = [];
  const html = fileListBody((d) => { seen.push(d); return `#view=eval&doc=${d}&x="<>`; });
  assert.deepEqual(seen, PACKET_FILES);
  const links = [...html.matchAll(/<li><a class="text-link" data-citation href="([^"]*)">([^<]*) ↗<\/a><\/li>/g)];
  assert.equal(links.length, 10);
  links.forEach((m, i) => {
    assert.equal(m[1], `#view=eval&amp;doc=${PACKET_FILES[i]}&amp;x=&quot;&lt;&gt;`);
    assert.equal(m[2], PACKET_FILES[i]);
  });
  assert.ok(html.startsWith('<ul class="packet-files">') && html.endsWith('</ul>'));
});

// ---- issue 163: the viewer rounds numbers with more than 3 decimals (decisions 240, 241) ----

test('issue 163: roundDecimals rounds 4+ decimals to 3, keeps trailing zeros and a sentence period', () => {
  const r = (s) => roundDecimals(s);
  assert.deepEqual(r('Cpk: 1.9092634239762918.'), { text: 'Cpk: 1.909.', count: 1 });
  assert.deepEqual(r('mean: 3.008096394929193 mm'), { text: 'mean: 3.008 mm', count: 1 });
  assert.deepEqual(r('ratio 1.5008125 and 1.32305'), { text: 'ratio 1.501 and 1.323', count: 2 });
  assert.deepEqual(r('0.014601196529644577'), { text: '0.015', count: 1 });
  assert.deepEqual(r('0.9996'), { text: '1.000', count: 1 }, 'rounds up, trailing zeros kept');
  assert.deepEqual(r('2.0000001'), { text: '2.000', count: 1 });
  assert.deepEqual(r('-3.14159'), { text: '-3.142', count: 1 });
  assert.deepEqual(r('| Cpk | 1.9379627413054112 |'), { text: '| Cpk | 1.938 |', count: 1 }, 'table cell');
  assert.deepEqual(r('- `7.995292807322634`'), { text: '- `7.995`', count: 1 }, 'code span in a list');
  // Decimal-count boundary: exactly 3 decimals is left alone, 4 is rounded.
  assert.deepEqual(r('1.234'), { text: '1.234', count: 0 });
  assert.deepEqual(r('1.2346'), { text: '1.235', count: 1 });
});

test('issue 163: roundDecimals leaves |v| < 0.001 as written; 0.001 itself is rounded', () => {
  const r = (s) => roundDecimals(s);
  assert.deepEqual(r('≤ 0.000001'), { text: '≤ 0.000001', count: 0 });
  assert.deepEqual(r('0.0009'), { text: '0.0009', count: 0 });
  assert.deepEqual(r('-0.0009'), { text: '-0.0009', count: 0 });
  assert.deepEqual(r('0.00099999'), { text: '0.00099999', count: 0 });
  assert.deepEqual(r('0.0010'), { text: '0.001', count: 1 }, 'the cut-off is strict: 0.001 is not under 0.001');
  assert.deepEqual(r('-0.0010'), { text: '-0.001', count: 1 });
});

test('issue 163: roundDecimals controls stay unchanged (IDs, dates, versions, exponents, glued units)', () => {
  for (const s of ['REG-SUP-05-QMS', 'ISO 9001:2015', '2026-11-01', 'v1.2.3', 'SUP-07.12345', '1.2.3.45678', '1.2345.6', 'v2.10001.3', '1.2345mm',
    '8.2147e-7', '8.239564034184113e-7', '≤ 0.000001', 'SI-CP-0007', '', 'no numbers here']) {
    assert.deepEqual(roundDecimals(s), { text: s, count: 0 }, s);
  }
  assert.deepEqual(roundDecimals(null), { text: '', count: 0 });
  assert.deepEqual(roundDecimals(undefined), { text: '', count: 0 });
});

// Every packet file the viewer can open: data/suppliers/<id>/*.md and data/worlds/<n>/packets/<id>/*.md.
const DATA = join(ROOT, 'data');
const dirs = (p) => readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => join(p, d.name));
const mdIn = (p) => readdirSync(p).filter((f) => f.endsWith('.md')).map((f) => join(p, f));
const CORPUS = [...dirs(join(DATA, 'suppliers')).flatMap(mdIn),
  ...dirs(join(DATA, 'worlds')).flatMap((w) => { try { return dirs(join(w, 'packets')); } catch { return []; } }).flatMap(mdIn)];

test('issue 163: real-data scan, every rounded number is a whole whitespace-delimited token (counts pinned)', () => {
  assert.equal(CORPUS.length, 540);
  const NUM = /^(-?\d+\.\d{4,})(\.?)$/;
  let rounded = 0, kept = 0, beforeSpace = 0, beforePeriod = 0, exponent = 0, changedFiles = 0, hitFiles = 0;
  const bad = [];
  for (const f of CORPUS) {
    const raw = readFileSync(f, 'utf8');
    const { text, count } = roundDecimals(raw);
    const a = raw.split(/(\s+)/), b = text.split(/(\s+)/);
    assert.equal(a.length, b.length, f);  // rounding never adds or removes whitespace
    let n = 0, hit = false;
    for (let i = 0; i < a.length; i++) {
      const m = NUM.exec(a[i]);
      if (a[i] !== b[i]) {
        // Safe context: the token is the number alone (whitespace before), optionally a sentence period after.
        if (!m || b[i] !== Number(m[1]).toFixed(3) + m[2]) bad.push(`${f}: ${a[i]} -> ${b[i]}`);
        else { n++; rounded++; hit = true; if (m[2]) beforePeriod++; else beforeSpace++; }
      } else if (m) {
        if (Math.abs(Number(m[1])) < 0.001) { kept++; hit = true; if (m[2]) beforePeriod++; else beforeSpace++; }
        else bad.push(`${f}: left unrounded ${a[i]}`);
      } else if (/\d\.\d{4,}/.test(a[i])) {
        if (/^\d+\.\d+e-\d+\.?$/.test(a[i])) exponent++; else bad.push(`${f}: long decimal in an unexpected context ${a[i]}`);
      }
    }
    assert.equal(count, n, f);
    if (n) changedFiles++;
    if (hit) hitFiles++;
  }
  assert.deepEqual(bad, []);
  assert.deepEqual({ rounded, kept, total: rounded + kept, beforeSpace, beforePeriod, exponent, changedFiles, hitFiles },
    { rounded: 902, kept: 48, total: 950, beforeSpace: 638, beforePeriod: 312, exponent: 43, changedFiles: 201, hitFiles: 225 });
});

test('issue 163: renderPacket returns the rounded count; empty and null files count 0', () => {
  assert.equal(renderPacket('## 1.1 A\n\nCpk: 1.9092634239762918. Mean 3.008096394929193 mm.').rounded, 2);
  assert.equal(renderPacket('## 1.1 A\n\nNothing long: 1.234, ≤ 0.000001, 8.2e-7.').rounded, 0);
  assert.equal(renderPacket('').rounded, 0);
  assert.equal(renderPacket(null).rounded, 0);
  assert.equal(renderPacket('   \n\n').rounded, 0);
  const out = renderPacket('| a | b |\n|---|---|\n| Cpk | 2.056587336187229 |');
  assert.equal(out.rounded, 1);
  assert.match(out.html, /<td>2\.057<\/td>/);
});

const SUP08_CAP = join(DATA, 'suppliers', 'SUP-08', 'capability_study.md');

test('issue 163: SUP-08 capability_study.md §1.1 is still highlighted on a rounded packet; file unchanged', () => {
  const raw = readFileSync(SUP08_CAP, 'utf8');
  const out = renderPacket(raw, '1.1');
  assert.equal(out.found, true);
  assert.equal(out.title, '1.1 Process capability');
  assert.ok(out.rounded > 0);
  const cited = /<div class="cited" data-cited>([\s\S]*?)<\/div>/.exec(out.html);
  assert.ok(cited, 'the cited wrapper is present');
  assert.match(cited[1], /^<span class="sr-only">Cited section: <\/span><h4>1\.1 Process capability<\/h4>/);
  assert.match(cited[1], /Cpk: 1\.909\./);
  assert.match(cited[1], /The recorded result is 1\.871\./);
  assert.doesNotMatch(out.html, /1\.9092634239762918/);
  // Same blocks and same cited range as the hand-rounded text: rounding changes digits only.
  assert.equal(out.html, renderPacket(roundDecimals(raw).text, '1.1').html);
  // The file on disk keeps the raw float (the blind eval ran on it) and rendering never writes.
  assert.ok(raw.includes('Cpk: 1.9092634239762918.'));
  assert.equal(readFileSync(SUP08_CAP, 'utf8'), raw);
});

test('issue 163: the rounding note lives in the viewer header, never in the scrolled sheet body', () => {
  assert.equal(ROUND_NOTE, 'Long decimals are shown rounded to 3 places. The file itself is unchanged.');
  const base = { status: 'ready', path: 'p', doc: 'd.md', sec: null, html: '<p>x</p>' };
  assert.equal(sheetBody({ ...base, rounded: 2 }), '<p>x</p>');
  assert.ok(!sheetBody({ ...base, sec: '9.9', found: false, rounded: 1 }).includes(ROUND_NOTE));
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const head = html.slice(html.indexOf('<header class="sheet-head">'), html.indexOf('</header>', html.indexOf('<header class="sheet-head">')));
  assert.match(head, /<p class="quiet" id="viewer-note" role="status" hidden><\/p>/);
  const main = readFileSync(new URL('./main.js', import.meta.url), 'utf8');
  assert.match(main, /note\.hidden = !\(state\.rounded > 0\)/);
  assert.match(main, /\$\('viewer-note'\)\.hidden = true;/, 'reset on every open, so the Eval file list never inherits it');
});

test('issue 163: packetDir refuses an Eval pair the router marked Not found', () => {
  const nf = { key: 'packet', value: 'SUP-07, world 999', label: 'Not found' };
  assert.equal(packetDir({ view: 'eval', params: { world: 999, supplier: 'SUP-07' }, notFound: nf }), null);
  assert.equal(packetDir({ view: 'eval', params: { world: 999, supplier: 'SUP-07', doc: 'msa.md' }, notFound: nf }), null);
  assert.equal(packetDir({ view: 'eval', params: { world: 101, supplier: 'SUP-01' }, notFound: null }), 'worlds/101/packets/SUP-01/');
});
