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
import { dayNumberFromIso, type FlaggedMember } from "./logic.js";

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
  const outcomes: OutreachOutcome[] = [];
  let notEvaluable = 0;
  for (const record of ledger) {
    if (!memberIds.has(record.memberId)) {
      notEvaluable += 1;
      continue;
    }
    const notedDay = dayNumberFromIso(record.takenAt);
    let firstReturnDay: number | null = null;
    for (const a of data.attendance) {
      if (a.member_id !== record.memberId || a.attendance_status !== "attended") continue;
      const date = sessionDateById.get(a.session_id);
      if (date === undefined || date === "") continue;
      const day = dayNumberFromIso(date);
      if (!Number.isFinite(day) || day <= notedDay || day > today) continue;
      if (firstReturnDay === null || day < firstReturnDay) firstReturnDay = day;
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
export const MAILTO_SAFE_LENGTH = 1800;

export function mailtoIsTooLong(href: string): boolean {
  return href.length > MAILTO_SAFE_LENGTH;
}
