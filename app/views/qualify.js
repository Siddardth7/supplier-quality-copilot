// Qualify view: queue sidebar (#39) and the supplier detail (#40 fills it in); + New supplier entry (issue 77).
import { errorPanel } from '../html.js';
import { renderQualify } from '../queue.js';
import { renderEntry } from '../entry.js';

export const meta = { name: 'qualify', n: 2, title: 'Qualify', issue: [39] };

export function render(model, ctx = {}) {
  const head = `<p class="eyebrow">02 / QUALIFY</p><h2>${meta.title}</h2>`;
  if (!model) return `${head}<p class="quiet">Loading data…</p>`;
  if (!model.suppliers.ok) return `${head}<div class="status">${errorPanel(model.suppliers.error)}</div>`;
  return head + renderQualify(model, ctx, ctx.params?.new && ctx.entry ? renderEntry(model, ctx) : null);
}
