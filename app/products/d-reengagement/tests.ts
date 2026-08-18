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

import type { FixtureSet } from "../../shared/contract.js";
import { brand, draftMessage, proposedRules } from "./config.js";
import {
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
