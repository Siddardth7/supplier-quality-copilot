// Standards view: the scoring policy editor (issue 109) and the view-only requirement sheet viewer (issue 110, UIS-FR-11).
// Uploaded sheets (UIS-FR-12..14) are issue 78.
import { renderStandards } from '../standards.js';

export const meta = { name: 'standards', n: 5, title: 'Standards', issue: [110] };

export function render(model, ctx = {}) {
  return `<p class="eyebrow">05 / STANDARDS</p><h2>${meta.title}</h2>` + renderStandards(model, ctx);
}
