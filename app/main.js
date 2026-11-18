// App shell boot: the only module that touches the DOM. Safe to import in Node (does nothing there).
import { safeStorage } from './storage.js';
import { resolveBase, makeFetchText, loadData } from './data.js';
import { resolvePolicy, chipView, policyLabel } from './policy.js';
import { buildModel } from './model.js';
import { STARK_REFERENCE } from './engine.js';
import { REF_KEY, SHARED_KEY, RESERVED_ID, activePolicy, checkedKey, savedKey, checkPolicy, decodePolicy, encodePolicy, exportPolicy, importPolicy,
  livePolicy, loadStore, plainPolicyError, removeFromList, saveToList, setField, setRating, toggleKnockout, writeStore } from './standards.js';
import { parseHash, formatHash, resolveRoute } from './route.js';
import { announcementKey, chip, roleSwitch } from './shell.js';
import { copyWithFallback } from './clipboard.js';
import { VIEWS } from './views/index.js';
import { ROUND_NOTE, fileListBody, packetDir, packetPath, renderPacket, sheetBody } from './packet.js';
import { monitorDetailKey, detailScrollOptions } from './monitor.js';
import { draftsModel, copyPayload } from './drafts.js';
import { WHERE_REQUIRED, blankEntry, entryFromRecord, exportRecord, importRecord, nextId, remove, scoreEntry, setPart, setRow, toRecord,
  upsert, writeManual } from './manual.js';
import { revealEntryFocus, issueText, liveGaps, livePanel, profileLine, sheetFor } from './entry.js';
import { queueHref } from './queue.js';
import { importSheet } from './sheet-import.js';
import { loadSheets, writeSheets, uploadModel, exportSheet, editPreview, previewFields, savePreview, applyPreviewJson } from './sheet-upload.js';
import { registerOffline } from './offline.js';

if (typeof document !== 'undefined') { boot(); registerOffline(); }  // issue 169: offline mode, never throws

function boot() {
  const $ = (id) => document.getElementById(id);
  const tabs = [...document.querySelectorAll('[role=tab]')];
  const tablist = document.querySelector('[role=tablist]');
  const roleGroup = $('role-switch');
  const source = resolveBase(location.search);
  const fetchText = makeFetchText(source.base);
  const storage = safeStorage();
  let sheetStore = loadSheets(storage), upload = null, sheetRead = 0;
  let model = null;
  let data = null;      // loadData() output, kept so a policy change can rebuild the model without a reload
  let refModel = null;  // buildModel(data, STARK_REFERENCE), once per data load: the impact panel's baseline
  // Policy state (issue 109, decisions 106-110): draft > shared > saved active > reference (resolvePolicy).
  let store = loadStore(storage);  // { active, policies } from sqc:policies
  let shared = null;               // decoded from the hash `policy` token, or null
  let sharedError = null;          // the refusal message for a bad token
  let sharedToken = null;          // the token last decoded (null: none yet), so a render decodes only a new one
  let draft = null;                // the editor's unsaved policy, possibly invalid
  let draftStart = null;           // the draft before any edit, for "Unsaved changes discarded"
  let draftNew = false;            // the draft saves as a new policy (forked from the reference or + New policy)
  let lastValid = null;            // the draft's last form the engine accepted: what applies while a draft exists
  let resolved = resolvePolicy({ saved: activePolicy(store) });
  let modelPolicy = null;          // the policy object `model` was built with
  const ui = { error: null, raw: {}, note: null, status: null, saveNote: null, actionError: null, importError: null, confirm: null, share: null };
  let stdAlerted = new Set();      // Standards role=alert texts already announced (UIS-FR-05: first appearance only)
  let stdFocus = null;             // a Standards control to focus after the next render
  const announced = new Set();  // 'view|key=value|supplier' screens whose alerts were already announced (decisions 11, 28)
  let route;            // the resolved route of the last render: { view, role, params, notFound }
  let lastView = null;  // view of the last render; null until the first one
  let chartTable = false;     // Monitor "Show as table": local UI state, not in the hash (decision 71)
  let lastMonthKey = null;    // 'ACT-03|9' once that month's point got focus, so re-renders don't steal focus (UIM-FR-11)
  let lastDetailKey = null;   // 'ACT-02' once its detail was brought into view, so re-renders don't steal focus (issue 163)
  // + New supplier (issue 77, decisions 160-171): the open entry lives in memory only, while the hash has new=1.
  let entry = null;
  const manualUi = { saveNote: null, importError: null, confirm: null, entryError: null };
  let entryFocus = null;      // a Qualify selector to focus after the next render

  if (source.overridden) {
    $('dev-note').textContent = `Local dev data: ${source.path}`;
    $('dev-note').hidden = false;
  }

  // The single render path: hashchange, boot, and once after data loads. Clicks only set location.hash.
  function render() {
    const parsed = parseHash(location.hash);
    const canon = formatHash({ view: parsed.view, role: parsed.role, ...parsed.params });
    // Normalize a hand-typed or stale hash in place: replace, never push, and replaceState fires no hashchange.
    if (location.hash !== '' && location.hash !== '#' && location.hash !== canon) history.replaceState(null, '', canon);
    const prevSupplier = route?.params.supplier;
    const prevFilter = route?.params.filter;
    const prevActive = route?.params.active;
    syncShared(parsed.params.policy);
    route = resolveRoute(parsed, model);
    syncEntry();
    const { policy } = route.params;
    const keepFocus = tablist.contains(document.activeElement) || roleGroup.contains(document.activeElement);
    const first = lastView === null;
    const moved = !first && route.view !== lastView;
    lastView = route.view;
    const queueFocus = !moved && route.view === 'qualify' ? queueFocusOf(document.activeElement, prevSupplier) : null;
    const monitorFocus = !moved && route.view === 'monitor' ? monitorFocusOf(document.activeElement, prevActive) : null;
    const standardsFocus = !moved && route.view === 'standards' ? standardsFocusOf(document.activeElement) : null;
    const linkFocus = !moved ? linkFocusOf(document.activeElement) : null;
    if (moved || route.params.active !== prevActive) chartTable = false;  // another supplier or view starts on the chart

    const chipEl = $('policy-chip');
    chipEl.className = `policy-chip ${chipView(resolved).tone}`;
    chipEl.dataset.kind = resolved.kind;
    chipEl.innerHTML = chip(resolved);
    chipEl.href = formatHash({ view: 'standards', role: route.role, policy });
    $('brand').href = formatHash({ view: 'today', role: route.role, policy });

    const hadFocus = roleGroup.contains(document.activeElement);
    roleGroup.innerHTML = roleSwitch(route.role);
    if (hadFocus) roleGroup.querySelector('[aria-checked=true]').focus();

    for (const t of tabs) {
      const on = t.dataset.view === route.view;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    }
    // Re-rendering Qualify in place resets the tablet card row's scroll to 0; keep it (#39 review F1).
    // Same view and same filter only: a filter change shows a new card set, which starts at its first card.
    const cardsScroll = !moved && route.view === 'qualify' && route.params.filter === prevFilter ? $('view-qualify').querySelector('.queue-cards')?.scrollLeft ?? null : null;
    for (const v of VIEWS) {
      const panel = $(`view-${v.meta.name}`);
      const on = v.meta.name === route.view;
      panel.hidden = !on;
      // Standards lists uploaded sheets; Qualify's + New supplier part picker offers them too (issue 77, issue 78).
      const viewModel = ['standards', 'qualify'].includes(v.meta.name) ? uploadModel(model, sheetStore) : model;
      panel.innerHTML = on ? v.render(viewModel, { role: route.role, params: route.params, notFound: route.notFound, chartTable, standards: standardsState(), ...qualifyState() }) : '';
      // role=alert announces on first render only (DESIGN-SPEC §7): once per view, not-found ID and selected
      // supplier (and Compare part, whose Not found comes from the view, issue 108), so a new unknown ID or a newly
      // opened knockout banner is announced; tab switches stay quiet.
      const seen = announcementKey(v.meta.name, route);
      // Standards announces each alert text on its first appearance instead (UIS-FR-05, issue 109): its errors change with edits.
      if (on && v.meta.name === 'standards') stdAlerted = markAlerts(panel, stdAlerted);
      else if (on && announced.has(seen)) panel.querySelectorAll('[role=alert]').forEach((el) => el.removeAttribute('role'));
      if (on && model) announced.add(seen);
      if (on) document.title = `${v.meta.title} · Supplier Quality Copilot`;
      // Back/Forward or a link changed the view: move focus to the content (DESIGN-SPEC §8). Tab clicks keep it on the tab.
      if (on && moved && !keepFocus) {
        $('main').focus({ preventScroll: true });
        $('announce').textContent = `Showing ${v.meta.title}`;
      }
    }
    if (cardsScroll) { const row = $('view-qualify').querySelector('.queue-cards'); if (row) row.scrollLeft = cardsScroll; }
    if (queueFocus) restoreQueueFocus(queueFocus);
    if (route.view === 'qualify' && entryFocus) {
      const el = $('view-qualify').querySelector(entryFocus);
      el?.focus({ preventScroll: true });
      // A refused Save or a Save/Cancel can land focus off-screen; scroll only then, so select changes don't jump.
      revealEntryFocus(el, window, entryFocusClearance(el));
    }
    entryFocus = null;
    if (monitorFocus) restoreMonitorFocus(monitorFocus);
    // A newly opened Monitor supplier (deep link, row click, Back/Forward to another ID) focuses its detail heading and
    // scrolls the detail to the top, once per ID (issue 163, decisions 243-244). Order matters: after
    // restoreMonitorFocus, so the heading wins over the row link; before the month block, which keeps the last word.
    const dKey = monitorDetailKey(route, model);
    if (dKey === null) lastDetailKey = null;
    else if (dKey !== lastDetailKey) {
      lastDetailKey = dKey;
      // An explicit month still focuses its chart point (decision 77); a tab click keeps focus on the tab.
      if (!keepFocus && !route.params.month) {
        const h = $('view-monitor').querySelector('#detail-title');
        h?.focus({ preventScroll: true });
        // Scroll the whole detail section, not the heading, so ← Table and the tier sit below the sticky shell bar.
        (h?.closest('.monitor-detail') ?? h)?.scrollIntoView?.(detailScrollOptions(matchMedia('(prefers-reduced-motion: reduce)').matches));
      }
    }
    if (linkFocus) {
      const panel = $(`view-${route.view}`);
      const a = [...panel.querySelectorAll(`${linkFocus.sel} a[href]`)].find((x) => x.getAttribute('href') === linkFocus.href);
      (a ?? $('main')).focus({ preventScroll: true });
    }
    if (route.view === 'standards' && (stdFocus || standardsFocus)) restoreStandardsFocus(stdFocus ?? standardsFocus);
    stdFocus = null;
    // `month` focuses its chart point (its table row in table mode) on load, Back and Forward; an explicit month wins
    // over the restore above. Set only after a focus succeeds, so the loading render doesn't consume it (decision 77).
    const { active, month } = route.params;
    const mKey = route.view === 'monitor' && model && !route.notFound && active && month ? `${active}|${month}` : null;
    if (mKey === null) lastMonthKey = null;
    else if (mKey !== lastMonthKey && focusMonth(month)) lastMonthKey = mKey;
    // A row click, Back or Forward opened or closed a supplier (decision 67). Not found announces itself (role=alert).
    if (!first && !moved && route.view === 'monitor' && route.params.active !== prevActive && !route.notFound) {
      $('announce').textContent = route.params.active ? `Showing ${route.params.active} detail` : 'Showing the tier table';
    }
    syncViewer();
  }

  // Citation viewer (#42, decisions 41-49). The hash is its state: `doc`/`sec` open it, closing pushes a hash
  // without them. The <dialog> sits outside the panels, so a re-render never destroys it or its scroll.
  const dialog = $('viewer');
  const sheet = $('viewer-body');
  const cache = new Map();  // packet path -> text; successes only, so a failed file is retried on reopen (decision 46)
  let shown = null;         // 'path#sec' on screen, or null when closed
  let trigger = null;       // { rowId, doc, sec } of the citation link that opened it (decision 49)
  const eyebrow = ({ view, params: p }) => `Supplier document · ${p.supplier}${view === 'eval' ? ` · world ${p.world}` : ''}${p.sec ? ` · cited §${p.sec}` : ''}`;

  function syncViewer() {
    if (!model) return;  // "Not found" is only known once the model loads (decision 45)
    const dir = packetDir(route);
    const { doc, sec } = route.params;
    const rel = dir && doc ? packetPath(dir, doc) : null;
    // Eval (issue 111, decision 142): world + supplier with no doc is a miss with no expected citation: the file list.
    const list = !rel && dir && !doc && route.view === 'eval';
    if (!rel && !list) {
      if (shown !== null) { shown = null; if (dialog.open) dialog.close(); restoreCitationFocus(); }
      return;
    }
    const key = list ? `${dir}#files` : `${rel}#${sec ?? ''}`;
    if (key === shown) return;
    shown = key;
    // A link inside the sheet (the file list) is about to be replaced: keep focus in the dialog, on Close.
    const refocus = dialog.open && sheet.contains(document.activeElement);
    $('viewer-title').textContent = list ? 'Packet files' : doc;
    $('viewer-eyebrow').textContent = eyebrow(route);
    $('viewer-note').hidden = true;  // issue 163: every open starts with no note; only a rounded packet shows it
    if (!dialog.open) { dialog.showModal(); $('viewer-close').focus(); }
    if (list) {
      sheet.scrollTop = 0;
      sheet.innerHTML = fileListBody((d) => formatHash({ view: route.view, role: route.role, ...route.params, doc: d }));
    } else showPacket(key, rel, doc, sec);
    if (refocus) $('viewer-close').focus();
  }

  async function showPacket(key, rel, doc, sec) {
    const path = source.label + rel;
    const fill = (state) => {
      sheet.scrollTop = 0; sheet.innerHTML = sheetBody({ path, doc, sec, ...state });
      // In the header, not the scroller, so it stays visible when the cited section is scrolled to the top (issue 163).
      const note = $('viewer-note'); note.hidden = !(state.rounded > 0); note.textContent = note.hidden ? '' : ROUND_NOTE;
    };
    let text = cache.get(rel);
    if (text === undefined) {
      fill({ status: 'loading' });
      try {
        text = await fetchText(rel);
      } catch (e) {
        if (shown === key) fill(e.message === 'HTTP 404' ? { status: 'missing' } : { status: 'error', message: e.message });
        return;
      }
      cache.set(rel, text);
      if (shown !== key) return;  // Back, another citation or close happened during the fetch: drop it
    }
    fill({ status: 'ready', ...renderPacket(text, sec) });
    // Scroll only the sheet body: scrollIntoView would also scroll the <dialog> and hide the cited heading (#42 D1).
    const cited = sheet.querySelector('[data-cited]');
    if (cited) sheet.scrollTop += cited.getBoundingClientRect().top - sheet.getBoundingClientRect().top;
  }

  function closeViewer() {
    const { doc, sec, ...rest } = route.params;
    if (route.view === 'eval') { delete rest.world; delete rest.supplier; }  // back to the Eval page (decision 142)
    const hash = formatHash({ view: route.view, role: route.role, ...rest });
    if (hash !== location.hash) location.hash = hash;  // push: Back reopens the viewer (decision 42)
  }

  // The panel was re-rendered, so find the clicked link again by its row and doc/sec; else go to the content.
  function restoreCitationFocus() {
    const t = trigger;
    trigger = null;
    const links = t?.rowId ? [...document.querySelectorAll(`#view-${route.view} tr[data-id="${CSS.escape(t.rowId)}"] a[data-citation]`)] : [];
    const link = links.find((a) => { const p = parseHash(a.getAttribute('href')).params; return p.doc === t.doc && p.sec === t.sec; }) ?? links[0];
    link?.closest('details:not([open])')?.setAttribute('open', '');  // its category closed on re-render (decision 39)
    link?.focus({ preventScroll: true });
    if (!link || document.activeElement !== link) $('main').focus({ preventScroll: true });
  }

  $('viewer-close').addEventListener('click', closeViewer);
  dialog.addEventListener('click', (e) => { if (e.target === dialog) closeViewer(); });  // the scrim: no padding, children fill the sheet
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); closeViewer(); });       // Escape
  // Chrome closes without `cancel` on a repeated Escape; keep the hash in step.
  // syncViewer clears `shown` before it closes the dialog itself, so this only reacts to a browser-initiated close
  // and never pushes a second history entry (#42 D2, decision 45).
  dialog.addEventListener('close', () => {
    const h = parseHash(location.hash);
    if (shown !== null && !dialog.open && (h.params.doc || (h.view === 'eval' && packetDir(h)))) closeViewer();
  });
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[data-citation]');
    // A modified or non-primary click opens a new tab, not the viewer, so it must not become the focus target (review F1).
    if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.closest('#viewer')) return;  // a link in the Eval file list: the miss row that opened the viewer keeps focus on close
    const { doc, sec } = parseHash(a.getAttribute('href')).params;
    trigger = { rowId: a.closest('tr')?.dataset.id ?? null, doc, sec };
  }, true);

  // Qualify re-renders replace the panel's HTML, so note what had focus and put it back (decision 18).
  function queueFocusOf(el, prevSupplier) {
    if (!el || !$('view-qualify').contains(el)) return null;
    if (el.matches('[data-queue-card]')) return { card: el.dataset.id };
    if (el.matches('[data-filter]')) return { filter: el.dataset.filter };
    if (el.matches('[data-back]') && prevSupplier) return { card: prevSupplier };
    // Focus follows the selected tab, so Back/Forward never leave focus on an unselected tab (#40 review F1).
    if (el.matches('[data-detail-tab]')) return { tab: true };
    return null;
  }
  function restoreQueueFocus({ card, filter, tab }) {
    const panel = $('view-qualify');
    const el = card !== undefined ? panel.querySelector(`[data-queue-card][data-id="${CSS.escape(card)}"]`)
      : tab ? panel.querySelector('[data-detail-tab][aria-selected="true"]')
        : panel.querySelector(`.pills [data-filter="${CSS.escape(filter)}"]`);
    // Missing, or hidden because the phone layout swapped the queue for the detail: go to the detail heading.
    const target = el && el.offsetParent !== null ? el
      : panel.querySelector('#detail-title') ?? panel.querySelector('[data-queue-card][tabindex="0"]');
    if (!target) return;
    if (target.matches('[data-queue-card]')) {
      for (const c of panel.querySelectorAll('[data-queue-card]')) c.tabIndex = c === target ? 0 : -1;
    }
    target.focus({ preventScroll: true });
    // Bring a card that keyboard selection moved off-screen into the row's view (tablet scroller).
    target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  // Same-view link lists that re-render in place (Eval runs, Compare parts, issue 46): find the focused link again by href.
  const LINK_LISTS = { 'view-eval': '.eval-runs', 'view-compare': '.compare-parts' };
  function linkFocusOf(el) {
    const sel = LINK_LISTS[el?.closest?.('.view')?.id];
    const a = el?.closest?.('a[href]');
    return sel && a?.closest(sel) ? { sel, href: a.getAttribute('href') } : null;
  }

  // Monitor re-renders replace the table, so put focus back on the row's ID link (decision 67). ← Table returns to the
  // row that was open. Hidden (phone: the detail replaced the table): the detail heading. A chart point goes back to
  // the chart's tab stop and the table toggle to the toggle (#45); an alert link is left to the `month` rule.
  function monitorFocusOf(el, prevActive) {
    if (!el || !$('view-monitor').contains(el)) return null;
    if (el.matches('[data-monitor-link]')) return { id: el.dataset.id };
    if (el.matches('.back-link')) return prevActive ? { id: prevActive } : null;
    if (el.matches('.pt')) return { point: true };
    if (el.id === 'detail-title') return { heading: true, id: prevActive };  // issue 163: heading if still open, else the row
    if (el.matches('[data-pchart-toggle]')) return { toggle: true };
    // A focused table row or alert link is gone after a re-render: land on the nearest stable control (#45 test note).
    if (el.closest('.pchart-table')) return { toggle: true };
    if (el.matches('[data-alert-link]')) return { point: true };
    return null;
  }
  function restoreMonitorFocus({ id, point, toggle, heading }) {
    const panel = $('view-monitor');
    const title = heading ? panel.querySelector('#detail-title') : null;
    if (title) { title.focus({ preventScroll: true }); return; }
    const el = id !== undefined ? panel.querySelector(`[data-monitor-link][data-id="${CSS.escape(id)}"]`)
      : toggle ? panel.querySelector('[data-pchart-toggle]')
        : point ? panel.querySelector('.pt[tabindex="0"]') : null;
    // offsetParent is undefined on SVG elements, which are never hidden by the phone layout.
    const target = el && el.offsetParent !== null ? el : panel.querySelector('#detail-title');
    target?.focus({ preventScroll: true });
  }
  // Focus the point for a month (it becomes the chart's tab stop), or that month's row in table mode.
  function focusMonth(month) {
    const panel = $('view-monitor');
    const el = panel.querySelector(`.pt[data-index="${month}"]`) ?? panel.querySelector(`.pchart-table tr.selected[data-index="${month}"]`);
    if (!el) return false;
    if (el.matches('.pt')) for (const p of panel.querySelectorAll('.pt')) p.tabIndex = p === el ? 0 : -1;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return true;
  }

  // A tab click keeps role and policy and resets the view's own keys.
  const openView = (view) => { location.hash = formatHash({ view, role: route.role, policy: route.params.policy }); };
  const setRole = (role) => {
    if (role === route.role) return;
    location.hash = formatHash({ view: route.view, role, ...route.params });
    $('announce').textContent = `Viewing as ${role === 'junior' ? 'Junior' : 'Senior'}`;
  };

  // The skip link must not change the hash (that would re-route to Today).
  document.querySelector('.skip-link').addEventListener('click', (e) => { e.preventDefault(); $('main').focus(); });

  tablist.addEventListener('click', (e) => {
    const tab = e.target.closest('[role=tab]');
    if (tab) openView(tab.dataset.view);
  });
  tablist.addEventListener('keydown', (e) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const n = tabs.length;
    const next = { ArrowRight: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    tabs[next].focus();
    openView(tabs[next].dataset.view);
  });

  roleGroup.addEventListener('click', (e) => {
    const radio = e.target.closest('[role=radio]');
    if (radio) setRole(radio.dataset.role);
  });
  roleGroup.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    setRole(route.role === 'junior' ? 'senior' : 'junior');
  });

  // View links (queue cards, filter pills, Show all) carry their hash in data-href; the hashchange renders.
  const main = $('main');
  main.addEventListener('click', (e) => {
    const el = e.target.closest('[data-href]');
    const a = e.target.closest('a[href]');
    // A real link inside a clickable row (Monitor ID) handles itself, so a Meta/Shift/middle click opens only the
    // new tab and the row handler doesn't also navigate this page.
    if (a && el?.contains(a)) return;
    if (el && el.dataset.href !== location.hash) location.hash = el.dataset.href;
  });
  // Drafts Copy (#43, decision 54). The text comes from the model, not the DOM, so there is one definition of it.
  // Copy changes no hash, so nothing re-renders and the status span keeps its message. No execCommand.
  const copyTimers = new WeakMap();
  main.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-copy]');
    const c = btn && model?.candidates.find((x) => x.id === route.params.supplier);
    if (c?.status !== 'scored') return;
    const text = copyPayload(draftsModel(c.evaluation, c.drafts), btn.dataset.copy);
    if (text === null) return;
    const status = btn.closest('section').querySelector('.copy-status');
    const copied = await copyWithFallback(text, {
      write: (value) => navigator.clipboard.writeText(value),
      current: () => btn.isConnected,
      select: () => {
        const target = $(btn.dataset.copyTarget);
        if (target) getSelection().selectAllChildren(target);
      },
    });
    if (copied === 'stale') return;
    const msg = copied === 'copied' ? 'Copied' : 'Select the text to copy';
    // Blank first, then write, so a repeat click is announced again; clear after 3 s.
    clearTimeout(copyTimers.get(status));
    status.textContent = '';
    copyTimers.set(status, setTimeout(() => {
      status.textContent = msg;
      copyTimers.set(status, setTimeout(() => { status.textContent = ''; }, 3000));
    }, 0));
  });
  // Detail sub-tabs (UIQ-FR-14, decision 30): automatic activation like the view tabs. Arrows wrap, Home/End;
  // focus moves to the target tab, then the hash; render() puts focus back on it after the re-render.
  main.addEventListener('keydown', (e) => {
    const tab = e.target.closest('[data-detail-tab]');
    if (!tab || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const list = [...tab.parentElement.querySelectorAll('[data-detail-tab]')];
    const i = list.indexOf(tab);
    const n = list.length;
    const next = { ArrowRight: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    list[next].focus();
    if (list[next].dataset.href !== location.hash) location.hash = list[next].dataset.href;
  });
  // Queue cards: roving tabindex. Arrows and Home/End move focus only; Enter/Space select (native button).
  main.addEventListener('keydown', (e) => {
    const card = e.target.closest('[data-queue-card]');
    if (!card || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;  // Alt/Cmd+Arrow is browser Back
    const cards = [...card.parentElement.querySelectorAll('[data-queue-card]')];
    const i = cards.indexOf(card);
    const next = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: cards.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const to = cards[Math.max(0, Math.min(cards.length - 1, next))];
    card.tabIndex = -1;
    to.tabIndex = 0;
    to.focus();
  });

  // p-chart (#45; UIM-FR-07, decision 78): roving tabindex over the points. Arrows and Home/End move focus only (clamp,
  // no wrap); Enter or Space selects the month (pushes `month`); a click goes through the data-href handler above.
  main.addEventListener('keydown', (e) => {
    const pt = e.target.closest?.('.pt');
    if (!pt || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;  // Alt/Cmd+Arrow is browser Back
    if (e.key === 'Escape') { hideTip(); return; }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (pt.dataset.href !== location.hash) location.hash = pt.dataset.href;
      return;
    }
    const pts = [...pt.ownerSVGElement.querySelectorAll('.pt')];
    const i = pts.indexOf(pt);
    const next = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: pts.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const to = pts[Math.max(0, Math.min(pts.length - 1, next))];
    pt.tabIndex = -1;
    to.tabIndex = 0;
    to.focus({ preventScroll: true });
    to.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  // Point tooltip: month, n, p, UCL on focus or hover; hidden from AT (the aria-label says the same), Escape hides it.
  // Focus also scrolls the tip into view: at phone widths the chart scroller would otherwise cut its side off.
  function showTip(pt, reveal = false) {
    const tip = pt.closest('.pchart-plot')?.querySelector('.pchart-tip');
    if (!tip) return;
    tip.textContent = pt.dataset.tip;
    tip.className = `pchart-tip ${pt.dataset.edge}`.trim();
    tip.style.left = `${pt.dataset.left}%`;
    tip.style.top = `${pt.dataset.top}%`;
    tip.hidden = false;
    if (reveal) tip.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function hideTip() { for (const t of main.querySelectorAll('.pchart-tip')) t.hidden = true; }
  main.addEventListener('focusin', (e) => { const pt = e.target.closest?.('.pt'); if (pt) showTip(pt, true); });
  main.addEventListener('mouseover', (e) => { const pt = e.target.closest?.('.pt'); if (pt) showTip(pt); });
  main.addEventListener('focusout', (e) => { if (e.target.closest?.('.pt')) hideTip(); });
  main.addEventListener('mouseout', (e) => { if (e.target.closest?.('.pt')) hideTip(); });
  // "Show as table" / "Show as chart": local state, re-render without a hash write, focus back on the toggle.
  main.addEventListener('click', (e) => {
    if (!e.target.closest('[data-pchart-toggle]')) return;
    chartTable = !chartTable;
    render();
    $('view-monitor').querySelector('[data-pchart-toggle]')?.focus();
  });
  // An alert link to the month already in the hash fires no hashchange: focus its point here instead.
  main.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-alert-link]');
    if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.getAttribute('href') !== location.hash) return;
    e.preventDefault();
    focusMonth(Number(a.dataset.index));
  });

  // ---- Standards: scoring policy editor (issue 109; PRD-12 UIS-FR-01..10, decisions 105-121) ----

  // A new `policy` token in the hash: decode it (never written to storage). An unsaved draft is dropped, since the
  // policy under it changed. Called by render() only; it does not render or touch location.hash, so it can't loop.
  function syncShared(token) {
    if (token === sharedToken) return;
    sharedToken = token;
    const r = token === undefined ? null : decodePolicy(token);
    shared = r?.ok ? r.policy : null;
    sharedError = r && !r.ok ? r.error : null;
    clearDraft();
    refreshPolicy();
  }

  // Recompute the effective policy; rebuild the model only when it changed (every view re-renders from it).
  function refreshPolicy() {
    resolved = resolvePolicy({ draft: draft ? lastValid : null, shared, saved: activePolicy(store) });
    if (data && resolved.policy !== modelPolicy) {
      modelPolicy = resolved.policy;
      model = modelPolicy === STARK_REFERENCE ? refModel : buildModel(data, modelPolicy);
    }
  }
  const applyPolicy = () => { refreshPolicy(); render(); };

  function standardsState() {
    return { store, shared, sharedError, draft, resolved, refModel, ui, upload };
  }

  function clearDraft() {
    draft = null; draftStart = null; draftNew = false; lastValid = null;
    ui.error = null; ui.raw = {};
  }
  // Drop the draft; say so when it held edits (decision 118: no confirmation for a never-saved draft).
  function discardDraft() {
    const edited = draft && JSON.stringify(draft) !== JSON.stringify(draftStart);
    clearDraft();
    if (edited) say('Unsaved changes discarded', 'note');
  }
  const resetNotes = () => { ui.note = null; ui.status = null; ui.actionError = null; ui.importError = null; ui.share = null; ui.confirm = null; };

  // A status line in the panel, also announced through the shell's live region (the panel's own is re-rendered).
  function say(msg, slot = 'status') {
    ui[slot] = msg;
    $('announce').textContent = msg;
  }

  // Drop the shared token from the hash (push, so Back brings the link back) and forget the shared policy now.
  function dropToken() {
    shared = null; sharedError = null; sharedToken = undefined;
    const { policy, ...rest } = route.params;
    if (policy !== undefined) location.hash = formatHash({ view: route.view, role: route.role, ...rest });
  }

  function persist() {
    ui.saveNote = writeStore(storage, store) ? null : "Can't save in this browser";
  }

  // The base of a new draft: the effective policy. The reference is forked with an empty name (decision 113).
  function startDraft({ asNew = false } = {}) {
    const fork = asNew || resolved.kind === 'reference';
    const base = JSON.parse(JSON.stringify(resolved.policy));
    lastValid = resolved.policy;
    draftNew = fork;
    draftStart = fork ? { ...base, id: 'draft', name: '' } : base;
    return draftStart;
  }

  // Every edit: a new draft, checked by the engine; the last valid form stays in effect while it is invalid (UIS-FR-05).
  function edit(change) {
    resetNotes();
    draft = change(draft ?? startDraft());
    ui.error = checkPolicy(livePolicy(draft));
    if (!ui.error) lastValid = livePolicy(draft);
    applyPolicy();
  }

  const currentKey = () => checkedKey(store, shared);
  const idOfKey = (key) => store.policies.find((p) => savedKey(p.id) === key)?.id ?? null;

  // An open requirement sheet (issue 110) closes to the editor, keeping role and the policy token; true when it navigated.
  // route.params loses sheet now so a dropToken() in the same click doesn't push it back.
  function closeSheet() {
    const { sheet, ...rest } = route.params;
    if (sheet === undefined) return false;
    route = { ...route, params: rest };
    location.hash = formatHash({ view: route.view, role: route.role, ...rest });
    return true;
  }

  function selectPolicy(key) {
    // The checked row only closes the sheet: reading a sheet never discards the draft (decision 133).
    if (closeSheet() && key === currentKey()) return;
    if (key === currentKey() && !draft) return;
    resetNotes();
    discardDraft();
    if (key !== SHARED_KEY) {
      store = { ...store, active: key === REF_KEY ? null : idOfKey(key) };
      persist();
      dropToken();
    }
    stdFocus = { act: 'select', key };
    applyPolicy();
  }

  // Save (UIS-FR-06, decision 112): a name is required; a saved base keeps its id at version + 1, anything else
  // (reference fork, + New policy, shared link) gets a new id at version 1. Becomes active; the hash token is dropped.
  function save() {
    resetNotes();
    const source = draft ?? (resolved.kind === 'reference' ? startDraft() : resolved.policy);
    const candidate = { ...source, name: String(source.name ?? '').trim() };
    const err = checkPolicy(candidate);
    if (err) {
      if (!draft && resolved.kind === 'reference') clearDraft();
      ui.error = err;
      stdFocus = { act: 'save' };
      render();
      return;
    }
    const asNew = draftNew || shared !== null || !activePolicy(store);
    const r = saveToList(store.policies, candidate, { asNew });
    store = { active: r.policy.id, policies: r.list };
    clearDraft();
    persist();
    dropToken();
    say(`Saved ${policyLabel(r.policy)}`);
    stdFocus = { act: 'save' };
    applyPolicy();
  }

  // The effective policy for Share and Export, or null (refused) while the draft is invalid.
  function shareable(verb) {
    if (draft && ui.error) { ui.actionError = `Can't ${verb}: ${plainPolicyError(ui.error)}`; render(); return null; }  // issue 162: plain sentence
    return resolved.policy;
  }

  async function share() {
    resetNotes();
    const p = shareable('share');
    if (!p) return;
    const link = location.origin + location.pathname + location.search + formatHash({ view: route.view, role: route.role, policy: p.id === RESERVED_ID ? undefined : encodePolicy(p) });
    ui.share = link;
    stdFocus = { act: 'share' };
    render();
    // decision 129: a reference link carries no policy, so the receiver sees their own active one.
    let msg = p.id === RESERVED_ID ? "Link copied. It carries no policy: the receiver sees their own active policy" : 'Link copied';
    const copied = await copyWithFallback(link, {
      write: (value) => navigator.clipboard.writeText(value),
      select: () => {
        const el = $('std-share-link');
        if (el) getSelection().selectAllChildren(el);
      },
    });
    if (copied !== 'copied') msg = p.id === RESERVED_ID ? 'Select the link to copy it. It carries no policy: the receiver sees their own active policy' : 'Select the link to copy it';
    ui.status = msg;
    $('announce').textContent = msg;
    const status = $('view-standards').querySelector('.std-status');
    if (status) status.textContent = msg;  // no re-render: it would drop the selection
  }

  function exportFile() {
    resetNotes();
    const p = shareable('export');
    if (!p) return;
    const { filename, text } = exportPolicy(p);
    download(filename, text);
    say(`Exported ${filename}`);
    render();
  }

  function download(filename, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  // A detached file input: it survives the panel's re-renders while the picker is open.
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json,application/json';
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    resetNotes();
    const r = importPolicy(await file.text(), store.policies);
    stdFocus = { act: 'import' };
    if (!r.ok) { ui.importError = r.error; render(); return; }
    clearDraft();
    store = { active: r.policy.id, policies: r.list };
    persist();
    dropToken();
    say(`Imported ${policyLabel(r.policy)}`);
    applyPolicy();
  });

  function confirmDelete(key) {
    const id = idOfKey(key);
    const p = store.policies.find((x) => x.id === id);
    resetNotes();
    if (!p) { render(); return; }
    const wasActive = store.active === id;
    store = { active: wasActive ? null : store.active, policies: removeFromList(store.policies, id) };
    if (wasActive) { clearDraft(); dropToken(); }
    persist();
    say(`Deleted ${policyLabel(p)}`);
    stdFocus = { act: 'select', key: currentKey() };
    applyPolicy();
  }

  function reset() {
    resetNotes();
    discardDraft();
    store = { ...store, active: null };
    persist();
    dropToken();
    stdFocus = { act: 'reset' };
    applyPolicy();
  }

  // Note the focused Standards control by its data-field / data-act (+ data-key) and caret, to find it after a re-render.
  function standardsFocusOf(el) {
    if (!el || !$('view-standards').contains(el)) return null;
    // A sheet link or "← Policy editor" (issue 110): plain links that the render they cause replaces.
    if (el.tagName === 'A') return { link: true };
    const { field, act, key } = el.dataset;
    if (!field && !act) return null;
    return { field, act, key, sel: el.type === 'text' ? el.selectionStart : null };
  }
  function restoreStandardsFocus({ field, act, key, sel, link }) {
    const panel = $('view-standards');
    const q = link ? '.std-sheet-link[aria-current="page"]'
      : (field ? `[data-field="${CSS.escape(field)}"]` : `[data-act="${CSS.escape(act)}"]`) + (key ? `[data-key="${CSS.escape(key)}"]` : '');
    const visible = (sel2) => [...panel.querySelectorAll(sel2)].find((el) => el.offsetParent !== null);
    // Gone (a deleted row) or hidden (the phone layout's select replaces the list): the active policy control.
    const el = visible(q) ?? visible('.std-radio[aria-checked="true"]') ?? visible('[data-act="select-policy"]');
    if (!el) return;
    el.focus({ preventScroll: true });
    if (sel !== null && sel !== undefined && el.type === 'text') el.setSelectionRange(sel, sel);
  }

  // role=alert only for a text that wasn't on screen in the last Standards render.
  function markAlerts(panel, before) {
    const now = new Set();
    for (const el of panel.querySelectorAll('[role=alert]')) {
      const t = el.textContent;
      if (before.has(t)) el.removeAttribute('role');
      now.add(t);
    }
    return now;
  }

  const std = $('view-standards');
  // Requirement-sheet handlers (issue 78): separate state/store; never rebuild demo scores from uploads.
  const sheetInput = document.createElement('input');
  sheetInput.type = 'file'; sheetInput.id = 'sheet-upload-file'; sheetInput.hidden = true;
  sheetInput.accept = '.json,.csv,.md,.markdown,application/json,text/csv,text/markdown';
  document.body.append(sheetInput);
  const sheetTypes = () => Object.fromEntries(previewFields(upload?.sheet).map(f => [JSON.stringify(f.path), typeof f.value]));
  const focusUpload = selector => [...$('view-standards').querySelectorAll(selector)].find(el => el.offsetParent !== null)?.focus();
  const sheetPersist = () => { say(writeSheets(storage, sheetStore) ? 'Sheet saved in this browser' : "Can't save in this browser. Sheet changes apply for this session only.", 'note'); };
  sheetInput.addEventListener('change', async () => {
    const file = sheetInput.files?.[0], sequence = ++sheetRead; sheetInput.value = '';
    if (!file) return;
    let result;
    try {
      const kind = file.type === 'application/pdf' ? 'pdf' : file.name.split('.').at(-1).toLowerCase();
      result = importSheet(kind === 'pdf' ? '' : await file.text(), kind);
    } catch { result = { sheet: null, unmatched: [], error: 'The file could not be read. Try JSON, CSV or Markdown.' }; }
    if (sequence !== sheetRead) return;
    upload = { ...result, filename: file.name, reviewed: false };
    upload.types = sheetTypes(); ui.sheetDelete = false;
    render(); focusUpload('[data-sheet-path], [data-act="sheet-cancel"]');
  });
  std.addEventListener('input', e => {
    if (e.target.dataset.sheetPath && upload?.sheet) {
      const path = JSON.parse(e.target.dataset.sheetPath);
      upload.sheet = editPreview(upload.sheet, path, e.target.value, upload.types[e.target.dataset.sheetPath]);
      const json = $('sheet-json'); if (json) json.value = JSON.stringify(upload.sheet, null, 2);
    }
    if (e.target.hasAttribute('data-sheet-reviewed') && upload) upload.reviewed = e.target.checked;
  });
  std.addEventListener('click', e => {
    const button = e.target.closest('button[data-act^="sheet-"]'); if (!button) return;
    const act = button.dataset.act, part = route.params.sheet;
    const selected = sheetStore.find(s => s.part_no === part);
    if (act === 'sheet-upload') { sheetInput.click(); return; }
    if (act === 'sheet-cancel') { sheetRead++; upload = null; render(); focusUpload('[data-act="sheet-upload"]'); return; }
    if (act === 'sheet-apply-json' && upload) {
      upload = applyPreviewJson(upload, $('sheet-json').value); upload.types = sheetTypes();
      render(); focusUpload('[data-act="sheet-apply-json"]'); return;
    }
    if (act === 'sheet-save' && upload) {
      const result = savePreview(upload, sheetStore, model?.sheets ?? {});
      if (result.error) { upload.error = result.error; render(); focusUpload('[data-act="sheet-save"]'); return; }
      sheetStore = result.sheets; upload = null; sheetPersist();
      location.hash = formatHash({ view: 'standards', role: route.role, policy: route.params.policy, sheet: result.sheet.part_no });
      render(); focusUpload('.std-sheet-link[aria-current="page"], [data-act="select-sheet"]'); return;
    }
    if (act === 'sheet-export' && selected) {
      const file = exportSheet(selected), url = URL.createObjectURL(new Blob([file.text], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = file.filename; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0); say('Exported ' + file.filename, 'note'); render(); focusUpload('[data-act="sheet-export"]'); return;
    }
    if (act === 'sheet-delete' && selected) { ui.sheetDelete = part; render(); focusUpload('[data-act="sheet-keep"]'); return; }
    if (act === 'sheet-keep') { ui.sheetDelete = false; render(); focusUpload('[data-act="sheet-delete"]'); return; }
    if (act === 'sheet-confirm-delete' && selected && ui.sheetDelete === part) {
      sheetStore = sheetStore.filter(s => s.part_no !== part); ui.sheetDelete = false; sheetPersist(); closeSheet(); render(); focusUpload('[data-act="sheet-upload"]');
    }
  });
  std.addEventListener('keydown', e => {
    if (e.key === 'Escape' && (upload || ui.sheetDelete)) {
      e.preventDefault(); sheetRead++; upload = null; ui.sheetDelete = false;
      render(); focusUpload('[data-act="sheet-upload"]');
    }
  });

  std.addEventListener('input', (e) => {
    const el = e.target;
    const f = el.dataset?.field;
    if (!f) return;
    // A slider rescores on change (release, or each arrow key): replacing it mid-drag would end the drag.
    if (el.type === 'range') { const out = el.parentElement.querySelector('.std-rate'); if (out) out.textContent = el.value; return; }
    if (el.type !== 'text') return;
    if (f !== 'name') ui.raw = { ...ui.raw, [f]: el.value };
    edit((p) => setField(p, f, el.value));
  });
  std.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset?.act === 'select-policy') { selectPolicy(el.value); return; }
    if (el.dataset?.act === 'select-sheet') {
      location.hash = formatHash({ view: 'standards', role: route.role, policy: route.params.policy, sheet: el.value || undefined });
      return;
    }
    const f = el.dataset?.field;
    if (el.type === 'range' && f) {
      const n = f.split('.').at(-1);
      const v = Math.min(5, Math.max(1, Math.round(Number(el.value))));
      edit((p) => setRating(p, n, v));
    } else if (el.type === 'checkbox' && f === 'qualification.knockouts_off') {
      edit((p) => toggleKnockout(p, el.dataset.key, el.checked));
    }
  });
  std.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const { act, key } = btn.dataset;
    if (act === 'select') selectPolicy(key);
    else if (act === 'save' || act === 'save-shared') save();
    else if (act === 'share') share();
    else if (act === 'export') exportFile();
    else if (act === 'import') { resetNotes(); fileInput.click(); }
    else if (act === 'delete') { resetNotes(); ui.confirm = key; stdFocus = { act: 'cancel', key }; render(); }
    else if (act === 'cancel') { ui.confirm = null; stdFocus = { act: 'delete', key }; render(); }
    else if (act === 'confirm-delete') confirmDelete(key);
    else if (act === 'discard') { resetNotes(); discardDraft(); stdFocus = { act: 'save' }; applyPolicy(); }
    else if (act === 'discard-shared') { resetNotes(); clearDraft(); dropToken(); stdFocus = { act: 'select', key: currentKey() }; applyPolicy(); }
    else if (act === 'reset') reset();
    else if (act === 'new') {
      resetNotes();
      clearDraft();
      draft = startDraft({ asNew: true });
      ui.error = checkPolicy(livePolicy(draft));
      if (!ui.error) lastValid = livePolicy(draft);
      stdFocus = { field: 'name', sel: 0 };
      applyPolicy();
    }
  });
  std.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ui.confirm) {
      e.preventDefault();
      const key = ui.confirm;
      ui.confirm = null;
      stdFocus = { act: 'delete', key };
      render();
      return;
    }
    // Policies radiogroup: arrows move and select, wrapping (like the Viewing as switch).
    const radio = e.target.closest?.('.std-radio');
    if (!radio || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const list = [...radio.closest('[role=radiogroup]').querySelectorAll('.std-radio')];
    const i = list.indexOf(radio);
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    selectPolicy(list[(i + step + list.length) % list.length].dataset.key);
  });

  // ---- + New supplier: hand entry (issue 77; PRD-05 UIQ-FR-15..17, decisions 160-171) ----

  // Open the entry for new=1 (blank, or the hand-entered record the hash names: Edit); drop it when new=1 goes.
  // A supplier that is not a hand-entered record gets no entry: the normal detail or Not found shows.
  function syncEntry() {
    if (manualUi.confirm !== route.params.supplier) manualUi.confirm = null;
    if (!route.params.new) { entry = null; manualUi.entryError = null; return; }
    if (!model?.suppliers.ok) return;
    const want = route.params.supplier ?? null;
    if (entry && entry.id === want) return;
    const rec = want === null ? null : data.manual.records.find((r) => r.supplier_id === want);
    entry = want === null ? blankEntry() : rec ? entryFromRecord(rec) : null;
    manualUi.entryError = null;
    if (entry) entryFocus ??= '#entry-title';
  }

  const blockedNote = () => manualUi.saveNote ?? (storage.ok ? null : "Can't save in this browser");
  function qualifyState() {
    return { entry: entry && { state: entry, policy: resolved.policy, saveNote: blockedNote(), error: manualUi.entryError },
      manualConfirm: manualUi.confirm, manualNote: manualUi.saveNote, importError: manualUi.importError };
  }
  const announce = (msg) => { $('announce').textContent = msg; };

  // Hand-entered records changed: rebuild both models (the impact baseline includes them), rescored under the active policy.
  // Saving intentionally replaces unreadable records dropped by readManual (issue 139).
  // Only hand-edited/corrupt storage can contain these invalid envelopes; they are not usable supplier records.
  // Do not re-persist unusable records alongside the valid, explicitly saved collection.
  function setManual(records) {
    data = { ...data, manual: { records, error: null } };
    refModel = buildModel(data, STARK_REFERENCE);
    modelPolicy = null;
    refreshPolicy();
  }
  const persistManual = () => { manualUi.saveNote = writeManual(storage, data.manual.records) ? null : "Can't save in this browser"; };
  const scoreNow = () => scoreEntry(entry, { as_of: model.as_of, policy: resolved.policy });
  const toQueue = () => queueHref({ role: route.role, params: route.params }, { supplier: undefined });

  // A keystroke updates the live panel, row errors and Continue in place: re-rendering would lose the caret.
  function refreshEntry() {
    const panel = $('view-qualify');
    if (entry.step === 1) {
      const btn = panel.querySelector('[data-act="entry-continue"]');
      if (btn && entry.name.trim() && entry.part_no) btn.removeAttribute('aria-disabled');
      else btn?.setAttribute('aria-disabled', 'true');
      if (entry.name.trim()) { const m = $('entry-name-error'); if (m) m.textContent = ''; $('entry-name')?.removeAttribute('aria-invalid'); }
      // The part select updates in place too, so its type-ahead survives (issue 46).
      if (entry.part_no) { const m = $('entry-part-error'); if (m) m.textContent = ''; $('entry-part')?.removeAttribute('aria-invalid'); }
      const line = $('entry-profile');
      if (line) line.textContent = profileLine(entry.commodity);
      return;
    }
    const view = scoreNow();
    const ctx = { role: route.role, params: route.params, ...qualifyState() };
    const live = panel.querySelector('[data-entry-live]');
    if (live) live.innerHTML = livePanel(view, ctx);
    const gaps = panel.querySelector('[data-entry-gaps]');
    if (gaps) gaps.innerHTML = liveGaps(view, ctx);
    for (const [id, { issue }] of Object.entries(view.rows)) {
      const err = panel.querySelector(`[data-row-error="${CSS.escape(id)}"]`);
      if (err) err.textContent = issueText(id, issue);
      for (const el of panel.querySelectorAll(`[data-entry-field][data-id="${CSS.escape(id)}"]`)) {
        if (issue) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
      }
    }
  }

  function continueEntry() {
    if (!entry.name.trim() || !entry.part_no) {
      manualUi.entryError = 'Enter a supplier name and pick a part';
      announce(!entry.name.trim() ? 'Enter a supplier name' : 'Pick a Stark part');
      entryFocus = !entry.name.trim() ? '#entry-name' : '#entry-part';
      render();
      return;
    }
    manualUi.entryError = null;
    entry = { ...entry, step: 2 };
    entryFocus = '#entry-title';
    render();
  }

  function saveEntry() {
    const view = scoreNow();
    if (!entry.name.trim() || !view.result?.ok) {
      manualUi.entryError = 'Fix the highlighted rows before saving';
      announce(manualUi.entryError);
      const first = Object.keys(view.rows).find((k) => view.rows[k].issue);
      entryFocus = first ? `[data-id="${CSS.escape(first)}"][data-entry-field="${view.rows[first].issue === WHERE_REQUIRED ? 'where' : 'value'}"]`
        : '[data-act="entry-save"]';
      render();
      return;
    }
    const records = data.manual.records;
    const record = toRecord(entry, { id: entry.id ?? nextId(records), saved_at: new Date().toISOString().slice(0, 10) });
    setManual(upsert(records, record));
    persistManual();
    entry = null;
    manualUi.entryError = null;
    announce(`Saved ${record.supplier_id}`);
    entryFocus = '#detail-title';
    location.hash = formatHash({ view: 'qualify', role: route.role, policy: route.params.policy, supplier: record.supplier_id });
  }

  function deleteManual(id) {
    manualUi.confirm = null;
    setManual(remove(data.manual.records, id));
    persistManual();
    announce(`Deleted ${id}`);
    entryFocus = '.queue-actions [data-href]';
    location.hash = toQueue();
  }

  // A second detached file input for Import, like the Standards one: it survives re-renders while the picker is open.
  const manualFile = document.createElement('input');
  manualFile.type = 'file';
  manualFile.accept = '.json,application/json';
  manualFile.addEventListener('change', async () => {
    const file = manualFile.files?.[0];
    manualFile.value = '';
    if (!file || !model?.suppliers.ok) return;
    const r = importRecord(await file.text(), data.manual.records, { as_of: model.as_of, policy: STARK_REFERENCE });
    if (!r.ok) {
      manualUi.importError = r.error;
      announce(`Import refused: ${r.error}`);
      entryFocus = '[data-act="manual-import"]';
      render();
      return;
    }
    setManual(r.records);
    persistManual();
    announce(`Imported ${r.record.supplier_id}`);
    entryFocus = '#detail-title';
    location.hash = formatHash({ view: 'qualify', role: route.role, policy: route.params.policy, supplier: r.record.supplier_id });
  });

  const qv = $('view-qualify');
  qv.addEventListener('input', (e) => {
    const el = e.target;
    const f = el.dataset?.entryField;
    if (!f || !entry || el.tagName === 'SELECT') return;  // selects go through change
    entry = el.dataset.id ? setRow(entry, el.dataset.id, { [f]: el.value }) : { ...entry, [f]: el.value };
    refreshEntry();
  });
  // A step-2 select changes the form's shape (disabled value, required label): full render, focus kept. Step 1's part
  // select updates in place: a re-render replaces the <select> and kills its type-ahead after one letter (issue 46).
  qv.addEventListener('change', (e) => {
    const el = e.target;
    const f = el.dataset?.entryField;
    if (!f || !entry || el.tagName !== 'SELECT') return;
    if (f === 'part_no') {
      const sheet = sheetFor(uploadModel(model, sheetStore), el.value);
      entry = sheet ? setPart(entry, sheet) : { ...entry, part_no: null, commodity: null };
    } else entry = setRow(entry, el.dataset.id, { [f]: el.value });
    if (entry.step === 1) { refreshEntry(); return; }
    entryFocus = el.dataset.id ? `[data-entry-field="${f}"][data-id="${CSS.escape(el.dataset.id)}"]` : `[data-entry-field="${f}"]`;
    render();
  });
  qv.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const { act, id } = btn.dataset;
    if (act === 'entry-continue') continueEntry();
    else if (act === 'entry-change-part') { entry = { ...entry, step: 1 }; manualUi.entryError = null; entryFocus = '#entry-part'; render(); }
    else if (act === 'entry-save') saveEntry();
    else if (act === 'entry-cancel') { entry = null; entryFocus = '.queue-actions [data-href]'; location.hash = toQueue(); }
    else if (act === 'manual-export') {
      const rec = data.manual.records.find((r) => r.supplier_id === id);
      if (!rec) return;
      const { filename, text } = exportRecord(rec);
      download(filename, text);
      announce(`Exported ${filename}`);
    } else if (act === 'manual-delete') { manualUi.confirm = id; entryFocus = '[data-act="manual-cancel"]'; render(); }
    else if (act === 'manual-cancel') { manualUi.confirm = null; entryFocus = '[data-act="manual-delete"]'; render(); }
    else if (act === 'manual-confirm-delete') deleteManual(id);
    else if (act === 'manual-import') { manualUi.importError = null; manualFile.click(); }
  });
  // WCAG 2.4.11: the browser doesn't scroll a field it sees as on screen, so Shift+Tab can land one under the sticky
  // score strip (or the tab bar above it). Scroll it clear of the strip; scroll-padding in app.css covers the rest.
  function entryFocusClearance(el) {
    const strip = qv.querySelector('.entry-live');
    if (!strip || strip.contains(el)) return 0;
    const css = getComputedStyle(strip);
    const s = strip.getBoundingClientRect();
    if (css.position === 'sticky' && s.top <= parseFloat(css.top) + 1) return s.bottom + 8;
    const bar = document.querySelector('.shell-bar')?.getBoundingClientRect();
    return bar && bar.top <= 1 ? bar.bottom : 0;
  }
  qv.addEventListener('focusin', (e) => {
    const strip = qv.querySelector('.entry-live');
    if (!strip || strip.contains(e.target)) return;
    revealEntryFocus(e.target, window, entryFocusClearance(e.target));
  });
  qv.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !manualUi.confirm) return;
    e.preventDefault();
    manualUi.confirm = null;
    entryFocus = '[data-act="manual-delete"]';
    render();
  });

  window.addEventListener('hashchange', render);
  render();

  loadData({ fetchText, storage, label: source.label }).then((loaded) => {
    data = loaded;
    refModel = buildModel(data, STARK_REFERENCE);
    modelPolicy = null;
    refreshPolicy();
    render();
  });
}
