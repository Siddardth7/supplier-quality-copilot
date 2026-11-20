// issue 178 (DS-FR-09): Coolant Loop particles, dots riding seven sine "pipes" on the fixed #coolant canvas behind the page.
// Colours come only from the --flow-1/--flow-2 tokens; opacity is CSS (--flow-alpha). Off under reduced motion, paused
// while the tab is hidden. Nothing runs at import; globals are injectable so Node can test it. Never throws.

// ponytail: count and DPR caps are the smooth-on-laptop budget (110 arcs/frame at <= 1.5x); lower them if a profile says so.
export const LANES = 7, COUNT_WIDE = 110, COUNT_NARROW = 50, NARROW_PX = 760, DPR_CAP = 1.5, MAX_DT = 50;
const WRAP = 1.05;

export function particleCount(width) {
  return width < NARROW_PX ? COUNT_NARROW : COUNT_WIDE;
}

export function canvasSize(cssW, cssH, dpr, cap = DPR_CAP) {
  const scale = Math.max(1, Math.min(dpr || 1, cap));
  return { width: Math.round(cssW * scale), height: Math.round(cssH * scale), scale };
}

export function makeParticles(n, rand = Math.random) {
  return Array.from({ length: n }, () => {
    const x = rand(), lane = Math.min(LANES - 1, Math.floor(rand() * LANES));
    return { x, lane, v: 0.0006 + rand() * 0.0016, r: 0.6 + rand() * 1.8, tint: lane % 3 === 0 ? 1 : 0 };
  });
}

/** Move along the pipe; dt is clamped so a late frame never jumps. */
export function advance(x, v, dtMs) {
  const next = x + v * Math.min(Math.max(dtMs, 0), MAX_DT) / 16.7;
  return next >= WRAP ? next - WRAP : next;
}

export function laneY(lane, h) {
  return h * (0.12 + lane * 0.13);
}

export function position(p, t, w, h) {
  return { x: p.x * w, y: laneY(p.lane, h) + Math.sin(p.x * 9 + t / 1400 + p.lane) * 26 };
}

/** styleOf(name) -> computed value. @returns {{ a: string, b: string, alpha: number|null } | null} */
export function readFlow(styleOf) {
  const a = String(styleOf('--flow-1') ?? '').trim(), b = String(styleOf('--flow-2') ?? '').trim();
  if (!a || !b) return null;
  const alpha = Number.parseFloat(styleOf('--flow-alpha'));
  return { a, b, alpha: Number.isFinite(alpha) ? alpha : null };
}

/** @returns {'started'|'reduced'|'unsupported'|'failed'} never throws */
export function startCoolant({ doc = globalThis.document, win = globalThis } = {}) {
  try {
    if (!doc || !win) return 'unsupported';
    const canvas = doc.getElementById?.('coolant');
    const ctx = canvas?.getContext?.('2d');
    if (!ctx) return 'unsupported';
    const styleOf = (name) => win.getComputedStyle(doc.documentElement).getPropertyValue(name);
    let flow = readFlow(styleOf);
    if (!flow) return 'unsupported';
    const motion = win.matchMedia?.('(prefers-reduced-motion: reduce)');
    let particles = [], w = 0, h = 0, frame = 0, running = false, last = 0, resizing = false;

    const resize = () => {
      resizing = false;
      w = win.innerWidth; h = win.innerHeight;
      const s = canvasSize(w, h, win.devicePixelRatio);
      canvas.width = s.width; canvas.height = s.height;  // CSS sizes the element, so this never shifts layout
      ctx.setTransform(s.scale, 0, 0, s.scale, 0, 0);
      if (particleCount(w) !== particles.length) particles = makeParticles(particleCount(w));
    };
    const tick = (t) => {
      try {
        const dt = last ? t - last : 0;
        last = t;
        ctx.clearRect(0, 0, w, h);
        for (const p of particles) {
          p.x = advance(p.x, p.v, dt);
          const { x, y } = position(p, t, w, h);
          ctx.beginPath(); ctx.arc(x, y, p.r, 0, 2 * Math.PI); ctx.fillStyle = p.tint ? flow.b : flow.a; ctx.fill();
        }
        frame = win.requestAnimationFrame(tick);
      } catch (e) { running = false; console.warn('Coolant animation stopped:', e?.message ?? e); }
    };
    const start = () => {
      if (running || motion?.matches || doc.hidden) return;
      running = true; last = 0;  // fresh timestamp: no dt jump after a pause
      frame = win.requestAnimationFrame(tick);
    };
    const stop = () => {
      if (running) win.cancelAnimationFrame(frame);
      running = false;
    };

    resize();
    win.addEventListener?.('resize', () => {
      if (resizing) return;
      resizing = true;
      win.requestAnimationFrame(resize);
    });
    doc.addEventListener?.('visibilitychange', () => (doc.hidden ? stop() : start()));
    doc.addEventListener?.('themechange', () => { flow = readFlow(styleOf) ?? flow; });
    motion?.addEventListener?.('change', () => {
      if (motion.matches) { stop(); ctx.clearRect(0, 0, w, h); } else start();
    });
    if (motion?.matches) { ctx.clearRect(0, 0, w, h); return 'reduced'; }
    start();
    return 'started';
  } catch (e) {
    console.warn('Coolant backdrop unavailable:', e?.message ?? e);
    return 'failed';
  }
}
