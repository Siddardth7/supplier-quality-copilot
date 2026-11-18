// HTML string helpers shared by the shell and every view. Pure: no DOM access.

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape any value for use as HTML text or a quoted attribute value. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);
}

/** One line of plain text for an error: "path: message", or the message alone. */
export function formatError(err) {
  return err?.path ? `${err.path}: ${err.message}` : String(err?.message ?? err);
}

/** The shared error panel (UIQ-FR-12, UIM-FR-12). err: { path, message, kind: 'fetch' | 'data' | 'engine' }.
 *  alert: false drops role="alert" when another panel already announces the same error (issue 46). */
export function errorPanel(err, { alert = true } = {}) {
  const title = err.kind === 'engine' ? 'ENGINE ERROR' : 'COULD NOT LOAD';
  return `<div class="panel error-panel"${alert ? ' role="alert"' : ''}><p class="eyebrow">${title}</p>`
    + (err.path ? `<p class="mono">${esc(err.path)}</p>` : '')
    + `<p>${esc(err.message)}</p>`
    + (err.kind === 'fetch' ? '<p class="quiet">Serve the repo root: <code>node scripts/serve.mjs</code> then open /app/.</p>' : '')
    + '</div>';
}

const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻' };

/** Display only (issue 162, decision 236). |n| < 0.001 or >= 1e6 (n !== 0) -> `a × 10ᵇ` with Unicode superscripts,
 *  digits from toExponential() so nothing is rounded; else String(n). Non-numbers and non-finite numbers unchanged. */
export function fmtLimitNumber(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n === 0) return typeof n === 'number' ? String(n) : n;
  const a = Math.abs(n);
  if (a >= 0.001 && a < 1e6) return String(n);
  const [m, e] = n.toExponential().split('e');
  return `${m} × 10${String(Number(e)).replace(/[0-9-]/g, (c) => SUP[c])}`;
}
