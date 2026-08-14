function compact(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function normalizeRequestDescription(
  title: string,
  description: string,
  rawText?: string,
): string {
  const t = title.trim();
  const d = description.trim();
  if (!d) return '';

  const tc = compact(t);
  const dc = compact(d);
  if (!dc || dc === tc) return '';

  if (dc.startsWith(tc)) {
    const rest = compact(d.slice(t.length));
    if (!rest || tc.includes(rest)) return '';
  }

  if (rawText) {
    const rc = compact(rawText);
    if (dc === rc && (tc === rc || tc.includes(rc) || rc.includes(tc))) return '';
  }

  const tail = d.slice(t.length).trim();
  if (tail && compact(t).includes(compact(tail))) return '';

  return d;
}
