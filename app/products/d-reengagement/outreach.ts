/* Product D — outreach discipline. The production-engine rules, pure.
 *
 * Everything here is a pure decision over data handed in: no DOM, no
 * storage, no clock. The page owns persistence; this module owns POLICY,
 * so every rule below is unit-testable with pinned inputs.
 *
 * Precedence, highest first — the first rule that speaks, decides:
 *   1. disabled        the studio never opted in: no outreach workflow
 *   2. suppressed      this member said (or staff decided) do-not-contact
 *   3. outsideConsent  silence older than the consent window
 *   4. alreadyReached  this LAPSE was already acted on (once per lapse;
 *                      a member who returns and lapses again re-arms)
 *   5. ready           draft away — a human still does the sending
 */

import type { OutreachPolicy } from "./config.js";
import type { FixtureSet } from "./deps.js";
import { dayNumberFromIso, firstNameOf, type FlaggedMember } from "./logic.js";

export interface OutreachRecord {
  memberId: string;
  /** Identity of the LAPSE, not the member: memberId + the last-attended
   *  date the note was about. A new last-attended date is a new lapse. */
  lapseKey: string;
  takenAt: string; // ISO date the draft was taken
  channel: "copy" | "email";
}

export interface SuppressionRecord {
  memberId: string;
  suppressedOn: string; // ISO date
}

export type OutreachState =
  | { kind: "ready" }
  | { kind: "disabled" }
  | { kind: "suppressed"; since: string }
  | { kind: "outsideConsent"; days: number }
  | { kind: "alreadyReached"; takenAt: string; channel: "copy" | "email" };

/** One lapse, one key. */
export function lapseKeyOf(flagged: FlaggedMember): string {
  const lastDate = flagged.lastSession.starts_at.split("T")[0] ?? "";
  return `${flagged.member.member_id}|${lastDate}`;
}

export function outreachStateFor(
  flagged: FlaggedMember,
  policy: OutreachPolicy,
  ledger: readonly OutreachRecord[],
  suppressions: readonly SuppressionRecord[],
): OutreachState {
  if (!policy.enabled) return { kind: "disabled" };

  const suppression = suppressions.find(
    (s) => s.memberId === flagged.member.member_id,
  );
  if (suppression) return { kind: "suppressed", since: suppression.suppressedOn };

  if (flagged.daysSince > policy.consentWindowDays) {
    return { kind: "outsideConsent", days: flagged.daysSince };
  }

  if (policy.oncePerLapse) {
    const key = lapseKeyOf(flagged);
    // The LATEST record for this lapse speaks for it.
    const prior = [...ledger].reverse().find((r) => r.lapseKey === key);
    if (prior) {
      return { kind: "alreadyReached", takenAt: prior.takenAt, channel: prior.channel };
    }
  }
  return { kind: "ready" };
}

/** Append-only: taking a draft claims the lapse. Returns a NEW ledger —
 *  the caller persists it; this module never touches storage. */
export function recordOutreach(
  ledger: readonly OutreachRecord[],
  flagged: FlaggedMember,
  channel: "copy" | "email",
  takenAt: string,
): OutreachRecord[] {
  return [
    ...ledger,
    {
      memberId: flagged.member.member_id,
      lapseKey: lapseKeyOf(flagged),
      takenAt,
      channel,
    },
  ];
}

/* ------------------------------------------------------------------ */
/* The closed loop — the part a production win-back engine lacks:       */
/* it sends, and never learns whether anyone came back.                 */
/* ------------------------------------------------------------------ */

export interface OutreachOutcome {
  record: OutreachRecord;
  result: "returned" | "stillQuiet";
  /** Days from the note to the first attended class after it. */
  daysToReturn: number | null;
}

export interface OutreachResults {
  outcomes: OutreachOutcome[];
  returned: number;
  stillQuiet: number;
  /** Ledger entries whose member is not in THESE records (a different
   *  data source is loaded) — accounted, never silently dropped. */
  notEvaluable: number;
  medianDaysToReturn: number | null;
}

/** Judge every taken draft against the records: did the member attend
 *  AFTER the note? Only attended counts — the product's one law — and only
 *  visits after the note date count as a return. Pure: records and ledger
 *  in, verdicts out. */
export function outreachResults(
  ledger: readonly OutreachRecord[],
  data: FixtureSet,
  today: number,
): OutreachResults {
  const memberIds = new Set(data.members.map((m) => m.member_id));
  const sessionDateById = new Map(
    data.class_sessions.map((s) => [s.session_id, s.starts_at.split("T")[0] ?? ""]),
  );

  /* THE LEDGER ONLY EVER GROWS, so this cannot be O(ledger x attendance).
   *
   * Every note a staff member takes appends one row, forever — there is no
   * pruning and there should not be, because the closed loop's whole claim
   * is that every note gets judged. Scanning the entire attendance list once
   * per note therefore gets slower every week the studio is used: measured
   * against a 2000-member studio, 10 notes cost 52ms, 500 cost 555ms and
   * 2000 cost 2220ms. A tool that works at launch and degrades permanently
   * is worse than one that is slow from the start, because nobody sees it
   * happen.
   *
   * Each member's attended DAYS are collected once, sorted ascending, so
   * finding the first visit after a note is a walk over that member's own
   * history instead of the studio's. */
  /* ONLY THE MEMBERS THE LEDGER ASKS ABOUT. Indexing the whole studio cost
   * the same 150ms whether ten notes had been taken or two thousand, which
   * made the common case slower to make the rare one fast. A ten-note
   * ledger names ten members, so ninety-nine per cent of the studio's
   * attendance never needs its date parsed at all. */
  const askedAbout = new Set(ledger.map((r) => r.memberId));
  const attendedDaysByMember = new Map<string, number[]>();
  for (const a of data.attendance) {
    if (!askedAbout.has(a.member_id)) continue;
    if (a.attendance_status !== "attended") continue;
    const date = sessionDateById.get(a.session_id);
    if (date === undefined || date === "") continue;
    const day = dayNumberFromIso(date);
    if (!Number.isFinite(day) || day > today) continue;
    const days = attendedDaysByMember.get(a.member_id);
    if (days === undefined) attendedDaysByMember.set(a.member_id, [day]);
    else days.push(day);
  }
  for (const days of attendedDaysByMember.values()) days.sort((x, y) => x - y);

  const outcomes: OutreachOutcome[] = [];
  let notEvaluable = 0;
  for (const record of ledger) {
    if (!memberIds.has(record.memberId)) {
      notEvaluable += 1;
      continue;
    }
    const notedDay = dayNumberFromIso(record.takenAt);
    let firstReturnDay: number | null = null;
    for (const day of attendedDaysByMember.get(record.memberId) ?? []) {
      // Ascending, so the first day past the note is THE first return.
      if (day > notedDay) {
        firstReturnDay = day;
        break;
      }
    }
    outcomes.push({
      record,
      result: firstReturnDay === null ? "stillQuiet" : "returned",
      daysToReturn: firstReturnDay === null ? null : firstReturnDay - notedDay,
    });
  }
  const returns = outcomes
    .filter((o) => o.daysToReturn !== null)
    .map((o) => o.daysToReturn as number)
    .sort((a, b) => a - b);
  return {
    outcomes,
    returned: returns.length,
    stillQuiet: outcomes.length - returns.length,
    notEvaluable,
    medianDaysToReturn:
      returns.length === 0 ? null : returns[Math.floor((returns.length - 1) / 2)] ?? null,
  };
}

/** Forget a claim on one lapse, so its draft is offered again.
 *
 *  WHY THIS HAS TO EXIST. Opening the mail client CLAIMS the lapse, because
 *  from here the note is in a person's hands and the tool cannot see what
 *  happens next. But a mail client that never opened — no handler
 *  configured, a blocked pop-up, a mistaken click — leaves the lapse
 *  claimed for a note that does not exist, and once claimed the discipline
 *  correctly never offers it again. The member's silence goes unanswered
 *  forever, by a rule working exactly as designed on a fact that was wrong.
 *
 *  Suppression has always been reversible for the same reason. This is the
 *  same escape for the same kind of mistake, and it is not rewriting
 *  history: the ledger records what a staff member TOOK, and if nothing was
 *  taken there is nothing to record. */
export function forgetOutreach(
  ledger: readonly OutreachRecord[],
  lapseKey: string,
): OutreachRecord[] {
  return ledger.filter((r) => r.lapseKey !== lapseKey);
}

export function suppress(
  suppressions: readonly SuppressionRecord[],
  memberId: string,
  suppressedOn: string,
): SuppressionRecord[] {
  if (suppressions.some((s) => s.memberId === memberId)) return [...suppressions];
  return [...suppressions, { memberId, suppressedOn }];
}

export function unsuppress(
  suppressions: readonly SuppressionRecord[],
  memberId: string,
): SuppressionRecord[] {
  return suppressions.filter((s) => s.memberId !== memberId);
}

/* ------------------------------------------------------------------ */
/* Reading the stored ledger back — hostile-input rules                 */
/* ------------------------------------------------------------------ */

/* THE STORED LEDGER IS NOT TRUSTED INPUT. It is a JSON blob in a browser
 * that a person, an extension, or an older version of this page can have
 * written. It used to be cast straight to OutreachRecord[], so a single row
 * missing takenAt reached the median arithmetic in outreachResults() and
 * turned a staff-facing number into NaN. Rows are validated one at a time:
 * good rows survive, bad rows are COUNTED, and the page states the count —
 * the same accounting attendance rows already get. */

/* keepOutreachRecords / keepSuppressionRecords are the whole API here. The
 * two row predicates behind them stay private: a caller that reached past
 * the keepers would get a filtered array with no dropped-count, which is
 * the one thing the page has to state. */
export interface KeptRows<T> {
  kept: T[];
  /** Rows that could not be read. Stated, never silently dropped. */
  dropped: number;
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return Number.isFinite(dayNumberFromIso(value));
}

function isOutreachRecord(row: unknown): row is OutreachRecord {
  if (typeof row !== "object" || row === null) return false;
  const r = row as Record<string, unknown>;
  return (
    typeof r["memberId"] === "string" &&
    r["memberId"] !== "" &&
    typeof r["lapseKey"] === "string" &&
    r["lapseKey"] !== "" &&
    isIsoDate(r["takenAt"]) &&
    (r["channel"] === "copy" || r["channel"] === "email")
  );
}

function isSuppressionRecord(row: unknown): row is SuppressionRecord {
  if (typeof row !== "object" || row === null) return false;
  const r = row as Record<string, unknown>;
  return (
    typeof r["memberId"] === "string" &&
    r["memberId"] !== "" &&
    isIsoDate(r["suppressedOn"])
  );
}

export function keepOutreachRecords(rows: unknown): KeptRows<OutreachRecord> {
  if (!Array.isArray(rows)) return { kept: [], dropped: 0 };
  const kept = rows.filter(isOutreachRecord);
  return { kept, dropped: rows.length - kept.length };
}

export function keepSuppressionRecords(rows: unknown): KeptRows<SuppressionRecord> {
  if (!Array.isArray(rows)) return { kept: [], dropped: 0 };
  const kept = rows.filter(isSuppressionRecord);
  return { kept, dropped: rows.length - kept.length };
}

/* ------------------------------------------------------------------ */
/* How long a mailto: link may be                                       */
/* ------------------------------------------------------------------ */

/* WHY THIS HAS A NUMBER ON IT. A mailto: URL is a URL, and mail clients
 * truncate long ones — Outlook and the Windows shell handler stop somewhere
 * around two thousand characters, without saying so. A truncated draft is a
 * note that arrives cut off mid-sentence, from a studio telling a member it
 * missed them.
 *
 * The part that makes it worse than an ugly email: opening the mail client
 * CLAIMS THE LAPSE in the ledger. Once claimed, the discipline never offers
 * that silence again — so a member could receive one half-finished note and
 * then, correctly by the rules, never be written to about it. That is the
 * outreach discipline working perfectly on a note that never should have
 * gone.
 *
 * The shipped voice is nowhere near it — the longest draft against the
 * running studio is about 820 characters of href. This exists because
 * config.ts is explicitly the file a reseller rewrites, and a longer voice,
 * a longer studio name, or longer links all push the same number up with
 * nothing to notice. 1800 leaves room under the lowest known ceiling. */
/* THE DRAFT AS A LINK THE STAFF MEMBER'S OWN MAIL CLIENT WILL OPEN.
 *
 * Nothing here sends: the product law is draft-only, and this hands the
 * note to a human who still has to press send.
 *
 * The studio name and address are PARAMETERS rather than reads of `brand`,
 * because the shipped brand carries studioEmail: null — so the bcc branch
 * below had never once run, in code or in a check, until they were passed
 * in. A branch that only executes at a reseller's site is exactly the kind
 * that is wrong on the day it first matters.
 *
 * Every interpolated value is member-supplied: display_name arrives from a
 * CSV a studio exported, and a mailto URL parses "&" as the start of
 * another header. A name of the form `Bob&bcc=stranger@elsewhere.invalid`
 * would
 * add a recipient to a note about a member if it reached the URL raw.
 * encodeURIComponent is what stops that, which is why it is checked and
 * not merely written. */
export function mailtoHref(
  f: FlaggedMember,
  draft: string,
  studioName: string,
  studioEmail: string | null,
): string {
  const subject = `We miss you at ${studioName}, ${firstNameOf(f.member.display_name)}!`;
  const bcc = studioEmail === null ? "" : `bcc=${encodeURIComponent(studioEmail)}&`;
  /* RFC 6068 wants CRLF line breaks in a mailto body; some clients collapse
   * a bare %0A. Only the URL gets CRLF — screen and clipboard stay LF. */
  return (
    "mailto:?" +
    bcc +
    `subject=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(draft.replace(/\n/g, "\r\n"))}`
  );
}

export const MAILTO_SAFE_LENGTH = 1800;

export function mailtoIsTooLong(href: string): boolean {
  return href.length > MAILTO_SAFE_LENGTH;
}
