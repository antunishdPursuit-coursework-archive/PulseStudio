/* Pulse Studio — escaping text before it goes into innerHTML. TEAM-OWNED.
 *
 * Two products build markup with template literals and `innerHTML` instead
 * of `createElement`/`textContent` — Product A's schedule cards and
 * Product B's session and roster panels, both interpolating names a person
 * typed (a class type, a room, a member's display name) straight into HTML.
 * Each wrote its own `escapeHtml`, byte-identical to the other's, and
 * neither had a single check on it: both live in a page's entry module,
 * which no suite can import because it reads `document` at load — the same
 * shape `app/shared/storage.ts` and `app/shared/today.ts` were in before
 * they moved here. The two copies had not yet drifted, which is not the
 * same as proof that either is correct; nothing had ever run either one
 * against a hostile string.
 */

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;",
};

/** Escape the five characters that matter for text going into `innerHTML`:
 *  a raw `&`, `<`, `>`, `"` or `'` in a person's own typed text is not
 *  markup, and none of them may be read as any. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);
}
