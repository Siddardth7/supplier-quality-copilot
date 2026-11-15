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
