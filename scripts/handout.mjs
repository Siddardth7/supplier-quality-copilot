// Builds docs/HANDOUT.pdf from docs/HANDOUT.md (issue 52, SHIP-FR-06): node scripts/handout.mjs
// Prints with headless Chrome (set CHROME to its path if it is not in the macOS default place) and exits 1 unless
// the PDF is exactly one page.
// ponytail: toHtml covers only the Markdown HANDOUT.md uses (#/## headings, paragraphs, one-level lists, tables,
// images, **bold**, `code`, bare URLs). A new construct needs a line here; a real parser only if that keeps happening.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (s) => esc(s)
  .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2">$2</a>');
const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()));

/** The Markdown subset in docs/HANDOUT.md -> HTML body. */
export function toHtml(md) {
  const out = [];
  const lines = md.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h = /^(#{1,2}) (.+)$/.exec(line);
    if (!line.trim()) continue;
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }
    if (line.startsWith('|')) {
      const rows = [];
      for (; i < lines.length && lines[i].startsWith('|'); i++) rows.push(lines[i]);
      i--;
      const body = rows.slice(2).map((r) => `<tr>${cells(r).map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
      out.push(`<table><thead><tr>${cells(rows[0]).map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`);
      continue;
    }
    const item = /^(-|\d+\.) /;
    if (item.test(line)) {
      const tag = line.startsWith('-') ? 'ul' : 'ol';
      const items = [];
      for (; i < lines.length && item.test(lines[i]); i++) items.push(`<li>${inline(lines[i].replace(item, ''))}</li>`);
      i--;
      out.push(`<${tag}>${items.join('')}</${tag}>`);
      continue;
    }
    out.push(`<p>${inline(line)}</p>`);
  }
  return out.join('\n');
}

// Paper, not screen: light page, navy ink. Sizes are the one-page calibration; if the page count check fails after
// an edit to HANDOUT.md, cut words first, then lower the body size here.
const CSS = `@page { size: letter; margin: 10mm 12mm; }
body { font: 8.4pt/1.3 -apple-system, "Helvetica Neue", Arial, sans-serif; color: #0b1b33; margin: 0; }
h1 { font-size: 17pt; margin: 0 0 2pt; }
h2 { font-size: 10pt; margin: 7pt 0 2pt; text-transform: uppercase; letter-spacing: .06em; color: #0a6c8f; border-bottom: .5pt solid #b9c6d6; }
p, ul, ol { margin: 0 0 3.5pt; } ol, ul { padding-left: 14pt; }
table { width: 100%; border-collapse: collapse; margin: 0 0 4pt; table-layout: fixed; }
th, td { border: .5pt solid #b9c6d6; padding: 2pt 4pt; text-align: left; vertical-align: top; }
th { background: #eaf1f8; }
img { width: 100%; display: block; aspect-ratio: 2 / 1; object-fit: cover; object-position: top; }  /* crop the empty lower part of each screen */
code { font: 8pt ui-monospace, Menlo, monospace; } a { color: inherit; text-decoration: none; }
body > p:last-child { font-size: 7.4pt; color: #47566b; margin-top: 5pt; }`;

function main() {
  const docs = fileURLToPath(new URL('../docs/', import.meta.url));
  const html = `<!doctype html><meta charset="utf-8"><base href="${pathToFileURL(docs)}"><title>Supplier Quality Copilot handout</title><style>${CSS}</style>${toHtml(readFileSync(join(docs, 'HANDOUT.md'), 'utf8'))}`;
  const tmp = join(mkdtempSync(join(tmpdir(), 'handout-')), 'handout.html');
  writeFileSync(tmp, html);
  const pdf = join(docs, 'HANDOUT.pdf');
  const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${pdf}`, pathToFileURL(tmp).href], { stdio: 'ignore' });
  const pages = (readFileSync(pdf, 'latin1').match(/\/Type\s*\/Page\b/g) ?? []).length;
  console.log(`handout: ${pdf}, ${pages} page${pages === 1 ? '' : 's'}`);
  if (pages !== 1) { console.error('handout: must be exactly one page'); process.exit(1); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
