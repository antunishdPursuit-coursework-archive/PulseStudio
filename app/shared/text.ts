/* Pulse Studio — counting things in a sentence a person reads. TEAM-OWNED.
 *
 * It sits in app/shared because BOTH sides need it: Product D writes
 * "1 class in the prior 60 days", and the synthetic reporting page writes
 * "1 finding". Putting it in a product folder would have meant two copies
 * of one rule, which is the duplication app/shared/color.ts exists to
 * undo for the contrast formula.
 *
 * This product already pluralised carefully in places — "1 note taken" and
 * "2 notes taken", "1 duplicate row was" and "2 duplicate rows were" — and
 * not in others, and several of the others were reachable. A member who
 * attended exactly once produced "1 classes in the prior 60 days" on the
 * evidence line a staff member weighs, with the SHIPPED thresholds. A
 * member who returned the day after a note produced "(1 days)".
 *
 * The rest were reachable by reconfiguring: the quiet thresholds are
 * explicitly unratified, and with minDaysQuiet set to 0 the badge reads
 * "1 days quiet" and the note sent to a member opens "it's been 1 days
 * since your last class". That is the one that matters — a studio's own
 * voice, in a personal note, getting a plural wrong on the first line.
 *
 * One helper rather than a ternary at each site, because the ternaries
 * were the problem: fifteen places to remember, several already forgotten.
 *
 * Product D reaches it through its own `deps.ts`, which is that folder's
 * only door to the outside — the portability seam its brief describes.
 */

/** `counted(1, "class", "classes")` is "1 class"; `counted(4, …)` is
 *  "4 classes". The plural defaults to the singular plus "s", which is
 *  right for day, member, row, note and spot — but never guessed at when
 *  it is not, hence the third argument. */
export function counted(count: number, singular: string, plural?: string): string {
  const word = count === 1 ? singular : (plural ?? `${singular}s`);
  return `${count} ${word}`;
}
