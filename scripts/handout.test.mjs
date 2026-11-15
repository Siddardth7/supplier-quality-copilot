// Guards the handout (issue 52, SHIP-FR-06): the converter handles the Markdown HANDOUT.md uses, the doc has every
// required part, and its numbers are the measured ones in data/eval.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { toHtml } from './handout.mjs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const md = read('../docs/HANDOUT.md');

test('toHtml converts the subset and escapes HTML', () => {
  assert.equal(toHtml('# A & <b>'), '<h1>A &amp; &lt;b&gt;</h1>');
  assert.equal(toHtml('x **y** `z`'), '<p>x <strong>y</strong> <code>z</code></p>');
  assert.equal(toHtml('- a\n- b'), '<ul><li>a</li><li>b</li></ul>');
  assert.equal(toHtml('1. a\n2. b'), '<ol><li>a</li><li>b</li></ol>');
  assert.equal(toHtml('| H |\n|---|\n| ![alt](i.png) |'),
    '<table><thead><tr><th>H</th></tr></thead><tbody><tr><td><img alt="alt" src="i.png"></td></tr></tbody></table>');
  assert.equal(toHtml('see https://x.test/a now'), '<p>see <a href="https://x.test/a">https://x.test/a</a> now</p>');
});

test('HANDOUT.md leaves no raw Markdown behind after conversion', () => {
  const text = toHtml(md).replace(/<[^>]+>/g, '');
  assert.doesNotMatch(text, /\*\*|!\[|^\s*[#|]/m);
});

test('HANDOUT.md has every SHIP-FR-06 part', () => {
  for (const h of ['The problem', 'How it works', 'The routing rule', 'The six views', 'Measured, not claimed', 'Three questions for you']) {
    assert.ok(md.includes(`## ${h}`), h);
  }
  for (const view of ['today', 'qualify', 'compare', 'monitor', 'standards', 'eval']) {
    assert.ok(md.includes(`(img/handout-${view}.png)`), view);
    assert.ok(existsSync(new URL(`../docs/img/handout-${view}.png`, import.meta.url)), `${view} image file`);
  }
  assert.equal((md.match(/^\d\. /gm) ?? []).length, 3, 'three questions');
  assert.match(md, /All data is synthetic.*not affiliated with Marvel/);
});

test('HANDOUT.md quotes the measured headline from data/eval.json', () => {
  const { counts: c, rates: r, targets: t } = JSON.parse(read('../data/eval.json')).runs[0].groups[0];
  assert.ok(md.includes(`| ${c.catch} / ${c.gap} (${r.catch}) | ≥ 90% | ${t.catch_ge_90} |`));
  assert.ok(md.includes(`| ${c.false_alarm} / ${c.clean} (${r.false_alarm}) | ≤ 5% | ${t.false_alarm_le_5} |`));
});
