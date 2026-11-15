// Compare view (issue 108): acceptable bidders for one Stark part, side by side; the rest listed with their reason.
import { renderCompare } from '../compare.js';

export const meta = { name: 'compare', n: 3, title: 'Compare', issue: [108] };

export function render(model, ctx = {}) {
  const head = `<p class="eyebrow">03 / COMPARE</p><h2>${meta.title}</h2>`;
  if (!model) return `${head}<p class="quiet">Loading data…</p>`;
  return head + renderCompare(model, ctx);
}
