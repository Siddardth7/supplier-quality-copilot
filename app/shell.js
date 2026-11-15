// Pure app-header and routed-state helpers (DESIGN-SPEC 4.1, 7).
import { esc } from './html.js';
import { chipView } from './policy.js';

/** Inner HTML of the policy chip; main.js sets the cyan/amber class from chipView().tone. */
export function chip(resolved) {
  const { label, note } = chipView(resolved);
  return esc(label) + (note ? ` <span class="chip-note">${esc(note)}</span>` : '');
}

/** The two Viewing-as radios, Junior then Senior, with a roving tabindex. */
export function roleSwitch(role) {
  return ['junior', 'senior'].map((r) => {
    const on = r === role;
    return `<button type="button" role="radio" data-role="${r}" aria-checked="${on}" tabindex="${on ? 0 : -1}">${r === 'junior' ? 'Junior' : 'Senior'}</button>`;
  }).join('');
}

/** The routed state live views show (DS-AC-04): "Not found: <key> <value>", else "Route: k=v …" in params order. */
export function routeLine(ctx) {
  if (ctx?.notFound) return `<p class="status-line" role="alert">${esc(`Not found: ${ctx.notFound.key} ${ctx.notFound.value}`)}</p>`;
  const pairs = Object.entries(ctx?.params ?? {}).map(([k, v]) => `${k}=${v}`);
  return pairs.length ? `<p class="status-line mono" data-route>${esc(`Route: ${pairs.join(' ')}`)}</p>` : '';
}

/** Preserve first-alert identity across re-renders; role, policy and detail tabs stay quiet (issue 140). */
export function announcementKey(view, { notFound, params = {} } = {}) {
  return `${view}|${notFound ? `${notFound.key}=${notFound.value}` : ''}|${params.supplier ?? ''}|${params.part ?? ''}`;
}
