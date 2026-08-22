/* Counting things in a sentence a person reads.
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
 * It lives in its own file so every module can use it. `config.ts` holds
 * the draft voice and is imported by `logic.ts`, so the helper cannot live
 * in either without one importing the other the wrong way round.
 */

/** `counted(1, "class", "classes")` is "1 class"; `counted(4, …)` is
 *  "4 classes". The plural defaults to the singular plus "s", which is
 *  right for day, member, row, note and spot — but never guessed at when
 *  it is not, hence the third argument. */
export function counted(count: number, singular: string, plural?: string): string {
  const word = count === 1 ? singular : (plural ?? `${singular}s`);
  return `${count} ${word}`;
}
