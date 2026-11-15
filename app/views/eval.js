// Eval view (issue 111): the published eval runs from data/eval.json, headline first, every miss linked to its packet.
import { renderEval } from '../eval.js';

export const meta = { name: 'eval', n: 6, title: 'Eval', issue: [111] };

export function render(model, ctx = {}) {
  return `<p class="eyebrow">06 / EVAL</p><h2>${meta.title}</h2>` + renderEval(model, ctx);
}
