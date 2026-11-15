// Shared identification survives routed content replacement and citation states (issue 47).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('./app.css', import.meta.url), 'utf8');
const badge = 'Synthetic data. Fictional suppliers.';
const disclaimer = 'Fan-made demo. Not affiliated with Marvel.';
// The whole `@media print{…}` block, ended at its own closing brace so CSS appended after it is not read as print (issue 46).
const printStart = css.indexOf('@media print{');
const printEnd = (() => {
  let depth = 0;
  for (let i = printStart; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}' && --depth === 0) return i + 1;
  }
  return css.length;
})();
const HIDES = /(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?![.\d]))/;
test('UIQ-FR-13: persistent identification belongs to shared navigation outside replaceable panels', () => {
  const shell = html.slice(html.indexOf('<div class="shell-bar">'), html.indexOf('<main'));
  assert.ok(shell.includes(badge) && shell.includes('role="tablist"'), 'shared shell contains identification and navigation');
  assert.match(css, /\.shell-bar\{[^}]*position:sticky;top:0;/, 'identification persists while scrolling');
});
test('UIQ-FR-13: citation identification is outside replaceable packet body', () => {
  const dialog = html.match(/<dialog\b[\s\S]*?<\/dialog>/)[0];
  const head = dialog.match(/<header\b[\s\S]*?<\/header>/)[0];
  assert.ok(head.includes(badge), 'viewer header identifies loading and failed files');
  assert.ok(dialog.slice(dialog.indexOf('</div>', dialog.indexOf('id="viewer-body"')) + 6).includes(disclaimer), 'viewer disclaimer survives body replacement');
});
test('UIQ-FR-13: paper labels remain readable and routed visibility is preserved', () => {
  assert.ok(printStart >= 0 && printEnd > printStart, 'the print block is found and closed');
  const print = css.slice(printStart, printEnd).replace(/\/\*[\s\S]*?\*\//g, '');
  const safeHidden = new Set(['.skip-link','.live-dot','[hidden]','.sheet:not([open])','.sheet[open]::backdrop','.sheet-head .subtle-button']);
  for (const rule of print.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/(?:display\s*:\s*none|visibility\s*:\s*hidden)\b/.test(rule[2])) continue;
    for (const selector of rule[1].trim().split(',')) {
      const name = selector.trim();
      if (/^body:has\(\.sheet\[open\]\)>/.test(name)) continue;
      assert.ok(safeHidden.has(name), 'print must not hide a label or its ancestors: '+name);
    }
  }
  assert.match(print, /body,body \*\{color:var\(--bg\)!important;background:transparent!important/);
  assert.match(print, /\.sheet\[open\]\{position:static;display:block;[^}]*overflow:visible\}/);
  assert.match(print, /body:has\(\.sheet\[open\]\)>\.app-header,body:has\(\.sheet\[open\]\)>\.shell-bar,\s*body:has\(\.sheet\[open\]\)>main,body:has\(\.sheet\[open\]\)>\.app-footer\{display:none!important\}/);
  assert.match(print, /\.synthetic-label \.badge,\.viewer-label,\.app-footer p,\.viewer-disclaimer\{color:var\(--bg\)!important\}/);
  assert.match(print, /\[hidden\],\.sheet:not\(\[open\]\)\{display:none!important\}/);
  assert.match(print, /\.shell-bar,\.sheet-head\{position:static\}/);
});

test('OVR-NFR-05: root scroll padding clears the sticky label and navigation', () => {
  assert.match(css, /:root\{scroll-padding-top:96px\}/);
});

test('UIQ-FR-13: no screen rule outside @media print hides the shell bar, the badge, the footer or the viewer labels', () => {
  const screen = (css.slice(0, printStart) + css.slice(printEnd)).replace(/\/\*[\s\S]*?\*\//g, '');
  const labels = /\.(?:shell-bar|synthetic-label|badge|app-footer|viewer-label|viewer-disclaimer)(?![\w-])/;
  let checked = 0;
  for (const rule of screen.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!HIDES.test(rule[2])) continue;
    checked += 1;
    for (const selector of rule[1].trim().split(',')) assert.doesNotMatch(selector.trim(), labels, `screen CSS hides a label: ${selector.trim()}`);
  }
  assert.ok(checked > 0, 'the scan saw at least one hiding rule, so the regex is live');
});
