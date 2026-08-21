/* Membership lifecycle — periods are the authority. TEAM-OWNED.
 *
 * A member's history is a list of contiguous, non-overlapping periods that
 * starts at their join date and always has exactly one open period.
 * Current status is DERIVED from the periods as of a supplied date; the
 * member row's snapshot field is validated against this derivation.
 */

import type { DerivedStatus, MembershipPeriod } from "./contracts.js";
import { dayNumberOf } from "./normalize.js";

/** The state whose period covers `date` (startsOn inclusive, endsOn
 *  exclusive). "none" when the date precedes the first period. */
export function deriveStatusOn(
  periods: readonly MembershipPeriod[],
  date: string,
): DerivedStatus {
  const day = dayNumberOf(date);
  for (const p of periods) {
    const starts = dayNumberOf(p.startsOn);
    const ends = p.endsOn === null ? Number.POSITIVE_INFINITY : dayNumberOf(p.endsOn);
    if (day >= starts && day < ends) return p.state;
  }
  return "none";
}

export function activeOn(
  periods: readonly MembershipPeriod[],
  date: string,
): boolean {
  return deriveStatusOn(periods, date) === "active";
}

/** Structural problems with one member's period history. Empty = coherent. */
export function periodProblems(
  periods: readonly MembershipPeriod[],
  joinedOn: string,
): string[] {
  const problems: string[] = [];
  if (periods.length === 0) return ["no membership periods"];
  const sorted = [...periods].sort(
    (a, b) => dayNumberOf(a.startsOn) - dayNumberOf(b.startsOn),
  );
  const first = sorted[0];
  if (first && first.startsOn !== joinedOn) {
    problems.push(`history starts ${first.startsOn}, member joined ${joinedOn}`);
  }
  let open = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    const p = sorted[i];
    if (!p) continue;
    if (p.endsOn === null) open += 1;
    else if (dayNumberOf(p.endsOn) <= dayNumberOf(p.startsOn)) {
      problems.push(`period ${p.id} ends on or before its start`);
    }
    const nextPeriod = sorted[i + 1];
    if (nextPeriod) {
      if (p.endsOn === null) problems.push(`period ${p.id} is open but not last`);
      else if (p.endsOn !== nextPeriod.startsOn) {
        problems.push(`gap or overlap between ${p.id} and ${nextPeriod.id}`);
      }
    }
  }
  if (open !== 1) problems.push(`expected exactly 1 open period, found ${open}`);
  return problems;
}
