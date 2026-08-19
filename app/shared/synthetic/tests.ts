/* Shared synthetic engine — the proof suite. TEAM-OWNED.
 *
 * Browser-run, zero clock dependence in every verdict: configurations pin
 * their own asOfDate. The suite holds the engine to the required checks:
 * determinism, stream independence, identity, lifecycle, capacity,
 * declared-vs-found reconciliation, truth independence, round-tripping,
 * and measured 500-member performance.
 */

import { ID_PATTERN } from "./contracts.js";
import type { GeneratedStudioBundle } from "./contracts.js";
import { DEFAULT_CONFIG, type SyntheticStudioConfig } from "./config.js";
import { generateStudio } from "./generate.js";
import { validateBundle } from "./validate.js";
import { serializeBundle, parseBundle } from "./serialize.js";
import { deriveStatusOn } from "./lifecycle.js";
import { dateOfTimestamp, dayNumberOf } from "./normalize.js";
import type { NamePool } from "./identity.js";

interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}
const results: CheckResult[] = [];
const stats: string[] = [];

function check(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  results.push({
    name,
    passed: a === e,
    detail: a === e ? `= ${e}` : `expected ${e}, got ${a}`,
  });
}
function stat(text: string): void {
  stats.push(text);
}

const BASE: SyntheticStudioConfig = {
  ...DEFAULT_CONFIG,
  seed: "proof-seed-0001",
  asOfDate: "2026-08-18",
  memberCount: 60,
  historyDays: 180,
  mode: "clean",
};

const cohortMemberId = (bundle: GeneratedStudioBundle, key: string): string =>
  Object.entries(bundle.truth.memberCohorts).find(([, k]) => k === key)?.[0] ?? "";

/* ------------------------------------------------------------------ */
/* Determinism and stream independence                                  */
/* ------------------------------------------------------------------ */

const first = generateStudio(BASE);
const second = generateStudio(BASE);
check("the same configuration yields identical output",
  serializeBundle(first) === serializeBundle(second), true);

const otherSeed = generateStudio({ ...BASE, seed: "proof-seed-0002" });
check("a different seed yields different output",
  serializeBundle(first) === serializeBundle(otherSeed), false);

// Substituting the name pool must change names ONLY — identity draws come
// from identity streams, behavior from behavior streams, never shared.
const ALT_POOL: NamePool = {
  first: ["Vera", "Kolo", "Ansel", "Miri", "Deka", "Pau", "Rin", "Salo"],
  last: ["Adeyemi", "Bloom", "Castellan", "Dvorak", "Eze", "Fontaine"],
};
const altNames = generateStudio(BASE, { namePool: ALT_POOL });
check("changing the name pool never reshuffles attendance",
  JSON.stringify(altNames.dataset.attendance) === JSON.stringify(first.dataset.attendance), true);
check("changing the name pool never reshuffles bookings",
  JSON.stringify(altNames.dataset.bookings) === JSON.stringify(first.dataset.bookings), true);
check("changing the name pool never reshuffles the schedule",
  JSON.stringify(altNames.dataset.classSessions) === JSON.stringify(first.dataset.classSessions), true);
check("the substituted pool does change names",
  altNames.dataset.members.some((m, i) => m.displayName !== first.dataset.members[i]?.displayName), true);

/* ------------------------------------------------------------------ */
/* Identity                                                             */
/* ------------------------------------------------------------------ */

check("every member id is namespaced",
  first.dataset.members.every((m) => ID_PATTERN.test(m.id) && m.id.startsWith("member:")), true);
{
  const byName = new Map<string, string[]>();
  for (const m of first.dataset.members) {
    const list = byName.get(m.displayName) ?? [];
    list.push(m.id);
    byName.set(m.displayName, list);
  }
  const duplicateGroups = [...byName.values()].filter((ids) => ids.length > 1);
  check("different members share a display name with DISTINCT ids",
    duplicateGroups.some((ids) => new Set(ids).size === ids.length && ids.length === 2), true);
}
check("unicode names survive verbatim",
  first.dataset.members.some((m) => m.displayName === "王伟") &&
    first.dataset.members.some((m) => m.displayName === "佐藤花子"), true);
check("every email is fictional (.invalid) or absent",
  first.dataset.members.every((m) => m.email === null || m.email.endsWith(".invalid")), true);
check("some members carry no email (missing optional identifier)",
  first.dataset.members.some((m) => m.email === null), true);

/* ------------------------------------------------------------------ */
/* Membership lifecycle                                                 */
/* ------------------------------------------------------------------ */

{
  const resumedId = cohortMemberId(first, "resumed");
  const periods = first.dataset.memberships.filter((p) => p.memberId === resumedId);
  check("a resumed member carries active -> paused -> active periods",
    periods.map((p) => p.state), ["active", "paused", "active"]);
  const pause = periods[1];
  check("derived status mid-pause is paused",
    pause ? deriveStatusOn(periods, pause.startsOn) : "?", "paused");
  check("derived status as of the reference date is active",
    deriveStatusOn(periods, BASE.asOfDate), "active");
}
check("every snapshot agrees with the authoritative periods",
  first.dataset.members.every((m) =>
    deriveStatusOn(
      first.dataset.memberships.filter((p) => p.memberId === m.id),
      BASE.asOfDate,
    ) === m.currentStatusSnapshot), true);

/* ------------------------------------------------------------------ */
/* Clean validation                                                     */
/* ------------------------------------------------------------------ */

const cleanReport = validateBundle(first);
check("clean mode validates with zero problems", cleanReport.problems.length, 0);
check("clean mode declares zero violations", first.truth.declaredViolations.length, 0);
check("clean serialization contains no injected ghost ids",
  serializeBundle(first).includes("member:999901"), false);
check("peak concurrent attendance respects the facility",
  cleanReport.stats["peakConcurrentAttendance"] as number <= (BASE.facilityCapacity ?? 30), true);

/* ------------------------------------------------------------------ */
/* Product D boundary cohorts, from truth intent                        */
/* ------------------------------------------------------------------ */

for (const [days, eligible] of [
  [14, false],
  [15, true],
  [60, true],
  [61, false],
] as const) {
  const id = cohortMemberId(first, `quiet-boundary-${days}`);
  check(`the ${days}-day boundary member exists with exact quiet days`,
    first.truth.expectedQuietDays[id], days);
  check(`the ${days}-day boundary member's eligibility is ${String(eligible)}`,
    first.truth.expectedReengagementEligibility[id], eligible);
}

/* ------------------------------------------------------------------ */
/* Cohort behavior realized in records                                  */
/* ------------------------------------------------------------------ */

{
  const newcomerId = cohortMemberId(first, "newcomer");
  check("a newcomer has no attendance at all",
    first.dataset.attendance.some((a) => a.memberId === newcomerId), false);
  check("a newcomer is absent from expected quiet days",
    newcomerId in first.truth.expectedQuietDays, false);
}
{
  const canceledId = cohortMemberId(first, "canceled");
  const cancelStart = first.dataset.memberships.find(
    (p) => p.memberId === canceledId && p.state === "canceled",
  )?.startsOn ?? "1970-01-01";
  const sessions = new Map(first.dataset.classSessions.map((s) => [s.id, s]));
  check("a canceled member never attends after the cancellation",
    first.dataset.attendance
      .filter((a) => a.memberId === canceledId && a.status === "attended")
      .every((a) => {
        const s = sessions.get(a.classSessionId);
        return s ? dayNumberOf(dateOfTimestamp(s.startsAt)) < dayNumberOf(cancelStart) : false;
      }), true);
}
{
  const proneId = cohortMemberId(first, "no-show-prone");
  check("the no-show-prone member has real no-shows",
    first.dataset.attendance.some((a) => a.memberId === proneId && a.status === "no_show"), true);
}
{
  const returningId = cohortMemberId(first, "returning");
  const sessions = new Map(first.dataset.classSessions.map((s) => [s.id, s]));
  const asOfDay = dayNumberOf(BASE.asOfDate);
  const agos = first.dataset.attendance
    .filter((a) => a.memberId === returningId && a.status === "attended")
    .map((a) => {
      const s = sessions.get(a.classSessionId);
      return s ? asOfDay - dayNumberOf(dateOfTimestamp(s.startsAt)) : -1;
    });
  check("the returning member's silent stretch is real (no visits 25-75 days ago)",
    agos.some((d) => d >= 25 && d <= 75), false);
  check("the returning member attended on both sides of the gap",
    agos.some((d) => d < 25) && agos.some((d) => d > 75), true);
}
check("walk-ins exist: attended with no booking",
  first.dataset.attendance.some((a) => a.status === "attended" && a.bookingId === null), true);

/* ------------------------------------------------------------------ */
/* Truth metrics recomputed here, independently                         */
/* ------------------------------------------------------------------ */

check("truth metric activeMembers agrees with a recount",
  first.truth.expectedDashboardMetrics["activeMembers"],
  first.dataset.members.filter((m) => m.currentStatusSnapshot === "active").length);
check("truth metric totalAttended agrees with a recount",
  first.truth.expectedDashboardMetrics["totalAttended"],
  first.dataset.attendance.filter((a) => a.status === "attended").length);

/* ------------------------------------------------------------------ */
/* Edge-cases mode: exactly the declared defects, nothing else          */
/* ------------------------------------------------------------------ */

const edge = generateStudio({ ...BASE, mode: "edge-cases" });
const edgeReport = validateBundle(edge);
check("edge mode declares a full slate of defects",
  edge.truth.declaredViolations.length >= 9, true);
check("every declared defect is FOUND by the validator",
  edgeReport.missedDeclared.length, 0);
check("nothing undeclared is found (no accidental corruption)",
  edgeReport.undeclaredFound.length, 0);
check("edge mode reconciles as ok", edgeReport.ok, true);
{
  const codes = new Set(edge.truth.declaredViolations.map((v) => v.code));
  for (const code of [
    "orphan-attendance-member",
    "orphan-booking-session",
    "duplicate-attendance",
    "conflicting-attendance",
    "invalid-timestamp",
    "future-attendance",
    "session-over-capacity",
    "attendance-outside-active-membership",
    "overlapping-attendance",
    "snapshot-mismatch",
  ]) {
    check(`edge mode plants ${code}`, codes.has(code), true);
  }
}

/* ------------------------------------------------------------------ */
/* Serialization round-trip                                             */
/* ------------------------------------------------------------------ */

check("serialize -> parse -> serialize is byte-identical",
  serializeBundle(parseBundle(serializeBundle(first))) === serializeBundle(first), true);
{
  let message = "did not throw";
  try {
    parseBundle('{"dataset": {"meta": {}}}');
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  check("parsing a malformed bundle throws a named reason",
    message.includes("missing"), true);
}

/* ------------------------------------------------------------------ */
/* Configuration guard-rails                                            */
/* ------------------------------------------------------------------ */

for (const [label, bad] of [
  ["memberCount 0", { ...BASE, memberCount: 0 }],
  ["memberCount 501", { ...BASE, memberCount: 501 }],
  ["historyDays 30", { ...BASE, historyDays: 30 }],
  ["a loose date", { ...BASE, asOfDate: "2026-8-1" }],
] as const) {
  let threw = false;
  try {
    generateStudio(bad as SyntheticStudioConfig);
  } catch {
    threw = true;
  }
  check(`configuration with ${label} is rejected`, threw, true);
}

/* ------------------------------------------------------------------ */
/* Scale: exactly 500 members, measured                                 */
/* ------------------------------------------------------------------ */

{
  const t0 = performance.now();
  const big = generateStudio({ ...BASE, memberCount: 500, mode: "scale" });
  const t1 = performance.now();
  const bigReport = validateBundle(big);
  const t2 = performance.now();
  check("exactly 500 members can be generated", big.dataset.members.length, 500);
  check("the 500-member studio validates clean", bigReport.problems.length, 0);
  check("500-member generation + validation stays under 10 seconds",
    t2 - t0 < 10_000, true);
  stat(`500 members: generation ${Math.round(t1 - t0)}ms, validation ${Math.round(t2 - t1)}ms — ` +
    `${big.dataset.classSessions.length} sessions, ${big.dataset.bookings.length} bookings, ` +
    `${big.dataset.attendance.length} attendance records, peak concurrent attendance ` +
    `${String(bigReport.stats["peakConcurrentAttendance"])}`);
}

/* ------------------------------------------------------------------ */
/* Truth independence: the engine imports no product, reads no clock,   */
/* touches no network — proven against the shipped sources.             */
/* ------------------------------------------------------------------ */

const ENGINE_SOURCES = [
  "contracts.js", "config.js", "random.js", "normalize.js", "identity.js",
  "lifecycle.js", "schedule.js", "scenarios.js", "generate.js",
  "validate.js", "serialize.js",
];
const FORBIDDEN: ReadonlyArray<[string, RegExp]> = [
  ["a product import", /from\s+["'][^"']*products\//],
  ["a network call", /\bfetch\s*\(|XMLHttpRequest|WebSocket/],
  ["a clock read", /Date\.now\s*\(|new Date\(\)/],
];
for (const file of ENGINE_SOURCES) {
  const source = await (await fetch(`./${file}`)).text();
  for (const [label, pattern] of FORBIDDEN) {
    check(`${file} contains no ${label}`, pattern.test(source), false);
  }
}

/* ------------------------------------------------------------------ */
/* Render the stated verdict                                            */
/* ------------------------------------------------------------------ */

const passed = results.filter((r) => r.passed).length;
const failed = results.length - passed;
const summaryEl = document.querySelector<HTMLParagraphElement>("#summary");
const listEl = document.querySelector<HTMLUListElement>("#results");
if (summaryEl && listEl) {
  summaryEl.textContent = `${results.length} checks run, ${passed} passed, ${failed} failed.`;
  summaryEl.classList.add(failed === 0 ? "all-good" : "has-failures");
  for (const s of stats) {
    const li = document.createElement("li");
    li.className = "stat";
    li.textContent = `STAT — ${s}`;
    listEl.append(li);
  }
  for (const r of results) {
    const li = document.createElement("li");
    li.className = r.passed ? "pass" : "fail";
    li.textContent = `${r.passed ? "PASS" : "FAIL"} — ${r.name} (${r.detail})`;
    listEl.append(li);
  }
}
console.log(`synthetic engine checks: ${results.length} run, ${passed} passed, ${failed} failed`);
for (const r of results.filter((x) => !x.passed)) {
  console.error(`FAIL: ${r.name} — ${r.detail}`);
}
