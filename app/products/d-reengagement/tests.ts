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

import type { FixtureSet } from "./deps.js";
import {
  attendanceCsv,
  generateStudio as generateSharedStudio,
  SYNTHETIC_DEFAULT_CONFIG,
} from "./deps.js";
import { adaptAttendanceCsv, normalizeStatus, parseCsv } from "./csv.js";
import { generateStudio } from "./generate.js";
import { brand, draftMessage, proposedRules } from "./config.js";
import {
  dataQualityLine,
  dayNumberFromIso,
  findQuietMembers,
  firstNameOf,
  summaryLine,
  todayDayNumber,
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
check("today is computed in the studio timezone",
  todayDayNumber("America/New_York", new Date(Date.UTC(2026, 7, 19, 2, 30))),
  dayNumberFromIso("2026-08-18"));

// 7-9. The excluded conversations.
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
    "1 members checked, 0 flagged as of August 18, 2026.");
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
  });
  check("draft carries the member's first name", text.includes("Maria"), true);
  check("draft carries the days away", text.includes("17"), true);
  check("draft carries their usual class", text.includes("yoga"), true);
  check("draft carries the studio name from config", text.includes(brand.studioName), true);
  check("draft has no unfilled placeholders", /[{}$]/.test(text), false);
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
//     13/1/2026 looks European; 2/30/2026 is a typo — neither may become a
//     fabricated future date that silently un-flags a quiet member.
{
  const imp = adaptAttendanceCsv("name,date\nMaria Santos,13/1/2026\nJose Reyes,2/30/2026\n", "America/New_York");
  check("impossible dates are skipped with reasons", imp.skipped.length, 2);
  check("impossible dates import zero records", imp.memberCount, 0);
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
