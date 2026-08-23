/* Shared synthetic engine — the proof suite. TEAM-OWNED.
 *
 * Browser-run, zero clock dependence in every verdict: configurations pin
 * their own asOfDate. The suite holds the engine to the required checks:
 * determinism, stream independence, identity, lifecycle, capacity,
 * declared-vs-found reconciliation, truth independence, round-tripping,
 * and measured 500-member performance.
 */

import { ID_PATTERN, makeId } from "./contracts.js";
import type { GeneratedStudioBundle, MembershipPeriod } from "./contracts.js";
import { DEFAULT_CONFIG, organicMemberCount, validateConfig, type SyntheticStudioConfig } from "./config.js";
import { generateStudio } from "./generate.js";
import { validateBundle } from "./validate.js";
import { attendanceCsv, csvField } from "./csv-export.js";
import { makeStream } from "./random.js";
import { serializeBundle, parseBundle } from "./serialize.js";
import { deriveStatusOn, periodProblems } from "./lifecycle.js";
import { demandFactor } from "./scenarios.js";
import { buildSchedule, roomsPerSlot } from "./schedule.js";
import { dateOfDayNumber, dateOfTimestamp, dayNumberOf, isStrictDate, isStrictTimestamp, weekdayOf } from "./normalize.js";
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

  /* THE PART THAT MAKES THE PAIR USEFUL.
   *
   * That they exist was checked. What they are FOR was not. scenarios.ts
   * gives the two contrasting behaviour on purpose — "the pair Product D
   * must tell apart" — and that is the half a consumer gets wrong: key
   * off display_name instead of member_id and you either write to
   * somebody who came in last week or stay silent about somebody who has
   * been gone a month. Product D's CSV door was caught doing exactly that
   * once, which is why the pair is here at all. */
  const pair = duplicateGroups.find((ids) => ids.length === 2) ?? [];
  check("...and the pair's re-engagement answers are OPPOSITE, which is the point",
    pair.map((id) => first.truth.expectedReengagementEligibility[id]).sort().join(","),
    "false,true");
  check("...so anything keying off the name alone gets one of them wrong",
    new Set(pair.map((id) => first.truth.expectedQuietDays[id])).size, 2);
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
/* THE VALIDATOR'S OWN COUNT, AGAINST THE ANSWER KEY.
 *
 * The re-engagement policy is computed twice on purpose: once by the
 * generator, recorded in the truth key, and once by the validator from
 * the finished records. They are meant to be independent — that is the
 * whole value of an answer key — and nothing compared them.
 *
 * Mutation found it: changing `q > 14` to `q >= 14` in the validator's
 * recomputation left every check green, because the number it produces
 * was never read. The cohorts guarantee a member sitting at exactly 14
 * quiet days, so that one flip silently moves the count by one. */
check("the validator's eligible count matches the answer key's, computed independently",
  cleanReport.stats["realizedEligible"] as number,
  Object.values(first.truth.expectedReengagementEligibility).filter(Boolean).length);
check("...and it is not zero, which would make the agreement meaningless",
  (cleanReport.stats["realizedEligible"] as number) > 0, true);

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

  /* THE ORDER IS A PROPERTY OF THE ROWS, NOT OF THE INPUT.
   *
   * The determinism check above regenerates the same config twice, so a
   * fault in the sort mutates both sides equally and it passes anyway.
   * Mutation found exactly that: one changed comparison in the comparator
   * reordered real rows and produced different bytes, with every check
   * here still green.
   *
   * The comparator sorted by date then member id and returned 0 for
   * anything still equal — but a member CAN attend two classes in one
   * day. Those pairs were left in whatever order the attendance list
   * happened to hold, deterministic only because Array.prototype.sort is
   * specified stable. This engine's brief promises byte-for-byte
   * reproducibility, which is a stronger claim than sort stability makes.
   *
   * Feeding the same records in REVERSED order tells the two apart: a
   * total order gives identical bytes, a partial one does not.
   *
   * It uses DEFAULT_CONFIG rather than BASE, and that is not incidental.
   * Whether a member attends twice in one day is seed-dependent and rare —
   * BASE produces none at any size tried, the shared studio's own config
   * produces a handful — so the check asserts the tie EXISTS before
   * relying on it. Without that first line the other two would pass
   * vacuously, which is how this was caught: they did. */
  const tieBundle = generateStudio(DEFAULT_CONFIG);
  const tieCsv = attendanceCsv(tieBundle.dataset);
  const sessionDay = new Map(
    tieBundle.dataset.classSessions.map((c) => [c.id, c.startsAt.slice(0, 10)]),
  );
  const perMemberDay = new Map<string, number>();
  for (const a of tieBundle.dataset.attendance) {
    const key = `${a.memberId}|${sessionDay.get(a.classSessionId) ?? ""}`;
    perMemberDay.set(key, (perMemberDay.get(key) ?? 0) + 1);
  }
  check("the shared studio really does contain a member attending twice in a day",
    [...perMemberDay.values()].some((n) => n > 1), true);

  const reversed = {
    ...tieBundle.dataset,
    attendance: [...tieBundle.dataset.attendance].reverse(),
  };
  check("...so the export must not depend on the order the rows arrive in",
    attendanceCsv(reversed) === tieCsv, true);

  const tieDates = tieCsv.trim().split("\n").slice(1).map((l) => l.split(",")[2] ?? "");
  check("...while still reading oldest-first, the order it has always had",
    tieDates.every((d, i) => i === 0 || (tieDates[i - 1] ?? "") <= d), true);
}

/* ------------------------------------------------------------------ */
/* Specification alignment: defaults, echo, lifecycle, sensitive scan   */
/* ------------------------------------------------------------------ */
/* NOBODY IS IN TWO PLACES AT ONCE — and the exception that proves it.
 *
 * generate.ts refuses to record an ATTENDED class that overlaps one the
 * member already attended that day. That invariant was never checked, and
 * it is the kind that reads as obviously true right up until a scheduling
 * change makes it quietly false.
 *
 * The second check is the more important one. The guard is applied ONLY
 * when the outcome is attended (`outcome !== "attended" || !overlapsAttended(...)`),
 * so a booked-but-not-attended record MAY overlap — which is realistic: a
 * member books two things at noon and shows up to one. Without stating
 * that, somebody strengthens the first check to "no member has two
 * overlapping records at all", it fails on real generated data, and the
 * fix looks like loosening a safety rule instead of restoring a
 * deliberate one. */
{
  const wide = generateStudio({ ...DEFAULT_CONFIG, memberCount: 300, historyDays: 365 });
  const sessionById = new Map(wide.dataset.classSessions.map((c) => [c.id, c]));
  const minutesOf = (t: string): number =>
    Number(t.slice(11, 13)) * 60 + Number(t.slice(14, 16));

  const countOverlaps = (onlyAttended: boolean): number => {
    const slots = new Map<string, Array<[number, number]>>();
    let overlaps = 0;
    for (const a of wide.dataset.attendance) {
      if (onlyAttended && a.status !== "attended") continue;
      const session = sessionById.get(a.classSessionId);
      if (session === undefined) continue;
      const start = minutesOf(session.startsAt);
      const end = start + session.durationMinutes;
      const key = `${a.memberId}|${session.startsAt.slice(0, 10)}`;
      const taken = slots.get(key) ?? [];
      for (const [from, to] of taken) if (start < to && end > from) overlaps += 1;
      taken.push([start, end]);
      slots.set(key, taken);
    }
    return overlaps;
  };

  /* STATED LIMIT, measured rather than assumed: disabling overlapsAttended
   * in the compiled generator leaves this at 0 too. Something upstream
   * already stops a member being offered two classes in one slot, so this
   * check is a regression guard on the DATA and is NOT evidence that the
   * guard works. Said plainly because a passing check that cannot fail
   * reads exactly like one that can. */
  check("no member is recorded as attending two classes at once",
    countOverlaps(true), 0);
  check("...while a booked-but-unattended class MAY overlap one they did attend, on purpose",
    countOverlaps(false) > 0, true);
}

check("the default history covers at least twelve months",
  DEFAULT_CONFIG.historyDays >= 365, true);

check("the answer key states which generation it answers for",
  [first.truth.generatorVersion, first.truth.seed, first.truth.asOfDate, first.truth.timezone],
  [BASE.generatorVersion, BASE.seed, BASE.asOfDate, BASE.timezone]);

// Each new validator check is proven able to fire on a planted defect —
// a check that has never failed proves nothing.
{
  const plant = (): GeneratedStudioBundle => parseBundle(serializeBundle(first));

  const late = plant();
  const victim = late.dataset.bookings.find((b) =>
    late.dataset.classSessions.some((x) => x.id === b.classSessionId));
  if (victim) victim.bookedAt = "2099-01-01T00:00:00";
  check("a booking placed after its session start is caught",
    validateBundle(late).problems.some((pr) => pr.code === "booked-after-start"), true);

  const ghosted = plant();
  const outcome = ghosted.dataset.attendance.find((a) => a.bookingId !== null);
  if (outcome) {
    const booking = ghosted.dataset.bookings.find((b) => b.id === outcome.bookingId);
    if (booking) booking.status = "canceled";
  }
  check("an outcome hung on a canceled booking is caught",
    validateBundle(ghosted).problems.some((pr) => pr.code === "attendance-on-canceled-booking"), true);

  /* THE ID CHECK ITSELF HAD NEVER BEEN PLANTED.
   *
   * malformed-id had no mention anywhere in this suite, in the one block
   * whose stated discipline is that every validator check is proven able
   * to fire. Mutation found the consequence: the condition is
   * `!ID_PATTERN.test(id) || !id.startsWith(kind + ":")`, and turning the
   * `||` into `&&` requires an id to fail BOTH before it is reported —
   * so a perfectly well-formed id under the WRONG namespace walks
   * through. That is the interesting failure, not a garbled string: it is
   * what a copy-paste between collections actually produces. */
  const misnamespaced = plant();
  const swapped = misnamespaced.dataset.members[0];
  if (swapped) swapped.id = "instructor:000001";
  check("a well-formed id in the wrong namespace is caught",
    validateBundle(misnamespaced).problems.some((pr) => pr.code === "malformed-id"), true);

  const garbled = plant();
  const broken = garbled.dataset.members[1];
  if (broken) broken.id = "member:1";
  check("...and so is an id that does not match the shape at all",
    validateBundle(garbled).problems.some((pr) => pr.code === "malformed-id"), true);

  check("...while the untouched studio reports no malformed id",
    validateBundle(first).problems.some((pr) => pr.code === "malformed-id"), false);

  const leaky = plant();
  const card = leaky.dataset.members[0];
  if (card) card.displayName = "Pat 4111111111111111 Doe";
  check("a card-shaped digit run in a field VALUE is caught",
    validateBundle(leaky).problems.some((pr) => pr.code === "sensitive-pattern"), true);

  const ssnish = plant();
  const mem = ssnish.dataset.members[1];
  if (mem) mem.email = "user123456789@members.pulse.invalid";
  check("an exact nine-digit run is caught",
    validateBundle(ssnish).problems.some((pr) => pr.code === "sensitive-pattern"), true);
}
check("clean records trip none of the lifecycle or sensitive checks",
  cleanReport.problems.filter((pr) =>
    ["booked-after-start", "attendance-on-canceled-booking", "sensitive-pattern"].includes(pr.code),
  ).length, 0);

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

/* WHAT parseBundle IS HANDED WHEN THE FILE IS WRONG.
 *
 * It reads JSON from outside, so every shape JSON can hold is reachable —
 * including the one that catches people out: JSON.parse("null") returns
 * null, and typeof null is "object". The three guards that spell that out
 * (`typeof x !== "object" || x === null`) could each be turned into `&&`
 * with the whole suite still green, because only a bundle missing FIELDS
 * had ever been parsed here, never one that was null. */
{
  const reasonFor = (text: string): string => {
    try {
      parseBundle(text);
      return "did not throw";
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  };
  const goodText = serializeBundle(first);
  const good = JSON.parse(goodText) as Record<string, unknown>;

  check("a top-level null is refused, not treated as an empty bundle",
    reasonFor("null"), "not a bundle: top level is not an object");
  check("...and so is a bare number",
    reasonFor("42"), "not a bundle: top level is not an object");
  check("an array is refused for what it is actually missing",
    reasonFor("[]"), "not a bundle: missing dataset, truth");
  check("text that is not JSON says so first",
    reasonFor("{oops").startsWith("not JSON:"), true);
  check("a null dataset is named, not dereferenced",
    reasonFor(JSON.stringify({ ...good, dataset: null })), "not a bundle: missing dataset");
  check("a null truth is named too",
    reasonFor(JSON.stringify({ ...good, truth: null })), "not a bundle: missing truth");
  check("...while the real thing still parses, so none of this is refusing everything",
    serializeBundle(parseBundle(goodText)) === goodText, true);
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

/* A CSV CELL THAT STARTS WITH = + - @ IS A FORMULA, NOT A NAME.
 *
 * Quoting solves CSV structure and nothing about what a spreadsheet does
 * with the text afterwards. Excel, LibreOffice and Sheets all evaluate a
 * cell beginning with those characters, so a member called
 * =HYPERLINK("http://...","Your refund") in an export becomes a clickable
 * lure the moment somebody opens the file — and this is a studio's own
 * member list, exported and mailed around. Every CSV this repo writes goes
 * through csvField, so it is proven here once. */
{
  const lure = '=HYPERLINK("http://not-a-real-host.invalid","Your refund")';
  check("a formula cell is defused with a leading apostrophe",
    csvField(lure).startsWith("\"'="), true);
  check("a plus-leading cell is defused", csvField("+1234567890"), "'+1234567890");
  check("an at-leading cell is defused", csvField("@SUM(A1:A9)"), "'@SUM(A1:A9)");
  check("a minus-leading cell is defused", csvField("-5"), "'-5");
  check("a tab-leading cell is defused — a tab can carry into the next cell",
    csvField("\tTabbed"), "'\tTabbed");

  check("an ordinary name is untouched", csvField("Maria Santos"), "Maria Santos");

  /* AND THE EXPORTER ACTUALLY APPLIES IT.
   *
   * Everything above tests the FUNCTION. The comment on this block used to
   * say it was "proven here once", which is true of csvField and says
   * nothing about attendanceCsv — a file that stopped calling it would
   * pass every check above. That is the same parts-versus-assembly gap
   * that put a double space in Product D's status line: each piece
   * correct, the line that joins them wrong.
   *
   * The generated names are fictional and none of them start with a
   * formula character, so this plants one. */
  const planted = parseBundle(serializeBundle(first));
  const victim = planted.dataset.members[0];
  if (victim) victim.displayName = "=cmd()|calc";
  const plantedCsv = attendanceCsv(planted.dataset);
  check("a formula-shaped name never starts a cell in the export",
    /(^|,)=/.test(plantedCsv), false);
  check("...it is carried through as text with its quote prefix",
    plantedCsv.includes("'=cmd()|calc"), true);
  check("...and the row is otherwise intact, not dropped",
    plantedCsv.split("\n").some((l) => l.includes("'=cmd()|calc") && l.split(",").length === 6), true);
  check("a non-Latin name is untouched", csvField("王伟"), "王伟");
  check("a name with an apostrophe INSIDE it is not a formula",
    csvField("O'Brien"), "O'Brien");
  check("a comma still quotes the field", csvField("Santos, Maria"), '"Santos, Maria"');
  check("a quote is still doubled", csvField('Say "hi"'), '"Say ""hi"""');
  check("a newline still quotes the field", csvField("two\nlines"), '"two\nlines"');
  check("an empty cell stays empty", csvField(""), "");
}

/* The export a studio actually gets must carry the defusal end to end. */
{
  const doctored = JSON.parse(serializeBundle(first)) as GeneratedStudioBundle;
  const victim = doctored.dataset.members[0];
  if (victim) victim.displayName = "=1+1";
  const csv = attendanceCsv(doctored.dataset);
  check("no line of a real export starts a cell with a bare formula",
    csv.split("\n").some((line) => /(^|,)[=+@]/.test(line)), false);
}

/* THE LEAK THAT IS NOT ON RECORD ZERO. The scan above used to read only
 * value[0] of every array, which catches a label that is on the TYPE and
 * misses the one that is on a RECORD — a stray field on member 30, or on
 * the single member an edge-case injection touched, walked straight past
 * it. That is the shape this check most needs to catch. */
{
  const doctored = JSON.parse(serializeBundle(first)) as GeneratedStudioBundle;
  const deep = doctored.dataset.members.length - 1;
  (doctored.dataset.members[deep] as unknown as Record<string, unknown>)["cohortIntent"] = "fader";
  const report = validateBundle(doctored);
  check("an answer label on the LAST record is caught, not just the first",
    report.problems.some((p) => p.code === "answer-label-leak"), true);
}

// Instructors and class types were outside the scan entirely.
{
  const doctored = JSON.parse(serializeBundle(first)) as GeneratedStudioBundle;
  (doctored.dataset.instructors[0] as unknown as Record<string, unknown>)["expectedLoad"] = 3;
  check("an answer label on an instructor is caught",
    validateBundle(doctored).problems.some((p) => p.code === "answer-label-leak"), true);
}
{
  const doctored = JSON.parse(serializeBundle(first)) as GeneratedStudioBundle;
  (doctored.dataset.classTypes[0] as unknown as Record<string, unknown>)["quietRate"] = 0.2;
  check("an answer label on a class type is caught",
    validateBundle(doctored).problems.some((p) => p.code === "answer-label-leak"), true);
}

// A label on the TYPE — every record carrying it — is ONE line, not one per
// record: a report nobody can read is a report nobody reads.
{
  const doctored = JSON.parse(serializeBundle(first)) as GeneratedStudioBundle;
  for (const m of doctored.dataset.members) {
    (m as unknown as Record<string, unknown>)["cohort"] = "regular";
  }
  const leaks = validateBundle(doctored).problems.filter((p) => p.code === "answer-label-leak");
  check("a label on every record is reported once, with the count", leaks.length, 1);
  check("...and the count is stated",
    leaks[0]?.detail.includes(`${doctored.dataset.members.length} records carry it`), true);
}

/* ONE DEFECT, ONE CODE. The credential scan ran twice under two names, so a
 * single planted value produced two problems — and the reconciliation matches
 * declared against found on code + entityId, which meant declaring either one
 * left the other undeclared and edge-cases mode could never balance. */
{
  const doctored = JSON.parse(serializeBundle(first)) as GeneratedStudioBundle;
  const victim = doctored.dataset.members[2];
  if (victim) victim.displayName = "Card 4111111111111111";
  const found = validateBundle(doctored).problems.filter(
    (p) => p.code === "sensitive-pattern" || p.code === "real-pii-pattern",
  );
  check("one credential-shaped value raises exactly one problem", found.length, 1);
  check("...under the surviving code", found[0]?.code, "sensitive-pattern");
  check("...attributed to the record that owns it, so a declaration can name it",
    found[0]?.entityId, victim?.id);
}

/* The pad is the sort key: a seventh digit sorts before every six-digit id. */
{
  let threw = "";
  try { makeId("attendance", 1_000_000); } catch (e) { threw = (e as Error).name; }
  check("an id past six digits refuses to be minted rather than mis-sorting", threw, "RangeError");
  check("the last six-digit id is still fine", makeId("attendance", 999_999), "attendance:999999");
  check("zero is not a record number", (() => {
    try { makeId("member", 0); return ""; } catch (e) { return (e as Error).name; }
  })(), "RangeError");
}

/* Every collection, because that is what the brief promises. */
{
  const doctored = JSON.parse(serializeBundle(first)) as GeneratedStudioBundle;
  // Reverse rather than index-swap: noUncheckedIndexedAccess makes every
  // element possibly-undefined, and reverse() needs no indexing at all.
  doctored.dataset.instructors.reverse();
  check("instructors out of id order is caught",
    validateBundle(doctored).problems.some((p) => p.code === "unsorted-collection"), true);
}
{
  const doctored = JSON.parse(serializeBundle(first)) as GeneratedStudioBundle;
  doctored.dataset.studioPolicies.reverse();
  check("studioPolicies out of id order is caught",
    validateBundle(doctored).problems.some((p) => p.code === "unsorted-collection"), true);
}

// A credential-shaped value anywhere must scream.
{
  const doctored = JSON.parse(serializeBundle(first)) as GeneratedStudioBundle;
  const victim = doctored.dataset.members[1];
  if (victim) victim.displayName = "Card 4111111111111111";
  check("a credential-shaped value is caught by the decoded-value scan",
    validateBundle(doctored).problems.some((p) => p.code === "sensitive-pattern"), true);
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
  /* A WALL-CLOCK SMOKE ALARM, NOT A PERFORMANCE BUDGET — and the ceiling is
   * deliberately far above the real cost. The work here is about three
   * seconds on an idle machine, and the old 30-second ceiling looked like
   * ten times the headroom needed. It was not: this check failed twice on a
   * machine running several builds at once, in a suite whose whole point is
   * that it reports the same answer every time. A check that goes red
   * because the machine was busy teaches people to re-run the gate until it
   * is green, which costs more than the check was ever worth.
   *
   * What it is still here to catch is an ALGORITHMIC regression — somebody
   * making generation quadratic in the member count, which would blow past
   * this by an order of magnitude on any machine, loaded or not. It cannot
   * catch a gradual slowdown, and it is not meant to. */
  check("five-year generation + validation does not regress by an order of magnitude",
    t2 - t0 < 120_000, true);
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
/* WHAT THE ENGINE MAY NOT CONTAIN, and the two holes this list used to have.
 *
 * UNSEEDED RANDOMNESS WAS NOT ON THE LIST AT ALL. Every promise this engine
 * makes rests on being reproducible from a seed — the answer key only means
 * something because the same seed builds the same studio — and the grep that
 * enforces purity never once looked for Math.random. The byte-identical
 * checks would catch it wherever it changed observed output; a call in a
 * branch those configurations do not reach would have sat there indefinitely.
 *
 * The clock pattern only caught `new Date()` with empty parens, which let
 * `new Date` (no parens at all — same current-date object) and a bare
 * `Date()` call through, along with performance.now(). `new Date(value)`
 * stays LEGAL and is used twice in normalize.ts: round-tripping a calendar
 * date through the real calendar is arithmetic, not a clock read, and
 * forbidding it would forbid checking that a date exists. */
const FORBIDDEN: ReadonlyArray<[string, RegExp]> = [
  ["a product import", /from\s+["'][^"']*products\//],
  ["a network call", /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/],
  ["a clock read", /Date\.now\s*\(|\bDate\s*\(\s*\)|new\s+Date\s*(?!\s*\()|performance\.now\s*\(/],
  ["unseeded randomness", /Math\.random\s*\(|crypto\.getRandomValues|randomUUID/],
  /* THE MACHINE'S LANGUAGE IS OUTSIDE STATE TOO. localeCompare and
   * Intl.Collator order text by the runtime's locale and ICU version, so a
   * seed could produce one studio here and a different one on a colleague's
   * laptop — the same failure a clock read or an unseeded draw would cause,
   * arriving by a quieter route. schedule.ts sorted its slot times with
   * localeCompare until 2026-08-22. It changed no byte of any bundle,
   * verified across four configurations, because every locale agrees about
   * the digits in "17:30" — but "it happens to agree" is what this engine
   * refuses to rest on everywhere else. Plain < and > are locale-blind. */
  ["locale-dependent ordering", /localeCompare\s*\(|Intl\.Collator/],
];
for (const file of ENGINE_SOURCES) {
  const source = await (await fetch(`./${file}`)).text();
  for (const [label, pattern] of FORBIDDEN) {
    check(`${file} contains no ${label}`, pattern.test(source), false);
  }
}

/* THE ANSWER KEY HAS TO AGREE WITH THE DATA IT IS THE KEY TO.
 *
 * `truth.expectedDashboardMetrics` is twelve counts a product validates
 * its own dashboard against. Nothing checked any of them. That is the
 * worst place in the engine to have no checks: a wrong answer key does
 * not fail, it quietly CERTIFIES a wrong dashboard, and the product that
 * trusted it has no second opinion to notice with.
 *
 * Found by mutation — three survivors sat on the upcoming-sessions filter
 * alone, because a count nothing reads is a count nothing can contradict.
 *
 * RECOMPUTED FROM THE RECORDS, never restated. A check that copied the
 * generator's own expression would agree with any mistake inside it. The
 * partitions are asserted whole as well as piece by piece, so a single
 * filter cannot drift without the total refusing to add up. */
{
  const asOf = "2026-08-22";
  const asOfDay = dayNumberOf(asOf);
  const bundle = generateStudio({
    ...DEFAULT_CONFIG,
    seed: "dashboard-metrics",
    asOfDate: asOf,
    memberCount: 200,
    historyDays: 365,
    mode: "clean",
  });
  const metrics = bundle.truth.expectedDashboardMetrics;
  const data = bundle.dataset;
  const startsOn = (session: { startsAt: string }): number =>
    dayNumberOf(dateOfTimestamp(session.startsAt));

  /* THE KEY NAMES ARE A PROSE PROMISE, and the type cannot hold them:
   * `expectedDashboardMetrics` is a `Record<string, number>`, so the only
   * statement of which keys exist is the doc comment above `SyntheticTruth`
   * in contracts.ts. A consumer reading a key that got renamed gets
   * `undefined` and no error. Read that comment and hold the record to it,
   * the same way the engine audit above holds the sources to their rules. */
  const contractSource = await (await fetch("./contracts.ts")).text();
  check("contracts.ts was actually read", contractSource.length > 200, true);
  const promised = (/expectedDashboardMetrics keys:([\s\S]*?)\./.exec(contractSource)?.[1] ?? "")
    .replace(/\*/g, " ").split(",").map((k) => k.trim()).filter((k) => k !== "");
  check("the doc comment lists twelve metric keys", promised.length, 12);
  check("the answer key holds exactly the keys contracts.ts promises",
    Object.keys(metrics).slice().sort().join(","), promised.slice().sort().join(","));

  /* -1 for a key that is not there: no count can be negative, so a missing
   * key fails every comparison below instead of silently reading as 0 and
   * matching an empty studio. */
  const m = (key: string): number => metrics[key] ?? -1;

  /* NON-VACUOUS FIRST. Every equality below would hold in a studio of
   * nothing, so establish there is a studio behind them. */
  check("there is a real studio behind these counts",
    data.members.length > 100 && data.attendance.length > 1000 && data.classSessions.length > 1000,
    true);

  check("active, paused and canceled account for every member",
    m("activeMembers") + m("pausedMembers") + m("canceledMembers"), data.members.length);
  check("...and each is the number the member records hold",
    [m("activeMembers"), m("pausedMembers"), m("canceledMembers")].join(","),
    ["active", "paused", "canceled"]
      .map((s) => data.members.filter((x) => x.currentStatusSnapshot === s).length).join(","));

  check("upcoming scheduled sessions are those scheduled on or after the as-of date",
    m("upcomingScheduledSessions"),
    data.classSessions.filter((s) => s.status === "scheduled" && startsOn(s) >= asOfDay).length);
  check("completed sessions are those marked completed",
    m("completedSessions"), data.classSessions.filter((s) => s.status === "completed").length);
  /* The partition is what stops one filter drifting unseen: every session
   * is upcoming-scheduled, completed, canceled, or still "scheduled" in the
   * past — and that last group should not exist at all. */
  const canceledSessions = data.classSessions.filter((s) => s.status === "canceled").length;
  const scheduledInPast = data.classSessions.filter(
    (s) => s.status === "scheduled" && startsOn(s) < asOfDay).length;
  check("every session falls in exactly one of the four groups",
    m("upcomingScheduledSessions") + m("completedSessions") + canceledSessions + scheduledInPast,
    data.classSessions.length);
  check("no session is still 'scheduled' in the past", scheduledInPast, 0);

  check("attendance records are counted whole",
    m("totalAttendanceRecords"), data.attendance.length);
  check("attended, no-show and unknown account for every attendance record",
    m("totalAttended") + m("totalNoShows")
      + data.attendance.filter((a) => a.status === "unknown").length,
    m("totalAttendanceRecords"));
  check("...and attended is the number the records hold",
    m("totalAttended"), data.attendance.filter((a) => a.status === "attended").length);
  check("bookings are counted whole", m("totalBookings"), data.bookings.length);

  /* The peak is the one metric that is a maximum rather than a count, so
   * an off-by-one in the comparison would not disturb any total above. */
  const attendedBySession = new Map<string, number>();
  for (const a of data.attendance) {
    if (a.status !== "attended") continue;
    attendedBySession.set(a.classSessionId, (attendedBySession.get(a.classSessionId) ?? 0) + 1);
  }
  check("the peak is the most any one class ever had attend",
    m("peakSessionAttendance"), Math.max(0, ...attendedBySession.values()));
  check("...and it is not merely the capacity", m("peakSessionAttendance") > 0, true);
}

/* THE MARK MAY MOVE ONLY FOR PEOPLE WHO HAVE NOT ASKED IT NOT TO.
 *
 * The pulse mark carries a guarded animation: a spark travels the line, and
 * everything that moves lives inside a prefers-reduced-motion: no-preference
 * block in theme.css. These checks read the shipped sources the way the
 * engine audit above does, and pin the three ways that promise could rot:
 * the animation escaping the guard, the resting state depending on the
 * animation, and the mark acquiring script it must never have. */
{
  const themeCss = await (await fetch("../theme.css")).text();
  check("theme.css was actually read", themeCss.length > 200, true);

  /* Every animation of the runner sits AFTER the reduced-motion guard. The
   * base .pulse-mark-runner rule (opacity 0 — the resting state) sits
   * before it, which is what makes rest the default rather than a fallback. */
  /* EVERY GUARDED REGION, FOUND BY MATCHING BRACES — not by assuming there
   * is one of them.
   *
   * This check used to compare each animation's position against
   * lastIndexOf(guard), which is only correct while the file has exactly
   * ONE reduced-motion block. The day a second one landed (the studio
   * floor's) the mark's animation was suddenly "before the last guard" and
   * a correct file failed. The assumption was the bug, so the assumption
   * is gone: the ranges are computed, and an animation has to sit inside
   * one of them. */
  const guardRanges: Array<[number, number]> = [];
  const GUARD = "@media (prefers-reduced-motion: no-preference)";
  for (let at = themeCss.indexOf(GUARD); at >= 0; at = themeCss.indexOf(GUARD, at + 1)) {
    let depth = 0;
    let end = -1;
    for (let i = themeCss.indexOf("{", at); i < themeCss.length && i >= 0; i += 1) {
      if (themeCss[i] === "{") depth += 1;
      else if (themeCss[i] === "}") { depth -= 1; if (depth === 0) { end = i; break; } }
    }
    if (end > at) guardRanges.push([at, end]);
  }
  const insideAGuard = (i: number): boolean => guardRanges.some(([a, b]) => i > a && i < b);
  check("theme.css has at least one reduced-motion guard", guardRanges.length > 0, true);
  check("...and every one of them closes", guardRanges.every(([a, b]) => b > a), true);

  const restingRule = themeCss.indexOf(".pulse-mark-runner { opacity: 0; }");
  check("the runner rests invisible, outside every guard",
    restingRule >= 0 && !insideAGuard(restingRule), true);

  /* NOT JUST THE MARK. Every `animation:` in the shared stylesheet has to
   * be inside a guard — the mark's spark, the lifter's press, the pedal
   * stroke, the stride and the crossing. One rule written outside is one
   * thing that keeps moving for somebody who asked the whole site to stop. */
  const allAnimations = [...themeCss.matchAll(/(^|[;{\s])animation:/g)].map((m) => m.index ?? -1);
  check("theme.css declares animations at all", allAnimations.length > 0, true);
  const unguarded = allAnimations.filter((i) => !insideAGuard(i));
  check("...and every single one sits inside a reduced-motion guard", unguarded.length, 0);
  const markAnimations = [...themeCss.matchAll(/animation:[^;]*pulse-mark-run/g)].map((m) => m.index ?? -1);
  check("the mark's animation exists", markAnimations.length > 0, true);
  check("...and it is one of the guarded ones", markAnimations.every(insideAGuard), true);

  /* A KNEE BENDS ONE WAY. Every shin and every forearm angle in the file
   * is zero or negative; a positive one folds a joint backwards, which is
   * the single thing that makes a rig read as broken rather than drawn.
   * Cheap to check, and impossible to see in a diff. */
  const jointAngles: number[] = [];
  for (const block of themeCss.split("}")) {
    if (!/-shin|-forearm/.test(block)) continue;
    for (const m of block.matchAll(/rotate\((-?[\d.]+)deg\)/g)) jointAngles.push(Number(m[1]));
  }
  check("the joint angles were actually found", jointAngles.length > 4, true);
  check("...and no knee or elbow bends backwards",
    jointAngles.filter((a) => a > 0), []);
  /* The keyframes never touch transform or layout — stroke and opacity only,
   * which is what "no layout movement" means as a greppable property.
   *
   * THE FIRST VERSION OF THIS CHECK COULD NOT FAIL. With the @keyframes
   * block deleted, indexOf returns -1, slice(-1) returns the file's last
   * character, and the regex correctly finds no transform in one character —
   * so a DEAD animation (a dangling animation: reference to keyframes that
   * no longer exist, which CSS silently no-ops) shipped green through all
   * five checks. A review agent proved it by simulation. The existence
   * check below is what makes the content check able to fail at all. */
  const framesAt = themeCss.indexOf("@keyframes pulse-mark-run");
  check("the keyframes the animation names actually exist", framesAt >= 0, true);
  const frames = framesAt >= 0 ? themeCss.slice(framesAt) : "";
  const frameEnd = frames.indexOf("}\n}");
  check("...and the keyframes block closes", frameEnd >= 0, true);
  const frameBlock = frameEnd >= 0 ? frames.slice(0, frameEnd + 3) : "";
  check("...and it is not empty", frameBlock.length > 40, true);
  check("the animation moves stroke and opacity, never transform or size",
    /transform|width|height|margin|top|left/.test(frameBlock), false);

  /* The mark's own modules: no inline handlers, no HTML injection, no
   * script inside the svg. textContent-and-attributes only. */
  /* Every shared component that writes into a live page, not just the two
   * that draw the mark: the footer and the alert box are appended to all
   * thirteen pages by theme-boot, so a string of HTML in either of them
   * would be a string of HTML on every page in the studio. */
  for (const file of [
    "../components/logo.ts",
    "../components/brand-header.ts",
    "../components/site-footer.ts",
    "../components/alert.ts",
    "../components/figures.ts",
    "../components/assistant.ts",
  ]) {
    const source = await (await fetch(file)).text();
    check(`${file} was actually read`, source.length > 200, true);
    check(`${file} sets no inline event handler`,
        /setAttribute\(["']on/i.test(source), false);
    check(`${file} never writes HTML as a string`,
      /innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(source), false);
  }

  /* Every page wired to theme-boot gets an icon: the ensure function exists,
   * targets rel icon, and resolves the shared file relative to the module
   * rather than to whatever page happens to be open. */
  const boot = await (await fetch("../theme-boot.ts")).text();
  check("theme-boot ensures a favicon", boot.includes("function ensureFavicon"), true);
  check("...only when the page declares none",
    boot.includes('querySelector(\'link[rel~="icon"]\')'), true);
  check("...resolved relative to the module, not the page",
    boot.includes('new URL("../favicon.svg", import.meta.url)'), true);

  /* ONE FOOTER AND ONE ALERT REGION, ON EVERY PAGE WIRED TO THIS MODULE.
   * The bottom of the site is a shared component for the same reason the
   * top is: thirteen pages had thirteen endings, twelve of which were
   * </main>. These pin the wiring rather than the look — the look is in
   * theme.css and a browser is the only thing that can judge it. */
  check("theme-boot mounts the one shared footer", boot.includes("mountSiteFooter()"), true);
  check("...and puts the alert region in before anything can need it",
    boot.indexOf("ensureAlertRegion()") < boot.indexOf("mountSiteFooter()"), true);
  check("...and neither is built with a string of HTML",
    /innerHTML|insertAdjacentHTML|document\.write/.test(boot), false);

  /* The footer resolves the site root from ITS OWN location. Resolved from
   * the page instead, every link would be right at one depth and 404 at the
   * other two — and no gate here opens a browser to find that out. */
  const footerSource = await (await fetch("../components/site-footer.ts")).text();
  check("the footer resolves the site root from the module, not the page",
    footerSource.includes('new URL("../../", import.meta.url)'), true);
  check("...and reads the studio's name from the clone seam",
    footerSource.includes('from "../brand.js"'), true);

  /* The guarded storage doors are ONE implementation now. theme-boot and
   * Product D each had their own and the two had drifted; a second copy
   * appearing here is the drift starting again. */
  check("theme-boot takes its storage doors from the shared module",
    boot.includes('from "./storage.js"'), true);
  check("...and opens none of its own",
    /localStorage\.(getItem|setItem|removeItem)/.test(boot), false);

  check("theme-boot mounts the assistant launcher", boot.includes("mountAssistant()"), true);
  const assistantSource = await (await fetch("../components/assistant.ts")).text();
  check("the assistant was actually read", assistantSource.length > 200, true);
  /* NAMES NO HOST — and does not name one to check for it either. This
   * used to be a list of candidate providers spelled out in a regex, in a
   * file that ships to a public URL, which published the shortlist it was
   * trying to keep out of the source. The generic form is both quieter and
   * stricter: the assistant must carry NO absolute URL at all. It talks to
   * its own origin through relative paths, so any scheme-and-host literal
   * in there is a provider hardcoded into a file that should outlive the
   * choice of provider. */
  check("it names no host at all in its own source",
    /https?:\/\/[a-z0-9]/i.test(assistantSource), false);
  check("it holds no key or credential-shaped literal",
    /anthropic-version|x-api-key|sk-ant-/i.test(assistantSource), false);

  /* A NAME IS NOT A PERMISSION, AND THE HEADER MUST NOT CONFUSE THE TWO.
   *
   * The top bar used to print "staff · front desk" straight from the
   * browser's remembered session — a localStorage value anybody can write.
   * Once the staff surfaces grew a real door, the two disagreed on one
   * screen: the header claimed staff while the page below it asked the
   * person to sign in. The tag is now drawn only after the SERVER confirms
   * a session it signed itself.
   *
   * These read the shipped source rather than the behaviour because the
   * failure they guard is a shape: somebody simplifying the async answer
   * back into a synchronous one from the local session. That reads like a
   * tidy-up and is a privilege claim. */
  const topbarSource = await (await fetch("../components/topbar.ts")).text();
  check("the top bar was actually read", topbarSource.length > 200, true);
  /* The IMPORT, not the name. An earlier version of this check looked for
     the string "readStaffGate" and was satisfied by the comment above it
     explaining what it does — a check a comment can pass is not a check.
     An import is a structural dependency prose cannot fake. */
  check("it imports the door from shared rather than deciding for itself",
    topbarSource.includes('from "../auth/staff-gate.js"'), true);
  check("...and the staff tag is only appended inside that answer",
    /readStaffGate\(\)[\s\S]{0,400}pulse-session-role/.test(topbarSource), true);
  check("signing out ends the server session, not just the remembered name",
    topbarSource.includes("signOutStaff") && topbarSource.includes("clearPulseSession"), true);

  /* THE NAME GUARD MUST NOT COME BACK TO THE BROWSER.
   *
   * The member support page used to fetch every member's display name so it
   * could check the assistant's answer against them — a member-facing page
   * holding the whole roster, which is precisely what the data law forbids
   * and a larger leak than the one it prevented. The check moved to the
   * server, which already holds the roster and already sees the answer.
   *
   * These read the shipped source because the regression is a shape: a
   * `.members` read reappearing on a member-facing page. The compiler now
   * refuses that too (PublicFixtures has no `members`), and two independent
   * guards on the same rule is the point, not duplication. */
  const chatbotSource = await (await fetch("../../products/c-chatbot/main.ts")).text();
  check("the member support page was actually read", chatbotSource.length > 200, true);
  /* ANY `.members` AT ALL, not a named variable. The first version of this
     looked for `fixtures.members` and a plant of `(fixtures as any).members`
     walked straight past it — a cast is exactly how this regression would
     actually arrive, since the compiler now refuses the honest spelling. */
  check("it never reads the studio roster in the browser",
    /\.members\b/.test(chatbotSource), false);
  check("it takes the name verdict from the server instead",
    chatbotSource.includes("nameRefused"), true);
  check("...and still runs the vocabulary half itself",
    chatbotSource.includes("answerProblems("), true);

  const serverSource = await (await fetch("../../../scripts/start-haiku.mjs")).text();
  check("the server was actually read", serverSource.length > 200, true);
  check("the server holds the name guard",
    serverSource.includes("answerNamesAnotherMember"), true);
  check("...and reads the roster from outside app/, never from the served folder",
    /staff-records\.json/.test(serverSource) && !/app[/\\]shared[/\\]staff-records/.test(serverSource), true);

  /* A THUMB IS NOT A POINTER. Seventeen controls measured under 44px on a
     375px viewport, eleven of them the footer's navigation links at fifteen
     pixels tall — invisible on a desktop, unusable on the phone a member
     actually carries. The rule is keyed on `pointer: coarse` rather than a
     width, because what changed is the input, not the screen. */
  const themeSource = await (await fetch("../theme.css")).text();
  check("the theme was actually read", themeSource.length > 200, true);
  check("touch pointers get a 44px minimum",
    /@media\s*\(pointer:\s*coarse\)/.test(themeSource), true);
  check("...and it covers the footer links that were fifteen pixels tall",
    /@media\s*\(pointer:\s*coarse\)[\s\S]{0,400}\.site-footer li a/.test(themeSource), true);
  check("...with a real minimum, not just a comment about one",
    /@media\s*\(pointer:\s*coarse\)[\s\S]{0,600}min-height:\s*44px/.test(themeSource), true);

  /* A RECURRING CLASS OF BUG, PINNED BY THE TWO CASES THAT ALREADY
   * HAPPENED. `hidden` is a UA-stylesheet `display: none` at the lowest
   * possible specificity; a plain class rule setting `display:` on the
   * same element wins by source order regardless, so the element is
   * marked hidden and still drawn. It happened first to `.home-product`
   * (the folded staff cards rendered at 941px anyway) and again, in the
   * SAME session, to `.assistant-panel` (the chat panel rendered open on
   * every page load) — proof that "I'll remember this time" does not
   * survive contact with a second component. Every class here that
   * toggles via `.hidden = ` in a shared module needs its override; this
   * pins the two found so far rather than trusting the next one to be
   * caught by eye. */
  const homeCss = await (await fetch("../home.css")).text();
  check("home.css was actually read", homeCss.length > 200, true);
  check("the folded staff card override still exists",
    homeCss.includes(".home .home-product[hidden] { display: none; }"), true);
  check("the assistant panel's override still exists",
    themeCss.includes(".assistant-panel[hidden] { display: none; }"), true);

  /* THE ASSISTANT'S DIRECTIONS HAVE TO POINT AT REAL PAGES. The system
   * prompt tells the model that booking happens on this site rather than
   * at the front desk — a wayfinding claim, and the kind of sentence that
   * rots silently when a route moves. It said the opposite until somebody
   * asked "where do I book?" on a page with a Book a class button on it.
   * These read the shipped server prompt and hold it to routes this
   * repository actually publishes. */
  /* serverSource is read once, above. */
  /* Fetched, not assumed: the booking page the prompt points a member at
   * has to be a page this site actually serves. A 404 here means the
   * assistant is giving directions to a room that is not there. */
  const bookingPageExists = (await fetch("../../products/a-booking/index.html")).ok;
  check("the assistant service was actually read", serverSource.length > 500, true);
  check("it tells the model booking happens on this site",
    /booking page/i.test(serverSource) && /do NOT send somebody to the front desk/i.test(serverSource), true);
  check("...and the booking page it names is one this site publishes",
    bookingPageExists, true);
  /* The other half, so the fix cannot swing too far: money is NOT on this
   * site, and the front desk must stay the answer for it. */
  check("...while payment still goes to the front desk",
    /Payment, prices and membership signup are NOT on this site/i.test(serverSource), true);
}

/* NOTHING IS ATTENDED ON THE AS-OF DATE, AND TWO PRODUCTS DEPEND ON IT.
 *
 * validate.ts skips attendance dated on the as-of date — `day >= asOfDay
 * continue; // future rows are never evidence`. Product D's
 * findQuietMembers counts a class attended today. Those definitions
 * disagree, and have never disagreed in practice for one reason: no
 * generated attendance row is ever dated there.
 *
 * app/shared/CLAUDE.md has warned about this in prose and asks whoever
 * changes it to raise it first. This is that warning with a check behind
 * it. If the generator ever fills today's classes, a member who attended
 * this morning reads as quiet to the answer key and as recent to Product
 * D, and it looks like a bug in whichever you read second.
 *
 * THE BOUNDARY IS TIGHT, WHICH IS WHY THIS IS WORTH CHECKING. The newest
 * attended class in clean mode is exactly ONE day before the as-of date —
 * measured, not assumed. One day nearer and the two products part company,
 * so this is a check standing next to the edge rather than one admiring it
 * from a distance.
 *
 * EDGE-CASES MODE IS EXCLUDED FROM THE RULE, ON PURPOSE. It injects a
 * `future-attendance` defect deliberately, so it DOES hold a row against a
 * later session. What matters there is the other half — that the row is
 * DECLARED — and that is checked instead of pretending the mode is clean.
 *
 * The check is on the ATTENDANCE, not on the schedule: today's classes DO
 * exist and are scheduled, and with `upcomingFillTarget` they are booked
 * too. Booked is not attended, and that distinction is what keeps the two
 * products agreeing. */
{
  const asOf = "2026-08-22";
  const asOfDay = dayNumberOf(asOf);
  const attendedDay = (bundle: GeneratedStudioBundle, sessionId: string): number => {
    const session = bundle.dataset.classSessions.find((s) => s.id === sessionId);
    return session === undefined ? Number.NaN : dayNumberOf(dateOfTimestamp(session.startsAt));
  };
  const build = (mode: SyntheticStudioConfig["mode"], fill?: number): GeneratedStudioBundle =>
    generateStudio({
      ...DEFAULT_CONFIG,
      seed: "as-of-boundary",
      asOfDate: asOf,
      memberCount: 120,
      historyDays: 365,
      mode,
      ...(fill === undefined ? {} : { upcomingFillTarget: fill }),
    });

  for (const [label, mode, fill] of [
    ["clean", "clean", undefined],
    ["clean, filled", "clean", 0.7],
    ["scale", "scale", undefined],
  ] as ReadonlyArray<[string, SyntheticStudioConfig["mode"], number | undefined]>) {
    const bundle = build(mode, fill);
    const days = bundle.dataset.attendance
      .map((a) => attendedDay(bundle, a.classSessionId))
      .filter((d) => Number.isFinite(d));

    check(`${label}: there is a history to search`, days.length > 1000, true);
    check(`${label}: nothing is attended on or after the as-of date`,
      days.filter((d) => d >= asOfDay).length, 0);
    /* The tie exists: the newest visit is the day before, so the rule above
     * is standing on the boundary rather than far from it. */
    check(`${label}: and the newest visit is the day before, so the edge is real`,
      asOfDay - Math.max(...days), 1);
    check(`${label}: today's classes still exist`,
      bundle.dataset.classSessions.filter((s) => s.startsAt.slice(0, 10) === asOf).length > 0, true);
  }

  /* Booked is not attended — with the fill knob somebody has a seat in
   * today's class, and still nobody has attended it. */
  const filled = build("clean", 0.7);
  check("with the fill knob, today's classes are booked",
    filled.dataset.bookings.filter((b) => attendedDay(filled, b.classSessionId) === asOfDay).length > 0, true);

  /* Edge-cases breaks the rule deliberately, and must DECLARE it. */
  const edge = build("edge-cases");
  const futureRows = edge.dataset.attendance.filter((a) => attendedDay(edge, a.classSessionId) >= asOfDay);
  check("edge-cases does hold attendance against a later class", futureRows.length > 0, true);
  const declaredIds = new Set(edge.truth.declaredViolations.map((v) => v.entityId));
  check("...and every one of them is declared, not a surprise",
    futureRows.every((a) => declaredIds.has(a.id)), true);
}

/* THE MODULES THAT ARE ALLOWED TO READ THE CLOCK STILL HAVE TO READ IT IN
 * THE STUDIO'S ZONE.
 *
 * The engine may not read the clock at all — that is the audit above. Three
 * shared modules may, and one of them got it wrong: page.ts prefilled the
 * as-of date with `new Date().toISOString().slice(0, 10)`, which is UTC, so
 * somebody in New York opening it after 8pm generated a studio as of a day
 * that had not happened where the studio is. Product D's brief already
 * records the same mistake costing it a misread return.
 *
 * The pattern is deliberately `new Date().toISOString()` with EMPTY parens,
 * not `toISOString` on its own: `new Date(day * 86_400_000).toISOString()`
 * is how a day NUMBER becomes a date and is correct, and appears in
 * generate.ts and normalize.ts. Catching those would be a false alarm that
 * teaches people to ignore this check. */
{
  const CLOCK_READERS = ["../today.ts", "../auth/studio.ts", "./page.ts"];
  const UTC_TODAY = /new Date\(\)\s*\.\s*toISOString\s*\(/;
  /* COMMENTS STRIPPED FIRST, unlike the engine audit above — and the
   * difference is deliberate. The engine may not read the clock even in a
   * comment, because there the words are a proposal somebody will act on.
   * Here the words are a RECORD: page.ts now carries the old broken line
   * quoted in the comment that explains why it changed, and this check
   * failed on that comment the first time it ran. Deleting the explanation
   * to satisfy a grep would trade the reason for the rule. */
  const withoutComments = (text: string): string =>
    text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");
  for (const file of CLOCK_READERS) {
    const source = withoutComments(await (await fetch(file)).text());
    check(`${file} does not take today's date from UTC`, UTC_TODAY.test(source), false);
    /* Non-vacuous: a fetch that quietly returned a 404 page would pass the
     * line above by containing no JavaScript at all. */
    check(`${file} was actually read`, source.length > 200, true);
  }

  /* Fired at the text it exists to catch, and at the legal text nearest it. */
  const planted: ReadonlyArray<[string, string, boolean]> = [
    ["the UTC-today antipattern", "dateEl.value = new Date().toISOString().slice(0, 10);", true],
    ["...with spacing", "const t = new Date() . toISOString ();", true],
    ["a day number becoming a date is legal", "return new Date(day * 86_400_000).toISOString().slice(0, 10);", false],
    ["a parsed date becoming a string is legal", "return new Date(value).toISOString();", false],
    ["reading the clock in a zone is the whole point", 'todayIsoInZone("America/New_York")', false],
    /* And the stripper itself, since the check now leans on it. */
    ["the antipattern quoted inside a block comment",
      "/* this used to be new Date().toISOString().slice(0, 10) */", false],
    ["the antipattern quoted after a line comment",
      "// was: new Date().toISOString()", false],
  ];
  for (const [label, text, want] of planted) {
    check(`the UTC-today grep catches ${label}`, UTC_TODAY.test(withoutComments(text)), want);
  }
}

/* A GREP THAT ONLY EVER PASSES IS INDISTINGUISHABLE FROM A BROKEN ONE, and
 * twelve clean files passing four patterns says nothing about whether the
 * patterns work. Each is fired at the text it exists to catch, and at the
 * legal text nearest to it. */
{
  const find = (label: string): RegExp =>
    FORBIDDEN.find(([l]) => l === label)?.[1] ?? /$^/;
  const planted: ReadonlyArray<[string, string, boolean]> = [
    ["unseeded randomness", "const r = Math.random();", true],
    ["unseeded randomness", "const id = crypto.randomUUID();", true],
    ["unseeded randomness", "const r = stream.chance(0.02);", false],
    ["locale-dependent ordering", "names.sort((a, b) => a.localeCompare(b));", true],
    ["locale-dependent ordering", "const c = new Intl.Collator('en');", true],
    /* The replacement must not read as a violation, or the rule would
     * forbid its own fix. */
    ["locale-dependent ordering", "slots.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));", false],
    /* And a date formatter is not a collator — the engine never formats,
     * but page.ts does, and a rule that cannot tell them apart would
     * spread. */
    ["locale-dependent ordering", "new Intl.DateTimeFormat('en-CA', { timeZone })", false],
    ["a clock read", "const t = Date.now();", true],
    ["a clock read", "const t = new Date();", true],
    ["a clock read", "const t = new Date;", true],
    ["a clock read", "const t = performance.now();", true],
    // The legal one, used twice in normalize.ts: round-tripping a calendar
    // date is arithmetic, not a clock read.
    ["a clock read", "const round = new Date(Date.UTC(y, m - 1, d));", false],
    ["a network call", "await fetch(url);", true],
    ["a network call", "navigator.sendBeacon(url, body);", true],
    ["a network call", "new EventSource(url);", true],
    ["a network call", "const fetched = cache.get(key);", false],
    ["a product import", 'import { x } from "../../products/d-reengagement/logic.js";', true],
    ["a product import", 'import { x } from "./random.js";', false],
  ];
  for (const [label, text, shouldFire] of planted) {
    check(
      `the ${label} grep ${shouldFire ? "catches" : "allows"} ${JSON.stringify(text)}`,
      find(label).test(text),
      shouldFire,
    );
  }
}

/* ------------------------------------------------------------------ */
/* buildSchedule — the timetable everything else is hung on             */
/* ------------------------------------------------------------------ */

/* This module reported 100% until the runner's clock was fixed; it is
 * really 54%, and six of its comparisons could be changed with nothing
 * noticing. They are not obscure: the horizon the schedule covers, how
 * many sessions a day holds, and whether a class happening TODAY counts
 * as finished.
 *
 * Two are left afterwards and are recorded rather than chased. The guard
 * `if (!type || !instructor)` can never fire — both are looked up by
 * modulo, so zero sessions in a whole schedule lack either — which makes
 * it defensive code, not a hole. The other decides whether a class on the
 * as-of date can be marked canceled, and the check below WOULD catch it,
 * but only when the 2% cancellation draw actually fires: five sessions
 * that day gives it about a 10% chance per seed. So it is covered
 * probabilistically, not deterministically, and calling that "caught"
 * would be the same overclaim the runner's clock was making. */
{
  const sch = buildSchedule(BASE);
  const dates = [...sch.sessionsByDate.keys()].sort();

  check("the schedule starts historyDays before the as-of date",
    dates[0], "2026-02-19");
  check("...and runs exactly fourteen days past it",
    dates[dates.length - 1], "2026-09-01");
  check("...covering every day in between with none missing",
    dates.length, BASE.historyDays + 1 + 14);

  const perDay = new Set([...sch.sessionsByDate.values()].map((v) => v.length));
  check("every day holds the same number of sessions", perDay.size, 1);
  check("...and that number is slots times rooms, with nothing extra",
    [...perDay][0], 5 * roomsPerSlot(BASE.memberCount));
  check("a boutique studio of sixty runs one room per slot",
    roomsPerSlot(BASE.memberCount), 1);
  check("...while a big-box gym is capped at six", roomsPerSlot(10_000), 6);

  /* THE AS-OF DATE IS NOT THE PAST. A class today has not happened yet:
   * it is scheduled, not completed, and it cannot already have been
   * canceled as a historical fact. Both comparisons deciding that could
   * be shifted by a day with nothing here to notice. */
  const today = sch.sessionsByDate.get(BASE.asOfDate) ?? [];
  check("the as-of date carries sessions at all", today.length > 0, true);
  check("...and every one of them is scheduled, not completed",
    today.every((c) => c.status === "scheduled"), true);

  const dayOf = (c: { startsAt: string }): string => c.startsAt.slice(0, 10);
  const future = sch.sessions.filter((c) => dayOf(c) > BASE.asOfDate);
  const past = sch.sessions.filter((c) => dayOf(c) < BASE.asOfDate);
  check("nothing in the future is marked completed",
    future.some((c) => c.status === "completed"), false);
  check("...nor canceled, which is a fact only the past can carry",
    future.some((c) => c.status === "canceled"), false);
  check("the past carries both completed and canceled",
    ["completed", "canceled"].every((st) => past.some((c) => c.status === st)), true);
  check("...and cancellation stays the small share it claims to be",
    past.filter((c) => c.status === "canceled").length / past.length < 0.06, true);
}

/* ------------------------------------------------------------------ */
/* demandFactor — the calibrated rhythm, finally measured               */
/* ------------------------------------------------------------------ */

/* CALIBRATION.md says this studio's rhythms are calibrated rather than
 * invented, and demandFactor is where that claim lives: generate.ts asks it
 * whether each member turns up on each day. (This comment said "published
 * real-gym check-in distributions" until 2026-08-22. The source dataset
 * describes itself as synthetic, so the rhythms are borrowed from another
 * model, not observed. What the block below measures is unaffected — it
 * pins the seasonal shape the code actually produces, which is the only
 * thing a check here could ever have proved.) Five of the six survivors in scenarios.ts sat on its one
 * holiday line, because BASE reaches only 180 days back from August and
 * December never falls inside it — so the year-end dip was modelled,
 * shipped, and never once exercised.
 *
 * These use a longer span on purpose. The window means are compared
 * rather than single days, because a single day also carries a weekday
 * weight and a noise draw, and a check that depends on one seed's noise
 * is a check that breaks when somebody changes the seed. */
{
  const seed = BASE.seed;
  const span = (from: string, to: string): number[] => {
    const out: number[] = [];
    for (let d = dayNumberOf(from); d <= dayNumberOf(to); d += 1) {
      out.push(demandFactor(seed, d));
    }
    return out;
  };
  const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

  const hush = [...span("2025-12-20", "2025-12-31"), ...span("2026-01-01", "2026-01-02")];
  const before = span("2025-12-06", "2025-12-19");
  const after = span("2026-01-03", "2026-01-16");

  check("the year-end hush covers the fourteen days it claims to", hush.length, 14);
  check("the studio is quieter over the holidays than the fortnight before",
    mean(hush) < mean(before), true);
  check("...and than the fortnight after",
    mean(hush) < mean(after), true);
  check("...by a visible margin, not a rounding error",
    mean(hush) < 0.75 * ((mean(before) + mean(after)) / 2), true);
  /* THE EDGES OF THE HUSH, WHICH THE MEANS ABOVE CANNOT SEE.
   *
   * Those compare a fourteen-day window against its neighbours, so one
   * boundary day moving in or out barely shifts the average. Mutation
   * found all three edges unheld: `dayOfMonth >= 20` could become `> 20`
   * (dropping the 20th), `<= 2` could become `< 2` (dropping the 2nd), and
   * `month === 12` could become `!==` (hushing every month but December).
   * Each is a day the studio either does or does not expect to be quiet.
   *
   * A single pair of dates cannot settle it: demandFactor carries per-day
   * variation, and two ordinary Fridays a week apart already differ by a
   * fifth. Each day is compared against ITS OWN WEEKDAY in the four weeks
   * either side, skipping other hush days, which cancels both the weekday
   * shape and the season. Measured: hush days land at 0.53, 0.69 and 0.53;
   * the days just outside at 0.88 and 1.08. */
  const againstOwnWeekday = (iso: string): number => {
    const target = dayNumberOf(iso);
    const here = demandFactor(seed, target);
    const peers: number[] = [];
    for (const offset of [-28, -21, -14, -7, 7, 14, 21, 28]) {
      const day = target + offset;
      const date = dateOfDayNumber(day);
      const month = Number(date.slice(5, 7));
      const dayOfMonth = Number(date.slice(8, 10));
      if ((month === 12 && dayOfMonth >= 20) || (month === 1 && dayOfMonth <= 2)) continue;
      peers.push(demandFactor(seed, day));
    }
    return here / (peers.reduce((a, b) => a + b, 0) / peers.length);
  };

  check("the hush starts ON the 20th, not the day after",
    againstOwnWeekday("2025-12-20") < 0.75, true);
  check("...and ends ON the 2nd, not the day before",
    againstOwnWeekday("2026-01-02") < 0.75, true);
  check("...with the middle of it quiet as well",
    againstOwnWeekday("2025-12-31") < 0.75, true);
  /* The other side of each edge, or a rule that hushed the whole year
   * would pass every line above. */
  check("the day before it is an ordinary day",
    againstOwnWeekday("2025-12-19") > 0.8, true);
  check("...and so is the day after",
    againstOwnWeekday("2026-01-03") > 0.8, true);

  check("the fortnights either side of it are themselves alike, so the dip is the hush and not the season",
    Math.abs(mean(before) - mean(after)) < 0.1, true);

  /* The documented range, over a whole year rather than a sample. */
  const year = span("2025-09-01", "2026-08-31");
  check("demand never leaves its documented 0.05..1 range across a full year",
    year.every((f) => f >= 0.05 && f <= 1), true);
  check("...and is not flat, which would make every check above vacuous",
    new Set(year.map((f) => f.toFixed(3))).size > 100, true);

  check("the same seed and day always give the same demand",
    demandFactor(seed, dayNumberOf("2026-03-04")), demandFactor(seed, dayNumberOf("2026-03-04")));
  /* Compared across a year, not on one day, and that is a correction
   * rather than a preference: the first version of this check picked
   * 2026-03-04 and failed, because demandFactor clamps to 1 and both
   * seeds saturate there. 82 days a year sit at that ceiling, so a
   * single-day comparison between seeds is a coin flip on whether it
   * proves anything. */
  const yearFrom = dayNumberOf("2025-09-01");
  const otherYear = year.map((_, i) => demandFactor("another-seed", yearFrom + i));
  check("a different seed gives a different rhythm on most days",
    year.filter((f, i) => f !== otherYear[i]).length > 250, true);
  check("...though not on all of them, because demand is capped at 1 and busy days saturate",
    year.filter((f) => f === 1).length > 0, true);
}

/* ------------------------------------------------------------------ */
/* periodProblems — the membership history checker                      */
/* ------------------------------------------------------------------ */

/* validate.ts runs this over every member, and it decides whether a
 * membership history is coherent — which is upstream of derived status,
 * which is what Product D means by "active member". It had no direct
 * checks: it was only ever reached through generated data, which is
 * coherent by construction, so every branch that reports a PROBLEM went
 * unexercised. Mutation found the boundary — a period ending the same day
 * it starts could stop being reported with nothing noticing. */
{
  const period = (
    id: string,
    startsOn: string,
    endsOn: string | null,
  ): MembershipPeriod => ({
    id,
    memberId: "member:000001",
    state: "active",
    startsOn,
    endsOn,
    planName: "monthly",
  });
  const joined = "2026-01-01";
  const problemsFor = (ps: MembershipPeriod[]): string[] => periodProblems(ps, joined);

  check("one open period starting the day they joined is coherent",
    problemsFor([period("membership:000001", joined, null)]).length, 0);
  check("a closed period followed by an open one is coherent",
    problemsFor([
      period("membership:000001", joined, "2026-03-01"),
      period("membership:000002", "2026-03-01", null),
    ]).length, 0);

  check("no periods at all is reported",
    problemsFor([]).join("|"), "no membership periods");
  check("a period ending the SAME day it starts is reported, by id",
    problemsFor([period("membership:000001", joined, joined), period("membership:000002", joined, null)])
      .some((x) => x === "period membership:000001 ends on or before its start"), true);
  check("...and so is one ending before it starts",
    problemsFor([period("membership:000001", "2026-06-01", "2026-02-01"), period("membership:000002", "2026-06-01", null)])
      .some((x) => x.endsWith("ends on or before its start")), true);
  check("a history that does not start when the member joined is reported",
    problemsFor([period("membership:000001", "2026-05-05", null)])
      .some((x) => x.includes("history starts 2026-05-05, member joined 2026-01-01")), true);
  check("a gap between two periods is reported with both ids",
    problemsFor([
      period("membership:000001", joined, "2026-03-01"),
      period("membership:000002", "2026-04-01", null),
    ]).some((x) => x === "gap or overlap between membership:000001 and membership:000002"), true);
  check("an open period that is not last is reported",
    problemsFor([
      period("membership:000001", joined, null),
      period("membership:000002", "2026-03-01", null),
    ]).some((x) => x.includes("is open but not last")), true);
  check("a history with no open period at all is reported",
    problemsFor([period("membership:000001", joined, "2026-03-01")])
      .some((x) => x === "expected exactly 1 open period, found 0"), true);
}

/* ------------------------------------------------------------------ */
/* The two gatekeepers every timestamp passes through                   */
/* ------------------------------------------------------------------ */

/* isStrictTimestamp decides whether a session's start time is usable at
 * all — the CSV export drops any row that fails it. Neither it nor
 * isStrictDate had a single check. Mutation found the shape of the hole:
 * the three time-component bounds could each be loosened to <= with
 * nothing noticing, which accepts hour 24, minute 60 and second 60 as
 * real times. */
{
  check("a real time passes", isStrictTimestamp("2026-08-21T12:30:00"), true);
  check("midnight passes", isStrictTimestamp("2026-08-21T00:00:00"), true);
  check("the last second of the day passes", isStrictTimestamp("2026-08-21T23:59:59"), true);
  check("hour 24 is not a time", isStrictTimestamp("2026-08-21T24:00:00"), false);
  check("minute 60 is not a time", isStrictTimestamp("2026-08-21T12:60:00"), false);
  check("second 60 is not a time, leap seconds included",
    isStrictTimestamp("2026-08-21T12:59:60"), false);
  check("a timestamp on an impossible date is refused",
    isStrictTimestamp("2026-02-30T12:00:00"), false);
  check("a date alone is not a timestamp", isStrictTimestamp("2026-08-21"), false);
  check("an offset is not this format, which is studio-local by contract",
    isStrictTimestamp("2026-08-21T12:00:00-04:00"), false);
  check("a single-digit hour is refused rather than guessed at",
    isStrictTimestamp("2026-08-21T9:00:00"), false);

  check("a real date passes", isStrictDate("2026-08-21"), true);
  check("the 30th of February is not a date, whatever the regex says",
    isStrictDate("2026-02-30"), false);
  check("the 29th of February is not a date in a common year",
    isStrictDate("2026-02-29"), false);
  check("...but it is in a leap year", isStrictDate("2024-02-29"), true);
  check("...and not in 1900, which the four-year rule alone would allow",
    isStrictDate("1900-02-29"), false);
  check("...while 2000 is a leap year, which the hundred-year rule alone would deny",
    isStrictDate("2000-02-29"), true);
  check("month 13 is not a month", isStrictDate("2026-13-01"), false);
  check("day 0 is not a day", isStrictDate("2026-08-00"), false);
  check("a two-digit year is refused rather than guessed at", isStrictDate("26-08-21"), false);
}

/* ------------------------------------------------------------------ */
/* The seeded stream — everything above rests on it, and nothing        */
/* checked it directly until 2026-08-21.                                */
/* ------------------------------------------------------------------ */

/* Every promise this engine makes reduces to one claim: the same seed
 * gives the same sequence. random.ts was only ever exercised THROUGH
 * generateStudio, which proves the whole pipeline agrees with itself but
 * says nothing about which part is responsible. Mutation found the gap:
 * changing `if (hi < lo) throw` to `<=` makes int(5, 5) throw instead of
 * returning 5 — and picking from a one-element list is an ordinary call,
 * `int(0, items.length - 1)`. Nothing noticed. */
{
  const a = makeStream("proof-seed-0001", "attendance");
  const b = makeStream("proof-seed-0001", "attendance");
  const other = makeStream("proof-seed-0001", "names");
  const otherSeed = makeStream("proof-seed-0002", "attendance");

  const take = (s: { next(): number }, n: number): number[] =>
    Array.from({ length: n }, () => s.next());

  const first = take(a, 20);
  check("the same seed and stream give the same sequence",
    JSON.stringify(first), JSON.stringify(take(b, 20)));
  check("a different stream name gives a different sequence",
    JSON.stringify(first) === JSON.stringify(take(other, 20)), false);
  check("a different seed gives a different sequence",
    JSON.stringify(first) === JSON.stringify(take(otherSeed, 20)), false);
  check("every draw sits in [0, 1)",
    first.every((n) => n >= 0 && n < 1), true);

  const ints = makeStream("proof-seed-0001", "ints");
  check("a single-value range returns that value rather than throwing",
    ints.int(5, 5), 5);
  check("...including zero, which is what int(0, list.length - 1) gives a one-item list",
    ints.int(0, 0), 0);
  let reversedRefused = false;
  try {
    ints.int(9, 2);
  } catch {
    reversedRefused = true;
  }
  check("a reversed range is refused, because an empty range has no answer",
    reversedRefused, true);
  check("every int lands inside the range asked for",
    Array.from({ length: 500 }, () => ints.int(3, 7)).every((n) => n >= 3 && n <= 7), true);

  const odds = makeStream("proof-seed-0001", "odds");
  check("a probability of 0 never fires",
    Array.from({ length: 2000 }, () => odds.chance(0)).some(Boolean), false);
  check("a probability of 1 always fires",
    Array.from({ length: 2000 }, () => odds.chance(1)).every(Boolean), true);
}

/* ------------------------------------------------------------------ */
/* The upcoming-occupancy fill knob (upcomingFillTarget) — added for the */
/* capacity dashboard: a week of classes should be able to present       */
/* realistic mixed occupancy, deterministically, without touching any    */
/* other consumer's output.                                              */
/* ------------------------------------------------------------------ */

{
  const offA = generateStudio(BASE);
  const offB = generateStudio({ ...BASE });
  check("fill knob unset: two runs stay byte-identical (the default path is untouched)",
    JSON.stringify(offA.dataset) === JSON.stringify(offB.dataset), true);

  const onA = generateStudio({ ...BASE, upcomingFillTarget: 0.85 });
  const onB = generateStudio({ ...BASE, upcomingFillTarget: 0.85 });
  check("fill is deterministic: same seed and target, same studio",
    JSON.stringify(onA.dataset) === JSON.stringify(onB.dataset), true);

  const upcomingOf = (bundle: GeneratedStudioBundle) =>
    bundle.dataset.classSessions.filter(
      (s) => s.status === "scheduled" && s.startsAt.slice(0, 10) >= BASE.asOfDate,
    );
  const bookedCount = (bundle: GeneratedStudioBundle, sessionId: string) =>
    bundle.dataset.bookings.filter(
      (b) => b.classSessionId === sessionId && b.status === "booked",
    ).length;

  const offSeats = upcomingOf(offA).reduce((n, s) => n + bookedCount(offA, s.id), 0);
  const onSeats = upcomingOf(onA).reduce((n, s) => n + bookedCount(onA, s.id), 0);
  check("the fill actually fills: strictly more upcoming seats than the organic run",
    onSeats > offSeats, true);

  const occupancies = upcomingOf(onA).map((s) => bookedCount(onA, s.id) / s.capacity);
  check("no session ever exceeds capacity", occupancies.every((o) => o <= 1), true);
  const mean = occupancies.reduce((a, b) => a + b, 0) / Math.max(1, occupancies.length);
  check("a 0.85 target lands a busy week (mean occupancy at least 55%)", mean >= 0.55, true);
  check("the band varies: not every session is equally full",
    new Set(occupancies.map((o) => Math.round(o * 20))).size > 1, true);

  const pairs = onA.dataset.bookings
    .filter((b) => b.status === "booked")
    .map((b) => `${b.memberId}|${b.classSessionId}`);
  check("a member holds at most one seat per session, fill included",
    new Set(pairs).size === pairs.length, true);

  check("the validator blesses a filled studio",
    validateBundle(onA).ok, true);

  /* THE BAND ITSELF, WHICH THE BRIEF STATES AND NOTHING CHECKED.
   *
   * app/shared/CLAUDE.md documents this knob as filling to roughly
   * target−25%..target+15% with per-session variance. The checks above
   * prove the fill is deterministic, that it fills MORE than organic, and
   * that nobody gets two seats — none of them look at the band. Mutation
   * found the consequence: the `+ 15` that sets the top of the range can
   * become `- 15`, collapsing it, with every check still green.
   *
   * The slack is for rounding, not for doubt: seats are integers, so on a
   * twelve-person class one seat is eight percentage points, and the
   * measured spread runs a little outside the nominal band at both ends.
   * The two "reaches" checks are what actually pin the shape — a
   * collapsed band cannot put a session above its target. */
  const occupancyOf = (bundle: GeneratedStudioBundle): number[] => {
    const asOf = dayNumberOf(BASE.asOfDate);
    const booked = new Map<string, number>();
    for (const b of bundle.dataset.bookings) {
      if (b.status !== "booked") continue;
      booked.set(b.classSessionId, (booked.get(b.classSessionId) ?? 0) + 1);
    }
    return bundle.dataset.classSessions
      .filter((c) => c.status === "scheduled" && dayNumberOf(dateOfTimestamp(c.startsAt)) >= asOf)
      .map((c) => ((booked.get(c.id) ?? 0) / c.capacity) * 100);
  };
  const SLACK = 10;
  for (const target of [85, 50]) {
    const occ = occupancyOf(generateStudio({ ...BASE, upcomingFillTarget: target / 100 }));
    check(`filling to ${target}% leaves upcoming sessions to measure`, occ.length > 0, true);
    check(`...none of them below the band's floor`,
      occ.every((o) => o >= target - 25 - SLACK), true);
    check(`...none above its ceiling`,
      occ.every((o) => o <= target + 15 + SLACK), true);
    check(`...and the band's upper half is actually used`,
      occ.some((o) => o > target), true);
    check(`...as is its lower half, so this is a spread and not one number`,
      occ.some((o) => o < target), true);
  }

  check("validateConfig rejects a fill target above 1",
    validateConfig({ ...BASE, upcomingFillTarget: 1.5 }).length > 0, true);
  check("validateConfig accepts a fill target inside 0..1",
    validateConfig({ ...BASE, upcomingFillTarget: 0.7 }).length, 0);
}

/* ------------------------------------------------------------------ */
/* validateConfig — the engine's front door                             */
/* ------------------------------------------------------------------ */

/* Every bound this function enforces is documented in the contract, and
 * only one of them had a check. Mutation put the score at 58%, the lowest
 * of any module swept: ten of its comparisons could be loosened with
 * nothing noticing, because a validator reached only with valid input
 * never runs the half that says no. These walk each limit from both
 * sides. */
{
  const ok = (c: Partial<SyntheticStudioConfig>): number =>
    validateConfig({ ...BASE, ...c } as SyntheticStudioConfig).length;
  const says = (c: Partial<SyntheticStudioConfig>): string =>
    validateConfig({ ...BASE, ...c } as SyntheticStudioConfig).join(" | ");

  check("the base configuration itself is valid, or none of this means anything",
    ok({}), 0);

  check("an empty seed is refused", says({ seed: "" }).includes("seed must be non-empty"), true);
  check("...and so is a seed of only spaces",
    says({ seed: "   " }).includes("seed must be non-empty"), true);
  check("an empty timezone is refused",
    says({ timezone: "" }).includes("timezone must be non-empty"), true);
  check("an impossible asOfDate is refused by the calendar, not the regex",
    says({ asOfDate: "2026-02-30" }).includes("real calendar date"), true);

  check("memberCount 1 is allowed", ok({ memberCount: 1 }), 0);
  check("memberCount 2000 is allowed", ok({ memberCount: 2000 }), 0);
  check("memberCount 0 is refused", says({ memberCount: 0 }).includes("memberCount"), true);
  check("memberCount 2001 is refused", says({ memberCount: 2001 }).includes("memberCount"), true);
  check("a fractional memberCount is refused",
    says({ memberCount: 60.5 }).includes("memberCount"), true);

  check("historyDays 90 is allowed", ok({ historyDays: 90 }), 0);
  check("historyDays 1900 is allowed", ok({ historyDays: 1900 }), 0);
  check("historyDays 89 is refused", says({ historyDays: 89 }).includes("historyDays"), true);
  check("historyDays 1901 is refused", says({ historyDays: 1901 }).includes("historyDays"), true);

  check("an unset facilityCapacity is fine", ok({ facilityCapacity: undefined }), 0);
  check("facilityCapacity 16 is allowed", ok({ facilityCapacity: 16 }), 0);
  check("facilityCapacity 500 is allowed", ok({ facilityCapacity: 500 }), 0);
  check("facilityCapacity 15 is refused",
    says({ facilityCapacity: 15 }).includes("facilityCapacity"), true);
  check("facilityCapacity 501 is refused, because the building has a ceiling",
    says({ facilityCapacity: 501 }).includes("facilityCapacity"), true);

  check("a fill target of exactly 0 is allowed", ok({ upcomingFillTarget: 0 }), 0);
  check("...and exactly 1", ok({ upcomingFillTarget: 1 }), 0);
  check("a fill target below 0 is refused",
    says({ upcomingFillTarget: -0.01 }).includes("upcomingFillTarget"), true);
  check("NaN is not a fill target, though it is a number",
    says({ upcomingFillTarget: Number.NaN }).includes("upcomingFillTarget"), true);
  check("neither is Infinity",
    says({ upcomingFillTarget: Number.POSITIVE_INFINITY }).includes("upcomingFillTarget"), true);
  check("a fill target given as a string is refused rather than coerced",
    says({ upcomingFillTarget: "0.5" as unknown as number }).includes("upcomingFillTarget"), true);

  check("every documented mode is accepted",
    (["clean", "edge-cases", "scale"] as const).every((mode) => ok({ mode }) === 0), true);
  check("an undocumented mode is refused, naming what it got",
    says({ mode: "chaos" as unknown as SyntheticStudioConfig["mode"] }).includes('got "chaos"'), true);

  check("several bad values are all reported, not just the first",
    validateConfig({ ...BASE, seed: "", memberCount: 0, historyDays: 5 } as SyntheticStudioConfig).length, 3);
}

/* ------------------------------------------------------------------ */
/* Injected defects need an id no real record has — and six digits      */
/* ------------------------------------------------------------------ */

/* An id is `kind:NNNNNN` and ID_PATTERN wants EXACTLY six digits. The
 * injector used to mint its phantom ids by adding 900001 to the collection
 * length, which is fine for a studio of sixty and wrong for a large one:
 * past 99,998 rows the sum needs a seventh digit. At the largest settings
 * the shipped form offers — 2000 members, five years, edge-cases —
 * attendance reaches about 168,000 rows and thirty ids came out malformed,
 * so the report read as a data defect when the fault was in the id.
 *
 * That full-scale run takes thirteen seconds, which is most of this
 * suite's budget for one case, so it is not run here. What IS run is the
 * property that distinguishes the two schemes at any size: phantom ids are
 * now minted DOWNWARD from the top of the six-digit space, so they sit at
 * 999999 and below rather than a little past the collection length. At
 * sixty members that is 999982..999999 where the old scheme gave ~900776.
 */
{
  const bundle = generateStudio({
    ...DEFAULT_CONFIG,
    seed: "phantom-ids",
    asOfDate: "2026-08-22",
    memberCount: 60,
    historyDays: 180,
    mode: "edge-cases",
  });
  const d = bundle.dataset;

  const everyId = [
    ...d.attendance.map((r) => r.id),
    ...d.bookings.map((r) => r.id),
    ...d.classSessions.map((r) => r.id),
  ];
  check("every id an edge-cases run mints is still a six-digit id",
    everyId.every((id) => ID_PATTERN.test(id)), true);

  /* The phantoms are the ids above the real range, which runs 1..length. */
  const numberOf = (id: string): number => Number(id.split(":")[1]);
  const phantomAttendance = d.attendance
    .map((r) => numberOf(r.id))
    .filter((n) => n > d.attendance.length);
  /* Non-vacuous: edge-cases mode must actually have injected something,
   * or every line below would pass by having nothing to look at. */
  check("edge-cases mode injected rows with phantom ids",
    phantomAttendance.length > 0, true);
  check("...and every one is minted downward from the top of the range",
    phantomAttendance.every((n) => n >= 999_000 && n <= 999_999), true);
  check("...so none of them collides with a real row",
    phantomAttendance.every((n) => n > d.attendance.length), true);
  check("...and each phantom is used once",
    new Set(phantomAttendance).size, phantomAttendance.length);

  /* The guard underneath it all: makeId refuses a seventh digit outright
   * rather than emitting an id the validator would later call malformed. */
  let refused = "";
  try {
    makeId("attendance", 1_000_000);
  } catch (error) {
    refused = error instanceof Error ? error.message : String(error);
  }
  check("a seventh digit is refused at the source", refused.includes("six digits"), true);
  check("...and the last six-digit id is still allowed",
    makeId("attendance", 999_999), "attendance:999999");

  const report = validateBundle(bundle);
  check("an edge-cases bundle validates clean, ids included", report.ok, true);
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
