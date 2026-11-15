// Monitor view: tier table and supplier detail (#44) with its p-chart and alert list (#45). ctx.chartTable (main.js
// local state, decision 71) passes through to renderMonitor.
import { errorPanel } from '../html.js';
import { renderMonitor } from '../monitor.js';

export const meta = { name: 'monitor', n: 4, title: 'Monitor', issue: [44, 45] };

export function render(model, ctx = {}) {
  const head = `<p class="eyebrow">04 / MONITOR</p><h2>${meta.title}</h2>`;
  if (!model) return `${head}<p class="quiet">Loading data…</p>`;
  if (!model.monitor.ok) return `${head}<div class="status">${errorPanel(model.monitor.error)}</div>`;
  return head + renderMonitor(model, ctx);
}
