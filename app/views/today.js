// Today view (issue 107): Needs you, Escalate this week and queue counts. Each section shows its own load error.
import { renderToday } from '../today.js';

export const meta = { name: 'today', n: 1, title: 'Today', issue: [107] };

export function render(model, ctx = {}) {
  const head = `<p class="eyebrow">01 / TODAY</p><h2>${meta.title}</h2>`;
  if (!model) return `${head}<p class="quiet">Loading data…</p>`;
  return head + renderToday(model, ctx);
}
