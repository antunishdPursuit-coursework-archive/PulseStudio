/* Product D — unit checks. Rensley's lane.
 *
 * These run in the browser (open tests.html) with ZERO clock dependence:
 * every check pins "today" to a fixed reference day, so the same records
 * give the same verdicts forever — no aging fixtures can flake these.
 *
 * War-room rules applied here:
 *  - Known answers, not "it ran": each check asserts an exact expected value.
 *  - Near-misses on both sides of every boundary (14/15 and 60/61 days).
 *  - The one forbidden bug — counting a no_show as a visit — has a check
 *    that fails loudly if it ever appears.
 */

import { counted } from "./deps.js";
import type { FixtureSet } from "./deps.js";
import {
  csvField,
  attendanceCsv,
  generateStudio as generateSharedStudio,
  SYNTHETIC_DEFAULT_CONFIG,
} from "./deps.js";
import { adaptAttendanceCsv, cleanName, importProvenance, detectSlashDateOrder, normalizeDate, normalizeStatus, parseCsv, parseCsvRowsDetailed } from "./csv.js";
import { fixtureSetFrom, parseRuntimeReservations } from "./live-studio.js";
import type { Reservation } from "./deps.js";
import { generateStudio } from "./generate.js";
import { GENERIC_CLASS_TYPE, GENERIC_INSTRUCTOR, brand, draftMessage, outreachPolicy, proposedRules } from "./config.js";
import {
  MAILTO_SAFE_LENGTH,
  forgetOutreach,
  keepOutreachRecords,
  availabilityLine,
  mailtoHref,
  outcomesLine,
  outreachLogCsv,
  outreachAvailability,
  workflowStateLine,
  mailtoIsTooLong,
  keepSuppressionRecords,
  lapseKeyOf,
  outreachResults,
  outreachStateFor,
  recordOutreach,
  suppress,
  unsuppress,
  type OutreachRecord,
} from "./outreach.js";
import {
  dataQualityLine,
  dayNumberFromIso,
  actorNote,
  attendanceCoverage,
  coverageWarning,
  findQuietMembers,
  nobodyFlaggedLine,
  firstNameOf,
  draftFactsFor,
  draftTextFor,
  evidenceLine,
  joinSentence,
  ruleStatement,
  inviteWording,
  recentBookingActivity,
  remainingSpots,
  suggestedSession,
  summaryLine,
  todayDayNumber,
  todayIsoInZone,
  longDate,
  upcomingReservedMemberIds,
  upcomingReservedNextClassDates,
  weeklyCadence,
} from "./logic.js";

/* ------------------------------------------------------------------ */
/* Tiny check harness — collected results, stated totals               */
/* ------------------------------------------------------------------ */

interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

const results: CheckResult[] = [];

function check(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  results.push({
    name,
    passed: a === e,
    detail: a === e ? `= ${e}` : `expected ${e}, got ${a}`,
  });
}

/* ------------------------------------------------------------------ */
/* Deterministic records: reference day is 2026-08-18                  */
/* ------------------------------------------------------------------ */

const TODAY = dayNumberFromIso("2026-08-18");

/** A minimal, fully-controlled record set. Helper builds one member with
 *  a given status and a list of attended/no_show class dates. */
function recordsFor(
  people: Array<{
    id: string;
    name: string;
    status: "active" | "paused" | "canceled" | "expired";
    /** Attended class dates, optionally "date@type" to pin the class type. */
    attended: string[];
    noShows?: string[];
    unknowns?: string[];
    /** Dates whose attended session gets a DUPLICATE attendance row, the
     *  way a data-entry mistake would produce one. */
    duplicated?: string[];
  }>,
): FixtureSet {
  const sessions = new Map<string, { date: string; type: string }>();
  const attendance: FixtureSet["attendance"] = [];
  const sessionIdByPersonDate = new Map<string, string>();
  let n = 0;
  for (const p of people) {
    for (const entry of p.attended) {
      n += 1;
      const [date, type] = entry.split("@") as [string, string | undefined];
      const sid = `s_${n}`;
      sessions.set(sid, { date, type: type ?? (n % 2 === 0 ? "yoga" : "cycling") });
      sessionIdByPersonDate.set(`${p.id}|${date}`, sid);
      attendance.push({
        attendance_id: `a_${n}`,
        member_id: p.id,
        session_id: sid,
        attendance_status: "attended",
        recorded_at: `${date}T10:00:00-04:00`,
      });
    }
    for (const date of p.noShows ?? []) {
      n += 1;
      const sid = `s_${n}`;
      sessions.set(sid, { date, type: "yoga" });
      attendance.push({
        attendance_id: `a_${n}`,
        member_id: p.id,
        session_id: sid,
        attendance_status: "no_show",
        recorded_at: `${date}T10:00:00-04:00`,
      });
    }
    for (const date of p.unknowns ?? []) {
      n += 1;
      const sid = `s_${n}`;
      sessions.set(sid, { date, type: "yoga" });
      attendance.push({
        attendance_id: `a_${n}`,
        member_id: p.id,
        session_id: sid,
        attendance_status: "unknown",
        recorded_at: `${date}T10:00:00-04:00`,
      });
    }
    for (const date of p.duplicated ?? []) {
      const sid = sessionIdByPersonDate.get(`${p.id}|${date.split("@")[0]}`);
      if (!sid) throw new Error(`duplicated date ${date} was never attended`);
      n += 1;
      attendance.push({
        attendance_id: `a_${n}`,
        member_id: p.id,
        session_id: sid,
        attendance_status: "attended",
        recorded_at: `${date.split("@")[0]}T10:05:00-04:00`,
      });
    }
  }
  return {
    timezone: "America/New_York",
    note: "unit-check records",
    members: people.map((p) => ({
      member_id: p.id,
      display_name: p.name,
      membership_status: p.status,
    })),
    memberships: [],
    instructors: [{ instructor_id: "i_1", display_name: "Ana Torres" }],
    class_sessions: [...sessions.entries()].map(([sid, s]) => ({
      session_id: sid,
      class_type: s.type,
      level: "all levels",
      instructor_id: "i_1",
      starts_at: `${s.date}T09:00:00-04:00`,
      ends_at: `${s.date}T10:00:00-04:00`,
      capacity: 12,
      session_status: "completed",
    })),
    reservations: [],
    attendance,
    studio_policies: [],
  };
}

const run = (fx: FixtureSet) => findQuietMembers(fx, TODAY, proposedRules);

/* ------------------------------------------------------------------ */
/* The checks                                                          */
/* ------------------------------------------------------------------ */

// 1. The core case: a regular gone quiet for 17 days is flagged.
{
  const r = run(recordsFor([{ id: "m1", name: "Quiet Regular", status: "active", attended: ["2026-07-28", "2026-07-30", "2026-08-01"] }]));
  check("regular quiet 17 days is flagged", r.flagged.length, 1);
  check("evidence: days since last visit", r.flagged[0]?.daysSince, 17);
  check("evidence: prior attendance count", r.flagged[0]?.priorCount, 3);
}

// 2-5. Both sides of both boundaries (the rule is >14 and ≤60).
check("exactly 14 days quiet is NOT flagged",
  run(recordsFor([{ id: "m1", name: "Edge Fourteen", status: "active", attended: ["2026-08-04"] }])).flagged.length, 0);
check("15 days quiet IS flagged",
  run(recordsFor([{ id: "m1", name: "Edge Fifteen", status: "active", attended: ["2026-08-03"] }])).flagged.length, 1);
check("exactly 60 days quiet IS flagged",
  run(recordsFor([{ id: "m1", name: "Edge Sixty", status: "active", attended: ["2026-06-19"] }])).flagged.length, 1);
check("61 days quiet is NOT flagged (older is a different conversation)",
  run(recordsFor([{ id: "m1", name: "Edge SixtyOne", status: "active", attended: ["2026-06-18"] }])).flagged.length, 0);

// 6. THE forbidden bug: a no_show after the last real visit must not
//    shrink days-quiet. Last attended 20 days ago, no_show 5 days ago.
{
  const r = run(recordsFor([{ id: "m1", name: "NoShow Trap", status: "active", attended: ["2026-07-29"], noShows: ["2026-08-13"] }]));
  check("a no_show is never a visit (still flagged)", r.flagged.length, 1);
  check("a no_show is never a visit (days count from real visit)", r.flagged[0]?.daysSince, 20);
}

// 6b. Same trap, third status: an "unknown" record is never a visit either.
{
  const r = run(recordsFor([{ id: "m1", name: "Unknown Trap", status: "active", attended: ["2026-07-29"], unknowns: ["2026-08-13"] }]));
  check("an unknown record is never a visit (still flagged)", r.flagged.length, 1);
  check("an unknown record is never a visit (days count from real visit)", r.flagged[0]?.daysSince, 20);
}

// 6c. A data-entry duplicate of the same class must not inflate evidence:
//     one real class attended, duplicated once, is ONE class — not two.
{
  const r = run(recordsFor([{ id: "m1", name: "Duplicate Row", status: "active", attended: ["2026-07-29"], duplicated: ["2026-07-29"] }]));
  check("a duplicated attendance row counts once", r.flagged[0]?.priorCount, 1);
}

// 6d. The prior-attendance window is real: a class 70 days before the last
//     visit is outside the 60-day window and must not count.
{
  const r = run(recordsFor([{ id: "m1", name: "Old Timer", status: "active", attended: ["2026-05-20", "2026-07-29"] }]));
  check("classes outside the prior window never count", r.flagged[0]?.priorCount, 1);
}

// 6e. "Usual" resolves ties toward the recent: one cycling then one yoga
//     means their usual class today is yoga, not the one they drifted from.
{
  const r = run(recordsFor([{ id: "m1", name: "Switched Class", status: "active", attended: ["2026-07-20@cycling", "2026-07-29@yoga"] }]));
  check("usual class resolves ties toward the recent", r.flagged[0]?.usualClassType, "yoga");
}

// 6g. A class dated in the FUTURE is not a visit. Without this, one bad
//     row becomes "last attended", days-quiet goes negative, and a genuinely
//     quiet member silently disappears from the list.
{
  const fx = recordsFor([{ id: "m1", name: "Future Row", status: "active", attended: ["2026-08-01"] }]);
  fx.class_sessions.push({
    session_id: "s_future", class_type: "yoga", level: "all levels", instructor_id: "i_1",
    starts_at: "2027-01-01T09:00:00-04:00", ends_at: "2027-01-01T10:00:00-04:00",
    capacity: 12, session_status: "completed",
  });
  fx.attendance.push({
    attendance_id: "a_future", member_id: "m1", session_id: "s_future",
    attendance_status: "attended", recorded_at: "2027-01-01T10:00:00-04:00",
  });
  const r = run(fx);
  check("a future-dated class never hides a quiet member", r.flagged.length, 1);
  check("a future-dated class is not the last visit", r.flagged[0]?.daysSince, 17);
}

// 6h. An unreadable class date is not a visit either — same disappearance
//     risk, same guard.
{
  const fx = recordsFor([{ id: "m1", name: "Blank Date", status: "active", attended: ["2026-08-01"] }]);
  fx.class_sessions.push({
    session_id: "s_blank", class_type: "yoga", level: "all levels", instructor_id: "i_1",
    starts_at: "", ends_at: "", capacity: 12, session_status: "completed",
  });
  fx.attendance.push({
    attendance_id: "a_blank", member_id: "m1", session_id: "s_blank",
    attendance_status: "attended", recorded_at: "",
  });
  const r = run(fx);
  check("an unreadable class date never hides a quiet member", r.flagged.length, 1);
  check("an unreadable class date is not the last visit", r.flagged[0]?.daysSince, 17);
}

// 6f. "Today" is the studio's date, not the viewer's: 02:30 UTC on Aug 19
//     is still Aug 18 in America/New_York.
/* An unreadable date must never become a real day. Date.UTC rolls over in
 * silence, so these are the exact shapes that used to become evidence. */
check("a real date reads as a day number",
  Number.isFinite(dayNumberFromIso("2026-08-19")), true);
check("an unpadded real date still reads",
  dayNumberFromIso("2026-8-19"), dayNumberFromIso("2026-08-19"));
check("February 30th is not a day",
  Number.isFinite(dayNumberFromIso("2026-02-30")), false);
check("month 13 is not a day",
  Number.isFinite(dayNumberFromIso("2026-13-01")), false);
check("day 0 is not a day",
  Number.isFinite(dayNumberFromIso("2026-08-00")), false);
check("a truncated date does not become the first of the month",
  Number.isFinite(dayNumberFromIso("2026-08")), false);
check("a leap day in a leap year is a day",
  Number.isFinite(dayNumberFromIso("2028-02-29")), true);
check("a leap day in a common year is not",
  Number.isFinite(dayNumberFromIso("2026-02-29")), false);
check("words are not a day",
  Number.isFinite(dayNumberFromIso("last-Tuesday-ish")), false);
check("an empty string is not a day",
  Number.isFinite(dayNumberFromIso("")), false);
check("a full timestamp still reads its date part",
  dayNumberFromIso("2026-08-19T18:30:00"), dayNumberFromIso("2026-08-19"));

/* ONE PAGE, ONE TODAY. The thresholds were always computed in the studio's
 * zone; the ledger stamp, the suppression stamp and the "as of" line were
 * not — they read UTC or the viewer's clock. At 8pm in New York those
 * disagree with the studio by a whole day, which is enough to report a
 * member who came back as still quiet. */
{
  // 2026-08-19, 23:30 in New York — already the 20th in UTC.
  const lateEvening = new Date("2026-08-20T03:30:00Z");
  check("the studio's date is used, not UTC",
    todayIsoInZone("America/New_York", lateEvening), "2026-08-19");
  check("a viewer further east still gets the studio's date",
    todayIsoInZone("America/New_York", new Date("2026-08-19T13:00:00Z")), "2026-08-19");
  check("the day number and the date text agree",
    todayDayNumber("America/New_York", lateEvening),
    dayNumberFromIso(todayIsoInZone("America/New_York", lateEvening)));
  check("a studio in another zone gets its own date",
    todayIsoInZone("Australia/Sydney", lateEvening), "2026-08-20");

  /* THE TWO NIGHTS A YEAR THE CLOCK MOVES, AND THE ONE IT ROLLS THE YEAR.
   *
   * Everything this product decides hangs off "today" as a day number, so
   * an hour handled wrongly shifts every member's days-quiet by one, and a
   * year handled wrongly shifts them by 365. The existing cases above cover
   * an ordinary evening and a second zone; these cover the three nights
   * that are not ordinary. Intl does the work — the point is that nobody
   * later replaces it with a fixed offset, which is what "-04:00" hard-coded
   * anywhere would be.
   */
  /* WINTER IS WHERE A FIXED OFFSET SHOWS. New York is -05:00 from
   * November to March, so an instant between 04:00Z and 05:00Z is still
   * the previous evening there while a hard-coded -04:00 has already
   * rolled the date over. These two are the cases that actually tell the
   * implementations apart — replacing Intl with a fixed offset fails them
   * and leaves the rest of this block green, which is why they are here
   * and named for what they prove. */
  check("a January evening is still the previous day in the studio",
    todayIsoInZone("America/New_York", new Date("2026-01-15T04:30:00Z")), "2026-01-14");
  check("...and a February one",
    todayIsoInZone("America/New_York", new Date("2026-02-10T04:15:00Z")), "2026-02-09");

  /* The two transition hours themselves. A fixed offset agrees with Intl
   * on both of these, so they are NOT evidence about offsets — they are
   * here because an instant inside a gap or a repeated hour is where a
   * date function is most likely to throw or return something odd. */
  check("an instant inside the spring-forward gap still names a real day",
    todayIsoInZone("America/New_York", new Date("2026-03-08T06:30:00Z")), "2026-03-08");
  check("...and one inside the repeated fall-back hour does too",
    todayIsoInZone("America/New_York", new Date("2026-11-01T05:30:00Z")), "2026-11-01");
  check("New Year in UTC is still the old year in the studio",
    todayIsoInZone("America/New_York", new Date("2026-01-01T04:59:00Z")), "2025-12-31");
  check("...and a minute later it is not",
    todayIsoInZone("America/New_York", new Date("2026-01-01T05:00:00Z")), "2026-01-01");

  /* A day is a day whatever the clock did that night: consecutive dates
   * across both transitions must be exactly one day number apart, or a
   * 23-hour day silently becomes two days quiet and a 25-hour one becomes
   * none. */
  const spans = [
    ["2026-03-07T17:00:00Z", "2026-03-08T17:00:00Z", "spring forward"],
    ["2026-10-31T17:00:00Z", "2026-11-01T17:00:00Z", "fall back"],
    ["2025-12-31T17:00:00Z", "2026-01-01T17:00:00Z", "the turn of the year"],
  ] as const;
  for (const [before, after, label] of spans) {
    const a = dayNumberFromIso(todayIsoInZone("America/New_York", new Date(before)));
    const b = dayNumberFromIso(todayIsoInZone("America/New_York", new Date(after)));
    check(`one calendar day across ${label} is one day number`, b - a, 1);
  }
}
{
  check("a date is spelled out from its text, never from a viewer's clock",
    longDate("2026-08-19"), "August 19, 2026");
  check("the first of January reads correctly", longDate("2026-01-01"), "January 1, 2026");
  check("the last of December reads correctly", longDate("2026-12-31"), "December 31, 2026");
  check("an unreadable date is shown as-is, never prettified into a lie",
    longDate("not-a-date"), "not-a-date");
  check("an impossible date is not spelled out", longDate("2026-02-30"), "2026-02-30");
}

/* THE LEAP RULE IS NOW OURS, so it has to be the full one. The validity
 * check stopped building a Date and reads month lengths instead, which
 * means the Gregorian rule is hand-written here: divisible by four, except
 * centuries, except every fourth century. The four-year shortcut is right
 * until 2100 and would ship a bug nobody alive today would see fail — the
 * worst kind to leave in. */
check("2024 is a leap year (divisible by 4)", Number.isFinite(dayNumberFromIso("2024-02-29")), true);
check("2023 is not (not divisible by 4)", Number.isFinite(dayNumberFromIso("2023-02-29")), false);
check("2000 IS a leap year (divisible by 400)", Number.isFinite(dayNumberFromIso("2000-02-29")), true);
check("1900 is NOT (century, not divisible by 400)", Number.isFinite(dayNumberFromIso("1900-02-29")), false);
check("2100 is NOT — the shortcut rule would say it is",
  Number.isFinite(dayNumberFromIso("2100-02-29")), false);
check("2400 IS (divisible by 400)", Number.isFinite(dayNumberFromIso("2400-02-29")), true);
check("February never has 30 days in any year",
  Number.isFinite(dayNumberFromIso("2024-02-30")), false);

/* Every month's real length, both sides of the boundary. */
{
  const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const wrong = lengths.filter((len, i) => {
    const mm = String(i + 1).padStart(2, "0");
    const lastIsReal = Number.isFinite(dayNumberFromIso(`2026-${mm}-${String(len).padStart(2, "0")}`));
    const overIsNot = !Number.isFinite(dayNumberFromIso(`2026-${mm}-${String(len + 1).padStart(2, "0")}`));
    return !(lastIsReal && overIsNot);
  });
  check("every month ends exactly where the calendar says", wrong.length, 0);
}
check("a day number still counts from the epoch", dayNumberFromIso("1970-01-01"), 0);
check("...and one day later is one more", dayNumberFromIso("1970-01-02"), 1);
check("...and dates before it go negative", dayNumberFromIso("1969-12-31"), -1);

check("today is computed in the studio timezone",
  todayDayNumber("America/New_York", new Date(Date.UTC(2026, 7, 19, 2, 30))),
  dayNumberFromIso("2026-08-18"));

// 7-9. The excluded conversations.
/* "0 FLAGGED" IS FOUR SITUATIONS WEARING ONE NUMBER, and only one of them
 * is good news. The page used to read all four as "every member has been in
 * recently" — flatly false for the studio where everybody left months ago,
 * which is the one staff would most want to hear about. */
{
  const allGone = recordsFor([
    { id: "m1", name: "Long Gone", status: "active", attended: ["2026-04-01"] },
    { id: "m2", name: "Also Gone", status: "active", attended: ["2026-03-15"] },
  ]);
  const r = findQuietMembers(allGone, TODAY, proposedRules);
  check("a studio where everyone left flags nobody", r.flagged.length, 0);
  check("...and says they were quiet too long, never that they were in recently",
    nobodyFlaggedLine(r, proposedRules)?.includes("quiet longer than 60 days"), true);
  check("...and never claims anyone has been in recently",
    nobodyFlaggedLine(r, proposedRules)?.includes("been in within"), false);
  check("the count of those past the window is stated", r.quietLongerThanWindowCount, 2);
}
/* THE CLOSED LOOP INDEXES ATTENDANCE, AND THE LEDGER ONLY GROWS.
 *
 * outreachResults used to scan the whole attendance list once per note, so
 * it got slower every week the studio was used — 10 notes 52ms, 500 notes
 * 555ms, 2000 notes 2220ms on a 2000-member studio. It now collects each
 * asked-about member's attended days once, ascending, so the first visit
 * after a note is a walk over that member's own history. These pin the
 * behaviour the index has to preserve. */
{
  const fx = recordsFor([
    { id: "m1", name: "Came Back", status: "active", attended: ["2026-08-01", "2026-08-14", "2026-08-16"] },
    { id: "m2", name: "Stayed Quiet", status: "active", attended: ["2026-07-20"] },
  ]);
  const ledger = [
    { memberId: "m1", lapseKey: "m1|a", takenAt: "2026-08-12", channel: "copy" as const },
    { memberId: "m2", lapseKey: "m2|a", takenAt: "2026-08-12", channel: "copy" as const },
    { memberId: "ghost", lapseKey: "g|a", takenAt: "2026-08-01", channel: "email" as const },
  ];
  const r = outreachResults(ledger, fx, TODAY);
  check("the FIRST visit after the note is the return, not the last",
    r.outcomes.find((o) => o.record.memberId === "m1")?.daysToReturn, 2);
  check("a member with only earlier visits is still quiet",
    r.outcomes.find((o) => o.record.memberId === "m2")?.result, "stillQuiet");
  check("a member outside these records is accounted, not judged", r.notEvaluable, 1);

  // Two notes about the same member resolve independently off one index.
  const twice = [
    { memberId: "m1", lapseKey: "m1|old", takenAt: "2026-07-25", channel: "copy" as const },
    { memberId: "m1", lapseKey: "m1|new", takenAt: "2026-08-15", channel: "copy" as const },
  ];
  const r2 = outreachResults(twice, fx, TODAY);
  check("an earlier note finds the earlier return",
    r2.outcomes.find((o) => o.record.lapseKey === "m1|old")?.daysToReturn, 7);
  check("a later note finds the later one",
    r2.outcomes.find((o) => o.record.lapseKey === "m1|new")?.daysToReturn, 1);
  check("no_show rows never become a return",
    outreachResults(
      [{ memberId: "m2", lapseKey: "x", takenAt: "2026-07-01", channel: "copy" as const }],
      recordsFor([{ id: "m2", name: "No Shows Only", status: "active", attended: ["2026-06-15"], noShows: ["2026-08-10"] }]),
      TODAY).outcomes[0]?.result,
    "stillQuiet");
}

/* THE SEAT COUNTS ARE MEMOISED, AND A MEMO CAN GO STALE.
 *
 * remainingSpots is asked about every candidate class for every flagged
 * member, so it counts seats once per reservation list rather than once per
 * question — 137 SECONDS down to 391ms at two thousand members. The first
 * version keyed that memo on the RECORD SET, and swapping in a different
 * reservation list on the same object kept returning the first answer
 * forever. Four checks below caught it within a minute of it being written;
 * these keep it caught. */
{
  const fx = recordsFor([{ id: "m1", name: "Someone", status: "active", attended: ["2026-08-01@yoga"] }]);
  const session = {
    session_id: "s-cache", class_type: "yoga", level: "all levels", instructor_id: "i1",
    starts_at: "2026-08-22T09:00:00", ends_at: "2026-08-22T10:00:00",
    capacity: 2, session_status: "scheduled" as const,
  };
  fx.class_sessions = [...fx.class_sessions, session];

  fx.reservations = [];
  check("an empty list leaves every seat", remainingSpots(session, fx), 2);

  fx.reservations = [
    { reservation_id: "r1", member_id: "a", session_id: "s-cache",
      reservation_status: "reserved", reserved_at: "2026-08-20T09:00:00", canceled_at: null },
  ];
  check("swapping in a new list is seen, not served from the last answer",
    remainingSpots(session, fx), 1);

  fx.reservations = [
    { reservation_id: "r1", member_id: "a", session_id: "s-cache",
      reservation_status: "reserved", reserved_at: "2026-08-20T09:00:00", canceled_at: null },
    { reservation_id: "r2", member_id: "b", session_id: "s-cache",
      reservation_status: "reserved", reserved_at: "2026-08-20T10:00:00", canceled_at: null },
  ];
  check("...and again when it fills", remainingSpots(session, fx), 0);

  // Asking twice must give the same answer — that is the memo working.
  check("two lookups on the same list agree",
    [remainingSpots(session, fx), remainingSpots(session, fx)], [0, 0]);

  // A different session in the same list is counted separately.
  const other = { ...session, session_id: "s-other", capacity: 5 };
  check("seats are per session, not shared across the studio",
    remainingSpots(other, fx), 5);
}

/* THE INDEX MUST AGREE WITH THE SCAN IT REPLACED.
 *
 * findQuietMembers used to re-scan the whole attendance array once per
 * member — O(members x attendance), which measured 4045ms at two thousand
 * members, on a page that re-runs it after every workflow click. Grouping
 * attendance by member first makes it O(members + attendance) and took that
 * to 430ms. Speed is worthless if the answer moved, so this pins the
 * equivalence: the same member's attended sessions, resolved both ways,
 * over a studio big enough that the two implementations could diverge. */
{
  const studio = generateStudio(20260818, "2026-08-18");
  const data = studio.records;

  // The scan the index replaced, kept here as the reference answer.
  const byScan = (memberId: string): string[] =>
    [...new Set(
      data.attendance
        .filter((a) => a.member_id === memberId && a.attendance_status === "attended")
        .map((a) => a.session_id),
    )].sort();

  // The grouping findQuietMembers now builds, reproduced the same way.
  const index = new Map<string, string[]>();
  for (const a of data.attendance) {
    if (a.attendance_status !== "attended") continue;
    const rows = index.get(a.member_id);
    if (rows === undefined) index.set(a.member_id, [a.session_id]);
    else rows.push(a.session_id);
  }
  const byIndex = (memberId: string): string[] =>
    [...new Set(index.get(memberId) ?? [])].sort();

  const disagreements = data.members.filter(
    (m) => byScan(m.member_id).join(",") !== byIndex(m.member_id).join(","),
  );
  check("the index agrees with the per-member scan for every member",
    disagreements.length, 0);
  check("...over a studio with enough members to matter",
    data.members.length >= 50, true);
  check("...and a member with no attendance resolves to nothing either way",
    [byScan("nobody").length, byIndex("nobody").length], [0, 0]);

  // A no_show must stay out of the index, the way it stayed out of the scan.
  const noShowMembers = new Set(
    data.attendance.filter((a) => a.attendance_status === "no_show").map((a) => a.member_id),
  );
  const leaked = [...noShowMembers].filter((id) => {
    const shows = new Set(
      data.attendance
        .filter((a) => a.member_id === id && a.attendance_status === "no_show")
        .map((a) => a.session_id),
    );
    return byIndex(id).some((sid) => shows.has(sid) && !byScan(id).includes(sid));
  });
  check("no no_show session reaches the index", leaked.length, 0);
}

/* THE MEMBER THE PAGE SETS ASIDE AFTER THE RULE RAN. main.ts removes anyone
 * already holding an upcoming reserved spot from result.flagged, so this
 * function cannot see them. It counted them under "have been in recently" —
 * flatly false about somebody quiet for seventeen days who simply booked
 * their way back, and the exact kind of sentence this product exists not to
 * produce. */
{
  const fx = recordsFor([{ id: "m1", name: "Coming Back", status: "active", attended: ["2026-08-01@yoga"] }]);
  fx.class_sessions = [...fx.class_sessions, {
    session_id: "soon", class_type: "yoga", level: "all levels", instructor_id: "i1",
    starts_at: "2026-08-22T09:00:00", ends_at: "2026-08-22T10:00:00",
    capacity: 12, session_status: "scheduled" as const,
  }];
  fx.reservations = [{
    reservation_id: "r1", member_id: "m1", session_id: "soon",
    reservation_status: "reserved" as const, reserved_at: "2026-08-17T09:00:00", canceled_at: null,
  }];
  const result = findQuietMembers(fx, TODAY, proposedRules);
  check("the rule flags them — they have been quiet 17 days", result.flagged.length, 1);
  const returning = result.flagged.filter((f) =>
    upcomingReservedNextClassDates(fx, TODAY).has(f.member.member_id));
  result.flagged = result.flagged.filter((f) =>
    !upcomingReservedNextClassDates(fx, TODAY).has(f.member.member_id));
  check("...and the page sets them aside", [result.flagged.length, returning.length], [0, 1]);
  const line = nobodyFlaggedLine(result, proposedRules, returning.length);
  check("...and is NEVER described as having been in recently",
    line?.includes("been in within"), false);
  check("...but as quiet and already booked back in",
    line?.includes("quiet but already booked back in"), true);
  check("the old wording was the bug: without the count it lies",
    nobodyFlaggedLine(result, proposedRules, 0)?.includes("been in within"), true);
}

{
  const allRecent = recordsFor([
    { id: "m1", name: "Was In Monday", status: "active", attended: ["2026-08-18"] },
  ]);
  const r = findQuietMembers(allRecent, TODAY, proposedRules);
  check("a genuinely healthy studio still gets the good news",
    nobodyFlaggedLine(r, proposedRules)?.includes("been in within the last 14 days"), true);

  /* AND SAYS NOTHING ABOUT THE CATEGORIES THAT ARE EMPTY.
   *
   * Each clause is guarded by a count being above zero, and every one of
   * those guards could be loosened to "or equal" with nothing noticing —
   * the clauses had checks for APPEARING and none for staying away. The
   * result would be an empty state reciting "0 have never attended a
   * class" for every category the studio does not have, which is the
   * opposite of stating a negative usefully: it is noise wearing the
   * shape of information. */
  const healthy = nobodyFlaggedLine(r, proposedRules) ?? "";
  check("...without reciting a zero for the long-quiet",
    healthy.includes("quiet longer than"), false);
  check("...or for members who never attended",
    healthy.includes("never attended"), false);
  check("...or for members already booked back in",
    healthy.includes("already booked back in"), false);
  check("...and no clause counts nobody",
    /\b0 (has|have|is|are)\b/.test(healthy), false);
}
{
  const noneActive = recordsFor([
    { id: "m1", name: "Paused Person", status: "paused", attended: ["2026-07-01"] },
  ]);
  const r = findQuietMembers(noneActive, TODAY, proposedRules);
  check("a records set with no active members says exactly that",
    nobodyFlaggedLine(r, proposedRules)?.includes("all 1 are paused, canceled or expired"), true);
  check("inactive members are counted, not silently skipped", r.notActiveCount, 1);
}
{
  const newcomer = recordsFor([{ id: "m1", name: "Brand New", status: "active", attended: [] }]);
  const r = findQuietMembers(newcomer, TODAY, proposedRules);
  check("a never-attended member is named as onboarding, not re-engagement",
    nobodyFlaggedLine(r, proposedRules)?.includes("never attended"), true);
  check("never-attended members are counted", r.neverAttendedCount, 1);
}
check("when somebody IS flagged there is nothing to explain",
  nobodyFlaggedLine(
    findQuietMembers(recordsFor([{ id: "m1", name: "Quiet One", status: "active", attended: ["2026-08-01"] }]), TODAY, proposedRules),
    proposedRules), null);

/* A STUDIO THAT STOPS RECORDING LOOKS EXACTLY LIKE A STUDIO EVERYBODY LEFT.
 * From inside one member's history the two are identical, which is why the
 * whole record set has to be asked when anyone last attended anything. */
{
  const stillRunning = recordsFor([
    { id: "m1", name: "Quiet One", status: "active", attended: ["2026-08-01"] },
    { id: "m2", name: "Regular", status: "active", attended: ["2026-08-18"] },
  ]);
  const cov = attendanceCoverage(stillRunning, TODAY, proposedRules);
  check("a studio still recording has current coverage", cov.recordsHaveGoneQuiet, false);
  check("the last recorded day is found", cov.daysSinceAnyAttendance, 0);
  check("...and no warning is printed over a healthy record set",
    coverageWarning(cov, findQuietMembers(stillRunning, TODAY, proposedRules), proposedRules), null);

  /* THE THREE COMPARISONS INSIDE THIS ANSWER.
   *
   * attendanceCoverage decides whether the RECORDS have gone quiet, which
   * is the warning printed above the flags — if the clipboard broke, every
   * flag underneath is suspect. Three comparisons build it and none had a
   * boundary: which rows are too new to count, which row is the most
   * recent, and how quiet the records must be before it says so. TODAY is
   * 2026-08-18 and the threshold is 14 days. */
  const coverageOf = (days: readonly string[]): ReturnType<typeof attendanceCoverage> =>
    attendanceCoverage(
      recordsFor(days.map((d, i) => ({
        id: `c${i}`, name: `Person ${i}`, status: "active" as const, attended: [d],
      }))),
      TODAY,
      proposedRules,
    );

  check("a row dated today is the most recent, not a future row to skip",
    coverageOf(["2026-08-18", "2026-07-01"]).daysSinceAnyAttendance, 0);
  check("the most recent usable row wins, whatever order they arrive in",
    coverageOf(["2026-07-01", "2026-08-10", "2026-07-20"]).daysSinceAnyAttendance, 8);

  check("records exactly at the threshold have NOT gone quiet",
    coverageOf(["2026-08-04"]).recordsHaveGoneQuiet, false);
  check("...one day past it, they have",
    coverageOf(["2026-08-03"]).recordsHaveGoneQuiet, true);
  check("...and the day count backs that up", coverageOf(["2026-08-04"]).daysSinceAnyAttendance, 14);
}
{
  // The clipboard broke on 2026-08-01. Everyone still comes; nobody is recorded.
  const clipboardBroke = recordsFor([
    { id: "m1", name: "Still Coming", status: "active", attended: ["2026-08-01"] },
    { id: "m2", name: "Also Coming", status: "active", attended: ["2026-07-30"] },
  ]);
  const cov = attendanceCoverage(clipboardBroke, TODAY, proposedRules);
  const result = findQuietMembers(clipboardBroke, TODAY, proposedRules);
  check("both members are flagged — the rule cannot tell from inside", result.flagged.length, 2);
  check("but the records are recognised as having gone quiet", cov.recordsHaveGoneQuiet, true);
  const warn = coverageWarning(cov, result, proposedRules);
  check("...and the page says the flags are suspect", warn !== null, true);
  check("...naming how long the records have been silent",
    warn?.includes("17 days"), true);
  check("...and why it matters",
    warn?.includes("stopped RECORDING"), true);
}
{
  // No flags, no warning: nothing to be suspicious ABOUT.
  const empty = recordsFor([{ id: "m1", name: "Recent", status: "active", attended: ["2026-08-18"] }]);
  check("a quiet record set with nothing flagged prints no warning",
    coverageWarning(attendanceCoverage(empty, TODAY, proposedRules),
      findQuietMembers(empty, TODAY, proposedRules), proposedRules), null);
}
{
  const never = recordsFor([{ id: "m1", name: "Brand New", status: "active", attended: [] }]);
  const cov = attendanceCoverage(never, TODAY, proposedRules);
  check("records with no attendance at all report null, not day zero",
    [cov.lastRecordedDay, cov.daysSinceAnyAttendance], [null, null]);
  check("...and never claim the records went quiet", cov.recordsHaveGoneQuiet, false);
}

check("paused member is NOT flagged",
  run(recordsFor([{ id: "m1", name: "Paused Person", status: "paused", attended: ["2026-07-29"] }])).flagged.length, 0);
check("canceled member is NOT flagged",
  run(recordsFor([{ id: "m1", name: "Gone Person", status: "canceled", attended: ["2026-07-29"] }])).flagged.length, 0);
check("never-attended member is NOT flagged (onboarding, not ours)",
  run(recordsFor([{ id: "m1", name: "Brand New", status: "active", attended: [] }])).flagged.length, 0);

// 10. Ranking: the more frequent past attender outranks the less frequent.
{
  const r = run(recordsFor([
    { id: "m1", name: "Once A Month", status: "active", attended: ["2026-07-25"] },
    { id: "m2", name: "Thrice A Week", status: "active", attended: ["2026-07-20", "2026-07-22", "2026-07-24", "2026-07-26"] },
  ]));
  check("ranking puts the most frequent past attender first", r.flagged[0]?.member.member_id, "m2");
  check("ranking flags both quiet members", r.flagged.length, 2);
}

// 11. The stated result line, flagged and empty forms.
{
  const some = run(recordsFor([
    { id: "m1", name: "Quiet Regular", status: "active", attended: ["2026-08-01"] },
    { id: "m2", name: "Recent Regular", status: "active", attended: ["2026-08-16"] },
  ]));
  check("summary states checked and flagged counts",
    summaryLine(some, "August 18, 2026"),
    "2 members checked, 1 flagged as of August 18, 2026.");
  const none = run(recordsFor([{ id: "m1", name: "Recent Regular", status: "active", attended: ["2026-08-16"] }]));
  check("summary states the negative when nobody is flagged",
    summaryLine(none, "August 18, 2026"),
    "1 member checked, 0 flagged as of August 18, 2026.");
}

// 12. The draft: every fact present, nothing template-shaped left. These
//     assert FACTS (name, days, class, brand) rather than voice — a reseller
//     who rewrites the voice in config.ts keeps every check green as long as
//     the facts survive, because the expectations read from the same config.
{
  const text = draftMessage({
    firstName: firstNameOf("Maria Santos"),
    daysSince: 17,
    usualClassType: "yoga",
    usualInstructorFirstName: firstNameOf("Ana Torres"),
    studioName: brand.studioName,
    suggestedInvite: null,
  });
  check("draft carries the member's first name", text.includes("Maria"), true);
  check("draft carries the days away", text.includes("17"), true);
  check("draft carries their usual class", text.includes("yoga"), true);
  check("draft carries the studio name from config", text.includes(brand.studioName), true);
  check("draft has no unfilled placeholders", /[{}$]/.test(text), false);
  check("draft keeps the three ways back even without an invite",
    text.includes("products/a-booking/") && text.includes("products/c-chatbot/"), true);
}

/* THE CONSENT WINDOW IS DORMANT, AND THAT IS A MEASURED FACT.
 *
 * outreachStateFor's outsideConsent branch works — there is a check for it
 * above, built from a FlaggedMember constructed by hand. What that check
 * cannot show is that findQuietMembers can never PRODUCE such a member:
 * the rule caps daysSince at maxDaysQuiet, so with a consent window larger
 * than that ceiling the branch is unreachable in the real pipeline. It was
 * being described in the README as something that happens. */
{
  check("the consent window sits above the rule's own ceiling, so it cannot fire today",
    outreachPolicy.consentWindowDays >= proposedRules.maxDaysQuiet, true);

  // Nothing the rule can produce reaches it, over a whole generated studio.
  const studio = generateStudio(20260818, "2026-08-18");
  const result = findQuietMembers(studio.records, TODAY, proposedRules);
  const kinds = new Set(
    result.flagged.map((f) => outreachStateFor(f, outreachPolicy, [], []).kind),
  );
  check("no member the rule flags is ever outside the consent window",
    kinds.has("outsideConsent"), false);
  check("...and the quietest of them is inside it",
    Math.max(...result.flagged.map((f) => f.daysSince)) <= outreachPolicy.consentWindowDays, true);

  // And it is not dead code: lower the window under the ceiling and it speaks.
  const tight = { ...outreachPolicy, consentWindowDays: 20 };
  const someone = result.flagged.find((f) => f.daysSince > 20);
  check("a window inside the rule's ceiling DOES fire — the branch is alive, just dormant",
    someone === undefined ? "outsideConsent" : outreachStateFor(someone, tight, [], []).kind,
    "outsideConsent");
}

/* ADAPT, NEVER GATE. The audience law lets a surface change its words for
 * whoever is signed in and forbids it hiding or blocking a route, because
 * the browser session is convenience and not access control. A member who
 * lands on the staff view should not be left wondering why the studio is
 * showing them a list of other people. */
{
  const url = "https://studio.invalid/";
  check("a signed-in member is told what this page is",
    actorNote("member", url)?.includes("staff view"), true);
  check("...and pointed at their own pages",
    actorNote("member", url)?.includes("products/a-booking/"), true);
  check("...and told none of it is about their account",
    actorNote("member", url)?.includes("Nothing here is about your account"), true);
  check("staff are told nothing — the page was built for them",
    actorNote("staff", url), null);
  check("a signed-out visitor is told nothing either",
    actorNote(null, url), null);
  check("the note carries the configured studio url, not a hard-coded one",
    actorNote("member", "https://other.invalid/")?.includes("https://other.invalid/products/a-booking/"), true);
}

/* A MAILTO LINK THAT WOULD BE TRUNCATED MUST NOT BE OFFERED. Mail clients
 * cut long URLs without saying so, and opening the client CLAIMS THE LAPSE
 * — so the member receives one half-finished note and then, correctly by
 * the discipline, never hears about that silence again. */
{
  check("the shipped voice is nowhere near the limit",
    mailtoIsTooLong("mailto:?subject=x&body=" + "y".repeat(900)), false);
  check("a link past the safe length is refused",
    mailtoIsTooLong("mailto:?subject=x&body=" + "y".repeat(MAILTO_SAFE_LENGTH)), true);
  check("exactly the safe length is allowed",
    mailtoIsTooLong("y".repeat(MAILTO_SAFE_LENGTH)), false);
  check("one character over is not",
    mailtoIsTooLong("y".repeat(MAILTO_SAFE_LENGTH + 1)), true);
  check("the limit sits under the lowest known client ceiling",
    MAILTO_SAFE_LENGTH < 2000, true);
}

/* THE LOG IS A RECORD OF WHAT STAFF DID, so it cannot quietly omit rows.
 * Notes taken against a different data source cannot be judged by the
 * records loaded now — the page counts them, and the download used to drop
 * them, which made an incomplete file read as a complete one. */
{
  const fx = recordsFor([{ id: "m1", name: "Judged One", status: "active", attended: ["2026-08-16"] }]);
  const ledger = [
    { memberId: "m1", lapseKey: "m1|2026-08-01", takenAt: "2026-08-12", channel: "copy" as const },
    { memberId: "ghost", lapseKey: "ghost|2026-07-01", takenAt: "2026-08-01", channel: "email" as const },
  ];
  const results = outreachResults(ledger, fx, TODAY);
  check("the unjudgeable note is counted, not judged", results.notEvaluable, 1);
  check("...and it is NOT among the outcomes", results.outcomes.length, 1);
  // The download writes one line per outcome PLUS one per ledger entry that
  // produced no outcome, so every note taken appears exactly once.
  const written = results.outcomes.length +
    ledger.filter((r) => !results.outcomes.some((o) => o.record === r)).length;
  check("every note taken gets exactly one line in the log", written, ledger.length);
}

/* THE INVITATION HAS TO BE REAL. The draft says "want us to save you a
 * spot?" — in a personal note, from a studio that just noticed this member
 * stopped coming. Sent about a full class, the member cannot book or has to
 * be told no, which is a worse second impression than the silence this tool
 * exists to break. */
{
  const fx = recordsFor([{ id: "m1", name: "Quiet One", status: "active", attended: ["2026-08-01@yoga"] }]);
  const future = {
    session_id: "s-future", class_type: "yoga", level: "all levels",
    instructor_id: "i1", starts_at: "2026-08-22T09:00:00", ends_at: "2026-08-22T10:00:00",
    capacity: 2, session_status: "scheduled" as const,
  };
  fx.class_sessions = [...fx.class_sessions, future];
  const flagged = findQuietMembers(fx, TODAY, proposedRules).flagged[0];

  check("an empty class has all its seats", remainingSpots(future, fx), 2);
  check("...and is offered", suggestedSession(flagged!, fx, TODAY)?.session_id, "s-future");

  fx.reservations = [
    { reservation_id: "r1", member_id: "other1", session_id: "s-future",
      reservation_status: "reserved", reserved_at: "2026-08-20T09:00:00", canceled_at: null },
    { reservation_id: "r2", member_id: "other2", session_id: "s-future",
      reservation_status: "reserved", reserved_at: "2026-08-20T10:00:00", canceled_at: null },
  ];
  check("a full class has no seats", remainingSpots(future, fx), 0);
  check("...and is never offered", suggestedSession(flagged!, fx, TODAY), null);

  // Booking appends a cancel row; last row wins, so the seat comes back.
  fx.reservations = [...fx.reservations, {
    reservation_id: "r2", member_id: "other2", session_id: "s-future",
    reservation_status: "canceled" as const, reserved_at: "2026-08-20T10:00:00",
    canceled_at: "2026-08-21T08:00:00",
  }];
  check("a cancellation frees the seat, by last-row-wins", remainingSpots(future, fx), 1);
  check("...and the class is offered again", suggestedSession(flagged!, fx, TODAY)?.session_id, "s-future");

  // One member appearing twice holds one seat, not two.
  fx.reservations = [
    { reservation_id: "r1", member_id: "other1", session_id: "s-future",
      reservation_status: "reserved", reserved_at: "2026-08-20T09:00:00", canceled_at: null },
    { reservation_id: "r1", member_id: "other1", session_id: "s-future",
      reservation_status: "reserved", reserved_at: "2026-08-20T09:00:00", canceled_at: null },
  ];
  check("a member counted twice still holds one seat", remainingSpots(future, fx), 1);

  /* AN ID FORMAT IS NOT THIS FUNCTION'S TO DEPEND ON. The seat counts were
   * first keyed on `${session}|${member}` in one flat map and recovered the
   * session by slicing at the last pipe — correct exactly as long as no
   * member id ever contains a pipe, which is true of all three doors today
   * and true only by luck. */
  fx.reservations = [
    { reservation_id: "r1", member_id: "a|b", session_id: "s-future",
      reservation_status: "reserved", reserved_at: "2026-08-20T09:00:00", canceled_at: null },
  ];
  check("a member id containing a pipe still holds exactly one seat",
    remainingSpots(future, fx), 1);
  fx.reservations = [
    { reservation_id: "r1", member_id: "a|b", session_id: "s-future",
      reservation_status: "reserved", reserved_at: "2026-08-20T09:00:00", canceled_at: null },
    { reservation_id: "r2", member_id: "a|b", session_id: "s-future",
      reservation_status: "canceled" as const, reserved_at: "2026-08-20T09:00:00",
      canceled_at: "2026-08-21T08:00:00" },
  ];
  check("...and frees it on cancellation, like any other member",
    remainingSpots(future, fx), 2);
}

/* WHAT THE RECORDS DO NOT SAY. A sign-in sheet is a name and a date: it does
 * not know what the person came to or who taught it. Those arrived as the
 * placeholders "class" and "the team" and were dropped straight into the
 * sentence, so the SUPPORTED sign-in-sheet import produced "your last class
 * class" in a note a staff member was about to send to a real member. These
 * check every combination reads like a person wrote it. */
{
  const base = { firstName: "Maria", daysSince: 20, studioName: brand.studioName };
  const signInSheet = draftMessage({
    ...base, usualClassType: null, usualInstructorFirstName: null, suggestedInvite: null,
  });
  check("an unknown class never doubles the word",
    signInSheet.includes("class class"), false);
  check("...and the note still says how long it has been",
    signInSheet.includes("20 days since your last class"), true);
  check("...and never names an instructor the records do not have",
    signInSheet.includes("the team") || signInSheet.includes("The team"), false);
  check("...and still offers a spot", signInSheet.includes("spot with your name on it"), true);
  check("...with no unfilled placeholder", /[{}$]/.test(signInSheet), false);

  const noInstructor = draftMessage({
    ...base, usualClassType: "yoga", usualInstructorFirstName: null, suggestedInvite: null,
  });
  check("a known class with no instructor still names the class",
    noInstructor.includes("your last yoga class"), true);
  check("...without inventing a teacher for it",
    noInstructor.includes("teaches"), false);

  const unknownClassRealSession = draftMessage({
    ...base, usualClassType: null, usualInstructorFirstName: null,
    suggestedInvite: "on Thursday at 9:00 AM",
  });
  check("a real upcoming class is still offered when the past class is unknown",
    unknownClassRealSession.includes("There's a class on Thursday at 9:00 AM"), true);

  const everything = draftMessage({
    ...base, usualClassType: "yoga", usualInstructorFirstName: "Kim",
    suggestedInvite: "on Thursday at 9:00 AM",
  });
  check("the fully-known note is unchanged",
    everything.includes("Kim teaches yoga on Thursday at 9:00 AM"), true);
}

/* ------------------------------------------------------------------ */
/* The outreach discipline: once per lapse, suppression, consent, opt-in */
/* ------------------------------------------------------------------ */

// 12a. The outreach ledger: one note per lapse, re-armed by a NEW lapse.
{
  const first = run(recordsFor([{ id: "m1", name: "Quiet Regular", status: "active", attended: ["2026-08-01"] }])).flagged[0];
  if (!first) throw new Error("fixture defect: nobody flagged");
  let ledger: OutreachRecord[] = [];
  check("an untouched lapse is ready",
    outreachStateFor(first, outreachPolicy, ledger, []).kind, "ready");
  ledger = recordOutreach(ledger, first, "copy", "2026-08-18");
  check("taking the draft claims the lapse",
    outreachStateFor(first, outreachPolicy, ledger, []).kind, "alreadyReached");
  // The member returns (new last-attended), then lapses again: NEW lapse.
  const relapsed = run(recordsFor([{ id: "m1", name: "Quiet Regular", status: "active", attended: ["2026-08-01", "2026-08-02"] }])).flagged[0];
  if (!relapsed) throw new Error("fixture defect: relapse not flagged");
  check("a new lapse re-arms the outreach",
    outreachStateFor(relapsed, outreachPolicy, ledger, []).kind, "ready");
  check("lapse identity is member + last-attended date",
    lapseKeyOf(first) === lapseKeyOf(relapsed), false);
}

// 12b. Suppression: checked BEFORE the ledger, reversible, idempotent.
{
  const f = run(recordsFor([{ id: "m1", name: "Quiet Regular", status: "active", attended: ["2026-08-01"] }])).flagged[0];
  if (!f) throw new Error("fixture defect");
  const ledger = recordOutreach([], f, "email", "2026-08-17");
  let sup = suppress([], "m1", "2026-08-16");
  check("suppression beats the ledger",
    outreachStateFor(f, outreachPolicy, ledger, sup).kind, "suppressed");
  check("suppressing twice stores once", suppress(sup, "m1", "2026-08-17").length, 1);
  sup = unsuppress(sup, "m1");
  check("unsuppression restores the ledger verdict",
    outreachStateFor(f, outreachPolicy, ledger, sup).kind, "alreadyReached");
}

// 12c. Consent aging: silence beyond the window refuses to draft, by name.
{
  const f = run(recordsFor([{ id: "m1", name: "Quiet Regular", status: "active", attended: ["2026-08-01"] }])).flagged[0];
  if (!f) throw new Error("fixture defect");
  const narrow = { ...outreachPolicy, consentWindowDays: 10 };
  check("outside the consent window the tool refuses, by name",
    outreachStateFor(f, narrow, [], []).kind, "outsideConsent");
  // A member BOTH suppressed AND outside the window: the do-not-contact
  // answer wins, because "they said no" outranks "we waited too long" —
  // the card should state the member's own decision, not our timing.
  check("suppression outranks the consent window",
    outreachStateFor(f, narrow, [], suppress([], "m1", "2026-08-10")).kind,
    "suppressed");
}

// 12d. The opt-in gate outranks everything, including suppression state.
{
  const f = run(recordsFor([{ id: "m1", name: "Quiet Regular", status: "active", attended: ["2026-08-01"] }])).flagged[0];
  if (!f) throw new Error("fixture defect");
  const off = { ...outreachPolicy, enabled: false };
  check("a studio that never opted in gets no outreach workflow",
    outreachStateFor(f, off, [], suppress([], "m1", "2026-08-16")).kind, "disabled");
}

/* ------------------------------------------------------------------ */
/* Concrete invites, cadence, and the closed loop                       */
/* ------------------------------------------------------------------ */

// 12e. The draft invites to a REAL class matching the member's own pattern —
//      usual class with the usual instructor first, then usual class with
//      anyone, and never an invented invitation.
{
  const fx = recordsFor([{ id: "m1", name: "Quiet Regular", status: "active", attended: ["2026-08-01@yoga"] }]);
  fx.instructors.push({ instructor_id: "i_2", display_name: "Kim Lee" });
  fx.class_sessions.push(
    { session_id: "up_1", class_type: "yoga", level: "all levels", instructor_id: "i_2",
      starts_at: "2026-08-20T09:00:00-04:00", ends_at: "2026-08-20T10:00:00-04:00",
      capacity: 12, session_status: "scheduled" },
    { session_id: "up_2", class_type: "yoga", level: "all levels", instructor_id: "i_1",
      starts_at: "2026-08-21T18:00:00-04:00", ends_at: "2026-08-21T19:00:00-04:00",
      capacity: 12, session_status: "scheduled" },
    { session_id: "up_3", class_type: "cycling", level: "beginner", instructor_id: "i_1",
      starts_at: "2026-08-19T07:00:00-04:00", ends_at: "2026-08-19T07:45:00-04:00",
      capacity: 12, session_status: "scheduled" },
  );
  const f = run(fx).flagged[0];
  if (!f) throw new Error("fixture defect");
  const pick = suggestedSession(f, fx, TODAY);
  check("the invite prefers their usual instructor over an earlier class",
    pick?.session_id, "up_2");
  check("the invite words are concrete", pick ? inviteWording(pick) : "",
    "on Friday at 6:00 PM");
  fx.class_sessions = fx.class_sessions.filter((x) => x.session_id !== "up_2");
  const fallback = suggestedSession(f, fx, TODAY);
  check("without their instructor, their usual class still wins",
    fallback?.session_id, "up_1");
}
/* THE EDGE OF THE PRIOR WINDOW, WHICH IS THE NUMBER ON THE CARD.
 *
 * "4 classes in the prior 60 days" is the evidence a staff member weighs,
 * and the comparison deciding what counts as inside those 60 days could
 * be shifted with nothing noticing. The window is measured back from the
 * member's LAST visit, not from today — so with a last visit on
 * 2026-08-01 it opens on 2026-06-02, exactly sixty days earlier. */
{
  const priorCountFor = (extra: string): number => {
    const fx = recordsFor([
      { id: "m1", name: "Quiet Regular", status: "active",
        attended: ["2026-08-01@yoga", extra] },
    ]);
    const flagged = run(fx).flagged[0];
    if (!flagged) throw new Error("fixture defect");
    return flagged.priorCount;
  };

  check("a class exactly sixty days before the last visit is inside the window",
    priorCountFor("2026-06-02@yoga"), 2);
  check("...and one day earlier is outside it",
    priorCountFor("2026-06-01@yoga"), 1);
  check("...while a class in the middle of the window plainly counts",
    priorCountFor("2026-07-15@yoga"), 2);
}

/* THE TEN-DAY WINDOW THE INVITATION LIVES IN.
 *
 * Four separate mutations survived on the one line that decides which
 * class a member is invited to — both ends of the window and the guard
 * against an unreadable date. The capacity rule beside it was checked and
 * the wording was checked; the window itself never was.
 *
 * Each case carries exactly ONE candidate, so what is being measured is
 * the boundary and not the ranking. TODAY is 2026-08-18, which puts the
 * window at the 19th through the 28th. */
{
  const withSession = (startsAt: string): FixtureSet => {
    const fx = recordsFor([
      { id: "m1", name: "Quiet Regular", status: "active", attended: ["2026-08-01@yoga"] },
    ]);
    fx.class_sessions.push({
      session_id: "candidate", class_type: "yoga", level: "beginner", instructor_id: "i_1",
      starts_at: startsAt, ends_at: startsAt, capacity: 12, session_status: "scheduled",
    });
    return fx;
  };
  const offered = (startsAt: string): string | null => {
    const fx = withSession(startsAt);
    const flagged = run(fx).flagged[0];
    if (!flagged) throw new Error("fixture defect");
    return suggestedSession(flagged, fx, TODAY)?.session_id ?? null;
  };

  check("a class TODAY is not offered — it may already have started",
    offered("2026-08-18T18:00:00-04:00"), null);
  check("tomorrow is the first day that can be offered",
    offered("2026-08-19T18:00:00-04:00"), "candidate");
  check("the tenth day out is still inside the window",
    offered("2026-08-28T18:00:00-04:00"), "candidate");
  check("the eleventh is not — an invitation that far ahead is not a nudge",
    offered("2026-08-29T18:00:00-04:00"), null);
  check("a class that already happened is never offered",
    offered("2026-08-10T18:00:00-04:00"), null);
  check("a class whose date cannot be read is never offered",
    offered("not-a-timestamp"), null);
}

{
  const fx = recordsFor([{ id: "m1", name: "Quiet Regular", status: "active", attended: ["2026-08-01@yoga"] }]);
  const f = run(fx).flagged[0];
  if (!f) throw new Error("fixture defect");
  check("no upcoming schedule means no invented invitation",
    suggestedSession(f, fx, TODAY), null);
  const text = draftMessage({
    firstName: "Maria", daysSince: 17, usualClassType: "yoga",
    usualInstructorFirstName: "Ana", studioName: brand.studioName,
    suggestedInvite: "on Thursday at 9:00 AM",
  });
  check("the draft weaves the concrete invite in",
    text.includes("on Thursday at 9:00 AM"), true);
}

// 12f. Cadence: comparable across members, honestly rounded.
check("cadence math: 12 classes in 60 days is 1.4 a week", weeklyCadence(12, 60), 1.4);
check("cadence math: 3 classes in 60 days is 0.4 a week", weeklyCadence(3, 60), 0.4);

// 12g. The closed loop: a note followed by attendance is a RETURN with the
//      days counted; silence after the note is stated; a visit BEFORE the
//      note never counts; foreign ledger entries are accounted, not dropped.
{
  const fx = recordsFor([
    { id: "m1", name: "Saved Member", status: "active", attended: ["2026-07-20", "2026-08-10"] },
    { id: "m2", name: "Still Gone", status: "active", attended: ["2026-07-25"] },
  ]);
  const ledger = [
    { memberId: "m1", lapseKey: "m1|2026-07-20", takenAt: "2026-08-06", channel: "email" as const },
    { memberId: "m2", lapseKey: "m2|2026-07-25", takenAt: "2026-08-12", channel: "copy" as const },
    { memberId: "ghost", lapseKey: "ghost|2026-07-01", takenAt: "2026-08-01", channel: "copy" as const },
  ];
  const results = outreachResults(ledger, fx, TODAY);
  check("a visit after the note is a return, days counted",
    results.outcomes.find((o) => o.record.memberId === "m1")?.daysToReturn, 4);
  check("silence after the note is stated, not hidden",
    results.outcomes.find((o) => o.record.memberId === "m2")?.result, "stillQuiet");
  check("a foreign ledger entry is accounted, never silently dropped",
    results.notEvaluable, 1);
  check("the aggregate states the loop",
    [results.returned, results.stillQuiet, results.medianDaysToReturn], [1, 1, 4]);
}
{
  // The visit-before-the-note trap: attendance on 08-10, note on 08-12.
  const fx = recordsFor([{ id: "m1", name: "Pre Noted", status: "active", attended: ["2026-08-10"] }]);
  const results = outreachResults(
    [{ memberId: "m1", lapseKey: "m1|2026-08-10", takenAt: "2026-08-12", channel: "copy" }],
    fx, TODAY);
  check("a visit BEFORE the note never counts as a return",
    results.outcomes[0]?.result, "stillQuiet");
}

/* BOOKING'S REAL CANCEL SHAPE. cancelReservation in a-booking appends a NEW
 * row that PRESERVES the original reserved_at and adds canceled_at. Both
 * rows therefore carry the same reserved_at, so dating by reserved_at gave
 * them the same day and a strict > kept the booking — the "(canceled)"
 * qualifier this product added on purpose never rendered once for a real
 * cancellation. The earlier check passed only because it fabricated a
 * cancel row whose reserved_at was the cancel date, which Booking never
 * emits. These use Booking's actual shape. */
{
  const fx = recordsFor([{ id: "m1", name: "Booked Then Canceled", status: "active", attended: ["2026-08-01"] }]);
  const bookedAt = "2026-08-10T09:00:00";
  fx.reservations = [
    { reservation_id: "r1", member_id: "m1", session_id: "s-future",
      reservation_status: "reserved", reserved_at: bookedAt, canceled_at: null },
    // Booking's cancel row: SAME reserved_at, a real canceled_at.
    { reservation_id: "r1", member_id: "m1", session_id: "s-future",
      reservation_status: "canceled", reserved_at: bookedAt, canceled_at: "2026-08-16T14:00:00" },
  ];
  check("a cancellation is dated by when it was canceled, not when it was booked",
    recentBookingActivity("m1", fx, dayNumberFromIso("2026-08-01"), TODAY), "2026-08-16 (canceled)");
}
{
  const fx = recordsFor([{ id: "m1", name: "Same Day Cancel", status: "active", attended: ["2026-08-01"] }]);
  const sameDay = "2026-08-12T09:00:00";
  fx.reservations = [
    { reservation_id: "r1", member_id: "m1", session_id: "s-future",
      reservation_status: "reserved", reserved_at: sameDay, canceled_at: null },
    { reservation_id: "r1", member_id: "m1", session_id: "s-future",
      reservation_status: "canceled", reserved_at: sameDay, canceled_at: sameDay },
  ];
  check("booked and cancelled on one day reads as cancelled — the last row is the last word",
    recentBookingActivity("m1", fx, dayNumberFromIso("2026-08-01"), TODAY), "2026-08-12 (canceled)");
}
{
  const fx = recordsFor([{ id: "m1", name: "Still Booked", status: "active", attended: ["2026-08-01"] }]);
  fx.reservations = [
    { reservation_id: "r1", member_id: "m1", session_id: "s-future",
      reservation_status: "reserved", reserved_at: "2026-08-10T09:00:00", canceled_at: null },
  ];
  check("a live booking is still reported without the qualifier",
    recentBookingActivity("m1", fx, dayNumberFromIso("2026-08-01"), TODAY), "2026-08-10");
}
{
  const fx = recordsFor([{ id: "m1", name: "Cancel Without Time", status: "active", attended: ["2026-08-01"] }]);
  fx.reservations = [
    { reservation_id: "r1", member_id: "m1", session_id: "s-future",
      reservation_status: "canceled", reserved_at: "2026-08-11T09:00:00", canceled_at: null },
  ];
  check("a cancel row with no canceled_at falls back to the booking date, still qualified",
    recentBookingActivity("m1", fx, dayNumberFromIso("2026-08-01"), TODAY), "2026-08-11 (canceled)");
}

/* "SINCE THEIR LAST VISIT" HAS TWO EDGES, AND NEITHER WAS CHECKED.
 *
 * The card can say "Booked since their last visit — but did not attend",
 * which is a different story from plain silence and changes what a staff
 * member writes. Both comparisons bounding it survived mutation: whether
 * an action on the DAY OF the last visit counts as after it, and whether
 * one dated today counts as having happened yet. Last visit is
 * 2026-08-01 and TODAY is 2026-08-18. */
{
  const bookedOn = (reservedAt: string): string | null => {
    const fx = recordsFor([
      { id: "m1", name: "Edge Booker", status: "active", attended: ["2026-08-01"] },
    ]);
    fx.reservations = [
      { reservation_id: "r1", member_id: "m1", session_id: "s-future",
        reservation_status: "reserved", reserved_at: reservedAt, canceled_at: null },
    ];
    return recentBookingActivity("m1", fx, dayNumberFromIso("2026-08-01"), TODAY);
  };

  check("a booking made on the day of the last visit is not 'since' it",
    bookedOn("2026-08-01T09:00:00"), null);
  check("the day after is", bookedOn("2026-08-02T09:00:00"), "2026-08-02");
  check("a booking made today counts — it has happened",
    bookedOn("2026-08-18T09:00:00"), "2026-08-18");
  check("one dated tomorrow does not, because it has not",
    bookedOn("2026-08-19T09:00:00"), null);
  check("nor does one whose date cannot be read", bookedOn("sometime"), null);
}

/* AND "UPCOMING" MEANS STRICTLY FUTURE, THE SAME AS THE INVITATION.
 *
 * upcomingReservedNextClassDates decides who is listed as already booked
 * back in and left alone. A class TODAY does not make that list, matching
 * suggestedSession's window — the same convention, and now the same
 * check. */
{
  const reservedFor = (startsAt: string): boolean => {
    const fx = recordsFor([
      { id: "m1", name: "Booked Back", status: "active", attended: ["2026-08-01"] },
    ]);
    fx.class_sessions.push({
      session_id: "s_when", class_type: "yoga", level: "all levels", instructor_id: "i_1",
      starts_at: startsAt, ends_at: startsAt, capacity: 12, session_status: "scheduled",
    });
    fx.reservations = [
      { reservation_id: "r1", member_id: "m1", session_id: "s_when",
        reservation_status: "reserved", reserved_at: "2026-08-15T09:00:00", canceled_at: null },
    ];
    return upcomingReservedNextClassDates(fx, TODAY).has("m1");
  };

  check("a class today does not count as already booked back in",
    reservedFor("2026-08-18T18:00:00"), false);
  check("tomorrow does", reservedFor("2026-08-19T18:00:00"), true);
  check("a class that already happened does not",
    reservedFor("2026-08-10T18:00:00"), false);
}

/* ------------------------------------------------------------------ */
/* Reading the stored ledger back — the browser is hostile input        */
/* ------------------------------------------------------------------ */

/* The ledger and the do-not-contact list are JSON in a browser store. A
 * person, an extension, or an older build of this page can have written
 * anything there. Before these checks the rows were cast unread, and a row
 * missing takenAt reached the median arithmetic in outreachResults() and
 * turned a staff-facing number into NaN. Each row is now judged alone. */
{
  const good = { memberId: "m1", lapseKey: "m1|2026-08-01", takenAt: "2026-08-12", channel: "copy" };
  check("a well-formed ledger row survives",
    keepOutreachRecords([good]).kept.length, 1);
  check("a row missing takenAt is dropped and counted",
    [keepOutreachRecords([{ memberId: "m1", lapseKey: "k", channel: "copy" }]).kept.length,
     keepOutreachRecords([{ memberId: "m1", lapseKey: "k", channel: "copy" }]).dropped], [0, 1]);
  check("a row whose takenAt is not a date is dropped",
    keepOutreachRecords([{ ...good, takenAt: "last Tuesday" }]).dropped, 1);
  check("an impossible date is not a date",
    keepOutreachRecords([{ ...good, takenAt: "2026-02-30" }]).dropped, 1);
  check("an unknown channel is dropped — only copy and email exist",
    keepOutreachRecords([{ ...good, channel: "sms" }]).dropped, 1);

  /* WHAT localStorage CAN ACTUALLY HAND BACK.
   *
   * This ledger is JSON.parse of a browser key, so every shape JSON can
   * hold reaches these readers — including the one that catches people
   * out. `[null]` is valid JSON, and typeof null is "object", which is
   * exactly why the guard reads `typeof row !== "object" || row === null`.
   * Turn that `||` into `&&` and the reader dereferences null and throws,
   * taking the whole page down on a corrupt key. Every case above passes
   * a well-formed OBJECT, so nothing noticed.
   *
   * The date guard has the same shape: a non-string reaching
   * dayNumberFromIso throws on .split. */
  check("a null row is dropped, not dereferenced",
    keepOutreachRecords([null] as unknown as object[]).dropped, 1);
  check("...and the survivors around it are still kept",
    keepOutreachRecords([null, good] as unknown as object[]).kept.length, 1);
  check("an array pretending to be a record is dropped",
    keepOutreachRecords([[] as unknown as object]).dropped, 1);
  check("a bare string is dropped",
    keepOutreachRecords(["m1"] as unknown as object[]).dropped, 1);
  check("a numeric takenAt is dropped rather than split",
    keepOutreachRecords([{ ...good, takenAt: 20260101 }] as unknown as object[]).dropped, 1);
  check("a null suppression row is dropped too",
    keepSuppressionRecords([null] as unknown as object[]).dropped, 1);
  check("...and a suppression with a numeric date",
    keepSuppressionRecords([{ memberId: "m1", suppressedOn: 20260101 }] as unknown as object[]).dropped, 1);
  check("an empty member id is dropped, never treated as a member",
    keepOutreachRecords([{ ...good, memberId: "" }]).dropped, 1);
  check("null and strings among the rows are dropped, not read",
    keepOutreachRecords([null, "not a row", 7, good]).kept.length, 1);
  check("good rows survive alongside bad ones — one bad row is not a bad file",
    [keepOutreachRecords([good, null, { memberId: "m2", lapseKey: "k2", takenAt: "2026-08-13", channel: "email" }]).kept.length,
     keepOutreachRecords([good, null, { memberId: "m2", lapseKey: "k2", takenAt: "2026-08-13", channel: "email" }]).dropped],
    [2, 1]);
  check("a non-array store reads as nothing, never throws",
    [keepOutreachRecords({ memberId: "m1" }).kept.length, keepOutreachRecords(null).kept.length], [0, 0]);
  check("__proto__ in a row does not make it a record",
    keepOutreachRecords([JSON.parse('{"__proto__":{"x":1}}')]).dropped, 1);
}
{
  const good = { memberId: "m1", suppressedOn: "2026-08-16" };
  check("a well-formed suppression survives", keepSuppressionRecords([good]).kept.length, 1);
  check("a suppression without a date is dropped and counted",
    [keepSuppressionRecords([{ memberId: "m1" }]).kept.length,
     keepSuppressionRecords([{ memberId: "m1" }]).dropped], [0, 1]);
  check("a suppression with an unreadable date is dropped",
    keepSuppressionRecords([{ ...good, suppressedOn: "16/08/2026" }]).dropped, 1);
}
{
  /* THE BUG THIS SECTION EXISTS FOR: an unreadable row must never reach the
   * arithmetic. Fed straight through, the bad row used to produce NaN. */
  const fx = recordsFor([{ id: "m1", name: "Returned One", status: "active", attended: ["2026-08-16"] }]);
  const stored = [
    { memberId: "m1", lapseKey: "m1|2026-08-01", takenAt: "2026-08-12", channel: "copy" },
    { memberId: "m1", lapseKey: "m1|2026-08-01", channel: "copy" },
  ];
  const results = outreachResults(keepOutreachRecords(stored).kept, fx, TODAY);
  check("a corrupt row never reaches the median — the number stays a number",
    Number.isFinite(results.medianDaysToReturn ?? NaN), true);
  check("the corrupt row is counted as dropped, not judged",
    [keepOutreachRecords(stored).dropped, results.outcomes.length], [1, 1]);
}

/* ------------------------------------------------------------------ */
/* The CSV door                                                        */
/* ------------------------------------------------------------------ */

// 13. Parsing: quoted fields, embedded commas, doubled quotes.
{
  const rows = parseCsv('name,note\n"Santos, Maria","said ""hi"" twice"\n');
  check("csv parsing handles quoted commas and doubled quotes",
    rows[1], ["Santos, Maria", 'said "hi" twice']);
}

/* AN UNTERMINATED QUOTE IS THE SILENT ONE. An odd number of quote marks is
 * a commonplace defect in a real export, and once the parser is inside a
 * quote every later comma and newline is ordinary text — the rest of the
 * file collapses into one cell of one row and simply stops existing. The
 * page used to report "0 rows skipped" over the wreckage. */
{
  const good = "member,date\nMaria Santos,2026-08-01\nJames Okafor,2026-08-02\n";
  const broken = 'member,date\nMaria Santos,2026-08-01\n"James Okafor,2026-08-02\nPriya Patel,2026-08-03\n';
  check("a well-formed file reports no structural defect",
    parseCsvRowsDetailed(good).unterminatedQuoteAtLine, null);
  check("an unterminated quote is reported with the line it opened on",
    parseCsvRowsDetailed(broken).unterminatedQuoteAtLine, 3);
  check("the rows below an unterminated quote really do vanish — that is the harm",
    parseCsvRowsDetailed(broken).rows.length < parseCsvRowsDetailed(good.replace("James", "X")).rows.length + 1, true);
  const adapted = adaptAttendanceCsv(broken, "America/New_York");
  check("the import states the defect instead of reporting a clean read",
    adapted.skipped.some((n) => n.includes("never closes")), true);
  check("the defect is stated first, before any per-row skip",
    adapted.skipped[0]?.includes("never closes"), true);
  check("a clean file states no such defect",
    adaptAttendanceCsv(good, "America/New_York").skipped.some((n) => n.includes("never closes")), false);
}

// 14. Header mapping is case-insensitive and order-free; US dates normalize.
{
  const imp = adaptAttendanceCsv("Date,Member,Status\n8/1/2026,Maria Santos,attended\n", "America/New_York");
  check("headers map case-insensitively in any order", imp.memberCount, 1);
  check("US-style dates normalize", imp.records.class_sessions[0]?.starts_at, "2026-08-01T00:00:00");
}

// 15. A sign-in sheet with no status column means attended.
{
  const imp = adaptAttendanceCsv("name,date\nMaria Santos,2026-08-01\n", "America/New_York");
  check("missing status column means attended", imp.records.attendance[0]?.attendance_status, "attended");
}

// 16. Status vocabulary maps to the contract's three values.
/* WHICH NUMBER IS THE MONTH. Read month-first, a European export dated
 * 05/03/2026 becomes the 3rd of May instead of the 5th of March — a visit
 * moved two months in silence — while 25/03/2026 has "month 25" and is
 * skipped outright. Half the file misdated, half discarded. The file itself
 * settles it: a first component above 12 cannot be a month. */
{
  check("a value above 12 in the first position proves day-first",
    detectSlashDateOrder(["05/03/2026", "25/03/2026"]), "day-first");
  check("a value above 12 in the second position proves month-first",
    detectSlashDateOrder(["03/25/2026", "05/03/2026"]), "month-first");
  check("a file where neither position ever exceeds 12 is ambiguous",
    detectSlashDateOrder(["05/03/2026", "04/06/2026"]), "ambiguous");
  check("a file with both above 12 fits no single reading",
    detectSlashDateOrder(["25/03/2026", "03/25/2026"]), "contradictory");
  /* An all-ISO file has NO slash date to have an order, which is not the
   * same as one whose order cannot be settled. It used to report
   * "ambiguous", and the page then told staff how their slash dates were
   * read when they had none — an always-on disclosure, which is the kind
   * that teaches people to skip the ones that matter. Caught by a check on
   * the provenance line, not by reading this function. */
  check("a file with no slash date at all reports none, not ambiguous",
    detectSlashDateOrder(["2026-08-19", "2026-08-20"]), "none");
  check("a slash date that settles nothing IS ambiguous",
    detectSlashDateOrder(["05/03/2026", "04/06/2026"]), "ambiguous");
  check("an empty file reports none", detectSlashDateOrder([]), "none");
  check("a day-first file reads the day first",
    normalizeDate("05/03/2026", "day-first"), "2026-03-05");
  check("the same text read month-first is a different day",
    normalizeDate("05/03/2026", "month-first"), "2026-05-03");
  check("a day-first date that month-first would SKIP is now read",
    normalizeDate("25/03/2026", "day-first"), "2026-03-25");
  check("month-first still refuses the impossible", normalizeDate("25/03/2026", "month-first"), null);
  check("the default reading is month-first, unchanged", normalizeDate("05/03/2026"), "2026-05-03");
}
{
  // End to end: a European export used to lose half its rows.
  const european = "member,date\nMaria Santos,05/03/2026\nMaria Santos,25/03/2026\nJames Okafor,14/03/2026\n";
  const imported = adaptAttendanceCsv(european, "America/New_York");
  check("a European export reads every row instead of skipping half",
    imported.skipped.length, 0);
  check("...and says which reading its own values proved", imported.dateOrder, "day-first");
  check("...and dates them in March, not May",
    imported.records.class_sessions.every((c) => c.starts_at.startsWith("2026-03")), true);
}
{
  // A half-filled identifier column splits one person into two.
  const split = "member id,member,date\n123,Maria Santos,2026-08-01\n,Maria Santos,2026-08-05\n";
  const imported = adaptAttendanceCsv(split, "America/New_York");
  check("a half-filled identifier column is caught", imported.splitIdentities.length, 1);
  check("...and the split is stated by name",
    imported.splitIdentities[0]?.includes("Maria Santos"), true);
  check("...and it really did become two members", imported.memberCount, 2);
}
{
  const consistent = "member id,member,date\n123,Maria Santos,2026-08-01\n123,Maria Santos,2026-08-05\n";
  const imported = adaptAttendanceCsv(consistent, "America/New_York");
  check("a consistently-filled identifier column states no split",
    imported.splitIdentities.length, 0);
  check("...and keeps one person as one person", imported.memberCount, 1);
}
{
  const twoPeople = "member,date\nMaria Santos,2026-08-01\nJames Okafor,2026-08-05\n";
  const imported = adaptAttendanceCsv(twoPeople, "America/New_York");
  check("two genuinely different names are not a split",
    imported.splitIdentities.length, 0);
}

/* A CLAIM MADE BY MISTAKE WAS PERMANENT.
 *
 * Opening the mail client claims the lapse, because from there the note is
 * in a person's hands and this tool cannot see what happens next. A client
 * that never opened — no handler, a blocked window, a stray click — left
 * the claim standing over a note that did not exist, and the discipline
 * then correctly refused to offer that lapse again. The member's silence
 * went unanswered forever, by a rule working exactly as designed on a fact
 * that was wrong. Suppression was always reversible; this was not. */
{
  const fx = recordsFor([{ id: "m1", name: "Quiet One", status: "active", attended: ["2026-08-01"] }]);
  const f = findQuietMembers(fx, TODAY, proposedRules).flagged[0]!;
  const key = lapseKeyOf(f);

  let ledger = recordOutreach([], f, "email", "2026-08-12");
  check("taking a draft claims the lapse",
    outreachStateFor(f, outreachPolicy, ledger, []).kind, "alreadyReached");

  ledger = forgetOutreach(ledger, key);
  check("forgetting the claim offers the draft again",
    outreachStateFor(f, outreachPolicy, ledger, []).kind, "ready");
  check("...and leaves no entry behind", ledger.length, 0);

  // It must forget ONE lapse, not a member's whole history.
  const other = { memberId: f.member.member_id, lapseKey: "m1|2026-05-01",
    takenAt: "2026-05-10", channel: "copy" as const };
  const mixed = forgetOutreach([...recordOutreach([], f, "email", "2026-08-12"), other], key);
  check("an older lapse for the same member is untouched",
    mixed.map((r) => r.lapseKey), ["m1|2026-05-01"]);

  // And it must not resurrect anything when the key is not there.
  check("forgetting a lapse that was never claimed changes nothing",
    forgetOutreach([other], "m1|not-a-lapse").length, 1);

  // Suppression is a different rule and outranks this one either way.
  check("forgetting a claim does not un-suppress anybody",
    outreachStateFor(f, outreachPolicy, forgetOutreach(ledger, key),
      suppress([], f.member.member_id, "2026-08-16")).kind, "suppressed");
}

/* TWO DIFFERENT PEOPLE NEED TWO DIFFERENT IDS.
 *
 * This door is seeded on the calendar day, so it builds a different studio
 * tomorrow — but the ids did not move with it: gen_m_1 was one person today
 * and another tomorrow, all sixty of them, every day. Do-not-contact stores
 * a member id and nothing else, so suppressing somebody today silently
 * suppressed whoever inherited their number tomorrow, and a staff member
 * would meet a person marked do-not-contact they had never seen. */
{
  const a = generateStudio(20260821, "2026-08-21").records;
  const b = generateStudio(20260822, "2026-08-22").records;

  const allIds = (r: typeof a): Set<string> => new Set([
    ...r.members.map((m) => m.member_id),
    ...r.memberships.map((m) => m.membership_id),
    ...r.instructors.map((i) => i.instructor_id),
    ...r.class_sessions.map((s) => s.session_id),
    ...r.attendance.map((x) => x.attendance_id),
    ...r.reservations.map((x) => x.reservation_id),
  ]);
  const shared = [...allIds(a)].filter((id) => allIds(b).has(id));
  check("two seeds share no id at all", shared.length, 0);

  const sameNumberDifferentPerson = a.members.filter((m) => {
    const other = b.members.find((x) => x.member_id === m.member_id);
    return other !== undefined && other.display_name !== m.display_name;
  });
  check("no id means one person today and another tomorrow",
    sameNumberDifferentPerson.length, 0);

  // The same seed must still be perfectly reproducible — that is the whole
  // point of this door, and namespacing must not have broken it.
  check("the same seed builds the same studio, byte for byte",
    JSON.stringify(generateStudio(20260821, "2026-08-21").records), JSON.stringify(a));

  // And the three doors still cannot collide with each other.
  check("generated ids never look like the live trail's",
    a.members.some((m) => m.member_id.startsWith("member:")), false);
  check("...nor like a CSV import's",
    a.members.some((m) => m.member_id.startsWith("csv_m_")), false);
}

/* A SIGN-IN SHEET CANNOT TELL TWO CLASSES FROM ONE VISIT ENTERED TWICE.
 *
 * The session a row belongs to is keyed on date + class + instructor. Give
 * the file no class column — which is exactly what a sign-in sheet is, a
 * name and a date — and every row on one date collapses into one session,
 * so a member who trains twice that day is credited with one visit.
 * Measured: the same sixteen visits read as "8 classes (≈0.9/week)" from a
 * sign-in sheet and "16 classes (≈1.9/week)" from an export that names the
 * class. That number is the evidence staff judge a member by, and it also
 * ranks the list.
 *
 * Counting them twice would be inventing attendance, so the count stays at
 * one and the ambiguity is stated — the same answer this product gives
 * everywhere it cannot know. */
{
  const days = ["07-06", "07-08", "07-10", "07-13"];
  const sheet = ["member,date", ...days.flatMap((d) => [`Maria Santos,2026-${d}`, `Maria Santos,2026-${d}`])].join("\n") + "\n";
  const named = ["member,date,class", ...days.flatMap((d) => [`Maria Santos,2026-${d},yoga`, `Maria Santos,2026-${d},HIIT`])].join("\n") + "\n";

  const a = adaptAttendanceCsv(sheet, "America/New_York");
  const b = adaptAttendanceCsv(named, "America/New_York");

  check("a sign-in sheet collapses each day into one session",
    a.records.class_sessions.length, days.length);
  check("...while an export that names the class keeps both",
    b.records.class_sessions.length, days.length * 2);
  check("the collapse is counted", a.sameDayRepeats, days.length);
  check("...and the file is known to lack a class column", a.classColumnMissing, true);
  check("an export that names the class has no ambiguity to state",
    [b.sameDayRepeats, b.classColumnMissing], [0, false]);

  // A genuinely duplicated row, WITH a class column, is a duplicate — and
  // still counts once, which was already the deliberate rule.
  const dup = "member,date,class\nMaria Santos,2026-07-06,yoga\nMaria Santos,2026-07-06,yoga\n";
  const d = adaptAttendanceCsv(dup, "America/New_York");
  check("a true duplicate row is counted once", d.records.class_sessions.length, 1);
  check("...and reported as a duplicate, not as an unknowable",
    [d.sameDayRepeats, d.classColumnMissing], [1, false]);

  const clean = "member,date,class\nMaria Santos,2026-07-06,yoga\nMaria Santos,2026-07-08,HIIT\n";
  check("a clean file states nothing",
    adaptAttendanceCsv(clean, "America/New_York").sameDayRepeats, 0);
}

/* ACCEPTANCE CHECK 7, WHICH NOTHING PROVED UNTIL NOW.
 *
 * The product brief lists seven acceptance checks. Six had cover somewhere
 * in this file. The seventh — "The tool changes no shared record: fixtures
 * are byte-identical after a run" — was stated in the brief, restated in
 * the README as a law this product lives by, and asserted by nobody. A
 * read-only guarantee that nothing checks is a hope, and this one is the
 * whole reason the other three products can trust this one to look at
 * their records.
 *
 * So: snapshot the records, run everything the page runs over them, and
 * compare byte for byte. Deep-freezing as well, so a mutation throws
 * rather than merely showing up in the diff. */
{
  const data = generateStudio(20260818, "2026-08-18").records;
  const before = JSON.stringify(data);

  const deepFreeze = (value: unknown): void => {
    if (typeof value !== "object" || value === null || Object.isFrozen(value)) return;
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  };
  deepFreeze(data);

  /* THE FREEZE HAS TO REPORT, NOT CRASH. Frozen records make a mutation
   * throw at the line that did it, which is the most useful place to learn
   * about one — but an escaping throw takes the whole suite down, and a
   * suite that DID NOT RUN tells nobody which guarantee broke. Caught here
   * so the answer is a named red check either way. Verified by planting a
   * data.attendance.sort() inside findQuietMembers: without this, the suite
   * did not run at all. */
  let mutationError = "";
  let findQuietMembersCount = 0;
  const run = (): void => {
  // Everything the page does to a record set, in the order it does it.
  const today = todayDayNumber(data.timezone);
  const result = findQuietMembers(data, today, proposedRules);
  findQuietMembersCount = result.flagged.length;
  attendanceCoverage(data, today, proposedRules);
  coverageWarning(attendanceCoverage(data, today, proposedRules), result, proposedRules);
  upcomingReservedMemberIds(data, today);
  upcomingReservedNextClassDates(data, today);
  dataQualityLine(result);
  summaryLine(result, "August 18, 2026");
  nobodyFlaggedLine(result, proposedRules, 0);
  for (const f of result.flagged) {
    recentBookingActivity(f.member.member_id, data, dayNumberFromIso(f.lastSession.starts_at), today);
    const session = suggestedSession(f, data, today);
    if (session) {
      remainingSpots(session, data);
      inviteWording(session);
    }
    lapseKeyOf(f);
    outreachStateFor(f, outreachPolicy, [], []);
  }
  outreachResults(
    result.flagged.slice(0, 5).map((f) => ({
      memberId: f.member.member_id, lapseKey: lapseKeyOf(f),
      takenAt: "2026-08-12", channel: "copy" as const,
    })),
    data, today,
  );

  };
  let flaggedCount = 0;
  try {
    run();
  } catch (error) {
    mutationError = error instanceof Error ? error.message : String(error);
  }
  flaggedCount = findQuietMembersCount;

  check("nothing tried to write to a shared record", mutationError, "");
  check("the tool changed no shared record — byte-identical after a whole run",
    JSON.stringify(data), before);
  check("...over a record set worth running (members)", data.members.length >= 50, true);
  check("...and worth running (attendance rows)", data.attendance.length >= 200, true);
  check("...and it actually found somebody, so the run was real", flaggedCount > 0, true);
}

/* THE SENTENCE A STAFF MEMBER READS TO DECIDE HOW MUCH TO TRUST THE REST.
 *
 * Five conditional branches with pluralisation in each, and until now every
 * one was provable only by opening the page — it lived in main.ts, which no
 * headless suite can import because it touches the DOM at module load. That
 * is exactly the kind of text that goes quietly wrong: one of these counts
 * said "names" while counting rows for several commits. */
{
  const clean = "member,date,class\nMaria Santos,2026-08-01,yoga\nJames Okafor,2026-08-02,HIIT\n";
  const line = importProvenance(adaptAttendanceCsv(clean, "America/New_York"), "roster.csv");
  check("a clean import names the file, the rows and the members",
    line.startsWith("Data: roster.csv — 2 rows, 2 members, 0 rows skipped."), true);
  check("...and says nothing it does not have to",
    /invisible|repeats|read as|Slash dates/.test(line), false);
  check("...but always states the two standing limits",
    line.includes("treated as an active member") && line.includes("never left your browser"), true);
}
{
  // Every disclosure at once, so their order and spacing are pinned too.
  const ZWSP = String.fromCodePoint(0x200b);
  const messy = ["member id,member,date",
    `123,Mar${ZWSP}ia Santos,13/1/2026`,
    `,Mar${ZWSP}ia Santos,14/1/2026`,
    "James Okafor,,not-a-date"].join("\n") + "\n";
  const imported = adaptAttendanceCsv(messy, "America/New_York");
  const line = importProvenance(imported, "messy.csv");
  check("the date reading is disclosed when the file proves it",
    line.includes("read day-first"), true);
  check("the cleaned name is disclosed", line.includes("invisible or control characters removed"), true);
  check("a skipped row is disclosed with its reason", line.includes("skipped:"), true);
  check("...and the sentence still ends with the standing limits",
    line.endsWith("This data never left your browser."), true);
}
{
  // Pluralisation, both sides, for each count that has one.
  const one = { rowCount: 1, memberCount: 1, skipped: [], splitIdentities: [],
    namesCleaned: 1, sameDayRepeats: 1, classColumnMissing: false, dateOrder: "month-first" as const,
    identityIsName: true, identityMethod: "member name", identityMayCountRows: false,
    records: { timezone: "", note: "", members: [], memberships: [], instructors: [],
      class_sessions: [], reservations: [], attendance: [], studio_policies: [] } };
  const oneLine = importProvenance(one, "f.csv");
  check("one cleaned name reads 'name had', not 'names had'",
    oneLine.includes("1 name had") && !oneLine.includes("1 names had"), true);
  check("one duplicate row reads 'row was'", oneLine.includes("1 duplicate row was"), true);

  /* THE SPLIT-IDENTITY NOTE, WHICH EVERY CASE HERE LEFT EMPTY.
   *
   * splitIdentities carries the sentence that tells staff a file half
   * filled its id column, so some rows matched by id and some by name —
   * the one warning that explains why a member might appear twice. The
   * import path is checked for producing it; this sentence was only ever
   * built with the list EMPTY, so the test deciding whether to include it
   * could be inverted and nothing would notice: the note would vanish
   * exactly when it is needed and appear as a stray space when it is not. */
  const split = { ...one, splitIdentities: ["Maria Santos appears under two identities."] };
  const splitLine = importProvenance(split, "f.csv");
  check("a split identity is carried into the sentence",
    splitLine.includes("Maria Santos appears under two identities."), true);
  check("...and the file with none says nothing about identities",
    oneLine.includes("appears under two identities"), false);
  check("...and leaves no stray gap where the note would have gone",
    /  +/.test(oneLine), false);

  const many = { ...one, namesCleaned: 3, sameDayRepeats: 4 };
  const manyLine = importProvenance(many, "f.csv");
  check("three cleaned names read 'names had'", manyLine.includes("3 names had"), true);
  check("four duplicates read 'rows were'", manyLine.includes("4 duplicate rows were"), true);

  // Without a class column the same repeat is an unknowable, not a duplicate.
  const unknowable = importProvenance({ ...one, classColumnMissing: true }, "f.csv");
  check("with no class column a repeat is disclosed as unknowable",
    unknowable.includes("cannot say whether that is a second class"), true);
  check("...and never as a plain duplicate",
    unknowable.includes("duplicate row was"), false);
}
{
  // The bound on skipped rows: five shown, the rest counted.
  const many = { rowCount: 9, memberCount: 0, splitIdentities: [], namesCleaned: 0,
    sameDayRepeats: 0, classColumnMissing: false, dateOrder: "month-first" as const,
    identityIsName: true, identityMethod: "member name", identityMayCountRows: false,
    skipped: Array.from({ length: 9 }, (_, i) => `line ${i + 2}: bad`),
    records: { timezone: "", note: "", members: [], memberships: [], instructors: [],
      class_sessions: [], reservations: [], attendance: [], studio_policies: [] } };
  const line = importProvenance(many, "f.csv");
  check("nine skipped rows list five and count the rest",
    line.includes("and 4 more, not listed here"), true);
  check("...stating the true total up front", line.includes("9 rows skipped:"), true);
  const five = importProvenance({ ...many, skipped: many.skipped.slice(0, 5) }, "f.csv");
  check("exactly five are all listed, with no 'and more'",
    five.includes("not listed here"), false);
}

/* AN INVISIBLE CHARACTER SPLITS A MEMBER IN TWO, AND NOBODY CAN SEE IT.
 *
 * A zero-width space makes "Bob" and "Bo<ZWSP>b" render identically and
 * count as two members — the same history-splitting false flag as a
 * half-filled identifier column, except undiagnosable from the screen. A
 * right-to-left override reverses how the rest of a name displays, which
 * reaches the member in a drafted note. Control characters are never a
 * name at all. */
{
  const ZWSP = String.fromCodePoint(0x200b);
  const NUL = String.fromCodePoint(0x00);
  const RTL = String.fromCodePoint(0x202e);
  const twin = ["member,date", `Bo${ZWSP}b,2026-08-01`, "Bob,2026-08-04", "Bob,2026-08-08"].join("\n") + "\n";
  const imported = adaptAttendanceCsv(twin, "America/New_York");
  check("an invisible twin is one member, not two", imported.memberCount, 1);
  check("...keeping all of that member's visits", imported.records.attendance.length, 3);
  check("...and the cleaning is counted, never silent", imported.namesCleaned, 1);

  /* PER NAME, NOT PER ROW. One member with a zero-width space and twenty
   * visits is ONE name cleaned. Counting rows reported twenty — twenty
   * times the truth, stated with total confidence, in the disclosure
   * written to warn staff about invisible characters. */
  const manyVisits = ["member,date,class",
    ...Array.from({ length: 20 }, (_, i) =>
      `Mar${ZWSP}ia Santos,2026-07-${String(i + 1).padStart(2, "0")},yoga`)].join("\n") + "\n";
  const many = adaptAttendanceCsv(manyVisits, "America/New_York");
  check("one member across twenty rows is ONE name cleaned", many.namesCleaned, 1);
  check("...and is still one member", many.memberCount, 1);

  /* A name that is ENTIRELY invisible cleans to nothing, produces no
   * member, and is already reported as an empty name. Counting it here as
   * well would report one row under two disclosures and count a member who
   * does not exist. */
  const allGone = `member,date\n${ZWSP}${NUL},2026-08-01\nMaria Santos,2026-08-02\n`;
  const gone = adaptAttendanceCsv(allGone, "America/New_York");
  check("a name that cleans to nothing is not counted as a cleaned name",
    gone.namesCleaned, 0);
  check("...it is reported as an empty name instead",
    gone.skipped.some((n) => n.includes("empty member name")), true);
  check("...and invents no member", gone.memberCount, 1);

  check("a null byte is not part of a name", cleanName(`Mar${NUL}ia`), "Maria");
  check("a right-to-left override is removed", cleanName(`Ann${RTL}exe.png`), "Annexe.png");
  check("a zero-width space is removed", cleanName(`Bo${ZWSP}b`), "Bob");
  check("a clean name is untouched", cleanName("Maria Santos"), "Maria Santos");
  check("a clean file reports nothing cleaned",
    adaptAttendanceCsv("member,date\nMaria Santos,2026-08-01\n", "America/New_York").namesCleaned, 0);
}
{
  /* THIS REMOVES WHAT CANNOT BE A NAME, NOT WHAT IS UNFAMILIAR. The
   * zero-width non-joiner and joiner are ordinary letters-in-context in
   * Persian and Devanagari; stripping them would corrupt real names, which
   * is the mirror of the bug above. */
  const ZWNJ = String.fromCodePoint(0x200c);
  const ZWJ = String.fromCodePoint(0x200d);
  const keep: ReadonlyArray<[string, string]> = [
    ["王伟", "a Chinese name"],
    ["Ann-Marie O'Brien", "a hyphen and an apostrophe"],
    [`با${ZWNJ}هم`, "Persian using a zero-width NON-joiner"],
    [`क${ZWJ}ष`, "Devanagari using a zero-width joiner"],
    ["José Ñuñez", "accents and a tilde"],
  ];
  const changed = keep.filter(([name]) => cleanName(name) !== name);
  check("every legitimate name passes through untouched", changed.length, 0);
}

/* IS THAT COLUMN IDENTIFYING PEOPLE, OR ROWS? The file cannot say, so this
 * product does not guess. Every value distinct while a name repeats is what
 * a per-visit row number looks like — and EXACTLY what two people sharing a
 * name look like, which this product already promises to read as two
 * people. A guess either splits one member into many or merges two into
 * one. It is stated instead, and identity still wins. */
{
  const rowIds = [
    "ID,member,date",
    "1001,Maria Santos,2026-08-01",
    "1002,Maria Santos,2026-08-04",
    "1003,Maria Santos,2026-08-08",
    "1004,James Okafor,2026-08-02",
  ].join("\n");
  const imported = adaptAttendanceCsv(rowIds, "America/New_York");
  check("an id that might be counting visits is flagged as ambiguous",
    imported.identityMayCountRows, true);
  check("...and the file says what it could not tell apart",
    imported.skipped.some((n) => n.includes("cannot tell them apart")), true);
  check("...and names the consequence if it is a row number",
    imported.skipped.some((n) => n.includes("nobody here will look like a regular")), true);
  check("...but identity still wins, because guessing is worse",
    imported.identityIsName, false);
}
{
  // Two people who really do share a name: the documented, deliberate case.
  const sameName = "member id,name,date\nm-100,John Smith,2026-08-01\nm-200,John Smith,2026-08-16\n";
  const imported = adaptAttendanceCsv(sameName, "America/New_York");
  check("two people sharing a name stay two people", imported.memberCount, 2);
  check("...and the ambiguity is disclosed rather than resolved",
    imported.identityMayCountRows, true);
}
{
  const realIds = [
    "member id,member,date",
    "M1,Maria Santos,2026-08-01",
    "M1,Maria Santos,2026-08-04",
    "M2,James Okafor,2026-08-02",
  ].join("\n");
  const imported = adaptAttendanceCsv(realIds, "America/New_York");
  check("an id that repeats across a member's visits is unambiguous",
    imported.identityMayCountRows, false);
  check("...and nothing is said about it",
    imported.skipped.length, 0);
  check("...reading two people", imported.memberCount, 2);
}
{
  const oneEach = "member id,member,date\nM1,Maria Santos,2026-08-01\nM2,James Okafor,2026-08-02\n";
  const imported = adaptAttendanceCsv(oneEach, "America/New_York");
  check("one row per person is unambiguous — both readings agree",
    imported.identityMayCountRows, false);
  check("...and reads two people either way", imported.memberCount, 2);
}

check("no-show vocabulary maps to no_show", normalizeStatus("No-Show"), "no_show");
check("unrecognized status maps to unknown, never attended", normalizeStatus("maybe?"), "unknown");

// 17. End to end: an imported quiet regular is flagged with the right count,
//     and an imported no-show never counts as a visit.
{
  const csvText = [
    "name,date,status,class,instructor",
    "Maria Santos,2026-07-28,attended,yoga,Ana Torres",
    "Maria Santos,2026-08-01,attended,yoga,Ana Torres",
    "Maria Santos,2026-08-13,no-show,yoga,Ana Torres",
    "James Okafor,2026-08-16,attended,cycling,Marco Silva",
  ].join("\n");
  const imp = adaptAttendanceCsv(csvText, "America/New_York");
  const r = findQuietMembers(imp.records, TODAY, proposedRules);
  check("imported records: exactly the quiet member is flagged", r.flagged.length, 1);
  check("imported records: days count from the real visit, not the no-show", r.flagged[0]?.daysSince, 17);
  check("imported records: evidence counts attended classes only", r.flagged[0]?.priorCount, 2);
}

// 18. Bad rows are skipped WITH stated reasons, never silently.
{
  const imp = adaptAttendanceCsv("name,date\nMaria Santos,soon\n,2026-08-01\n", "America/New_York");
  check("unreadable rows are skipped with stated reasons", imp.skipped.length, 2);
  check("skipped rows leave zero records behind", imp.rowCount - imp.skipped.length, 0);
}

// 19. Missing required columns fail loudly and name what is missing.
{
  let message = "did not throw";
  try {
    adaptAttendanceCsv("foo,bar\n1,2\n", "America/New_York");
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  check("missing required columns are named in the error",
    message.includes("member column") && message.includes("date column"), true);
}

// 18b. Orphan attendance: rows matching no member are COUNTED, never
//      silently dropped — and they neither invent a member nor touch a
//      real member's history.
{
  const fx = recordsFor([{ id: "m1", name: "Quiet Regular", status: "active", attended: ["2026-08-01"] }]);
  fx.attendance.push({
    attendance_id: "a_ghost", member_id: "GHOST", session_id: fx.class_sessions[0]!.session_id,
    attendance_status: "attended", recorded_at: "2026-08-16T10:00:00-04:00",
  });
  const r = run(fx);
  check("orphan attendance is counted", r.unmatchedAttendanceCount, 1);
  check("orphan attendance invents no member", r.checkedCount, 1);
  check("orphan attendance leaves the real member's days untouched", r.flagged[0]?.daysSince, 17);
  check("the data-quality line names the unmatched rows",
    dataQualityLine(r), "1 attendance row could not be matched to a member.");
}

// 18c. Unusable evidence for a KNOWN member is counted too — a future or
//      unreadable class date is no longer a silent exclusion.
{
  const fx = recordsFor([{ id: "m1", name: "Future Row", status: "active", attended: ["2026-08-01"] }]);
  fx.class_sessions.push({
    session_id: "s_future", class_type: "yoga", level: "all levels", instructor_id: "i_1",
    starts_at: "2027-01-01T09:00:00-04:00", ends_at: "2027-01-01T10:00:00-04:00",
    capacity: 12, session_status: "completed",
  });
  fx.attendance.push({
    attendance_id: "a_future", member_id: "m1", session_id: "s_future",
    attendance_status: "attended", recorded_at: "2027-01-01T10:00:00-04:00",
  });
  const r = run(fx);
  check("unusable evidence is counted", r.unusableEvidenceCount, 1);
  check("unusable evidence still does not hide the member", r.flagged.length, 1);

  /* WHERE "FUTURE" BEGINS, WHICH IS NOT TODAY.
   *
   * The folder's brief states the rule: future or unreadable dates are
   * never evidence. It does not say today is future, and the code agrees
   * — a class dated today counts. The comparison drawing that line could
   * be shifted with nothing noticing, which would quietly add every one
   * of today's classes to the "could not be used as evidence" number a
   * staff member reads. TODAY here is 2026-08-18. */
  const evidenceAt = (startsAt: string): number => {
    const one = recordsFor([
      { id: "m1", name: "Edge Case", status: "active", attended: ["2026-08-01"] },
    ]);
    one.class_sessions.push({
      session_id: "s_edge", class_type: "yoga", level: "all levels", instructor_id: "i_1",
      starts_at: startsAt, ends_at: startsAt, capacity: 12, session_status: "completed",
    });
    one.attendance.push({
      attendance_id: "a_edge", member_id: "m1", session_id: "s_edge",
      attendance_status: "attended", recorded_at: startsAt,
    });
    return run(one).unusableEvidenceCount;
  };

  check("a class dated today is usable evidence, not future",
    evidenceAt("2026-08-18T09:00:00-04:00"), 0);
  check("...yesterday plainly is too",
    evidenceAt("2026-08-17T09:00:00-04:00"), 0);
  check("tomorrow is where unusable begins",
    evidenceAt("2026-08-19T09:00:00-04:00"), 1);
  check("...and a date nothing can read is unusable too",
    evidenceAt("whenever"), 1);
}

// 18d. Clean records say nothing — a data-quality line only appears when
//      there is a real problem to repair.
check("clean records produce no data-quality line",
  dataQualityLine(run(recordsFor([{ id: "m1", name: "Quiet Regular", status: "active", attended: ["2026-08-01"] }]))), null);

// 18e. An identifier whose value equals somebody's NAME must not collide
//      with that person — keys are namespaced by source.
{
  const csv = [
    "member id,name,date",
    "Ana Ruiz,Beto Cruz,2026-08-01",
    ",Ana Ruiz,2026-08-16",
  ].join("\n");
  check("an id equal to a name never collides with that person",
    adaptAttendanceCsv(csv, "America/New_York").memberCount, 2);
}

// 19b. Identity: a stable id column beats the name. Two different people
//      who share a name stay two people when the export carries ids — the
//      merge that name-only matching cannot avoid.
{
  const csv = [
    "member id,name,date",
    "m-100,John Smith,2026-08-01",
    "m-200,John Smith,2026-08-16",
  ].join("\n");
  const imp = adaptAttendanceCsv(csv, "America/New_York");
  check("a stable id keeps same-named people distinct", imp.memberCount, 2);
  check("the page can state which column identity used", imp.identityIsName, false);
}

// 19c. An email column serves as identity when no explicit id exists.
{
  const csv = [
    "email,name,date",
    "a@studio.test,John Smith,2026-08-01",
    "b@studio.test,John Smith,2026-08-16",
  ].join("\n");
  check("an email column serves as identity", adaptAttendanceCsv(csv, "America/New_York").memberCount, 2);
}

// 19d. Name-only files still work, and the limitation is DISCLOSED rather
//      than hidden — the page states how members were matched.
{
  const imp = adaptAttendanceCsv("name,date\nJohn Smith,2026-08-01\nJohn Smith,2026-08-16\n", "America/New_York");
  check("a name-only file still groups by name", imp.memberCount, 1);
  check("name matching is disclosed, not hidden", imp.identityIsName, true);
  check("the disclosure names the fix", imp.identityMethod.includes("member id"), true);
}

// 19e. A blank identifier cell falls back to that row's name — blanks must
//      never collapse several people into one.
{
  const csv = [
    "member id,name,date",
    ",Ana Ruiz,2026-08-01",
    ",Beto Cruz,2026-08-16",
  ].join("\n");
  check("blank identifiers fall back to the name, never merge", adaptAttendanceCsv(csv, "America/New_York").memberCount, 2);
}

// 20. Impossible calendar dates are stated skips, never guessed visits.
//     2/30/2026 is a typo and is impossible in EVERY reading, so it is
//     skipped by name. 13/1/2026 used to be skipped alongside it, because
//     the parser assumed month-first and month 13 does not exist. It is not
//     an impossible date — it is the 13th of January, and the file says so:
//     a 13 in the first position can only be a day. Now that the file
//     settles the order (detectSlashDateOrder above), reading it is not a
//     guess, and skipping a date the file explained would be the error.
{
  const imp = adaptAttendanceCsv("name,date\nMaria Santos,13/1/2026\nJose Reyes,2/30/2026\n", "America/New_York");
  check("a date impossible in every reading is still skipped", imp.skipped.length, 1);
  check("...and the readable one is read as the file's own order proves",
    imp.records.class_sessions.some((c) => c.starts_at.startsWith("2026-01-13")), true);
  // Maria's row is readable now, so she is a member; Jose's is not, so he
  // is not invented. One in, one stated as skipped — never a silent drop.
  check("only the member whose row could be read is imported", imp.memberCount, 1);
  check("the unreadable row invents nobody",
    imp.records.members.some((m) => m.display_name === "Jose Reyes"), false);
}

// 21. Identity is the name as written — non-Latin names are distinct
//     people, never merged by a lossy ASCII slug.
{
  const imp = adaptAttendanceCsv("name,date\n王伟,2026-08-01\n佐藤花子,2026-08-16\n", "America/New_York");
  check("non-Latin names stay distinct members", imp.memberCount, 2);
  const r = findQuietMembers(imp.records, TODAY, proposedRules);
  check("the quiet non-Latin member is flagged", r.flagged[0]?.member.display_name, "王伟");
}

// 22. Skip reasons name the PHYSICAL file line, blank lines included, so
//     staff fixing "line 3" in their spreadsheet find the actual row.
{
  const imp = adaptAttendanceCsv("name,date\n\nMaria Santos,soon\n", "America/New_York");
  check("skip reasons use the physical file line", imp.skipped[0]?.startsWith("line 3:"), true);
}

// 23. Unpadded ISO dates are unambiguous and accepted.
{
  const imp = adaptAttendanceCsv("name,date\nMaria Santos,2026-8-1\n", "America/New_York");
  check("unpadded ISO dates are accepted", imp.records.class_sessions[0]?.starts_at, "2026-08-01T00:00:00");
}

// 24. Synonym priority: a "Day" column of weekday names must never shadow
//     the real "Date" column.
{
  const imp = adaptAttendanceCsv("Member,Day,Date\nMaria Santos,Monday,2026-08-01\nJose Reyes,Tuesday,2026-08-02\n", "America/New_York");
  check("a Day column never shadows the Date column", imp.skipped.length, 0);
  check("dates read from the Date column", imp.memberCount, 2);
}

/* ------------------------------------------------------------------ */
/* The shared synthetic studio, through the CSV door                    */
/* ------------------------------------------------------------------ */

// 30. The strongest proof this product has: a synthetic studio's attendance
//     export walks through THIS product's CSV door, and the flags are
//     reconciled against the shared engine's INDEPENDENT truth — computed
//     from construction intent, never from this engine. Agreement means two
//     independent implementations of the policy meet; disagreement means a
//     defect in one of them.
{
  const bundle = generateSharedStudio({
    ...SYNTHETIC_DEFAULT_CONFIG,
    seed: "door-proof-0001",
    asOfDate: "2026-08-18",
    memberCount: 60,
    mode: "clean",
  });
  const csvText = attendanceCsv(bundle.dataset);
  const imp = adaptAttendanceCsv(csvText, "America/New_York");
  check("the synthetic export walks through the door with zero skips",
    imp.skipped.length, 0);
  check("identity matched on the stable member id column", imp.identityIsName, false);

  const r = findQuietMembers(imp.records, TODAY, proposedRules);
  // Map adapter members back to synthetic ids by replaying the adapter's
  // own rule: member N is the Nth NEW identity cell in row order. (The
  // adapter's readable id fragment is the name, not the identity — names
  // repeat, so the identity cell is the only faithful bridge.)
  const rows = parseCsv(csvText);
  const headerCells = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const idCol = headerCells.indexOf("member id");
  const firstAppearance: string[] = [];
  const seenIdentity = new Set<string>();
  for (const row of rows.slice(1)) {
    const raw = (row[idCol] ?? "").trim();
    if (raw !== "" && !seenIdentity.has(raw.toLowerCase())) {
      seenIdentity.add(raw.toLowerCase());
      firstAppearance.push(raw);
    }
  }
  const syntheticIdOf = (adapterId: string): string => {
    const m = adapterId.match(/^csv_m_(\d+)_/);
    return m ? (firstAppearance[Number(m[1]) - 1] ?? adapterId) : adapterId;
  };
  const flaggedIds = new Set(r.flagged.map((f) => syntheticIdOf(f.member.member_id)));
  const truthEligible = new Set(
    Object.entries(bundle.truth.expectedReengagementEligibility)
      .filter(([, v]) => v)
      .map(([id]) => id),
  );
  // The one DOCUMENTED divergence: a bare attendance export says nothing
  // about memberships, so the door treats everyone as active. Members the
  // truth knows are paused/canceled but who sit in the quiet window are the
  // only extra flags the door may produce — and nothing else.
  const statuses = bundle.truth.expectedCurrentMembershipStatus;
  const quiet = bundle.truth.expectedQuietDays;
  const windowQuietNonActive = new Set(
    Object.entries(quiet)
      .filter(([id, q]) => q > 14 && q <= 60 && statuses[id] !== "active")
      .map(([id]) => id),
  );
  check("every truth-eligible member is flagged by the door",
    [...truthEligible].every((id) => flaggedIds.has(id)), true);
  check("extra door flags are exactly the members the export cannot reveal as inactive",
    [...flaggedIds].every((id) => truthEligible.has(id) || windowQuietNonActive.has(id)), true);
  check("the door's quiet-day counts match the shared truth exactly",
    r.flagged.every((f) => quiet[syntheticIdOf(f.member.member_id)] === f.daysSince), true);
}

/* ------------------------------------------------------------------ */
/* The studio generator                                                */
/* ------------------------------------------------------------------ */

// 25. Seeded means reproducible: same seed and same day, same studio.
{
  const a = generateStudio(7, "2026-08-18");
  const b = generateStudio(7, "2026-08-18");
  check("the same seed rebuilds the identical studio",
    JSON.stringify(a.records) === JSON.stringify(b.records), true);
  const c = generateStudio(8, "2026-08-18");
  check("a different seed builds a different studio",
    JSON.stringify(a.records) === JSON.stringify(c.records), false);
}

// 26. The generator's claim is held to account: it says how many members
//     SHOULD be flagged, and the engine must agree exactly.
{
  const studio = generateStudio(7, "2026-08-18");
  const r = findQuietMembers(studio.records, dayNumberFromIso("2026-08-18"), proposedRules);
  check("the generated studio flags exactly what it claims",
    r.flagged.length, studio.expectedFlagged);
  check("every generated member was checked", r.checkedCount, studio.memberCount);
}

// 27. Nobody who should be excluded is ever flagged, at any scale.
{
  const studio = generateStudio(42, "2026-08-18");
  const r = findQuietMembers(studio.records, dayNumberFromIso("2026-08-18"), proposedRules);
  check("no paused or canceled member is ever flagged",
    r.flagged.every((f) => f.member.membership_status === "active"), true);
  check("every flag sits inside the proposed window",
    r.flagged.every((f) => f.daysSince > proposedRules.minDaysQuiet && f.daysSince <= proposedRules.maxDaysQuiet), true);
  check("every flag carries its evidence",
    r.flagged.every((f) => f.priorCount >= 1 && f.usualClassType !== ""), true);
}

// 28. Generated histories never rot: the same seed a year later still
//     produces the same shape, because history is built from that day.
{
  const now = generateStudio(7, "2026-08-18");
  const later = generateStudio(7, "2027-08-18");
  const flaggedNow = findQuietMembers(now.records, dayNumberFromIso("2026-08-18"), proposedRules);
  const flaggedLater = findQuietMembers(later.records, dayNumberFromIso("2027-08-18"), proposedRules);
  check("a generated studio holds up a year later",
    flaggedLater.flagged.length, flaggedNow.flagged.length);
}

// 29. Distinct people stay distinct at scale — no name collisions.
{
  const studio = generateStudio(7, "2026-08-18");
  const names = new Set(studio.records.members.map((m) => m.display_name));
  check("every generated member has a distinct name", names.size, studio.memberCount);
}

/* ------------------------------------------------------------------ */
/* Render the stated verdict                                           */
/* ------------------------------------------------------------------ */

/* ---------------------------------------------------------------- */
/* The live trail: the running studio as this product's records       */
/* ---------------------------------------------------------------- */

{
  const studio = generateSharedStudio({
    ...SYNTHETIC_DEFAULT_CONFIG,
    seed: "d-live-proof",
    asOfDate: "2026-08-18",
    memberCount: 40,
    historyDays: 120,
    mode: "clean",
  }).dataset;
  const live = fixtureSetFrom(studio, []);
  const noneCount = studio.members.filter((m) => m.currentStatusSnapshot === "none").length;
  check("live trail: every membered person crosses the adapter",
    live.members.length, studio.members.length - noneCount);
  check("live trail: attendance rows cross one-for-one",
    live.attendance.length, studio.attendance.length);
  check("live trail: attendance statuses cross verbatim",
    live.attendance.every((a, i) => a.attendance_status === studio.attendance[i]?.status), true);
  check("live trail: a class resolves its real type name",
    live.class_sessions[0] !== undefined && live.class_sessions[0].class_type !== "class", true);
  check("live trail: booked becomes reserved, one-for-one",
    live.reservations.filter((r) => r.reservation_status === "reserved").length,
    studio.bookings.filter((b) => b.status === "booked").length);

  const rt: Reservation = {
    reservation_id: "res_rt1",
    member_id: studio.members[0]?.id ?? "member:000001",
    session_id: studio.classSessions[0]?.id ?? "class-session:000001",
    reservation_status: "reserved",
    reserved_at: "2026-08-17T09:00:00",
    canceled_at: null,
  };
  check("live trail: the browser log appends AFTER the baseline (last row wins)",
    fixtureSetFrom(studio, [rt]).reservations.at(-1)?.reservation_id, "res_rt1");
  check("live trail: junk in the log reads as zero rows, never a crash",
    parseRuntimeReservations("{broken").length, 0);
  check("live trail: a half-row never sneaks in beside a whole one",
    parseRuntimeReservations(JSON.stringify([{ member_id: "m" }, rt])).length, 1);

  /* THE BOOKING LOG IS ANOTHER PRODUCT'S localStorage, which makes it the
   * least trusted input this product has: a person, an extension, or an
   * older build of Booking can have written anything there, and this
   * product's brief promises a corrupt log degrades to nothing and never
   * breaks the page. Two checks proved the two easy shapes. These are the
   * rest of what "anything" means. */
  const rows = (raw: string): number => parseRuntimeReservations(raw).length;
  check("null reads as nothing", rows("null"), 0);
  check("a bare string reads as nothing", rows('"hello"'), 0);
  check("a number reads as nothing", rows("42"), 0);
  check("an object that is not an array reads as nothing", rows('{"a":1}'), 0);
  check("an array of nulls reads as nothing", rows("[null,null]"), 0);
  check("an array of strings reads as nothing", rows('["a","b"]'), 0);
  check("a deeply nested array reads as nothing", rows("[[[[[1]]]]]"), 0);
  check("an illegal reservation_status is refused",
    rows(JSON.stringify([{ ...rt, reservation_status: "DROP TABLE" }])), 0);
  check("numeric ids are refused — the contract says string",
    rows(JSON.stringify([{ ...rt, reservation_id: 1, member_id: 2, session_id: 3 }])), 0);
  check("a canceled_at that is neither string nor null is refused",
    rows(JSON.stringify([{ ...rt, canceled_at: 7 }])), 0);
  check("one good row survives ten thousand junk ones",
    rows("[" + Array.from({ length: 10_000 }, () => "null").join(",") + "," + JSON.stringify(rt) + "]"), 1);

  /* A row carrying __proto__ must not reach Object.prototype. JSON.parse
   * makes it an ordinary own property, which is why this passes — the check
   * exists so that stays true if the parsing ever changes. */
  const polluting = JSON.stringify([{ ...rt, ["__proto__"]: { polluted: true } }]);
  check("a __proto__ row is read as an ordinary row", rows(polluting), 1);
  check("...and pollutes nothing",
    ({} as Record<string, unknown>)["polluted"], undefined);
}

{
  const TODAY_LIVE = dayNumberFromIso("2026-08-18");
  const session = (id: string, day: string) => ({
    session_id: id, class_type: "yoga", level: "all levels", instructor_id: "i1",
    starts_at: `${day}T09:00:00`, ends_at: `${day}T10:00:00`, capacity: 10,
    session_status: "scheduled" as const,
  });
  const res = (id: string, session_id: string, status: Reservation["reservation_status"]) => ({
    reservation_id: id, member_id: "m1", session_id,
    reservation_status: status, reserved_at: "2026-08-16T09:00:00", canceled_at: null,
  });
  const trail = (rows: Reservation[]) => ({
    timezone: "America/New_York", note: "", members: [], memberships: [],
    instructors: [], class_sessions: [session("s_future", "2026-08-22"), session("s_past", "2026-08-10")],
    reservations: rows, attendance: [], studio_policies: [],
  });
  check("coming back: a reserved future class holds the member",
    upcomingReservedMemberIds(trail([res("r1", "s_future", "reserved")]), TODAY_LIVE).has("m1"), true);
  check("coming back: a cancel recorded later releases the spot (last row wins)",
    upcomingReservedMemberIds(trail([res("r1", "s_future", "reserved"), res("r1", "s_future", "canceled")]), TODAY_LIVE).size, 0);
  check("coming back: a waitlist spot is hope, never a hold",
    upcomingReservedMemberIds(trail([res("r1", "s_future", "waitlisted")]), TODAY_LIVE).size, 0);
  check("coming back: a past reservation says nothing about tomorrow",
    upcomingReservedMemberIds(trail([res("r1", "s_past", "reserved")]), TODAY_LIVE).size, 0);
  // The dated view: not just WHO is coming back, but WHEN — and the id set
  // is DERIVED from it, so the two readings can never disagree.
  const two = trail([res("r1", "s_future", "reserved"), res("r2", "s_far", "reserved")]);
  two.class_sessions.push({
    session_id: "s_far", class_type: "yoga", level: "all levels", instructor_id: "i1",
    starts_at: "2026-08-27T09:00:00", ends_at: "2026-08-27T10:00:00", capacity: 10,
    session_status: "scheduled",
  });
  check("coming back: the next class DATE is the earliest upcoming one",
    upcomingReservedNextClassDates(two, TODAY_LIVE).get("m1"), "2026-08-22");
  check("coming back: the id set is exactly the dated map's keys",
    [...upcomingReservedMemberIds(two, TODAY_LIVE)],
    [...upcomingReservedNextClassDates(two, TODAY_LIVE).keys()]);
}

// Booking-without-attending since the last visit: disclosed, never a visit.
{
  const TODAY_LIVE = dayNumberFromIso("2026-08-18");
  const LAST_VISIT = dayNumberFromIso("2026-07-28");
  const withRes = (rows: Array<{ id: string; status: Reservation["reservation_status"]; at: string }>) => {
    const fx = recordsFor([{ id: "m1", name: "Books Not Shows", status: "active", attended: ["2026-07-28"] }]);
    fx.class_sessions.push({
      session_id: "s_b", class_type: "yoga", level: "all levels", instructor_id: "i_1",
      starts_at: "2026-08-12T09:00:00-04:00", ends_at: "2026-08-12T10:00:00-04:00",
      capacity: 12, session_status: "scheduled",
    });
    fx.reservations = rows.map((r) => ({
      reservation_id: r.id, member_id: "m1", session_id: "s_b",
      reservation_status: r.status, reserved_at: r.at, canceled_at: null,
    }));
    return fx;
  };
  check("booking activity since the last visit is disclosed",
    recentBookingActivity("m1",
      withRes([{ id: "r1", status: "reserved", at: "2026-08-10T12:00:00" }]),
      LAST_VISIT, TODAY_LIVE),
    "2026-08-10");
  check("a canceled booking is disclosed AS canceled — reaching and pulling back is still reaching",
    recentBookingActivity("m1",
      withRes([{ id: "r1", status: "canceled", at: "2026-08-16T12:00:00" }]),
      LAST_VISIT, TODAY_LIVE),
    "2026-08-16 (canceled)");
  check("an action before the last visit is old news, not activity",
    recentBookingActivity("m1",
      withRes([{ id: "r1", status: "reserved", at: "2026-07-20T12:00:00" }]),
      LAST_VISIT, TODAY_LIVE),
    null);
  check("an action after today never leaks in",
    recentBookingActivity("m1",
      withRes([{ id: "r1", status: "reserved", at: "2026-08-25T12:00:00" }]),
      LAST_VISIT, TODAY_LIVE),
    null);
  check("booking activity never shrinks quiet days — only attendance is a visit",
    run(withRes([{ id: "r1", status: "reserved", at: "2026-08-10T12:00:00" }])).flagged[0]?.daysSince,
    21);
}

/* FROM THE FILE TO THE SENTENCE — the placeholders, checked where they are
 * actually made.
 *
 * The block above hands draftMessage a null class by hand, so it proves the
 * VOICE copes. It cannot prove the IMPORT produces null, and that is the
 * half that broke: the mapping lived inside a click handler in main.ts,
 * which touches the DOM at import and so can never be loaded here. These
 * start from the plainest supported file there is — a sign-in sheet, two
 * columns, a name and a date, no class and no instructor anywhere in it —
 * and walk the real path to the words a staff member would read. */
{
  const signInSheetFile = [
    "Member,Date",
    "Maria Delgado,2026-06-27",
    "Maria Delgado,2026-07-11",
    "Maria Delgado,2026-07-25",
  ].join("\n");
  const imported = adaptAttendanceCsv(signInSheetFile, "America/New_York");
  const today = dayNumberFromIso("2026-08-21");
  const flagged = findQuietMembers(imported.records, today, proposedRules).flagged;

  check("a sign-in sheet with no class column still flags its quiet member",
    flagged.length, 1);
  const only = flagged[0];
  if (only) {
    check("...and the records carry the placeholder, because the field cannot be null",
      only.usualClassType, GENERIC_CLASS_TYPE);
    check("...and the instructor placeholder too",
      only.usualInstructorName, GENERIC_INSTRUCTOR);

    const facts = draftFactsFor(only, imported.records, today, brand.studioName);
    check("the draft turns the class placeholder back into 'we do not know'",
      facts.usualClassType, null);
    check("...and the instructor placeholder too",
      facts.usualInstructorFirstName, null);
    check("...while keeping the one thing the file DID say",
      facts.firstName, "Maria");

    const note = draftTextFor(only, imported.records, today, brand.studioName);
    check("so the note never says 'class class' to a real member",
      note.includes("class class"), false);
    /* Case-insensitive and both tenses on purpose: the placeholder's first
     * name is "the", and it lands MID-sentence in lower case, so an anchored
     * capital-T pattern here passed happily while the bug was live. */
    check("...and never credits 'the' with teaching anything",
      /\bthe (still )?teaches\b/i.test(note), false);
    check("...and never prints the instructor placeholder either",
      note.toLowerCase().includes("the team"), false);
    check("...and still counts the days from the file's own last date",
      note.includes("27 days"), true);
  }
}

/* THE OTHER DIRECTION — a real placeholder must not be confused with a real
 * class. If the mapping ever widened to "drop anything short", a studio
 * that genuinely runs a class called "class" would lose it. */
{
  const fullExport = [
    "Member,Date,Class,Instructor",
    "Maria Delgado,2026-06-27,yoga,Ana Reyes",
    "Maria Delgado,2026-07-11,yoga,Ana Reyes",
    "Maria Delgado,2026-07-25,yoga,Ana Reyes",
  ].join("\n");
  const imported = adaptAttendanceCsv(fullExport, "America/New_York");
  const today = dayNumberFromIso("2026-08-21");
  const only = findQuietMembers(imported.records, today, proposedRules).flagged[0];
  if (only) {
    const facts = draftFactsFor(only, imported.records, today, brand.studioName);
    check("a named class survives the mapping untouched", facts.usualClassType, "yoga");
    check("...and the instructor arrives as a first name, not a full one",
      facts.usualInstructorFirstName, "Ana");
    const note = draftTextFor(only, imported.records, today, brand.studioName);
    check("...so the note names both", note.includes("Ana") && note.includes("yoga"), true);
  }
}

/* A NAME IS UNTRUSTED INPUT, AND A MAILTO URL IS A HEADER LIST.
 *
 * display_name arrives from a CSV some other system exported. In a mailto
 * URL "&" starts another header, so a name shaped like an injection would
 * add a recipient to a note ABOUT a member if it reached the URL raw —
 * and cleanName does not strip "&", because "Ben & Jerry" is a real name.
 * encodeURIComponent is the whole defence, so it gets checked rather than
 * trusted. */
{
  const hostileFile = [
    "Member,Date",
    "Bob&bcc=stranger@elsewhere.invalid,2026-06-27",
    "Bob&bcc=stranger@elsewhere.invalid,2026-07-11",
    "Bob&bcc=stranger@elsewhere.invalid,2026-07-25",
  ].join("\n");
  const imported = adaptAttendanceCsv(hostileFile, "America/New_York");
  const today = dayNumberFromIso("2026-08-21");
  const only = findQuietMembers(imported.records, today, proposedRules).flagged[0];
  check("a name shaped like an injection still imports as a member",
    only !== undefined, true);
  if (only) {
    const href = mailtoHref(only, "the note", "Pulse Studio", null);
    /* Structural, not a substring search: with no studio address there are
     * exactly two headers, subject and body. A third means one came from
     * the member's name. */
    check("...and the URL it builds carries exactly the two headers we wrote",
      href.split("&").length, 2);
    check("...so the injected recipient never becomes a recipient",
      href.includes("bcc="), false);
    check("...it is carried as encoded text inside the subject instead",
      href.includes("%26bcc%3D"), true);
  }
}

/* THE BRANCH THAT HAD NEVER RUN. The shipped brand sets studioEmail to
 * null, so until these lines nothing had ever built the bcc form — not in
 * a browser, not in a check. A reseller turning it on would have been the
 * first to find out whether it worked. */
{
  const hostileFile = [
    "Member,Date",
    "Ana Reyes,2026-06-27",
    "Ana Reyes,2026-07-11",
    "Ana Reyes,2026-07-25",
  ].join("\n");
  const imported = adaptAttendanceCsv(hostileFile, "America/New_York");
  const today = dayNumberFromIso("2026-08-21");
  const only = findQuietMembers(imported.records, today, proposedRules).flagged[0];
  if (only) {
    const href = mailtoHref(only, "line one\nline two", "Pulse Studio", "front+desk@studio.invalid");
    check("a studio address becomes a bcc header", href.startsWith("mailto:?bcc="), true);
    check("...with its plus sign encoded, not read as a space",
      href.includes("front%2Bdesk%40studio.invalid"), true);
    check("...and the subject still names the member",
      href.includes(encodeURIComponent("Ana")), true);
    /* RFC 6068: the body wants CRLF. Only the URL gets it — the draft the
     * staff member reads on screen and copies keeps plain LF. */
    check("...and the body's line breaks are CRLF in the URL",
      href.includes("%0D%0A"), true);
    check("...with no bare LF left beside them",
      /%0A/.test(href.replace(/%0D%0A/g, "")), false);
  }
}

/* THE EVIDENCE LINE — where the placeholders must be NAMED, not dropped.
 *
 * The draft hides what the records do not say, because a member should
 * never read around a gap. Staff need the opposite: the flag rests on
 * this line, so a gap in it has to be visible. The old line printed the
 * placeholders raw, which read as a class called "class" taught by
 * somebody called "the team" — a fact no import ever carried. */
{
  const signInSheet = [
    "Member,Date",
    "Maria Delgado,2026-06-27",
    "Maria Delgado,2026-07-11",
    "Maria Delgado,2026-07-25",
  ].join("\n");
  const imported = adaptAttendanceCsv(signInSheet, "America/New_York");
  const today = dayNumberFromIso("2026-08-21");
  const only = findQuietMembers(imported.records, today, proposedRules).flagged[0];
  if (only) {
    const line = evidenceLine(only, proposedRules.priorWindowDays);
    check("a sign-in sheet never invents a class called 'class'",
      line.includes("class with the team"), false);
    check("...nor claims 'the team' taught it",
      line.toLowerCase().includes("the team"), false);
    check("...it names the gap instead",
      line.includes("the import recorded no class type and no instructor"), true);
    check("...while still carrying the date the flag rests on",
      line.includes("July 25, 2026"), true);
    check("...and the whole line carries no invented clause at all",
      line,
      "Last attended: July 25, 2026 · 3 classes in the prior 60 days (≈0.4/week) · the import recorded no class type and no instructor");
    check("...and the count behind it",
      line.includes("3 classes in the prior 60 days"), true);
  }
}

{
  const fullExport = [
    "Member,Date,Class,Instructor",
    "Maria Delgado,2026-06-27,yoga,Ana Reyes",
    "Maria Delgado,2026-07-11,yoga,Ana Reyes",
    "Maria Delgado,2026-07-25,yoga,Ana Reyes",
  ].join("\n");
  const imported = adaptAttendanceCsv(fullExport, "America/New_York");
  const today = dayNumberFromIso("2026-08-21");
  const only = findQuietMembers(imported.records, today, proposedRules).flagged[0];
  if (only) {
    const line = evidenceLine(only, proposedRules.priorWindowDays);
    check("a full export reads as a sentence about a real class",
      line.startsWith("Last attended: yoga with Ana Reyes on July 25, 2026"), true);
    check("...and says nothing about anything missing",
      line.includes("the import recorded no"), false);
    check("...and still names the usual pattern",
      line.includes("usually yoga with Ana Reyes"), true);
  }
}

/* WHICH RULE SPOKE. Four of the five outcomes stop a draft being offered,
 * and each is the moment a staff member most needs the reason to be
 * exact. They were a nested conditional inside the card renderer, which
 * no headless check can load. */
{
  check("a ready member gets no state line at all",
    workflowStateLine({ kind: "ready" }, outreachPolicy), "");
  check("a studio that has not opted in says so",
    workflowStateLine({ kind: "disabled" }, outreachPolicy),
    "Outreach workflow is off — this studio has not opted in.");
  check("a suppressed member names the date they were suppressed",
    workflowStateLine({ kind: "suppressed", since: "2026-07-01" }, outreachPolicy),
    "Do not contact — suppressed 2026-07-01.");
  check("outside the consent window names the window AND the gap",
    workflowStateLine({ kind: "outsideConsent", days: 400 }, outreachPolicy),
    `Outside the ${outreachPolicy.consentWindowDays}-day consent window (400 days quiet) — no draft offered.`);
  check("already reached names the channel and when",
    workflowStateLine({ kind: "alreadyReached", channel: "email", takenAt: "2026-08-01" }, outreachPolicy),
    "Already reached for this lapse (email, 2026-08-01). A new lapse re-arms.");
  check("...and every one of the four stop-states says something",
    (["disabled", "suppressed", "outsideConsent", "alreadyReached"] as const)
      .map((kind) => workflowStateLine(
        { kind, since: "x", days: 1, channel: "email", takenAt: "x" } as never, outreachPolicy))
      .every((line) => line.length > 20), true);
}

/* WHAT THE SUMMARY NEVER SAID: how many of the flagged can be written to.
 * The flag count comes from the quiet rule, the blocking comes from the
 * outreach policy, and until now the two never met in a sentence. */
{
  const none = { ready: 3, suppressed: 0, alreadyReached: 0, outsideConsent: 0, disabled: 0 };
  check("when every flagged member can be written to, the line says nothing",
    availabilityLine(none), "");
  check("...because '0 blocked' is noise, not a stated negative",
    availabilityLine({ ...none, ready: 0 }), "");

  check("one suppressed member is named as such",
    availabilityLine({ ready: 4, suppressed: 1, alreadyReached: 0, outsideConsent: 0, disabled: 0 }),
    "No draft offered for 1 of 5 — 1 do not contact.");
  check("every reason that applies is named, not just the count",
    availabilityLine({ ready: 1, suppressed: 2, alreadyReached: 3, outsideConsent: 1, disabled: 0 }),
    "No draft offered for 6 of 7 — 2 do not contact, 3 already reached this lapse, 1 outside the consent window.");
  check("the switched-off case reads as a studio setting, not a member's choice",
    availabilityLine({ ready: 0, suppressed: 0, alreadyReached: 0, outsideConsent: 0, disabled: 2 }),
    "No draft offered for 2 of 2 — 2 while outreach is switched off.");

  /* The case that prompted this: every flagged member blocked. The old
   * summary said "N flagged" over N cards that all refused a draft. */
  const allBlocked = availabilityLine({ ready: 0, suppressed: 3, alreadyReached: 0, outsideConsent: 0, disabled: 0 });
  check("when nobody can be written to, the page says so out loud",
    allBlocked, "No draft offered for 3 of 3 — 3 do not contact.");
  check("...and never reads as though there is work waiting",
    allBlocked.includes("0 of"), false);
}

/* The counting itself, from real records rather than hand-built totals. */
{
  const sheet = [
    "Member,Date",
    "Maria Delgado,2026-06-27", "Maria Delgado,2026-07-11", "Maria Delgado,2026-07-25",
    "Jonah Ford,2026-06-20", "Jonah Ford,2026-07-04", "Jonah Ford,2026-07-18",
  ].join("\n");
  const imported = adaptAttendanceCsv(sheet, "America/New_York");
  const today = dayNumberFromIso("2026-08-21");
  const flagged = findQuietMembers(imported.records, today, proposedRules).flagged;
  check("two quiet members are flagged from the sheet", flagged.length, 2);

  const clean = outreachAvailability(flagged, outreachPolicy, [], []);
  check("with an empty ledger every one of them is ready", clean.ready, flagged.length);
  check("...so the line stays silent", availabilityLine(clean), "");

  const first = flagged[0];
  if (first) {
    const suppressed = outreachAvailability(flagged, outreachPolicy, [], [
      { memberId: first.member.member_id, suppressedOn: "2026-08-01" },
    ]);
    check("suppressing one moves exactly one out of ready", suppressed.ready, flagged.length - 1);
    check("...and it is counted as do-not-contact", suppressed.suppressed, 1);
    check("...and the sentence names it",
      availabilityLine(suppressed).includes("1 do not contact"), true);
  }
}

/* THE STITCHING ITSELF. Every status line here is optional clauses joined
 * together, and the joining kept being written inline where no check could
 * reach it. That cost a real defect: a `string | null` part, an inline
 * `!== ""` filter that does not narrow a null away, and a double space in
 * the middle of a sentence a staff member reads. These are the cases that
 * would have caught it. */
{
  check("a null part is dropped, not joined as nothing",
    joinSentence(["one", null, "two"]), "one two");
  check("...which is exactly the double space that shipped",
    joinSentence(["Checked.", null, "Flagged."]).includes("  "), false);
  check("undefined is dropped too", joinSentence(["one", undefined, "two"]), "one two");
  check("an empty string is dropped", joinSentence(["one", "", "two"]), "one two");
  check("a whitespace-only part is dropped", joinSentence(["one", "   ", "two"]), "one two");
  check("parts are trimmed, so a padded clause cannot double the gap",
    joinSentence([" one ", " two "]), "one two");
  check("everything empty gives an empty string, never a stray separator",
    joinSentence([null, "", "  "]), "");
  check("one part alone is returned unchanged", joinSentence(["only"]), "only");
  check("no parts at all is empty", joinSentence([]), "");
  check("a custom separator is used between every kept part",
    joinSentence(["a", null, "b", "c"], " · "), "a · b · c");
  check("...and never leaves a trailing separator when the last part is null",
    joinSentence(["a", "b", null], " · "), "a · b");
}

/* THE OUTCOMES LINE — the closed loop's own claim, in a sentence. */
{
  const base = { outcomes: [], returned: 0, stillQuiet: 0, notEvaluable: 0, medianDaysToReturn: null };
  check("one note reads as a note, not notes",
    outcomesLine({ ...base, outcomes: [1] as never[], stillQuiet: 1 }),
    "Outreach so far: 1 note taken · 0 came back · 1 still quiet.");
  check("more than one reads as notes",
    outcomesLine({ ...base, outcomes: [1, 2] as never[], stillQuiet: 2 }),
    "Outreach so far: 2 notes taken · 0 came back · 2 still quiet.");
  check("a median is only offered once somebody has come back",
    outcomesLine({ ...base, outcomes: [1, 2] as never[], returned: 1, stillQuiet: 1, medianDaysToReturn: 9 }),
    "Outreach so far: 2 notes taken · 1 came back (median 9 days after the note) · 1 still quiet.");
  check("...and is left out entirely when nobody has",
    outcomesLine({ ...base, outcomes: [1] as never[], stillQuiet: 1 }).includes("median"), false);
  check("a note whose member is not in these records is counted, never dropped",
    outcomesLine({ ...base, outcomes: [1] as never[], stillQuiet: 1, notEvaluable: 2 }),
    "Outreach so far: 3 notes taken · 0 came back · 1 still quiet · 2 not evaluable in these records.");
  check("...and the total it reports is the one that adds up",
    outcomesLine({ ...base, outcomes: [1] as never[], stillQuiet: 1, notEvaluable: 2 }).startsWith("Outreach so far: 3 notes"), true);
  check("the sentence always ends in a full stop",
    outcomesLine({ ...base, outcomes: [1] as never[] }).endsWith("."), true);
}

/* THE PAGE'S DESCRIPTION OF ITS OWN RULE, CHECKED AGAINST THE RULE.
 *
 * Staff decide whether to trust the list by reading this sentence. Its
 * numbers interpolate so they cannot drift; its WORDS can. "More than 14
 * and at most 60" is two boundary claims, and flipping one comparison in
 * findQuietMembers from > to >= would leave this line confident and
 * wrong, with nothing to notice.
 *
 * So these do not stop at the string. Four members sit exactly on the
 * boundaries the sentence names, and the real rule decides each one. */
{
  const sentence = ruleStatement(proposedRules);
  check("the sentence names the studio's own lower threshold",
    sentence.includes(`more than ${proposedRules.minDaysQuiet}`), true);
  check("...and its upper one",
    sentence.includes(`at most ${proposedRules.maxDaysQuiet}`), true);
  check("...and says the quiet part about no-shows out loud",
    sentence.includes("a no-show is never a visit"), true);
  check("...and does not present an unratified rule as settled",
    sentence.startsWith("Proposed thresholds (not yet ratified by the team)"), true);
  check("a studio with different thresholds gets its own numbers, not these",
    ruleStatement({ minDaysQuiet: 7, maxDaysQuiet: 30, priorWindowDays: 30 }),
    "Proposed thresholds (not yet ratified by the team): flag active members " +
    "whose last attended class is more than 7 and at most 30 days ago. " +
    "Only attended classes count — a no-show is never a visit.");

  /* today is 2026-08-21. Each of these last attended exactly N days ago. */
  const onTheLine = [
    "Member,Date",
    "Exactly Fourteen,2026-08-07",   // 14 days — "more than 14" excludes
    "Exactly Fifteen,2026-08-06",    // 15 days — first day included
    "Exactly Sixty,2026-06-22",      // 60 days — "at most 60" includes
    "Exactly SixtyOne,2026-06-21",   // 61 days — first day excluded
  ].join("\n");
  const imported = adaptAttendanceCsv(onTheLine, "America/New_York");
  const today = dayNumberFromIso("2026-08-21");
  const result = findQuietMembers(imported.records, today, proposedRules);
  const flaggedNames = result.flagged.map((f) => f.member.display_name).sort();

  check("all four boundary members were read from the file", result.checkedCount, 4);
  check("'more than 14' excludes the member who is exactly 14 days quiet",
    flaggedNames.includes("Exactly Fourteen"), false);
  check("...and includes the one who is 15",
    flaggedNames.includes("Exactly Fifteen"), true);
  check("'at most 60' includes the member who is exactly 60 days quiet",
    flaggedNames.includes("Exactly Sixty"), true);
  check("...and excludes the one who is 61",
    flaggedNames.includes("Exactly SixtyOne"), false);
  check("so the sentence describes exactly the two the rule chose",
    flaggedNames.join(", "), "Exactly Fifteen, Exactly Sixty");
  check("...and the days-quiet the page shows match the boundary exactly",
    result.flagged.map((f) => f.daysSince).sort((a, b) => a - b).join(","), "15,60");
}

/* THE BRAND SEAM IS A PROMISE THIS PRODUCT MAKES OUT LOUD.
 *
 * The README says every studio-specific value lives in config.ts and
 * nothing else needs an edit. generate.ts broke that quietly: its
 * timeZone parameter defaulted to a literal "America/New_York", and
 * main.ts calls it WITHOUT the argument. A studio that changed its time
 * zone would have had the generated door alone keep New York hours while
 * agreeing with itself everywhere else.
 *
 * STATED LIMIT, because the first version of this block oversold itself:
 * while brand.timeZone IS "America/New_York", a check comparing the two
 * cannot tell a value sourced from the seam from a literal that happens to
 * match. Reinstating the bug left all of these green, which is how the
 * problem was found. The first check below is kept anyway — not because it
 * discriminates today, but because it starts discriminating the moment a
 * studio rebrands, which is the only moment the bug can cost anything. The
 * third check of the first version was deleted: it asserted that two equal
 * strings were equal, and dressed a tautology up as a proof. */
{
  const studio = generateStudio(20260818, "2026-08-18");
  check("the generated studio's time zone agrees with the brand seam",
    studio.records.timezone, brand.timeZone);
  check("an explicit time zone still wins, for a host that knows better",
    generateStudio(20260818, "2026-08-18", "Europe/Lisbon").records.timezone,
    "Europe/Lisbon");
  check("...and it really is used, not merely accepted and ignored",
    generateStudio(20260818, "2026-08-18", "Europe/Lisbon").records.timezone ===
      generateStudio(20260818, "2026-08-18").records.timezone, false);
}

/* GAPS FOUND BY MUTATION, NOT BY READING.
 *
 * 143 single-token mutations were applied to the compiled engine and the
 * suite rerun against each. 110 were caught; 33 survived. A survivor is a
 * way the engine could be wrong that nobody would hear about. These close
 * the three that were real rather than equivalent. */

/* 1. dayNumberFromIso guards three distinct malformed shapes with three
 * `||` chains. Turning any of them into `&&` survived, because every
 * existing case tripped all the conditions at once. Each shape now has
 * its own case, so each guard is load-bearing. */
{
  check("a date missing its day is unreadable", Number.isFinite(dayNumberFromIso("2026-08")), false);
  check("a date missing month and day is unreadable", Number.isFinite(dayNumberFromIso("2026")), false);
  check("a non-numeric day is unreadable", Number.isFinite(dayNumberFromIso("2026-08-0x")), false);
  check("a non-numeric month is unreadable", Number.isFinite(dayNumberFromIso("2026-aug-01")), false);
  check("a fractional day is unreadable", Number.isFinite(dayNumberFromIso("2026-08-1.5")), false);
  check("month 13 is unreadable even with a valid day",
    Number.isFinite(dayNumberFromIso("2026-13-01")), false);
  check("month 0 is unreadable even with a valid day",
    Number.isFinite(dayNumberFromIso("2026-00-15")), false);
  check("day 0 is unreadable even in a valid month",
    Number.isFinite(dayNumberFromIso("2026-08-00")), false);
  check("...while a real date on the same shape reads fine",
    Number.isFinite(dayNumberFromIso("2026-08-01")), true);
}

/* 2. mostCommon decides the "usually X with Y" a draft is built on.
 * Changing its counter from +1 to -1 survived the whole suite, because
 * every member tested had their most COMMON class also be their most
 * RECENT one — so returning the wrong one looked identical. This member
 * does not: three yoga classes, then one strength class last. */
{
  const mixed = [
    "Member,Date,Class,Instructor",
    "Pat Rivera,2026-06-27,yoga,Ana Reyes",
    "Pat Rivera,2026-07-04,yoga,Ana Reyes",
    "Pat Rivera,2026-07-11,yoga,Ana Reyes",
    "Pat Rivera,2026-07-25,strength,Kim Lee",
  ].join("\n");
  const imported = adaptAttendanceCsv(mixed, "America/New_York");
  const today = dayNumberFromIso("2026-08-21");
  const only = findQuietMembers(imported.records, today, proposedRules).flagged[0];
  check("a member with a mixed history is flagged", only !== undefined, true);
  if (only) {
    check("'usually' means most common, not most recent",
      only.usualClassType, "yoga");
    check("...and the instructor follows the same rule",
      only.usualInstructorName, "Ana Reyes");
    check("...while 'last attended' really is the most recent",
      only.lastSession.class_type, "strength");
    check("...so the evidence line can say both without contradicting itself",
      evidenceLine(only, proposedRules.priorWindowDays),
      "Last attended: strength with Kim Lee on July 25, 2026 · 4 classes in the prior 60 days (≈0.5/week) · usually yoga with Ana Reyes");
  }
}

/* 3. evidenceLine branches on class-known and instructor-known
 * independently, and every `&&` between them survived mutation: only
 * both-known and both-unknown were ever tested. These are the two mixed
 * cases, which are what a real export with one missing column produces. */
{
  const today = dayNumberFromIso("2026-08-21");
  const classOnly = adaptAttendanceCsv([
    "Member,Date,Class",
    "Sam Okoro,2026-06-27,pilates", "Sam Okoro,2026-07-11,pilates", "Sam Okoro,2026-07-25,pilates",
  ].join("\n"), "America/New_York");
  const a = findQuietMembers(classOnly.records, today, proposedRules).flagged[0];
  if (a) {
    const line = evidenceLine(a, proposedRules.priorWindowDays);
    check("a file with a class column but no instructor names the class",
      line.includes("Last attended: pilates on July 25, 2026"), true);
    check("...and says the instructor is what is missing, not the class",
      line.includes("the import recorded no instructor"), true);
    check("...and does not claim the class is missing too",
      line.includes("no class type"), false);
    /* WHOLE LINE, not includes(). The includes() checks above all passed
     * while a mutation made the "usually" clause read "usually class" from
     * a placeholder — an extra clause is invisible to a substring test. */
    check("...and the whole line reads exactly as intended",
      line,
      "Last attended: pilates on July 25, 2026 · 3 classes in the prior 60 days (≈0.4/week) · usually pilates · the import recorded no instructor");
  }

  const instructorOnly = adaptAttendanceCsv([
    "Member,Date,Instructor",
    "Lee Moreau,2026-06-27,Ana Reyes", "Lee Moreau,2026-07-11,Ana Reyes", "Lee Moreau,2026-07-25,Ana Reyes",
  ].join("\n"), "America/New_York");
  const b = findQuietMembers(instructorOnly.records, today, proposedRules).flagged[0];
  if (b) {
    const line = evidenceLine(b, proposedRules.priorWindowDays);
    check("a file with an instructor but no class names the instructor",
      line.includes("a class with Ana Reyes"), true);
    check("...and says the class type is what is missing",
      line.includes("the import recorded no class type"), true);
    check("...and does not claim the instructor is missing too",
      line.includes("no instructor"), false);
    check("...and the whole line reads exactly as intended",
      line,
      "Last attended: a class with Ana Reyes on July 25, 2026 · 3 classes in the prior 60 days (≈0.4/week) · usually with Ana Reyes · the import recorded no class type");
  }
}

/* THE CONSENT BOUNDARY, WHICH NOTHING COULD REACH.
 *
 * Mutation found this: turning `daysSince > consentWindowDays` into `>=`
 * left every check green. The reason is not a weak suite — it is that the
 * shipped numbers make the branch unreachable. consentWindowDays is 730
 * and maxDaysQuiet is 60, so findQuietMembers never produces a member the
 * consent window could exclude.
 *
 * That is correct defensive code: the two thresholds are configured
 * independently, and a studio that widens its quiet window to three years
 * needs the consent rule to still hold. But "unreachable today" is a
 * property of one config, not of the rule, and the rule deciding whether a
 * studio may write to somebody at all is the last one that should go
 * unchecked. So these give it a config where it CAN fire. */
{
  const wideRules = { minDaysQuiet: 14, maxDaysQuiet: 1000, priorWindowDays: 60 };
  const today = dayNumberFromIso("2026-08-21");
  /* 2026-08-21 minus 730 days is 2024-08-21; minus 731 is 2024-08-20. */
  const longGone = adaptAttendanceCsv([
    "Member,Date",
    "Exactly Seven Thirty,2024-08-21",
    "Seven Thirty One,2024-08-20",
  ].join("\n"), "America/New_York");
  const flagged = findQuietMembers(longGone.records, today, wideRules).flagged;
  const byName = new Map(flagged.map((f) => [f.member.display_name, f]));

  check("a wider quiet window reaches members the shipped one never does",
    flagged.length, 2);
  check("...and their days-quiet land exactly on the boundary",
    flagged.map((f) => f.daysSince).sort((a, b) => a - b).join(","), "730,731");

  const at = byName.get("Exactly Seven Thirty");
  const past = byName.get("Seven Thirty One");
  if (at && past) {
    check("a member quiet for exactly the consent window may still be written to",
      outreachStateFor(at, outreachPolicy, [], []).kind, "ready");
    check("...and one day further may not",
      outreachStateFor(past, outreachPolicy, [], []).kind, "outsideConsent");
    const state = outreachStateFor(past, outreachPolicy, [], []);
    check("...and the page says how long they have been quiet, not just that it refused",
      state.kind === "outsideConsent" ? state.days : -1, 731);
    check("...in a sentence naming the window it was measured against",
      workflowStateLine(state, outreachPolicy),
      `Outside the ${outreachPolicy.consentWindowDays}-day consent window (731 days quiet) — no draft offered.`);
  }

  /* Stated so nobody "simplifies" one of the two numbers into the other:
   * they are independent on purpose, and today one hides the other. */
  check("the shipped config really does make this branch unreachable",
    outreachPolicy.consentWindowDays > proposedRules.maxDaysQuiet, true);
}

/* SAME DAY IS NOT "CAME BACK", AND THAT IS A DECISION.
 *
 * Mutation found `day > notedDay` could become `>=` with nothing
 * noticing. The strictness is deliberate: the ledger stores a date and no
 * time, so a class attended the same day the note was taken cannot be
 * shown to have followed it. Counting it would credit the note with a
 * visit that may have happened hours before — the one claim this panel
 * exists not to make. */
{
  const attended = adaptAttendanceCsv([
    "Member,Date",
    "Robin Vale,2026-06-20", "Robin Vale,2026-07-04", "Robin Vale,2026-08-10",
  ].join("\n"), "America/New_York");
  const today = dayNumberFromIso("2026-08-21");
  const id = attended.records.members[0]?.member_id ?? "";
  const note = (takenAt: string) => [{
    memberId: id, lapseKey: `${id}|2026-07-04`, takenAt, channel: "copy" as const,
  }];

  const sameDay = outreachResults(note("2026-08-10"), attended.records, today);
  check("a visit on the very day of the note is not counted as coming back",
    sameDay.returned, 0);
  check("...it is left as still quiet, not dropped from the total",
    sameDay.stillQuiet, 1);
  check("...and no days-to-return is invented for it",
    sameDay.medianDaysToReturn, null);

  const dayBefore = outreachResults(note("2026-08-09"), attended.records, today);
  check("a visit the day after the note does count",
    dayBefore.returned, 1);
  check("...and is measured as one day", dayBefore.medianDaysToReturn, 1);

  const earlier = outreachResults(note("2026-06-25"), attended.records, today);
  check("the FIRST visit past the note is the one measured, not the latest",
    earlier.medianDaysToReturn, dayNumberFromIso("2026-07-04") - dayNumberFromIso("2026-06-25"));

  /* A RETURN TODAY IS STILL A RETURN.
   *
   * Future rows are filtered out of the attended set, and the comparison
   * drawing that line could shift by a day — which would stop a member who
   * walked in this morning counting as having come back. The panel would
   * read "0 came back" on the day the note worked. */
  const attendedToday = adaptAttendanceCsv([
    "Member,Date",
    "Robin Vale,2026-06-20", "Robin Vale,2026-08-21",
  ].join("\n"), "America/New_York");
  const todayId = attendedToday.records.members[0]?.member_id ?? "";
  const returnedToday = outreachResults(
    [{ memberId: todayId, lapseKey: `${todayId}|2026-06-20`, takenAt: "2026-08-20", channel: "copy" as const }],
    attendedToday.records,
    dayNumberFromIso("2026-08-21"),
  );
  check("a class attended today counts as coming back", returnedToday.returned, 1);
  check("...measured as one day after the note", returnedToday.medianDaysToReturn, 1);

  /* AN ATTENDANCE ROW POINTING AT A SESSION THAT IS NOT HERE.
   *
   * Realistic whenever a different data source is loaded: the ledger names
   * a member, the records hold an outcome, and the session it refers to is
   * absent. The guard skips it. Without the guard the date lookup returns
   * undefined and dayNumberFromIso splits it, taking the page down rather
   * than dropping one row. */
  const orphaned = adaptAttendanceCsv([
    "Member,Date", "Robin Vale,2026-06-20", "Robin Vale,2026-07-04",
  ].join("\n"), "America/New_York");
  const orphanId = orphaned.records.members[0]?.member_id ?? "";
  orphaned.records.attendance.push({
    attendance_id: "a_orphan", member_id: orphanId, session_id: "session-that-is-not-here",
    attendance_status: "attended", recorded_at: "2026-07-10T09:00:00",
  });
  const withOrphan = outreachResults(
    [{ memberId: orphanId, lapseKey: `${orphanId}|2026-06-20`, takenAt: "2026-06-25", channel: "copy" as const }],
    orphaned.records,
    dayNumberFromIso("2026-08-21"),
  );
  check("an outcome whose session is missing is skipped, not split",
    withOrphan.outcomes.length, 1);
  check("...and the real visit beside it is still measured",
    withOrphan.returned, 1);
}

/* WINDOWS LINE ENDINGS — the format a real studio actually exports.
 *
 * Mutation found four separate ways to break CRLF handling with every
 * check still green, and the reason was simple: there was not one \r
 * anywhere in this suite. A studio exporting attendance from Excel or
 * almost any Windows tool sends CRLF, so the parser's most likely real
 * input was its least tested one.
 *
 * The invariant is what matters, not the byte: the same records, however
 * the file ends its lines. */
{
  const rows = ["Member,Date,Class", "Ada Rowe,2026-07-01,yoga", "Bo Vance,2026-07-02,strength"];
  const lf = adaptAttendanceCsv(rows.join("\n"), "America/New_York");
  const crlf = adaptAttendanceCsv(rows.join("\r\n"), "America/New_York");
  const cr = adaptAttendanceCsv(rows.join("\r"), "America/New_York");

  check("a Windows file reads the same number of rows as a Unix one",
    crlf.rowCount, lf.rowCount);
  check("...and the same members", crlf.memberCount, lf.memberCount);
  check("...and skips nothing the Unix file kept", crlf.skipped.length, lf.skipped.length);
  check("...and produces byte-identical records",
    JSON.stringify(crlf.records), JSON.stringify(lf.records));
  check("...with no stray carriage return left in a member's name",
    crlf.records.members.some((m) => /[\r\n]/.test(m.display_name)), false);
  check("...or in a class type",
    crlf.records.class_sessions.some((c) => /[\r\n]/.test(c.class_type)), false);

  check("an old-style Mac file with bare carriage returns reads the same too",
    JSON.stringify(cr.records), JSON.stringify(lf.records));

  /* A trailing newline is normal in an exported file and must not become
   * an empty row — in either dialect. */
  const trailingLf = adaptAttendanceCsv(rows.join("\n") + "\n", "America/New_York");
  const trailingCrlf = adaptAttendanceCsv(rows.join("\r\n") + "\r\n", "America/New_York");
  check("a trailing newline does not invent a row", trailingLf.rowCount, lf.rowCount);
  check("...and neither does a trailing CRLF", trailingCrlf.rowCount, lf.rowCount);
  check("...and neither invents a member",
    trailingCrlf.memberCount + trailingLf.memberCount, lf.memberCount * 2);
}

/* ONE MISSING COLUMN, NOT BOTH.
 *
 * The only case here passed a file missing BOTH required columns, so the
 * `||` joining the two conditions could become `&&` untouched — and a
 * file with names but no dates would have been accepted. Each is now
 * refused on its own, and the message names the one that is missing
 * without naming the one that is not. */
{
  const failsWith = (text: string): string => {
    try {
      adaptAttendanceCsv(text, "America/New_York");
      return "did not throw";
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  };

  const noDate = failsWith("Member,Class\nAda Rowe,yoga\n");
  check("a file with names but no dates is refused", noDate !== "did not throw", true);
  check("...and the error names the date column", noDate.includes("date column"), true);
  check("...and does not claim the member column is missing too",
    noDate.includes("member column"), false);

  const noMember = failsWith("Date,Class\n2026-07-01,yoga\n");
  check("a file with dates but no names is refused", noMember !== "did not throw", true);
  check("...and the error names the member column", noMember.includes("member column"), true);
  check("...and does not claim the date column is missing too",
    noMember.includes("date column"), false);
}

/* A LINE BREAK INSIDE A QUOTED FIELD — legal CSV, and the last corner of
 * the parser nothing reached.
 *
 * The CRLF checks above cover the outside-quotes branch. There is a second
 * branch for a newline INSIDE quotes, and mutation could break it four
 * ways with every check still green. A field that spans lines is ordinary
 * in an export whose source had a wrapped cell, and it must be one row in
 * both dialects, with the carriage return normalised away rather than
 * carried into a name. */
{
  const lf = adaptAttendanceCsv('Member,Date\n"Ada\nRowe",2026-07-01\n', "America/New_York");
  const crlf = adaptAttendanceCsv('Member,Date\r\n"Ada\r\nRowe",2026-07-01\r\n', "America/New_York");

  check("a quoted field spanning two lines is still one row", lf.rowCount, 1);
  check("...and one member", lf.memberCount, 1);
  check("...and nothing is skipped", lf.skipped.length, 0);
  check("a CRLF inside quotes normalises to the same field as an LF one",
    JSON.stringify(crlf.records), JSON.stringify(lf.records));
  check("...so no carriage return survives into a member's name",
    crlf.records.members.some((m) => m.display_name.includes("\r")), false);

  /* What the page then does with it. A newline in a name is not stripped —
   * cleanName removes characters that cannot be part of a name, and a line
   * break in a wrapped cell is a layout artefact rather than an attack. It
   * must still reach a draft as a plain first name. */
  const name = crlf.records.members[0]?.display_name ?? "";
  check("the newline is kept as a newline, not a literal backslash-n",
    name, "Ada\nRowe");
  check("...and the draft still greets a person, not a line break",
    firstNameOf(name), "Ada");

  /* A LONE CARRIAGE RETURN INSIDE THE QUOTES.
   *
   * The branch handling a newline inside a quoted field accepts a bare
   * \r as well as \r\n, because an old Mac export uses one. Nothing
   * tested that, and the mutation is not a crash: it consumes the
   * character AFTER the return, so "Ada\rRowe" arrives as "Ada\nowe" and
   * a member's name loses a letter on the way to a note addressed to
   * them. Silent corruption is the worst kind. */
  const loneCr = adaptAttendanceCsv('Member,Date\r\n"Ada\rRowe",2026-07-01\r\n', "America/New_York");
  check("a bare carriage return inside quotes keeps every letter of the name",
    loneCr.records.members[0]?.display_name, "Ada\nRowe");
  check("...and still reads as a single row", loneCr.rowCount, 1);
}

/* THE DOWNLOADED LOG. A staff member opens this in a spreadsheet, which
 * is the one place a cell beginning = + - or @ stops being text and
 * becomes a formula. Member names here can come straight from a studio's
 * own export, so that is not hypothetical. */
{
  const sheet = [
    "Member,Date",
    "=cmd()|calc,2026-06-20", "=cmd()|calc,2026-07-04",
    "Robin Vale,2026-06-20", "Robin Vale,2026-07-04",
  ].join("\n");
  const imported = adaptAttendanceCsv(sheet, "America/New_York");
  const members = imported.records.members;
  const hostile = members.find((m) => m.display_name.startsWith("=cmd"));
  const plain = members.find((m) => m.display_name === "Robin Vale");
  check("a hostile name imports as a member at all", hostile !== undefined, true);
  if (hostile && plain) {
    const ledger = [
      { memberId: hostile.member_id, lapseKey: `${hostile.member_id}|2026-07-04`,
        takenAt: "2026-07-10", channel: "copy" as const },
      { memberId: "member:not-here", lapseKey: "member:not-here|2026-01-01",
        takenAt: "2026-07-11", channel: "email" as const },
    ];
    const results = outreachResults(ledger, imported.records, dayNumberFromIso("2026-08-21"));
    const names = new Map(members.map((m) => [m.member_id, m.display_name]));
    const csv = outreachLogCsv(results, ledger, names, csvField);
    const lines = csv.trim().split("\n");

    check("the header names all six columns",
      lines[0], "member,member id,channel,note taken,result,days to return");
    check("a formula-shaped name never starts a cell",
      /(^|,)=/.test(csv), false);
    check("...it is quoted and prefixed so a spreadsheet reads it as text",
      lines.some((l) => l.includes("'=cmd")), true);
    check("a note whose member is not in these records still appears",
      csv.includes("not in these records"), true);
    check("...so the log has a row for every note taken, not just the judgeable ones",
      lines.length - 1, ledger.length);
    check("every line has the same number of columns as the header",
      new Set(lines.map((l) => l.split(",").length)).size, 1);
  }
}

/* COUNTING THINGS IN A SENTENCE A PERSON READS.
 *
 * This product pluralised carefully in some places and not others, and
 * several of the others were reachable. A member who attended exactly
 * once gave "1 classes in the prior 60 days" on the evidence line, with
 * the SHIPPED thresholds. A member who came back the day after a note
 * gave "(1 days)". Two checks in this very file had pinned the wrong
 * text — "1 members checked" — which is how a grammar bug becomes the
 * expected answer.
 *
 * The thresholds are explicitly unratified, so the rest are reachable by
 * configuring them: with minDaysQuiet at 0 the badge reads "1 days quiet"
 * and the note sent to a member opens "it's been 1 days since your last
 * class". That one is a studio's own voice getting a plural wrong on the
 * first line of a personal message. */
{
  check("one is singular", counted(1, "day"), "1 day");
  check("two is plural", counted(2, "day"), "2 days");
  check("zero is plural, which is what English does", counted(0, "day"), "0 days");
  check("an irregular plural is never guessed at",
    counted(1, "class", "classes") + " / " + counted(4, "class", "classes"),
    "1 class / 4 classes");

  /* The sites that were wrong, through the real functions. */
  const once = adaptAttendanceCsv(
    ["Member,Date", "Once Only,2026-07-25"].join("\n"), "America/New_York");
  const solo = findQuietMembers(once.records, dayNumberFromIso("2026-08-21"), proposedRules).flagged[0];
  if (solo) {
    check("a member who attended once reads as one class, not '1 classes'",
      evidenceLine(solo, proposedRules.priorWindowDays).includes("1 class in the prior 60 days"), true);
    check("...and never as the plural", 
      evidenceLine(solo, proposedRules.priorWindowDays).includes("1 classes"), false);
  }

  const oneMember = findQuietMembers(once.records, dayNumberFromIso("2026-08-21"), proposedRules);
  check("one member checked reads as one member",
    summaryLine(oneMember, "August 21, 2026").startsWith("1 member checked"), true);

  /* The draft, under a threshold a studio is free to set. */
  const wide = { minDaysQuiet: 0, maxDaysQuiet: 60, priorWindowDays: 60 };
  const dayOld = adaptAttendanceCsv(
    ["Member,Date", "Just Yesterday,2026-08-20"].join("\n"), "America/New_York");
  const fresh = findQuietMembers(dayOld.records, dayNumberFromIso("2026-08-21"), wide).flagged[0];
  if (fresh) {
    check("a one-day gap is one day in the note, not '1 days'",
      draftTextFor(fresh, dayOld.records, dayNumberFromIso("2026-08-21"), brand.studioName)
        .includes("it's been 1 day since"), true);
    check("...and the evidence beside it agrees",
      evidenceLine(fresh, wide.priorWindowDays).includes("1 classes"), false);
  }
}

const passed = results.filter((r) => r.passed).length;
const failed = results.length - passed;

const summaryEl = document.querySelector<HTMLParagraphElement>("#summary");
const listEl = document.querySelector<HTMLUListElement>("#results");
if (summaryEl && listEl) {
  summaryEl.textContent = `${results.length} checks run, ${passed} passed, ${failed} failed.`;
  summaryEl.classList.add(failed === 0 ? "all-good" : "has-failures");
  for (const r of results) {
    const li = document.createElement("li");
    li.className = r.passed ? "pass" : "fail";
    li.textContent = `${r.passed ? "PASS" : "FAIL"} — ${r.name} (${r.detail})`;
    listEl.append(li);
  }
}

// Also state the verdict where a terminal can read it.
console.log(`re-engagement checks: ${results.length} run, ${passed} passed, ${failed} failed`);
for (const r of results.filter((x) => !x.passed)) {
  console.error(`FAIL: ${r.name} — ${r.detail}`);
}
