/* Pulse Studio — what day it is where the STUDIO is. TEAM-OWNED.
 *
 * WHY THIS FILE EXISTS: three places needed today's date and each wrote its
 * own, which is how the WCAG contrast formula ended up in two places and
 * became `color.ts`. One of these three was wrong.
 *
 *   app/products/d-reengagement/logic.ts   correct, and the tested one
 *   app/shared/auth/studio.ts              correct, assembled by hand from
 *                                          formatToParts
 *   app/shared/synthetic/page.ts           WRONG — `new Date()
 *                                          .toISOString().slice(0, 10)`
 *
 * The last one is UTC, and Product D's own brief records what that costs:
 * "a note taken at 8pm on a Wednesday was stamped Thursday". The synthetic
 * page uses it to prefill the as-of date a whole studio is generated
 * against, so somebody in New York generating a studio after 8pm got
 * tomorrow's studio without being told.
 *
 * A STAFF MEMBER'S OWN TIMEZONE IS NOT THE ANSWER either. Someone checking
 * from another country at 11:30pm studio time must get the studio's day, or
 * every threshold boundary — quiet for 14 days, 60 days — moves by one for
 * them and for nobody else.
 *
 * `en-CA` because it formats as YYYY-MM-DD, which is the shape every date
 * in this repo already uses. That is a real dependency on a locale's
 * conventions rather than a coincidence worth relying on quietly, so it is
 * pinned by a check.
 *
 * `now` is a parameter with a default rather than a bare clock read, so a
 * check can ask what this returns at 11:30pm without waiting until 11:30pm.
 * Every check in the repo passes it explicitly.
 */

export function todayIsoInZone(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
