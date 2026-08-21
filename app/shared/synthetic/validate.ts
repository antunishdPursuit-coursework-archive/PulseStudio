/* The validator — nothing ships unless this agrees. TEAM-OWNED.
 *
 * Clean and scale datasets must produce ZERO problems. Edge-cases datasets
 * must produce EXACTLY their declared violations: every declared defect
 * found, nothing undeclared found. The declared/found reconciliation makes
 * the injector and the validator test each other — a validator that cannot
 * find a planted defect fails loudly here, not silently in a product.
 *
 * Evidence rules mirrored from the shared policy: only readable, past,
 * resolvable ATTENDED rows count as visits when recomputing quiet days.
 */

import { ID_PATTERN } from "./contracts.js";
import type {
  GeneratedStudioBundle,
  SyntheticAttendance,
  SyntheticClassSession,
} from "./contracts.js";
import {
  dateOfTimestamp,
  dayNumberOf,
  isStrictDate,
  isStrictTimestamp,
  minutesOfTimestamp,
  normalizeName,
} from "./normalize.js";
import { deriveStatusOn, periodProblems } from "./lifecycle.js";

export interface Problem {
  code: string;
  entityId: string;
  detail: string;
}

export interface ValidationReport {
  ok: boolean;
  problems: Problem[];
  /** Edge-cases reconciliation — empty lists mean exact agreement. */
  missedDeclared: Problem[];
  undeclaredFound: Problem[];
  stats: Record<string, number>;
}

export function validateBundle(bundle: GeneratedStudioBundle): ValidationReport {
  const { dataset, truth } = bundle;
  const problems: Problem[] = [];
  const add = (code: string, entityId: string, detail: string): void => {
    problems.push({ code, entityId, detail });
  };
  const asOfDay = dayNumberOf(dataset.meta.asOfDate);

  // --- ids: unique and namespaced ------------------------------------
  const allIds = new Map<string, string>();
  const idRows: Array<[string, string]> = [
    [dataset.studio.id, "studio"],
    ...dataset.members.map((r) => [r.id, "member"] as [string, string]),
    ...dataset.memberships.map((r) => [r.id, "membership"] as [string, string]),
    ...dataset.instructors.map((r) => [r.id, "instructor"] as [string, string]),
    ...dataset.classTypes.map((r) => [r.id, "class-type"] as [string, string]),
    ...dataset.classSessions.map((r) => [r.id, "class-session"] as [string, string]),
    ...dataset.bookings.map((r) => [r.id, "booking"] as [string, string]),
    ...dataset.attendance.map((r) => [r.id, "attendance"] as [string, string]),
    ...dataset.studioPolicies.map((r) => [r.id, "policy"] as [string, string]),
  ];
  for (const [id, kind] of idRows) {
    if (!ID_PATTERN.test(id) || !id.startsWith(`${kind}:`)) {
      add("malformed-id", id, `expected a ${kind}:NNNNNN id`);
    }
    if (allIds.has(id)) add("duplicate-id", id, "id appears more than once");
    allIds.set(id, kind);
  }

  const memberById = new Map(dataset.members.map((m) => [m.id, m]));
  const sessionById = new Map(dataset.classSessions.map((s) => [s.id, s]));
  const instructorIds = new Set(dataset.instructors.map((i) => i.id));
  const classTypeIds = new Set(dataset.classTypes.map((t) => t.id));
  const periodsByMember = new Map<string, typeof dataset.memberships>();
  for (const p of dataset.memberships) {
    const list = periodsByMember.get(p.memberId) ?? [];
    list.push(p);
    periodsByMember.set(p.memberId, list);
  }

  // --- members: names, emails, dates, snapshot vs derived ------------
  for (const m of dataset.members) {
    if (m.displayName !== normalizeName(m.displayName) || m.displayName === "") {
      add("empty-name", m.id, "display name empty or carries outer whitespace");
    }
    if (m.email !== null && !/^[^@\s]+@[a-z0-9.-]+\.invalid$/.test(m.email)) {
      add("email-not-fictional", m.id, `email "${m.email}" is not a reserved .invalid address`);
    }
    if (!isStrictDate(m.joinedOn)) {
      add("invalid-date", m.id, `joinedOn "${m.joinedOn}"`);
      continue;
    }
    const periods = periodsByMember.get(m.id) ?? [];
    for (const issue of periodProblems(periods, m.joinedOn)) {
      add("membership-incoherent", m.id, issue);
    }
    const derived = deriveStatusOn(periods, dataset.meta.asOfDate);
    if (derived !== m.currentStatusSnapshot) {
      add(
        "snapshot-mismatch",
        m.id,
        `snapshot ${m.currentStatusSnapshot}, periods derive ${derived}`,
      );
    }
  }

  // --- memberships: refs and dates ------------------------------------
  for (const p of dataset.memberships) {
    if (!memberById.has(p.memberId)) {
      add("orphan-membership-member", p.id, `memberId ${p.memberId} does not exist`);
    }
    if (!isStrictDate(p.startsOn) || (p.endsOn !== null && !isStrictDate(p.endsOn))) {
      add("invalid-date", p.id, "membership period carries a non-calendar date");
    }
  }

  // --- sessions: refs, timestamps -------------------------------------
  const sessionReadable = new Set<string>();
  for (const s of dataset.classSessions) {
    if (!instructorIds.has(s.instructorId)) {
      add("orphan-session-instructor", s.id, `instructorId ${s.instructorId}`);
    }
    if (!classTypeIds.has(s.classTypeId)) {
      add("orphan-session-classtype", s.id, `classTypeId ${s.classTypeId}`);
    }
    if (!isStrictTimestamp(s.startsAt)) {
      add("invalid-timestamp", s.id, `startsAt "${s.startsAt}"`);
      continue;
    }
    sessionReadable.add(s.id);
  }

  // --- bookings: refs, capacity ---------------------------------------
  const bookedCountBySession = new Map<string, number>();
  for (const b of dataset.bookings) {
    const memberOk = memberById.has(b.memberId);
    const sessionOk = sessionById.has(b.classSessionId);
    if (!memberOk) add("orphan-booking-member", b.id, `memberId ${b.memberId}`);
    if (!sessionOk) add("orphan-booking-session", b.id, `classSessionId ${b.classSessionId}`);
    if (!isStrictTimestamp(b.bookedAt)) add("invalid-timestamp", b.id, `bookedAt "${b.bookedAt}"`);
    if (!memberOk || !sessionOk) continue;
    const bookedSession = sessionById.get(b.classSessionId);
    if (
      bookedSession &&
      isStrictTimestamp(b.bookedAt) &&
      sessionReadable.has(bookedSession.id) &&
      b.bookedAt > bookedSession.startsAt
    ) {
      add("booking-after-session", b.id, `booked at ${b.bookedAt}, class started ${bookedSession.startsAt}`);
    }
    if (b.status === "booked") {
      bookedCountBySession.set(
        b.classSessionId,
        (bookedCountBySession.get(b.classSessionId) ?? 0) + 1,
      );
    }
  }
  for (const [sessionId, count] of bookedCountBySession) {
    const session = sessionById.get(sessionId);
    if (session && count > session.capacity) {
      add(
        "session-over-capacity",
        sessionId,
        `${count} active bookings for capacity ${session.capacity}`,
      );
    }
  }

  // --- attendance: refs, duplicates, membership, overlap, future -----
  const attendanceByMemberSession = new Map<string, SyntheticAttendance[]>();
  const attendedMembersBySession = new Map<string, Set<string>>();
  const bookingIds = new Set(dataset.bookings.map((b) => b.id));
  for (const a of dataset.attendance) {
    if (!["attended", "no_show", "unknown"].includes(a.status)) {
      add("unknown-attendance-status", a.id, `status "${a.status}"`);
      continue;
    }
    const memberOk = memberById.has(a.memberId);
    const session = sessionById.get(a.classSessionId);
    if (!memberOk) {
      add("orphan-attendance-member", a.id, `memberId ${a.memberId} does not exist`);
      continue; // unresolved identity: dependent checks would only cascade
    }
    if (!session) {
      add("orphan-attendance-session", a.id, `classSessionId ${a.classSessionId}`);
      continue;
    }
    if (a.bookingId !== null && !bookingIds.has(a.bookingId)) {
      add("orphan-attendance-booking", a.id, `bookingId ${a.bookingId}`);
    }
    if (!isStrictTimestamp(a.recordedAt)) {
      add("invalid-timestamp", a.id, `recordedAt "${a.recordedAt}"`);
    }
    const key = `${a.memberId}|${a.classSessionId}`;
    const rows = attendanceByMemberSession.get(key) ?? [];
    rows.push(a);
    attendanceByMemberSession.set(key, rows);

    if (!sessionReadable.has(session.id)) continue;
    const sessionDay = dayNumberOf(dateOfTimestamp(session.startsAt));
    if (sessionDay >= asOfDay) {
      add("future-attendance", a.id, `session ${session.id} starts on/after asOfDate`);
      continue;
    }
    const periods = periodsByMember.get(a.memberId) ?? [];
    if (deriveStatusOn(periods, dateOfTimestamp(session.startsAt)) !== "active") {
      add(
        "attendance-outside-active-membership",
        a.id,
        `membership was not active on ${dateOfTimestamp(session.startsAt)}`,
      );
    }
    if (a.status === "attended") {
      const set = attendedMembersBySession.get(session.id) ?? new Set<string>();
      set.add(a.memberId);
      attendedMembersBySession.set(session.id, set);
    }
  }

  // duplicates / conflicts: one member, one session, more than one row.
  for (const rows of attendanceByMemberSession.values()) {
    if (rows.length < 2) continue;
    const statuses = new Set(rows.map((r) => r.status));
    for (const extra of rows.slice(1)) {
      if (statuses.size > 1) {
        add("conflicting-attendance", extra.id, "contradictory outcomes for one member at one session");
      } else {
        add("duplicate-attendance", extra.id, "repeats another row for the same member and session");
      }
    }
  }

  // attended head-count per session (distinct people — a duplicate row is
  // one person, and its defect is reported above, not double-counted here).
  for (const [sessionId, memberSet] of attendedMembersBySession) {
    const session = sessionById.get(sessionId);
    if (session && memberSet.size > session.capacity) {
      add(
        "session-attendance-over-capacity",
        sessionId,
        `${memberSet.size} attendees for capacity ${session.capacity}`,
      );
    }
  }

  // overlapping attendance per member per day.
  const byMemberDay = new Map<string, Array<[number, number, string]>>();
  for (const rows of attendanceByMemberSession.values()) {
    const first = rows[0];
    if (!first || first.status !== "attended") continue;
    const session = sessionById.get(first.classSessionId);
    if (!session || !sessionReadable.has(session.id)) continue;
    const date = dateOfTimestamp(session.startsAt);
    const start = minutesOfTimestamp(session.startsAt);
    const key = `${first.memberId}|${date}`;
    const list = byMemberDay.get(key) ?? [];
    list.push([start, start + session.durationMinutes, first.id]);
    byMemberDay.set(key, list);
  }
  for (const list of byMemberDay.values()) {
    list.sort((x, y) => x[0] - y[0]);
    for (let i = 1; i < list.length; i += 1) {
      const prev = list[i - 1];
      const cur = list[i];
      if (prev && cur && cur[0] < prev[1]) {
        add("overlapping-attendance", cur[2], "attends two sessions occupying the same time");
      }
    }
  }

  // facility occupancy: concurrent attendees across overlapping sessions.
  let peakConcurrentAttendance = 0;
  const sessionsByDate = new Map<string, SyntheticClassSession[]>();
  for (const s of dataset.classSessions) {
    if (!sessionReadable.has(s.id)) continue;
    const date = dateOfTimestamp(s.startsAt);
    const list = sessionsByDate.get(date) ?? [];
    list.push(s);
    sessionsByDate.set(date, list);
  }
  for (const [, sessions] of sessionsByDate) {
    for (const s of sessions) {
      const sStart = minutesOfTimestamp(s.startsAt);
      const sEnd = sStart + s.durationMinutes;
      let concurrent = 0;
      for (const other of sessions) {
        const oStart = minutesOfTimestamp(other.startsAt);
        const oEnd = oStart + other.durationMinutes;
        if (sStart < oEnd && sEnd > oStart) {
          concurrent += (attendedMembersBySession.get(other.id) ?? new Set()).size;
        }
      }
      peakConcurrentAttendance = Math.max(peakConcurrentAttendance, concurrent);
      if (concurrent > dataset.studio.facilityCapacity) {
        add(
          "facility-over-capacity",
          s.id,
          `${concurrent} concurrent attendees for facility capacity ${dataset.studio.facilityCapacity}`,
        );
      }
    }
  }

  // --- studio policies: strict dates, one current per topic -------------
  const currentByTopic = new Map<string, number>();
  for (const pol of dataset.studioPolicies) {
    if (!isStrictDate(pol.effectiveFrom)) add("invalid-date", pol.id, `effectiveFrom "${pol.effectiveFrom}"`);
    if (!isStrictTimestamp(pol.updatedAt)) add("invalid-timestamp", pol.id, `updatedAt "${pol.updatedAt}"`);
    if (pol.isCurrent) currentByTopic.set(pol.topic, (currentByTopic.get(pol.topic) ?? 0) + 1);
  }
  for (const [topic, count] of currentByTopic) {
    if (count !== 1) add("policy-topic-current-count", topic, `${count} current policies for one topic`);
  }

  // --- upcoming availability truth vs a recount -------------------------
  const upcomingBooked = new Map<string, number>();
  for (const b of dataset.bookings) {
    if (b.status !== "booked" || !sessionById.has(b.classSessionId)) continue;
    upcomingBooked.set(b.classSessionId, (upcomingBooked.get(b.classSessionId) ?? 0) + 1);
  }
  for (const s of dataset.classSessions) {
    if (s.status !== "scheduled" || !sessionReadable.has(s.id)) continue;
    if (dayNumberOf(dateOfTimestamp(s.startsAt)) < asOfDay) continue;
    const expected = truth.expectedUpcomingAvailability[s.id];
    const actual = s.capacity - (upcomingBooked.get(s.id) ?? 0);
    if (expected !== actual) {
      add("truth-availability-mismatch", s.id, `truth says ${expected ?? "absent"} spots left, records say ${actual}`);
    }
  }

  // --- truth agreement: intent vs records, computed independently -----
  if (Object.keys(truth.memberCohorts).length !== dataset.members.length) {
    add(
      "cohort-count-mismatch",
      dataset.studio.id,
      `${Object.keys(truth.memberCohorts).length} cohorts for ${dataset.members.length} members`,
    );
  }
  const realizedQuiet = new Map<string, number>();
  for (const rows of attendanceByMemberSession.values()) {
    for (const a of rows) {
      if (a.status !== "attended") continue;
      const session = sessionById.get(a.classSessionId);
      if (!session || !sessionReadable.has(session.id)) continue;
      const day = dayNumberOf(dateOfTimestamp(session.startsAt));
      if (day >= asOfDay) continue; // future rows are never evidence
      if (!memberById.has(a.memberId)) continue;
      const quiet = asOfDay - day;
      const prev = realizedQuiet.get(a.memberId);
      if (prev === undefined || quiet < prev) realizedQuiet.set(a.memberId, quiet);
    }
  }
  for (const m of dataset.members) {
    const expected = truth.expectedQuietDays[m.id];
    const realized = realizedQuiet.get(m.id);
    if ((expected === undefined) !== (realized === undefined) || expected !== realized) {
      add(
        "truth-intent-mismatch",
        m.id,
        `expected quiet ${expected ?? "never-attended"}, records show ${realized ?? "never-attended"}`,
      );
      continue;
    }
    const expectedPrior = truth.expectedPriorAttendance[m.id];
    if (realized !== undefined) {
      const lastDay = asOfDay - realized;
      const seenSessions = new Set<string>();
      let priorCount = 0;
      for (const rows of attendanceByMemberSession.values()) {
        const row = rows[0];
        if (!row || row.memberId !== m.id || row.status !== "attended") continue;
        const sess = sessionById.get(row.classSessionId);
        if (!sess || !sessionReadable.has(sess.id) || seenSessions.has(sess.id)) continue;
        seenSessions.add(sess.id);
        const day = dayNumberOf(dateOfTimestamp(sess.startsAt));
        if (day >= asOfDay) continue;
        if (day >= lastDay - 60 && day <= lastDay) priorCount += 1;
      }
      if (expectedPrior !== priorCount) {
        add("truth-prior-mismatch", m.id, `answer key says ${expectedPrior ?? "absent"} prior classes, records show ${priorCount}`);
      }
    }
    const periods = periodsByMember.get(m.id) ?? [];
    const derived = deriveStatusOn(periods, dataset.meta.asOfDate);
    const expectedStatus = truth.expectedCurrentMembershipStatus[m.id];
    if (expectedStatus !== derived) {
      add("truth-status-mismatch", m.id, `truth ${expectedStatus}, periods derive ${derived}`);
    }
    const eligible =
      derived === "active" && realized !== undefined && realized > 14 && realized <= 60;
    if (truth.expectedReengagementEligibility[m.id] !== eligible) {
      add(
        "truth-eligibility-mismatch",
        m.id,
        `truth says ${String(truth.expectedReengagementEligibility[m.id])}, records say ${String(eligible)}`,
      );
    }
  }

  // --- canonical order: collections ascending by id ---------------------
  const collections: Array<[string, ReadonlyArray<{ id: string }>]> = [
    ["members", dataset.members],
    ["memberships", dataset.memberships],
    ["classSessions", dataset.classSessions],
    ["bookings", dataset.bookings],
    ["attendance", dataset.attendance],
  ];
  for (const [name, rows] of collections) {
    for (let i = 1; i < rows.length; i += 1) {
      const prev = rows[i - 1];
      const cur = rows[i];
      if (prev && cur && cur.id <= prev.id) {
        add("unsorted-collection", cur.id, `${name} is not in ascending id order`);
        break;
      }
    }
  }

  // --- the answer key never leaks into normal records -------------------
  // Answer vocabulary on a production-shaped record would let a product
  // read the answers instead of inferring them. Decided by key NAME, so a
  // parsed dataset from anywhere is held to it, not just our own types.
  {
    // "answer" is deliberately NOT here: a studio policy's answer field is
    // the member-facing text itself — production data. The forbidden
    // vocabulary is the kind that would let a product read a verdict.
    const forbiddenKey = /^(cohort|group|expected|eligib|quiet)/i;
    /* EVERY ELEMENT, NOT THE FIRST ONE. This used to scan only value[0] of
     * each array — `const sample = value.length > 0 ? [value[0]] : []` —
     * which catches a leak that is on the TYPE and misses entirely the
     * leak that is on a RECORD. A stray label on member 500, or on the one
     * member an edge-case injection touched, walked straight past it, and
     * a leak on a single record is the shape this check most needs to
     * catch. The cost of doing it properly is a key-name test per field on
     * a few tens of thousands of records: milliseconds, against a check
     * that was close to decorative.
     *
     * Reported once per distinct key with a count, so a leak that IS on
     * the type produces one line instead of fifty thousand. */
    const leakCounts = new Map<string, { count: number; first: string }>();
    const scan = (value: unknown, path: string): void => {
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i += 1) scan(value[i], `${path}[${i}]`);
        return;
      }
      if (typeof value !== "object" || value === null) return;
      for (const [k, v] of Object.entries(value)) {
        if (forbiddenKey.test(k)) {
          const seen = leakCounts.get(k);
          if (seen === undefined) leakCounts.set(k, { count: 1, first: path });
          else seen.count += 1;
        }
        scan(v, `${path}.${k}`);
      }
    };
    scan(
      {
        members: dataset.members,
        memberships: dataset.memberships,
        instructors: dataset.instructors,
        classTypes: dataset.classTypes,
        classSessions: dataset.classSessions,
        bookings: dataset.bookings,
        attendance: dataset.attendance,
        studioPolicies: dataset.studioPolicies,
      },
      "dataset",
    );
    for (const [key, { count, first }] of leakCounts) {
      add(
        "answer-label-leak",
        first,
        `record key "${key}" belongs in the answer key, not on records` +
          (count > 1 ? ` (${count} records carry it)` : ""),
      );
    }
  }

  // --- sensitive data: scan DECODED field values, not file text ---------
  // Nothing in this dataset may even be SHAPED like a credential: no long
  // digit runs (card-shaped), no nine-digit runs (government-id-shaped).
  {
    const credentialShaped = /\d{13,19}|(?<!\d)\d{9}(?!\d)/;
    const scanStrings = (value: unknown, path: string): void => {
      if (typeof value === "string") {
        if (credentialShaped.test(value)) {
          add("real-pii-pattern", path, `value looks credential-shaped: "${value.slice(0, 40)}"`);
        }
        return;
      }
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i += 1) scanStrings(value[i], `${path}[${i}]`);
        return;
      }
      if (typeof value === "object" && value !== null) {
        for (const [k, v] of Object.entries(value)) scanStrings(v, `${path}.${k}`);
      }
    };
    scanStrings(dataset, "dataset");
  }

  // --- booking lifecycle order ------------------------------------------
  // A booking is placed at or before its session starts (identical strict
  // timestamp formats make lexicographic comparison exact), and a canceled
  // booking never carries an attendance outcome.
  const bookingById = new Map(dataset.bookings.map((b) => [b.id, b]));
  for (const b of dataset.bookings) {
    const session = sessionById.get(b.classSessionId);
    if (!session || !sessionReadable.has(session.id)) continue;
    if (!isStrictTimestamp(b.bookedAt)) continue; // reported above
    if (b.bookedAt > session.startsAt) {
      add("booked-after-start", b.id, `booked ${b.bookedAt}, session started ${session.startsAt}`);
    }
  }
  for (const a of dataset.attendance) {
    if (a.bookingId === null) continue;
    const booking = bookingById.get(a.bookingId);
    if (booking && booking.status === "canceled") {
      add("attendance-on-canceled-booking", a.id, `outcome recorded against canceled ${booking.id}`);
    }
  }

  // --- sensitive data: scan DECODED field values, not serialized text ----
  // Credential-shaped digit runs (13-19 digits, or an exact 9-digit run)
  // must not exist in any string field. Serialized-text scanning can be
  // fooled by adjacent fields and formatting; values cannot.
  const scanValue = (owner: string, value: unknown): void => {
    if (typeof value !== "string") return;
    if (/\d{13,19}/.test(value) || /(?<!\d)\d{9}(?!\d)/.test(value)) {
      add("sensitive-pattern", owner, `credential-shaped digit run in "${value.slice(0, 40)}"`);
    }
  };
  const scanRecord = (record: Record<string, unknown>): void => {
    const id = typeof record["id"] === "string" ? (record["id"] as string) : dataset.studio.id;
    for (const value of Object.values(record)) scanValue(id, value);
  };
  scanRecord(dataset.studio as unknown as Record<string, unknown>);
  for (const r of dataset.members) scanRecord(r as unknown as Record<string, unknown>);
  for (const r of dataset.memberships) scanRecord(r as unknown as Record<string, unknown>);
  for (const r of dataset.instructors) scanRecord(r as unknown as Record<string, unknown>);
  for (const r of dataset.classTypes) scanRecord(r as unknown as Record<string, unknown>);
  for (const r of dataset.classSessions) scanRecord(r as unknown as Record<string, unknown>);
  for (const r of dataset.bookings) scanRecord(r as unknown as Record<string, unknown>);
  for (const r of dataset.attendance) scanRecord(r as unknown as Record<string, unknown>);
  for (const r of dataset.studioPolicies) scanRecord(r as unknown as Record<string, unknown>);

  // --- reconcile with declared violations ------------------------------
  const keyOf = (x: { code: string; entityId: string }): string =>
    `${x.code}|${x.entityId}`;
  const declared = truth.declaredViolations;
  const declaredKeys = new Set(declared.map(keyOf));
  const foundKeys = new Set(problems.map(keyOf));
  const missedDeclared: Problem[] = declared
    .filter((d) => !foundKeys.has(keyOf(d)))
    .map((d) => ({ code: d.code, entityId: d.entityId, detail: `declared but not found: ${d.detail}` }));
  const undeclaredFound = problems.filter((p) => !declaredKeys.has(keyOf(p)));

  const ok =
    dataset.meta.mode === "edge-cases"
      ? missedDeclared.length === 0 && undeclaredFound.length === 0
      : problems.length === 0;

  return {
    ok,
    problems,
    missedDeclared,
    undeclaredFound,
    stats: {
      members: dataset.members.length,
      memberships: dataset.memberships.length,
      classSessions: dataset.classSessions.length,
      bookings: dataset.bookings.length,
      attendance: dataset.attendance.length,
      peakConcurrentAttendance,
      realizedEligible: dataset.members.filter((m) => {
        const q = realizedQuiet.get(m.id);
        const periods = periodsByMember.get(m.id) ?? [];
        return (
          deriveStatusOn(periods, dataset.meta.asOfDate) === "active" &&
          q !== undefined &&
          q > 14 &&
          q <= 60
        );
      }).length,
    },
  };
}
