// One clipboard attempt and selection fallback; callers own DOM lookup and status copy (issue 140).

/** copied | selected | stale. Resolve the selection target inside select(), after an awaited failure. */
export async function copyWithFallback(text, { write, select, current = () => true }) {
  try {
    await write(text);
    return 'copied';
  } catch {
    if (!current()) return 'stale';
    select();
    return 'selected';
  }
}
