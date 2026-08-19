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
import { DEFAULT_CONFIG, organicMemberCount, type SyntheticStudioConfig } from "./config.js";
import { generateStudio } from "./generate.js";
import { validateBundle } from "./validate.js";
import { serializeBundle, parseBundle } from "./serialize.js";
import { deriveStatusOn } from "./lifecycle.js";
import { dateOfTimestamp, dayNumberOf, weekdayOf } from "./normalize.js";
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
  cleanReport.stats["peakConcurrentAttendance"] as number <=
    first.dataset.studio.facilityCapacity, true);
check("the facility never exceeds the 500-person building ceiling",
  first.dataset.studio.facilityCapacity <= 500, true);

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
/* Serving every product, not just re-engagement                        */
/* ------------------------------------------------------------------ */

// The booking surface (A): upcoming sessions with known spots-left answers.
{
  const upcoming = Object.keys(first.truth.expectedUpcomingAvailability);
  check("upcoming sessions carry availability truth for the booking surface",
    upcoming.length > 0, true);
  check("every availability answer is within 0..capacity",
    upcoming.every((id) => {
      const s = first.dataset.classSessions.find((x) => x.id === id);
      const left = first.truth.expectedUpcomingAvailability[id] ?? -1;
      return s !== undefined && left >= 0 && left <= s.capacity;
    }), true);
}

// The staff surface (B): a near-term week that actually has bookings —
// and lapsed members booking NOTHING, the way real quiet members go.
{
  const booked = first.dataset.bookings.filter((b) => b.status === "booked");
  const sessionById = new Map(first.dataset.classSessions.map((x) => [x.id, x]));
  const asOfDay = dayNumberOf(BASE.asOfDate);
  const upcomingBooked = booked.filter((b) => {
    const s = sessionById.get(b.classSessionId);
    return s !== undefined && dayNumberOf(dateOfTimestamp(s.startsAt)) >= asOfDay;
  });
  check("the upcoming fortnight has a real booking load",
    upcomingBooked.length >= 10, true);
  const lapsedIds = new Set(
    Object.entries(first.truth.memberCohorts)
      .filter(([, k]) =>
        ["recently-quiet", "long-lapsed", "paused", "canceled",
         "quiet-boundary-15", "quiet-boundary-60"].includes(k))
      .map(([id]) => id),
  );
  check("lapsed, paused, and canceled members have booked nothing upcoming",
    upcomingBooked.every((b) => !lapsedIds.has(b.memberId)), true);
}

// The support surface (C): current policies, with a superseded version so
// answering from CURRENT policy only is provable.
{
  const policies = first.dataset.studioPolicies;
  check("the studio ships current policies for the support surface",
    policies.filter((p) => p.isCurrent).length, 5);
  check("a superseded policy version exists to test the is-current rule",
    policies.some((p) => !p.isCurrent && p.topic === "cancellation"), true);
  const currentPerTopic = new Map<string, number>();
  for (const p of policies) {
    if (p.isCurrent) currentPerTopic.set(p.topic, (currentPerTopic.get(p.topic) ?? 0) + 1);
  }
  check("exactly one current policy per topic",
    [...currentPerTopic.values()].every((n) => n === 1), true);
}

/* ------------------------------------------------------------------ */
/* The attendance CSV export                                            */
/* ------------------------------------------------------------------ */

{
  const { attendanceCsv } = await import("./csv-export.js");
  const csv = attendanceCsv(first.dataset);
  const lines = csv.trim().split("\n");
  check("the CSV header speaks the re-engagement door's vocabulary",
    lines[0], "member id,member,date,status,class,instructor");
  check("the CSV carries one row per readable recorded outcome",
    lines.length - 1, first.dataset.attendance.length);
  check("the CSV status vocabulary is attended / no-show / unknown",
    lines.slice(1).every((l) => / (attended|no-show|unknown),/.test(l.replace(/,/g, " , ")) ||
      /,(attended|no-show|unknown),/.test(l)), true);
  check("the CSV export is deterministic",
    attendanceCsv(second.dataset) === csv, true);
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
/* The bands the adversarial sweep broke — pinned forever               */
/* ------------------------------------------------------------------ */

// The shortest legal history with a full singleton roster: this exact band
// (historyDays 90-114, memberCount >= 13) crashed the generator once.
for (const hist of [90, 100, 114]) {
  const short = generateStudio({ ...BASE, historyDays: hist, memberCount: 60 });
  check(`a ${hist}-day history generates and validates clean`,
    validateBundle(short).problems.length, 0);
}

// Tiny populations in every mode: edge-cases once declared an over-capacity
// defect it could not create below 13 members and failed itself.
for (const n of [1, 2, 5, 12]) {
  const tinyClean = generateStudio({ ...BASE, memberCount: n });
  check(`a ${n}-member studio validates clean`,
    validateBundle(tinyClean).problems.length, 0);
  const tinyEdge = generateStudio({ ...BASE, memberCount: n, mode: "edge-cases" });
  const tinyReport = validateBundle(tinyEdge);
  check(`a ${n}-member edge-cases studio reconciles exactly`,
    tinyReport.missedDeclared.length + tinyReport.undeclaredFound.length, 0);
}

// A pool that collides constantly must still change ONLY names: the email
// draw once shared the identity stream and pool collisions flipped it.
{
  const tinyPool: NamePool = { first: ["Ada"], last: ["Blue"] };
  const collided = generateStudio(BASE, { namePool: tinyPool });
  check("a colliding pool never flips who has an email",
    collided.dataset.members.every(
      (m, i) => (m.email === null) === (first.dataset.members[i]?.email === null)), true);
  check("a colliding pool never reshuffles attendance",
    JSON.stringify(collided.dataset.attendance) === JSON.stringify(first.dataset.attendance), true);
}

// Impossible calendar dates are refused at the config gate, not discovered
// downstream as invalid timestamps in a "clean" dataset.
{
  let threw = false;
  try {
    generateStudio({ ...BASE, asOfDate: "2026-02-30" });
  } catch {
    threw = true;
  }
  check("an impossible asOfDate is refused at the gate", threw, true);
}

/* ------------------------------------------------------------------ */
/* Habits, decline, cancellers, and the answer key's new column         */
/* ------------------------------------------------------------------ */

// Regulars have rhythms: most visits land on the member's usual weekdays.
{
  const regularId = cohortMemberId(first, "regular");
  const sessions = new Map(first.dataset.classSessions.map((x) => [x.id, x]));
  const seen = new Set<string>();
  const days: number[] = [];
  for (const a of first.dataset.attendance) {
    if (a.memberId !== regularId || a.status !== "attended" || seen.has(a.classSessionId)) continue;
    seen.add(a.classSessionId);
    const sess = sessions.get(a.classSessionId);
    if (sess) days.push(weekdayOf(dateOfTimestamp(sess.startsAt)));
  }
  const counts = new Map<number, number>();
  for (const d of days) counts.set(d, (counts.get(d) ?? 0) + 1);
  const top2 = [...counts.values()].sort((a, b) => b - a).slice(0, 2).reduce((x, y) => x + y, 0);
  check("a regular's visits concentrate on habit weekdays", top2 * 2 >= days.length, true);
}

// The gradual decliner's recent gaps are wider than their old ones.
{
  const fadingId = cohortMemberId(first, "fading");
  const sessions = new Map(first.dataset.classSessions.map((x) => [x.id, x]));
  const days = [...new Set(
    first.dataset.attendance
      .filter((a) => a.memberId === fadingId && a.status === "attended")
      .map((a) => sessions.get(a.classSessionId))
      .filter((x): x is NonNullable<typeof x> => x !== undefined)
      .map((x) => dayNumberOf(dateOfTimestamp(x.startsAt))),
  )].sort((a, b) => a - b);
  const gaps = days.slice(1).map((d, i) => d - (days[i] ?? d));
  const firstHalf = gaps.slice(0, Math.floor(gaps.length / 2));
  const lastHalf = gaps.slice(Math.floor(gaps.length / 2));
  const mean = (xs: number[]): number => xs.reduce((x, y) => x + y, 0) / Math.max(1, xs.length);
  check("a fading member's engagement visibly thins before the quiet",
    gaps.length >= 4 && mean(lastHalf) > mean(firstHalf), true);
}

// The books-then-cancels member actually books and cancels, repeatedly.
{
  const cancellerId = cohortMemberId(first, "books-then-cancels");
  const canceled = first.dataset.bookings.filter(
    (b) => b.memberId === cancellerId && b.status === "canceled",
  ).length;
  check("the books-then-cancels member has real canceled bookings", canceled >= 2, true);
}

// The answer key's prior-attendance column agrees with the records.
{
  const maria = cohortMemberId(first, "quiet-boundary-15");
  check("the answer key carries a prior-attendance count for attenders",
    typeof first.truth.expectedPriorAttendance[maria], "number");
  check("prior-attendance truth reconciles (validator found no mismatch)",
    cleanReport.problems.filter((p) => p.code === "truth-prior-mismatch").length, 0);
}

/* ------------------------------------------------------------------ */
/* The validator's own new teeth, proven on doctored bundles            */
/* ------------------------------------------------------------------ */

// Answer vocabulary planted on a record must scream.
{
  const doctored = JSON.parse(serializeBundle(first)) as GeneratedStudioBundle;
  (doctored.dataset.members[0] as unknown as Record<string, unknown>)["cohort"] = "regular";
  const report = validateBundle(doctored);
  check("an answer label leaked onto a record is caught",
    report.problems.some((p) => p.code === "answer-label-leak"), true);
}

// A credential-shaped value anywhere must scream.
{
  const doctored = JSON.parse(serializeBundle(first)) as GeneratedStudioBundle;
  const victim = doctored.dataset.members[1];
  if (victim) victim.displayName = "Card 4111111111111111";
  check("a credential-shaped value is caught by the decoded-value scan",
    validateBundle(doctored).problems.some((p) => p.code === "real-pii-pattern"), true);
}

// A booking stamped after its class must scream.
{
  const doctored = JSON.parse(serializeBundle(first)) as GeneratedStudioBundle;
  const b = doctored.dataset.bookings[0];
  if (b) b.bookedAt = "2027-12-31T23:59:59";
  check("a booking made after its class is caught",
    validateBundle(doctored).problems.some((p) => p.code === "booking-after-session"), true);
}

// A shuffled collection must scream — order is contract.
{
  const doctored = JSON.parse(serializeBundle(first)) as GeneratedStudioBundle;
  doctored.dataset.attendance.reverse();
  check("an out-of-order collection is caught",
    validateBundle(doctored).problems.some((p) => p.code === "unsorted-collection"), true);
}

/* ------------------------------------------------------------------ */
/* Organic sizing: the studio is the size it is                         */
/* ------------------------------------------------------------------ */

check("organic size is deterministic per seed",
  organicMemberCount("proof-seed-0001") === organicMemberCount("proof-seed-0001"), true);
check("organic size stays within the supported population",
  ["a", "b", "c", "d", "e"].every((s) => {
    const n = organicMemberCount(s);
    return n >= 1 && n <= 500;
  }), true);
check("different seeds grow different studios",
  new Set(["a", "b", "c", "d", "e"].map((s) => organicMemberCount(s))).size > 1, true);
{
  const organic = generateStudio({ ...BASE, memberCount: organicMemberCount(BASE.seed) });
  check("an organically sized studio validates clean",
    validateBundle(organic).problems.length, 0);
}

/* ------------------------------------------------------------------ */
/* Configuration guard-rails                                            */
/* ------------------------------------------------------------------ */

for (const [label, bad] of [
  ["memberCount 0", { ...BASE, memberCount: 0 }],
  ["memberCount 2001", { ...BASE, memberCount: 2001 }],
  ["historyDays 1901", { ...BASE, historyDays: 1901 }],
  ["facilityCapacity 600", { ...BASE, facilityCapacity: 600 }],
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
/* The flagship: 1000 customers, five years, slow days and all          */
/* ------------------------------------------------------------------ */

{
  const t0 = performance.now();
  const flagship = generateStudio({
    ...BASE,
    memberCount: 1000,
    historyDays: 1825,
    mode: "scale",
  });
  const t1 = performance.now();
  const flagshipReport = validateBundle(flagship);
  const t2 = performance.now();
  check("a thousand customers over five years generate", flagship.dataset.members.length, 1000);
  check("the five-year studio validates clean", flagshipReport.problems.length, 0);
  check("five-year generation + validation stays under 30 seconds", t2 - t0 < 30_000, true);
  check("arrivals spread across the years, not bunched at the end",
    flagship.dataset.members.some((m) => dayNumberOf(m.joinedOn) < dayNumberOf(BASE.asOfDate) - 1400), true);
  check("occupancy never approaches the 500-person ceiling",
    (flagshipReport.stats["peakConcurrentAttendance"] as number) <= flagship.dataset.studio.facilityCapacity, true);
  stat(`1000 members x 5 years: generation ${Math.round(t1 - t0)}ms, validation ${Math.round(t2 - t1)}ms — ` +
    `${flagship.dataset.classSessions.length} sessions, ${flagship.dataset.bookings.length} bookings, ` +
    `${flagship.dataset.attendance.length} attendance records, peak concurrency ` +
    `${String(flagshipReport.stats["peakConcurrentAttendance"])} of ${flagship.dataset.studio.facilityCapacity}`);

  // Slow days are visible in the records themselves: Fridays run quieter
  // than Mondays across five years, and the year-end hush is real.
  const sessions = new Map(flagship.dataset.classSessions.map((x) => [x.id, x]));
  const byWeekday = [0, 0, 0, 0, 0, 0, 0];
  let holidayDays = 0;
  let ordinaryDays = 0;
  const perDay = new Map<string, number>();
  for (const a of flagship.dataset.attendance) {
    if (a.status !== "attended") continue;
    const sess = sessions.get(a.classSessionId);
    if (!sess) continue;
    const date = dateOfTimestamp(sess.startsAt);
    byWeekday[weekdayOf(date)] = (byWeekday[weekdayOf(date)] ?? 0) + 1;
    perDay.set(date, (perDay.get(date) ?? 0) + 1);
  }
  for (const [date, count] of perDay) {
    const month = Number(date.slice(5, 7));
    const dayOfMonth = Number(date.slice(8, 10));
    if ((month === 12 && dayOfMonth >= 20) || (month === 1 && dayOfMonth <= 2)) holidayDays += count;
    else ordinaryDays += count;
  }
  check("Fridays run quieter than Mondays, five years running",
    (byWeekday[5] ?? 0) < (byWeekday[1] ?? 0), true);
  check("the year-end hush exists in the records",
    holidayDays > 0 && holidayDays / 13 < ordinaryDays / 352, true);
}

/* ------------------------------------------------------------------ */
/* Truth independence: the engine imports no product, reads no clock,   */
/* touches no network — proven against the shipped sources.             */
/* ------------------------------------------------------------------ */

const ENGINE_SOURCES = [
  "contracts.js", "config.js", "random.js", "normalize.js", "identity.js",
  "lifecycle.js", "schedule.js", "scenarios.js", "generate.js",
  "validate.js", "serialize.js", "csv-export.js",
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
