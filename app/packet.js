// Citation viewer helpers (#42; PRD-05 UIQ-FR-09, -11, -12, UIQ-NFR-01; DESIGN-SPEC 4.4, 7). Pure: no DOM, no fetch.
// A small built-in Markdown renderer for packet files, the cited-section finder and the sheet's body states.
// Packet text is model-written: everything is escaped before any formatting, and no link, image, style or raw
// HTML ever reaches the output (decision 44).
import { esc, errorPanel } from './html.js';

const DOC = /^[a-z0-9_]+\.md$/;  // PRD-04 citation file part (route.js enforces it too)
const HEADING = /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const NUM = /^(\d+(?:\.\d+)*)\.?(?:\s|$)/;
const HR = /^\s*(-{3,}|\*{3,})\s*$/;
const QUOTE = /^\s*>/;
const TABLE_SEP = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const UL = /^\s*[-*+]\s+(.*)$/;
const OL = /^\s*\d+[.)]\s+(.*)$/;

/** Directory (relative to the data base) holding one supplier's packet, or null when the route has none.
 *  Qualify: `suppliers/<id>/`. Eval (issue 111): `worlds/<n>/packets/<id>/`, which needs both `world` and `supplier`. */
export function packetDir(route) {
  const p = route?.params;
  if (route?.view === 'qualify' && p?.supplier && !route.notFound) return `suppliers/${encodeURIComponent(p.supplier)}/`;
  if (route?.view === 'eval' && p?.supplier && p?.world && !route.notFound) return `worlds/${encodeURIComponent(p.world)}/packets/${encodeURIComponent(p.supplier)}/`;
  return null;
}

// ponytail: every packet in worlds 93 and 101-104 has exactly these ten files (checked 2026-11-13); a listing
// would need a manifest per packet, since a static server can't list a directory.
export const PACKET_FILES = ['cover_letter.md', 'quality_manual.md', 'certificates.md', 'capability_study.md', 'msa.md',
  'reliability_report.md', 'capacity.md', 'subtier.md', 'pcn_policy.md', 'rfq.md'];

/** The viewer body for an Eval miss with no expected citation (UIE-FR-06): the packet's file list.
 *  hrefFor(doc) -> hash; each link is a citation link, so it opens the file in the same viewer. */
export function fileListBody(hrefFor) {
  return '<ul class="packet-files">' + PACKET_FILES.map((f) =>
    `<li><a class="text-link" data-citation href="${esc(hrefFor(f))}">${esc(f)} ↗</a></li>`).join('') + '</ul>';
}

/** dir + doc, or null when doc is not a PRD-04 file name (defence in depth; route.js already enforces it). */
export function packetPath(dir, doc) {
  return dir && typeof doc === 'string' && DOC.test(doc) ? dir + doc : null;
}

const isTableStart = (lines, i) => lines[i].includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]);
const startsBlock = (lines, i) => HEADING.test(lines[i]) || HR.test(lines[i]) || QUOTE.test(lines[i])
  || UL.test(lines[i]) || OL.test(lines[i]) || isTableStart(lines, i);
// ponytail: a `|` inside a code span still splits the cell; escape-aware splitting if a packet ever needs it.
const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

/** md -> blocks. Headings carry { level, num, text }; other blocks carry neither level nor num. */
function parseBlocks(md) {
  const lines = String(md ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    let m;
    if (!line.trim()) { i++; continue; }
    if ((m = HEADING.exec(line))) {
      blocks.push({ type: 'heading', level: m[1].length, num: NUM.exec(m[2])?.[1] ?? null, text: m[2] });
      i++;
    } else if (HR.test(line)) {
      blocks.push({ type: 'hr' });
      i++;
    } else if (QUOTE.test(line)) {
      const text = [];
      while (i < lines.length && QUOTE.test(lines[i])) text.push(lines[i++].replace(/^\s*> ?/, ''));
      blocks.push({ type: 'quote', text: text.join(' ') });
    } else if (isTableStart(lines, i)) {
      const rows = [cells(lines[i])];
      i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) rows.push(cells(lines[i++]));
      blocks.push({ type: 'table', rows });
    } else if (UL.test(line) || OL.test(line)) {
      const re = UL.test(line) ? UL : OL;
      const items = [];
      while (i < lines.length && (m = re.exec(lines[i]))) { items.push(m[1]); i++; }
      blocks.push({ type: 'list', ordered: re === OL, items });
    } else {
      const text = [line.trim()];
      i++;
      while (i < lines.length && lines[i].trim() && !startsBlock(lines, i)) text.push(lines[i++].trim());
      blocks.push({ type: 'p', text: text.join(' ') });
    }
  }
  return blocks;
}

// Inline formatting on escaped text. Code spans first: their text is escaped and gets nothing else.
function inline(raw) {
  return String(raw).split(/(`[^`]+`)/).map((part, i) => (i % 2 ? `<code>${esc(part.slice(1, -1))}</code>` : esc(part)
    .replace(/!?\[([^\]]*)\]\((?:[^()]|\([^()]*\))*\)/g, '$1')  // images and links: the label text only
    .replace(/\*\*(?!\s)(.+?)(?<!\s)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(?!\s)([^*]+?)(?<!\s)\*/g, '<em>$1</em>')
    .replace(/(^|[^A-Za-z0-9_])_(?!\s)([^_]+?)(?<!\s)_(?![A-Za-z0-9_])/g, '$1<em>$2</em>'))).join('');
}

function blockHtml(b) {
  if (b.type === 'heading') { const h = `h${Math.min(b.level + 2, 6)}`; return `<${h}>${inline(b.text)}</${h}>`; }
  if (b.type === 'hr') return '<hr>';
  if (b.type === 'quote') return `<blockquote><p>${inline(b.text)}</p></blockquote>`;
  if (b.type === 'list') { const t = b.ordered ? 'ol' : 'ul'; return `<${t}>${b.items.map((x) => `<li>${inline(x)}</li>`).join('')}</${t}>`; }
  if (b.type === 'table') {
    const n = b.rows[0].length;
    const row = (r, tag) => `<tr>${Array.from({ length: n }, (_, k) => `<${tag}>${inline(r[k] ?? '')}</${tag}>`).join('')}</tr>`;
    return `<div class="table-wrap"><table><thead>${row(b.rows[0], 'th')}</thead><tbody>${b.rows.slice(1).map((r) => row(r, 'td')).join('')}</tbody></table></div>`;
  }
  return `<p>${inline(b.text)}</p>`;
}

/** blocks: [{ level?, num? }] -> { start, end } (end exclusive) | null. The first heading whose number equals sec
 *  exactly; it ends at the next heading of the same or a higher level (decision 43). */
export function findSection(blocks, sec) {
  if (sec == null) return null;
  const start = blocks.findIndex((b) => b.level && b.num === String(sec));
  if (start < 0) return null;
  let end = start + 1;
  while (end < blocks.length && !(blocks[end].level && blocks[end].level <= blocks[start].level)) end++;
  return { start, end };
}

// Numbers written with more than 3 decimals (generator floats) are shown rounded to 3 in the viewer (issue 163).
// Lookbehind: not inside a word, code, version, date or another number; sign allowed. Lookahead: not before a word
// char (units glued on, exponent `e-7`) and not before `.digit` (a version such as 1.2.3.4567). A sentence-final
// period is fine: `1.9092634239762918.` -> `1.909.`
const LONG_DECIMAL = /(?<![\w.-])-?\d+\.\d{4,}(?!\w|\.\d)/g;
export const ROUND_NOTE = 'Long decimals are shown rounded to 3 places. The file itself is unchanged.';

/** md -> { text, count }. |value| < 0.001 is left as written (0.000001 limits would read 0.000). Trailing zeros kept. */
export function roundDecimals(md) {
  let count = 0;
  const text = String(md ?? '').replace(LONG_DECIMAL, (m) => {
    const v = Number(m);
    if (Math.abs(v) < 0.001) return m;
    count++;
    return v.toFixed(3);
  });
  return { text, count };
}

/** md -> { html, found, title, rounded }. found: null without sec, else whether the section exists. title: the cited
 *  heading's text ('' if none). rounded: how many numbers roundDecimals changed. The cited blocks sit in
 *  <div class="cited" data-cited>, led by an sr-only label. */
export function renderPacket(md, sec) {
  const { text, count } = roundDecimals(md ?? '');
  const blocks = parseBlocks(text);
  const range = findSection(blocks, sec);
  const found = sec == null ? null : range !== null;
  if (!blocks.length) return { html: '<p class="quiet">This file is empty.</p>', found, title: '', rounded: 0 };
  const parts = blocks.map(blockHtml);
  if (range) {
    parts[range.start] = `<div class="cited" data-cited><span class="sr-only">Cited section: </span>${parts[range.start]}`;
    parts[range.end - 1] += '</div>';
  }
  return { html: parts.join('\n'), found, title: range ? blocks[range.start].text : '', rounded: count };
}

/** The sheet's inner HTML. state: { status: 'loading'|'ready'|'missing'|'error', path, doc, sec, html?, found?, rounded?, message? } */
export function sheetBody(state) {
  const { status, path, doc, sec } = state;
  if (status === 'loading') return `<p class="quiet" role="status">Loading <span class="mono">${esc(path)}</span>…</p>`;
  if (status === 'missing') {
    return `<div class="panel error-panel" role="alert"><p class="eyebrow">FILE NOT IN PACKET</p><p class="mono">${esc(path)}</p>`
      + `<p>This supplier's packet has no ${esc(doc)}.</p></div>`;
  }
  if (status === 'error') return errorPanel({ path, message: state.message, kind: 'fetch' });
  const note = sec != null && state.found === false
    ? `<p class="quiet" role="status">Section §${esc(sec)} is not in this file. Showing the whole file.</p>` : '';
  return note + (state.html ?? '');  // the rounding note sits in the dialog header (issue 163)
}
