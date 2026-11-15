// Browser storage that never throws (private mode, blocked storage and bad JSON all read as null).

export function safeStorage(win = globalThis) {
  let ls = null;
  try { ls = win?.localStorage ?? null; } catch { ls = null; }
  return {
    ok: ls !== null,
    get(key) {
      try {
        const raw = ls?.getItem(key);
        return raw == null ? null : JSON.parse(raw);
      } catch { return null; }
    },
    set(key, value) {
      try { ls.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
    },
  };
}
