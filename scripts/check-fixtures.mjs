#!/usr/bin/env node
/* Pulse Studio — the shared fixture gate. TEAM-OWNED.
 *
 * WHY THIS EXISTS: app/shared/fixtures.json is the studio's shared records,
 * and app/shared/data.ts hands them to a product with a bare cast —
 * `(await res.json()) as FixtureSet`. TypeScript erases at runtime, so that
 * cast checks nothing. The staff dashboard loads this file live, and until
 * this gate landed a dangling member_id or a misspelled status shipped
 * green: 340 checks across three suites and not one of them opened the
 * file. The data law names this file the vocabulary every product speaks;
 * it deserved at least as much enforcement as the stylesheets.
 *
 * THE ENUMS COME FROM contract.ts, NOT FROM HERE. Restating the legal
 * status values in this file would create a second source of truth that
 * drifts the first time somebody adds one. They are read out of
 * app/shared/contract.ts at run time, and a union this script cannot find
 * is a FAILURE, never a skip — the lesson check-styles.mjs paid for when a
 * renamed stylesheet made it print "0 checked ... PASS".
 *
 * HONEST LIMITS, stated because a checker that oversells itself is worse
 * than none:
 *   - It checks SHAPE, REFERENCES and CALENDAR VALIDITY. It does not know
 *     whether the records describe a plausible studio: a class with one
 *     booking and a class with none look identical to it.
 *   - It reads the four status unions from contract.ts by pattern. It does
 *     not parse TypeScript, so a union written across several lines or
 *     built from another type would not be found — and it fails loudly
 *     rather than passing quietly if that happens.
 *   - Timezone is checked for presence and for being a zone this runtime
 *     recognises, not for being the RIGHT zone for the studio.
 *   - It says nothing about whether the fixture exercises any product's
 *     rules. Those belong in that product's own suite.
 *
 * Run: node scripts/check-fixtures.mjs   (also runs inside `npm run check`)
 * Prove it still works: node scripts/check-fixtures.mjs --self-test
 */

import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const IS_COMMAND =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACT = "app/shared/contract.ts";
const FIXTURES = "app/shared/fixtures.json";

/* The union names this gate needs out of contract.ts. Each one must be
 * found; a missing name means the contract was renamed and this gate is
 * checking against a vocabulary that no longer exists. */
const REQUIRED_UNIONS = [
  "MembershipStatus",
  "SessionStatus",
  "ReservationStatus",
  "AttendanceStatus",
];

/** Pull `export type Name = "a" | "b";` out of contract.ts. */
export function readUnions(source) {
  const unions = {};
  for (const name of REQUIRED_UNIONS) {
    const match = source.match(new RegExp(`export type ${name}\\s*=([^;]+);`));
    if (match === null) continue;
    const values = [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    if (values.length > 0) unions[name] = values;
  }
  return unions;
}

/** A real calendar date, optionally with a time and offset. Date.UTC rolls
 *  impossible dates over in silence, so the parts are round-tripped — the
 *  same rule Product D's engine had to learn about "2026-02-30". */
export function isRealTimestamp(value) {
  if (typeof value !== "string") return false;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(Z|[+-]\d{2}:\d{2})?)?$/);
  if (m === null) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const round = new Date(Date.UTC(y, mo - 1, d));
  if (round.getUTCFullYear() !== y || round.getUTCMonth() !== mo - 1 || round.getUTCDate() !== d) {
    return false;
  }
  if (m[4] !== undefined) {
    if (Number(m[4]) > 23 || Number(m[5]) > 59 || Number(m[6]) > 59) return false;
  }
  return true;
}

export function isDateOnly(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && isRealTimestamp(value);
}

/* Every collection, its id field, and the fields that must be present with
 * the right primitive type. `enum:` names a union read from contract.ts;
 * `ref:` names another collection whose id must already exist. */
const SHAPE = {
  members: {
    id: "member_id",
    fields: { member_id: "string", display_name: "string", membership_status: "enum:MembershipStatus" },
  },
  memberships: {
    id: "membership_id",
    fields: {
      membership_id: "string", member_id: "ref:members", plan_name: "string",
      status: "enum:MembershipStatus", started_on: "date",
      renews_on: "date|null", canceled_on: "date|null",
    },
  },
  instructors: {
    id: "instructor_id",
    fields: { instructor_id: "string", display_name: "string" },
  },
  class_sessions: {
    id: "session_id",
    fields: {
      session_id: "string", class_type: "string", level: "string",
      instructor_id: "ref:instructors", starts_at: "timestamp", ends_at: "timestamp",
      capacity: "number", session_status: "enum:SessionStatus",
    },
  },
  reservations: {
    id: "reservation_id",
    fields: {
      reservation_id: "string", member_id: "ref:members", session_id: "ref:class_sessions",
      reservation_status: "enum:ReservationStatus", reserved_at: "timestamp",
      canceled_at: "timestamp|null",
    },
  },
  attendance: {
    id: "attendance_id",
    fields: {
      attendance_id: "string", member_id: "ref:members", session_id: "ref:class_sessions",
      attendance_status: "enum:AttendanceStatus", recorded_at: "timestamp",
    },
  },
  studio_policies: {
    id: "policy_id",
    fields: {
      policy_id: "string", topic: "string", answer: "string",
      effective_from: "date", updated_at: "timestamp", is_current: "boolean",
    },
  },
};

/* HOW LONG THIS FIXTURE STAYS USEFUL, which is a different question from
 * whether it is valid.
 *
 * The dates in fixtures.json are fixed and the real calendar is not, so the
 * records age out from under whoever reads them. Product D's brief requires
 * this fixture to contain a deliberate near-miss — a member who attended
 * RECENTLY and must therefore NOT be flagged — and that member stops being
 * recent on a specific morning with nothing to announce it. Measured when
 * this landed: the near-miss held until 2026-08-31, and by mid-October the
 * newest attendance was old enough that no product could show a recent
 * anything.
 *
 * Nothing was watching that. The unit suites are pinned to a reference date
 * so they cannot rot — correct, and it means they cannot warn either. This
 * is the one place that reads the real clock on purpose. */
export function attendanceFreshness(data) {
  const sessionDate = new Map(
    (Array.isArray(data.class_sessions) ? data.class_sessions : [])
      .map((s) => [s?.session_id, String(s?.starts_at ?? "").slice(0, 10)]),
  );
  let newest = null;
  for (const a of Array.isArray(data.attendance) ? data.attendance : []) {
    if (a?.attendance_status !== "attended") continue;
    const date = sessionDate.get(a.session_id);
    if (date === undefined || !isDateOnly(date)) continue;
    if (newest === null || date > newest) newest = date;
  }
  if (newest === null) return { newest: null, daysOld: null };
  const day = (iso) => Date.UTC(...iso.split("-").map((n, i) => (i === 1 ? Number(n) - 1 : Number(n)))) / 86_400_000;
  const today = Math.floor(Date.now() / 86_400_000);
  return { newest, daysOld: today - day(newest) };
}

/* A recent attendee stops being recent after this many days. Product D's
 * proposed rule flags at 14, so the fixture has to hold a visit newer than
 * that for its near-miss to mean anything; the ceiling here is deliberately
 * looser, because this gate should announce a real problem rather than
 * bicker about one product's threshold. */
const FRESH_ENOUGH_DAYS = 14;

/** Every problem in one pass. Returns [] for a clean fixture. */
export function validateFixtures(data, unions) {
  const problems = [];
  const say = (code, detail) => problems.push({ code, detail });

  if (typeof data !== "object" || data === null) {
    say("not-an-object", "the fixture file is not a JSON object");
    return problems;
  }

  /* The envelope. contract.ts declares timezone and note on FixtureSet, and
   * the shared rules require the timezone be stated EXPLICITLY — every
   * product's day arithmetic depends on it. */
  if (typeof data.timezone !== "string" || data.timezone === "") {
    say("missing-timezone", "timezone is required: every product's day boundaries are computed in it");
  } else {
    try {
      new Intl.DateTimeFormat("en-CA", { timeZone: data.timezone });
    } catch {
      say("unknown-timezone", `this runtime does not recognise the zone "${data.timezone}"`);
    }
  }
  if (typeof data.note !== "string" || data.note === "") {
    say("missing-note", "note is required: it is where the fixture says the people in it are fictional");
  }

  const idSets = {};
  for (const [name, spec] of Object.entries(SHAPE)) {
    const rows = data[name];
    if (!Array.isArray(rows)) {
      say("missing-collection", `${name} is missing or is not an array`);
      idSets[name] = new Set();
      continue;
    }
    idSets[name] = new Set(rows.map((r) => (r === null ? undefined : r?.[spec.id])).filter((v) => typeof v === "string"));
  }

  for (const [name, spec] of Object.entries(SHAPE)) {
    const rows = data[name];
    if (!Array.isArray(rows)) continue;
    const seen = new Set();
    rows.forEach((row, index) => {
      const where = `${name}[${index}]`;
      if (typeof row !== "object" || row === null) {
        say("bad-row", `${where} is not an object`);
        return;
      }
      const id = row[spec.id];
      if (typeof id === "string" && id !== "") {
        if (seen.has(id)) say("duplicate-id", `${where} repeats ${spec.id} "${id}" — every record needs a STABLE, unique id`);
        seen.add(id);
      }
      for (const [field, kind] of Object.entries(spec.fields)) {
        const value = row[field];
        const nullable = kind.endsWith("|null");
        const base = nullable ? kind.slice(0, -5) : kind;
        if (nullable && value === null) continue;
        if (value === undefined) {
          say("missing-field", `${where} has no ${field}`);
          continue;
        }
        if (base === "string" || base === "number" || base === "boolean") {
          if (typeof value !== base) say("wrong-type", `${where}.${field} should be a ${base}, is ${typeof value}`);
        } else if (base === "date") {
          if (!isDateOnly(value)) say("bad-date", `${where}.${field} is not a real calendar date: ${JSON.stringify(value)}`);
        } else if (base === "timestamp") {
          if (!isRealTimestamp(value)) say("bad-timestamp", `${where}.${field} is not a real timestamp: ${JSON.stringify(value)}`);
        } else if (base.startsWith("enum:")) {
          const legal = unions[base.slice(5)] ?? [];
          if (!legal.includes(value)) {
            say("illegal-enum", `${where}.${field} is ${JSON.stringify(value)}; contract.ts allows ${legal.map((v) => `"${v}"`).join(", ")}`);
          }
        } else if (base.startsWith("ref:")) {
          const target = base.slice(4);
          if (typeof value !== "string") {
            say("wrong-type", `${where}.${field} should be a string id, is ${typeof value}`);
          } else if (!idSets[target].has(value)) {
            say("dangling-reference", `${where}.${field} points at "${value}", which is not in ${target}`);
          }
        }
      }
    });
  }

  /* Rules the field types cannot carry. Each one is a promise the document
   * makes that a reader would otherwise write code against. */
  for (const [i, m] of (Array.isArray(data.memberships) ? data.memberships : []).entries()) {
    if (typeof m !== "object" || m === null) continue;
    if (m.status === "active" && m.renews_on === null) {
      say("active-without-renewal", `memberships[${i}] is active but has no renews_on; the contract says null means NOT active`);
    }
    if (m.status !== "active" && typeof m.renews_on === "string") {
      say("inactive-with-renewal", `memberships[${i}] is "${m.status}" but carries a renews_on date`);
    }
    if (m.status === "canceled" && m.canceled_on === null) {
      say("canceled-without-date", `memberships[${i}] is canceled but has no canceled_on`);
    }
  }
  for (const [i, r] of (Array.isArray(data.reservations) ? data.reservations : []).entries()) {
    if (typeof r !== "object" || r === null) continue;
    if (r.reservation_status === "canceled" && r.canceled_at === null) {
      say("canceled-without-time", `reservations[${i}] is canceled but has no canceled_at — Product D dates a cancellation by it`);
    }
    if (r.reservation_status !== "canceled" && typeof r.canceled_at === "string") {
      say("uncanceled-with-time", `reservations[${i}] is "${r.reservation_status}" but carries a canceled_at`);
    }
  }
  for (const [i, s] of (Array.isArray(data.class_sessions) ? data.class_sessions : []).entries()) {
    if (typeof s !== "object" || s === null) continue;
    if (isRealTimestamp(s.starts_at) && isRealTimestamp(s.ends_at) && s.ends_at < s.starts_at) {
      say("ends-before-starts", `class_sessions[${i}] ends before it starts`);
    }
    if (typeof s.capacity === "number" && s.capacity <= 0) {
      say("impossible-capacity", `class_sessions[${i}] has capacity ${s.capacity}`);
    }
  }
  /* A member cannot be in one session twice, and attendance cannot record
   * one person twice for one class — the second row would double every
   * count computed from it. */
  const attendanceSeen = new Set();
  for (const [i, a] of (Array.isArray(data.attendance) ? data.attendance : []).entries()) {
    if (typeof a !== "object" || a === null) continue;
    const key = `${a.member_id}|${a.session_id}`;
    if (attendanceSeen.has(key)) {
      say("double-attendance", `attendance[${i}] records ${a.member_id} for ${a.session_id} a second time`);
    }
    attendanceSeen.add(key);
  }

  return problems;
}

/* ---------- the self-test ---------- */

function clean() {
  return {
    timezone: "America/New_York",
    note: "Every person here is fictional.",
    members: [{ member_id: "m1", display_name: "A Person", membership_status: "active" }],
    memberships: [{ membership_id: "ms1", member_id: "m1", plan_name: "Monthly", status: "active", started_on: "2026-01-01", renews_on: "2026-09-01", canceled_on: null }],
    instructors: [{ instructor_id: "i1", display_name: "An Instructor" }],
    class_sessions: [{ session_id: "s1", class_type: "yoga", level: "all levels", instructor_id: "i1", starts_at: "2026-08-01T09:00:00-04:00", ends_at: "2026-08-01T10:00:00-04:00", capacity: 12, session_status: "completed" }],
    reservations: [{ reservation_id: "r1", member_id: "m1", session_id: "s1", reservation_status: "reserved", reserved_at: "2026-07-31T09:00:00-04:00", canceled_at: null }],
    attendance: [{ attendance_id: "a1", member_id: "m1", session_id: "s1", attendance_status: "attended", recorded_at: "2026-08-01T10:05:00-04:00" }],
    studio_policies: [{ policy_id: "p1", topic: "cancellation", answer: "Cancel 12 hours ahead.", effective_from: "2026-01-01", updated_at: "2026-01-01T00:00:00-05:00", is_current: true }],
  };
}

function selfTest() {
  let failedFreshness = 0;
  const unions = readUnions(readFileSync(join(ROOT, CONTRACT), "utf8"));
  const bend = (fn) => { const d = clean(); fn(d); return d; };
  const planted = [
    ["a clean fixture passes", clean(), null],
    ["a dangling member reference is caught", bend((d) => { d.reservations[0].member_id = "ghost"; }), "dangling-reference"],
    ["a dangling session reference is caught", bend((d) => { d.attendance[0].session_id = "ghost"; }), "dangling-reference"],
    ["an illegal status is caught", bend((d) => { d.members[0].membership_status = "lapsed"; }), "illegal-enum"],
    ["an impossible date is caught", bend((d) => { d.memberships[0].started_on = "2026-02-30"; }), "bad-date"],
    ["a repeated id is caught", bend((d) => { d.members.push({ ...d.members[0] }); }), "duplicate-id"],
    ["a missing field is caught", bend((d) => { delete d.members[0].display_name; }), "missing-field"],
    ["a missing timezone is caught", bend((d) => { delete d.timezone; }), "missing-timezone"],
    ["an unknown timezone is caught", bend((d) => { d.timezone = "Mars/Olympus"; }), "unknown-timezone"],
    ["a missing collection is caught", bend((d) => { delete d.attendance; }), "missing-collection"],
    ["an active membership with no renewal is caught", bend((d) => { d.memberships[0].renews_on = null; }), "active-without-renewal"],
    ["a paused membership still carrying a renewal is caught", bend((d) => { d.memberships[0].status = "paused"; }), "inactive-with-renewal"],
    ["a canceled booking with no cancel time is caught", bend((d) => { d.reservations[0].reservation_status = "canceled"; }), "canceled-without-time"],
    ["a class ending before it starts is caught", bend((d) => { d.class_sessions[0].ends_at = "2026-08-01T08:00:00-04:00"; }), "ends-before-starts"],
    ["one person recorded twice for one class is caught", bend((d) => { d.attendance.push({ ...d.attendance[0], attendance_id: "a2" }); }), "double-attendance"],
    ["a capacity of zero is caught", bend((d) => { d.class_sessions[0].capacity = 0; }), "impossible-capacity"],
  ];

  /* THE FRESHNESS TRIPWIRE, both sides. It reads the real clock on purpose,
   * so the planted fixtures are dated relative to today rather than pinned —
   * a fixed date here would be the very rot this measures. */
  const isoDaysAgo = (n) =>
    new Date((Math.floor(Date.now() / 86_400_000) - n) * 86_400_000).toISOString().slice(0, 10);
  const withVisitDaysAgo = (n) => {
    const d = clean();
    d.class_sessions[0].starts_at = `${isoDaysAgo(n)}T09:00:00-04:00`;
    d.class_sessions[0].ends_at = `${isoDaysAgo(n)}T10:00:00-04:00`;
    return d;
  };
  const freshCases = [
    ["a visit today is fresh", withVisitDaysAgo(0), 0, false],
    ["a visit at the limit is still fresh", withVisitDaysAgo(FRESH_ENOUGH_DAYS), FRESH_ENOUGH_DAYS, false],
    ["one day past the limit is stale", withVisitDaysAgo(FRESH_ENOUGH_DAYS + 1), FRESH_ENOUGH_DAYS + 1, true],
    ["a year old is stale", withVisitDaysAgo(365), 365, true],
  ];
  for (const [label, data, wantDays, wantStale] of freshCases) {
    const f = attendanceFreshness(data);
    const stale = f.daysOld !== null && f.daysOld > FRESH_ENOUGH_DAYS;
    if (f.daysOld !== wantDays || stale !== wantStale) {
      failedFreshness += 1;
      console.error(`  self-test MISS — ${label}: wanted ${wantDays} days / stale=${wantStale}, got ${f.daysOld} / ${stale}`);
    }
  }
  {
    const none = clean();
    none.attendance = [];
    const f = attendanceFreshness(none);
    if (f.newest !== null || f.daysOld !== null) {
      failedFreshness += 1;
      console.error("  self-test MISS — a fixture with no attendance should report null, not a date");
    }
  }
  {
    // A no_show is not a visit and must not make the fixture look fresh.
    const noShowOnly = withVisitDaysAgo(0);
    noShowOnly.attendance[0].attendance_status = "no_show";
    if (attendanceFreshness(noShowOnly).newest !== null) {
      failedFreshness += 1;
      console.error("  self-test MISS — a no_show counted as a recent visit");
    }
  }

  let failed = failedFreshness;
  for (const [label, data, wantCode] of planted) {
    const problems = validateFixtures(data, unions);
    const got = wantCode === null ? problems.length === 0 : problems.some((p) => p.code === wantCode);
    if (!got) {
      failed += 1;
      console.error(`  self-test MISS — ${label}: wanted ${wantCode ?? "a clean pass"}, got [${problems.map((p) => p.code).join(", ") || "nothing"}]`);
    }
  }
  const total = planted.length + freshCases.length + 2;
  console.log(`self-test: ${total} planted fixtures, ${total - failed} behaved, ${failed} did not.`);
  console.log(
    failed === 0
      ? "self-test PASSED — the gate can still fail. (Says nothing about plausibility; see the limits above.)"
      : "self-test FAILED — the gate is blind.",
  );
  process.exit(failed === 0 ? 0 : 1);
}

/* ---------- the run ---------- */

if (!IS_COMMAND) {
  // imported for its functions; nothing to do
} else if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  let contractSource;
  try {
    contractSource = readFileSync(join(ROOT, CONTRACT), "utf8");
  } catch {
    console.error(`check-fixtures: cannot read ${CONTRACT}. The gate refuses to report a pass on a contract it never read.`);
    process.exit(1);
  }
  const unions = readUnions(contractSource);
  const missingUnions = REQUIRED_UNIONS.filter((n) => unions[n] === undefined);
  if (missingUnions.length > 0) {
    console.error(`check-fixtures: ${CONTRACT} no longer declares ${missingUnions.join(", ")}.`);
    console.error("check-fixtures: if a union was renamed, update REQUIRED_UNIONS in this file in the same commit.");
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(readFileSync(join(ROOT, FIXTURES), "utf8"));
  } catch (error) {
    console.error(`check-fixtures: ${FIXTURES} is not readable JSON — ${error.message}`);
    process.exit(1);
  }

  const problems = validateFixtures(data, unions);
  const freshness = attendanceFreshness(data);
  const counts = Object.keys(SHAPE)
    .map((n) => `${Array.isArray(data[n]) ? data[n].length : 0} ${n}`)
    .join(", ");
  console.log(
    `check-fixtures: ${FIXTURES} read against ${REQUIRED_UNIONS.length} unions from ${CONTRACT} — ${counts}.`,
  );

  /* SAID EVERY RUN, not only when it breaks — the point is that the team
   * sees it coming rather than meeting it one morning. */
  if (freshness.newest === null) {
    console.log("check-fixtures: no attended class in the fixture, so it can demonstrate nobody attending recently.");
  } else {
    const expires = new Date((Math.floor(Date.now() / 86_400_000) + (FRESH_ENOUGH_DAYS - freshness.daysOld)) * 86_400_000)
      .toISOString().slice(0, 10);
    console.log(
      `check-fixtures: newest attended class is ${freshness.newest}, ${freshness.daysOld} days ago — ` +
        (freshness.daysOld > FRESH_ENOUGH_DAYS
          ? `PAST the ${FRESH_ENOUGH_DAYS}-day mark, so this fixture can no longer show a recent attendee.`
          : `${FRESH_ENOUGH_DAYS - freshness.daysOld} days of usable life left (goes stale ${expires}).`),
    );
  }
  if (freshness.daysOld !== null && freshness.daysOld > FRESH_ENOUGH_DAYS) {
    console.error(
      `check-fixtures: the shared fixture has aged out. Its newest attended class is ${freshness.daysOld} days ` +
        `old, so every member in it now reads as long-quiet and the deliberate near-miss the product briefs ` +
        `require — a member who attended RECENTLY and must NOT be flagged — no longer exists.`,
    );
    console.error(
      "check-fixtures: roll the dates in app/shared/fixtures.json forward (team-owned; state the agreement). " +
        "Do NOT hardcode a fake today in a product — the pinned unit suites are the thing that must not move.",
    );
    process.exit(1);
  }

  if (problems.length === 0) {
    console.log("check-fixtures: every reference resolves, every status is legal, every date is real. PASS");
  } else {
    for (const p of problems) console.error(`  ${p.code} · ${p.detail}`);
    console.error(`check-fixtures: ${problems.length} problem${problems.length === 1 ? "" : "s"}. FAIL`);
    process.exit(1);
  }
}
