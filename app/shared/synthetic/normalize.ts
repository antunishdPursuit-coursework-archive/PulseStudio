/* Conservative normalization + strict calendar arithmetic. TEAM-OWNED.
 *
 * Normalization MAY: trim outer whitespace, case-fold emails, validate
 * strict dates and timestamps, canonicalize documented enum values,
 * preserve Unicode, preserve meaningful punctuation.
 *
 * Normalization MUST NEVER: fuzzy-match people, ASCII-slug names, remove
 * Gmail dots, collapse punctuation, infer identity from similar
 * attributes, merge empty ids, or invent missing relationships. Invalid
 * records are rejected or disclosed — never silently repaired by guess.
 */

/** Trim outer whitespace only. Unicode and punctuation pass through
 *  untouched — 王伟 stays 王伟, "Mary-Jane" stays "Mary-Jane". */
export function normalizeName(raw: string): string {
  return raw.trim();
}

/** Trim + lower-case. Deliberately nothing more: stripping dots or
 *  plus-tags would merge addresses their owners consider distinct. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}


/** Strict YYYY-MM-DD that also survives the real calendar (2026-02-30 is
 *  not a date, whatever the regex says). */
export function isStrictDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const t = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1));
  return (
    t.getUTCFullYear() === y &&
    t.getUTCMonth() === (m ?? 1) - 1 &&
    t.getUTCDate() === d
  );
}

/** Strict studio-local YYYY-MM-DDTHH:MM:SS. */
export function isStrictTimestamp(v: string): boolean {
  const m = v.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return false;
  const [, date, hh, mm, ss] = m;
  return (
    isStrictDate(date ?? "") &&
    Number(hh) < 24 &&
    Number(mm) < 60 &&
    Number(ss) < 60
  );
}

/** Whole-day number of a strict date (days since 1970-01-01, UTC-anchored
 *  on the date text — studio-local by construction). */
export function dayNumberOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1) / 86_400_000;
}

export function dateOfDayNumber(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: string): number {
  return (((dayNumberOf(date) + 4) % 7) + 7) % 7;
}

/** Date part of a strict timestamp. */
export function dateOfTimestamp(ts: string): string {
  return ts.slice(0, 10);
}

/** Minutes since midnight of a strict timestamp's time part. */
export function minutesOfTimestamp(ts: string): number {
  return Number(ts.slice(11, 13)) * 60 + Number(ts.slice(14, 16));
}
