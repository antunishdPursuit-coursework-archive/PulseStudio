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

import { counted } from "./deps.js";
import type { OutreachPolicy } from "./config.js";
import type { FixtureSet } from "./deps.js";
import { dayNumberFromIso, firstNameOf, joinSentence, type FlaggedMember } from "./logic.js";

/** Where a routine lives, for a member who wants to open it.
 *
 *  GENERIC BY CONSTRUCTION. The address carries a routine id and nothing
 *  else — no member id, no name, no attendance figure — so two members sent
 *  the same routine open the identical page, and the page cannot know who
 *  is reading it. The personal words stay in the copied message, which
 *  travels between two people and never touches this site. */
export function routineUrl(studioUrl: string, routineId: string): string {
  const base = studioUrl.endsWith("/") ? studioUrl : `${studioUrl}/`;
  return `${base}products/d-reengagement/routine.html?r=${encodeURIComponent(routineId)}`;
}

/** The copied draft with a routine added underneath it.
 *
 *  ONLY A TITLE AND AN ADDRESS. Not a reason it was chosen, not a claim it
 *  suits anybody — a staff member picked it, and the sentence says so
 *  plainly. The draft is unchanged when no routine was chosen, and a check
 *  pins that byte-for-byte, because outreach has to stay useful without
 *  one. */
export function draftWithRoutine(
  draft: string,
  routineTitle: string,
  url: string,
): string {
  return `${draft}\n\nOne of our approved at-home routines, if you would like it:\n${routineTitle}\n${url}`;
}

export interface OutreachRecord {
  memberId: string;
  /** Identity of the LAPSE, not the member: memberId + the last-attended
   *  date the note was about. A new last-attended date is a new lapse. */
  lapseKey: string;
  takenAt: string; // ISO date the draft was taken
  channel: "copy" | "email";
  /** Which approved routine went with the note, when one did.
   *
   *  AN ATTRIBUTE OF THE NOTE, NOT A SECOND EVENT. A routine is included IN
   *  a copied draft, so this is one more thing known about the same event —
   *  which is why it does NOT change what the ledger means. A separate
   *  `routine_included` row would have been counted by outreachStateFor as
   *  outreach, so attaching a routine could have suppressed a legitimate
   *  note, or made "already reached" read true for a lapse nobody wrote to.
   *
   *  Optional, because every record written before today lacks it, and
   *  because a note without a routine is the common case. Nothing here
   *  records the message text, anything about a body, or any claim that the
   *  routine was opened, followed, or suited anybody. */
  routineId?: string;
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
  routineId?: string,
): OutreachRecord[] {
  /* The routine id is OMITTED when there is none, never written as null or
   * an empty string — the same rule the routine contract follows, and the
   * reason a record from before today still reads correctly. */
  const record: OutreachRecord = {
    memberId: flagged.member.member_id,
    lapseKey: lapseKeyOf(flagged),
    takenAt,
    channel,
  };
  if (routineId !== undefined && routineId !== "") record.routineId = routineId;
  return [...ledger, record];
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
      /* Ascending, so the first day PAST the note is THE first return.
       *
       * Strictly past, and that is a judgement rather than an accident.
       * The ledger records a DATE, not a time — so when a member attends
       * a class on the same day the note was taken, nothing here can tell
       * whether the note came first. Counting it as "came back" would
       * claim the note caused a visit that may have happened hours
       * earlier, which is the one thing this panel exists not to do. A
       * same-day visit is left as still quiet, and the member's next
       * visit counts normally. */
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
/* Reading a list back out of a browser store                           */
/* ------------------------------------------------------------------ */

/* WHY THIS IS HERE AND NOT IN main.ts, WHERE IT RAN UNTIL 2026-08-22.
 *
 * main.ts is the page's entry module. Nothing can load it outside a
 * browser, so no check reaches it — `npm run mutate` scores its shared
 * twin, synthetic/page.ts, at 0% caught with every mutation surviving, and
 * both folder briefs already name the remedy: anything in an entry module
 * that is a RULE rather than markup belongs in a module a check can load.
 *
 * This is a rule. It decides what a staff member is told when the browser
 * hands back something that is not what was stored — which happens for
 * dull reasons (another tab mid-write, a quota failure, a person with dev
 * tools) and must never end in a silent empty list, because an empty
 * do-not-contact list means messaging someone who asked not to be.
 *
 * The two failures are deliberately NOT the same. Unreadable bytes or a
 * value that is not a list at all is unrecoverable: it is reset. Individual
 * bad ROWS are not — the good rows survive and the count of the bad ones is
 * stated, the same accounting attendance rows already get. Only the first
 * clears the key, which is why `clear` is reported separately from the
 * warning rather than inferred from it. */
export interface RecoveredList<T> {
  rows: T[];
  /** Sentences the page appends verbatim. Empty when nothing went wrong.
   *  Leading space included, because they join a running warning. */
  warning: string;
  /** Whether the stored value is beyond saving and should be thrown away.
   *  Dropped rows do NOT set this: the survivors are still worth keeping. */
  clear: boolean;
}

export function recoverStoredList<T>(
  raw: string | null,
  label: string,
  keep: (rows: unknown) => KeptRows<T>,
): RecoveredList<T> {
  const unreadable = {
    rows: [],
    warning: ` The stored ${label} was unreadable and was reset.`,
    clear: true,
  };
  if (raw === null) return { rows: [], warning: "", clear: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return unreadable;
  }
  /* Array.isArray, not a typeof test: `typeof [] === "object"` and so is
   * `null`, and JSON.parse produces both. */
  if (!Array.isArray(parsed)) return unreadable;
  const { kept, dropped } = keep(parsed);
  if (dropped === 0) return { rows: kept, warning: "", clear: false };
  return {
    rows: kept,
    warning:
      ` ${counted(dropped, "unreadable entry", "unreadable entries")}` +
      ` in the stored ${label} ${dropped === 1 ? "was" : "were"} discarded.`,
    clear: false,
  };
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
/* WHAT CAME OF THE NOTES ALREADY TAKEN, IN A SENTENCE.
 *
 * The closed loop's whole claim is that every note gets judged, so this
 * line is where the claim is either kept or quietly broken. It was built
 * inline in the renderer, which no headless check can load, and it
 * carries four clauses, two pluralisations and a median that is null
 * until somebody actually comes back. */
/* THE WELCOME-BACK CUE, and the one number on this panel that is good
 * news. It lived inside main.ts until 2026-08-22, written as
 * `(${o.daysToReturn} days)` with no plural — so a member who answered a
 * note by coming in the NEXT DAY, the best outcome this tool can produce,
 * was reported to the front desk as "(1 days)". Every other count in this
 * product goes through counted(); this one could not, because nothing
 * could load the module it was in.
 *
 * daysToReturn is at least 1 for a returned outcome — a same-day visit is
 * deliberately not counted as a return, see the comment in
 * outreachResults — so the null branch here is unreachable through that
 * path and exists because the type allows it, not because it happens.
 *
 * Returns null, not an empty string, when nobody has come back: there is
 * no cue to give, and the page shows nothing rather than an empty line. */
export function returnedLine(
  results: OutreachResults,
  nameFor: (memberId: string) => string,
): string | null {
  const returned = results.outcomes.filter((o) => o.result === "returned");
  if (returned.length === 0) return null;
  const names = returned.map(
    (o) =>
      `${nameFor(o.record.memberId)}` +
      `${o.daysToReturn === null ? "" : ` (${counted(o.daysToReturn, "day")})`}`,
  );
  return `Came back after a note — worth a hello at the front desk: ${names.join(" · ")}`;
}

export function outcomesLine(results: OutreachResults): string {
  const total = results.outcomes.length + results.notEvaluable;
  const median =
    results.medianDaysToReturn === null
      ? ""
      : ` (median ${counted(results.medianDaysToReturn ?? 0, "day")} after the note)`;
  return (
    joinSentence(
      [
        `Outreach so far: ${counted(total, "note")} taken`,
        `${results.returned} came back${median}`,
        `${results.stillQuiet} still quiet`,
        /* Never dropped in silence: a ledger entry whose member is not in
         * THESE records still happened, and saying so is the difference
         * between a total that adds up and one that quietly does not. */
        results.notEvaluable > 0
          ? `${results.notEvaluable} not evaluable in these records`
          : null,
      ],
      " · ",
    ) + "."
  );
}

/* HOW MANY OF THE FLAGGED CAN ACTUALLY BE WRITTEN TO.
 *
 * The summary says "N members checked, M flagged". It has never said how
 * many of those M a staff member can do anything about, because the count
 * comes from the quiet rule and the blocking comes from the outreach
 * policy, and the two never met. In the common case they agree and the
 * distinction is invisible. In a studio that has suppressed most of its
 * quiet members it reads "10 flagged" over ten cards that all say do not
 * contact, and a person scrolls looking for work that is not there.
 *
 * The truth law already asks for exactly this shape — "5 members checked,
 * 1 flagged ... 1 could not be used as evidence" — so this is the same
 * sentence pattern applied to the half that was missing, not a new idea. */
export interface OutreachAvailability {
  ready: number;
  suppressed: number;
  alreadyReached: number;
  outsideConsent: number;
  disabled: number;
}

export function outreachAvailability(
  flagged: readonly FlaggedMember[],
  policy: OutreachPolicy,
  ledger: readonly OutreachRecord[],
  suppressions: readonly SuppressionRecord[],
): OutreachAvailability {
  const counts: OutreachAvailability = {
    ready: 0, suppressed: 0, alreadyReached: 0, outsideConsent: 0, disabled: 0,
  };
  for (const f of flagged) {
    counts[outreachStateFor(f, policy, ledger, suppressions).kind] += 1;
  }
  return counts;
}

/**
 * The sentence, or "" when every flagged member can be written to — in
 * which case the summary already told the whole truth and a second
 * sentence saying "0 blocked" would be noise.
 */
export function availabilityLine(counts: OutreachAvailability): string {
  const blocked =
    counts.suppressed + counts.alreadyReached + counts.outsideConsent + counts.disabled;
  if (blocked === 0) return "";
  const total = blocked + counts.ready;
  /* Every reason that applies is named. A single number would say the
   * drafts are missing without saying why, which is the kind of half
   * answer this product exists to avoid. */
  const reasons = [
    counts.suppressed > 0 ? `${counts.suppressed} do not contact` : "",
    counts.alreadyReached > 0 ? `${counts.alreadyReached} already reached this lapse` : "",
    counts.outsideConsent > 0 ? `${counts.outsideConsent} outside the consent window` : "",
    counts.disabled > 0 ? `${counts.disabled} while outreach is switched off` : "",
  ].filter((r) => r !== "");
  return `No draft offered for ${blocked} of ${total} — ${reasons.join(", ")}.`;
}

/* THE DOWNLOADED LOG — every note taken, including the unjudgeable ones.
 *
 * Built here rather than in the click handler so a check can read it. Two
 * things about it are easy to get wrong and neither is visible in a
 * browser until somebody opens the file in a spreadsheet.
 *
 * EVERY field goes through csvField, not just the name. A member's name is
 * the field most likely to carry `=`, `+`, `-` or `@` from a studio's own
 * export, so it was the one that got quoted — but quoting one column and
 * not the rest leaves the reader guessing which are safe, and makes the
 * file's safety depend on how member ids happen to be minted today. They
 * are sanitised now (an imported `=cmd()` becomes `csv_m_1_cmd`), which is
 * exactly the kind of fact that changes without anybody rechecking here.
 *
 * And a note whose member is not in the records loaded now still appears,
 * marked. outreachResults counts those separately; this file used to drop
 * them, so the log read as a complete record of what staff did while
 * quietly omitting rows. A log that omits is worse than no log. */
export function outreachLogCsv(
  results: OutreachResults,
  ledger: readonly OutreachRecord[],
  memberName: ReadonlyMap<string, string>,
  quote: (value: string) => string,
): string {
  const lines = ["member,member id,channel,note taken,result,days to return"];
  const row = (cells: readonly string[]): void => {
    lines.push(cells.map(quote).join(","));
  };
  for (const o of results.outcomes) {
    row([
      memberName.get(o.record.memberId) ?? "",
      o.record.memberId,
      o.record.channel,
      o.record.takenAt,
      o.result === "returned" ? "came back" : "still quiet",
      o.daysToReturn === null ? "" : String(o.daysToReturn),
    ]);
  }
  for (const record of ledger) {
    if (results.outcomes.some((o) => o.record === record)) continue;
    row([
      memberName.get(record.memberId) ?? "",
      record.memberId,
      record.channel,
      record.takenAt,
      "not in these records — cannot be judged",
      "",
    ]);
  }
  return lines.join("\n") + "\n";
}

/* WHICH RULE SPOKE, IN A SENTENCE.
 *
 * Five outcomes, four of which stop a draft being offered. It lived as a
 * nested conditional inside the card renderer, where nothing could reach
 * it: main.ts touches the DOM at import, so a headless suite cannot load
 * it. These are the lines that tell a staff member WHY the studio is not
 * writing to somebody, which is the moment they most need the reason to
 * be exact. */
export function workflowStateLine(
  state: OutreachState,
  policy: OutreachPolicy,
): string {
  switch (state.kind) {
    case "ready":
      return "";
    case "disabled":
      return "Outreach workflow is off — this studio has not opted in.";
    case "suppressed":
      return `Do not contact — suppressed ${state.since}.`;
    case "outsideConsent":
      return `Outside the ${policy.consentWindowDays}-day consent window (${state.days} days quiet) — no draft offered.`;
    case "alreadyReached":
      return `Already reached for this lapse (${state.channel}, ${state.takenAt}). A new lapse re-arms.`;
  }
}

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
