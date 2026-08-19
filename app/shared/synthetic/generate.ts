/* The generator — one coherent lifecycle, in explicit order. TEAM-OWNED.
 *
 * 1 studio → 2 instructors + class types → 3 schedule → 4 identities →
 * 5 membership histories → 6 cohorts (planned first, realized here) →
 * 7 bookings under membership + capacity → 8 outcomes → 9 attendance →
 * 10 truth + summaries → 11 validation (validate.ts) → 12 serialization
 * (serialize.ts) — never each table independently reconciled afterward.
 *
 * The anchor discipline: every attending member's LAST visit is placed
 * first, then earlier history fills strictly before it. Realized
 * last-attended therefore equals planned intent, truth metadata is intent,
 * and the validator can hold the records to it. If an anchor cannot be
 * placed, generation THROWS — loud, never a silently different studio.
 *
 * Pure by contract: no clock, no network, no product imports.
 */

import {
  makeId,
  type DeclaredViolation,
  type GeneratedStudioBundle,
  type MembershipPeriod,
  type SyntheticAttendance,
  type SyntheticBooking,
  type SyntheticClassSession,
  type SyntheticDataset,
  type SyntheticMember,
  type SyntheticStudio,
  type SyntheticTruth,
} from "./contracts.js";
import { validateConfig, type SyntheticStudioConfig } from "./config.js";
import { makeStream, type Stream } from "./random.js";
import {
  dateOfDayNumber,
  dateOfTimestamp,
  dayNumberOf,
  minutesOfTimestamp,
} from "./normalize.js";
import { buildSchedule } from "./schedule.js";
import { planCohorts, type CohortPlan } from "./scenarios.js";
import { buildIdentities, DEFAULT_NAME_POOL, type NamePool } from "./identity.js";
import { activeOn, deriveStatusOn } from "./lifecycle.js";

export interface GenerateOptions {
  /** Substituting the pool must change names ONLY — a test hook proving
   *  stream independence, also usable by clones. */
  namePool?: NamePool;
}

const PLAN_NAMES: readonly string[] = [
  "Unlimited Monthly",
  "8 Classes Monthly",
  "4 Classes Monthly",
];

export function generateStudio(
  config: SyntheticStudioConfig,
  options: GenerateOptions = {},
): GeneratedStudioBundle {
  const configProblems = validateConfig(config);
  if (configProblems.length > 0) {
    throw new Error(`invalid configuration: ${configProblems.join("; ")}`);
  }
  const asOfDay = dayNumberOf(config.asOfDate);
  const windowStartDay = asOfDay - config.historyDays;

  // 1. The studio and its facility constraint.
  const studio: SyntheticStudio = {
    id: makeId("studio", 1),
    name: "Pulse Studio",
    timezone: config.timezone,
    facilityCapacity: config.facilityCapacity ?? 30,
  };

  // 2-3. Instructors, class types, schedule.
  const schedule = buildSchedule(config);

  // 4. Cohort plans, then identities in plan order.
  const plans = planCohorts(config);
  const identities = buildIdentities(
    config.seed,
    plans,
    options.namePool ?? DEFAULT_NAME_POOL,
  );

  // 5. Membership histories — periods are authoritative; snapshots derived.
  const memberships: MembershipPeriod[] = [];
  const periodsByMember = new Map<string, MembershipPeriod[]>();
  const members: SyntheticMember[] = [];
  let membershipCounter = 0;
  for (let i = 0; i < plans.length; i += 1) {
    const plan = plans[i];
    const identity = identities[i];
    if (!plan || !identity) continue;
    const lifecycleStream = makeStream(config.seed, `lifecycle:${i}`);
    const joinedOn = dateOfDayNumber(asOfDay - plan.joinDaysAgo);
    const planName = lifecycleStream.pick(PLAN_NAMES);
    const periods = buildPeriods(plan, joinedOn, asOfDay, planName, () => {
      membershipCounter += 1;
      return makeId("membership", membershipCounter);
    }, identity.id);
    memberships.push(...periods);
    periodsByMember.set(identity.id, periods);
    members.push({
      id: identity.id,
      displayName: identity.displayName,
      email: identity.email,
      joinedOn,
      currentStatusSnapshot: deriveStatusOn(periods, config.asOfDate),
    });
  }

  // 6-9. Bookings and attendance, anchors first.
  const seatsUsed = new Map<string, number>();
  const attendedSlots = new Map<string, Array<[number, number]>>(); // memberId|date
  const bookedSessions = new Set<string>(); // memberId|sessionId
  const bookings: SyntheticBooking[] = [];
  const attendance: SyntheticAttendance[] = [];
  let bookingCounter = 0;
  let attendanceCounter = 0;

  const nextBookingId = (): string => {
    bookingCounter += 1;
    return makeId("booking", bookingCounter);
  };
  const nextAttendanceId = (): string => {
    attendanceCounter += 1;
    return makeId("attendance", attendanceCounter);
  };

  const sessionSeatFree = (s: SyntheticClassSession): boolean =>
    (seatsUsed.get(s.id) ?? 0) < s.capacity;

  const overlapsAttended = (
    memberId: string,
    s: SyntheticClassSession,
  ): boolean => {
    const date = dateOfTimestamp(s.startsAt);
    const startMin = minutesOfTimestamp(s.startsAt);
    const endMin = startMin + s.durationMinutes;
    const taken = attendedSlots.get(`${memberId}|${date}`) ?? [];
    return taken.some(([a, b]) => startMin < b && endMin > a);
  };

  /** Book (or walk in) and record the outcome for one member on one date.
   *  Returns the session used, or null when nothing fit. */
  const placeVisit = (
    memberId: string,
    plan: CohortPlan,
    day: number,
    stream: Stream,
    outcome: "attended" | "no_show" | "unknown",
    preferredTypeId: string | null,
  ): SyntheticClassSession | null => {
    const date = dateOfDayNumber(day);
    const todays = schedule.sessionsByDate.get(date) ?? [];
    const usable = todays.filter(
      (s) =>
        s.status !== "canceled" &&
        sessionSeatFree(s) &&
        !bookedSessions.has(`${memberId}|${s.id}`) &&
        (outcome !== "attended" || !overlapsAttended(memberId, s)),
    );
    if (usable.length === 0) return null;
    const preferred = usable.filter((s) => s.classTypeId === preferredTypeId);
    const session = (preferred.length > 0 ? preferred : usable)[0];
    if (!session) return null;

    seatsUsed.set(session.id, (seatsUsed.get(session.id) ?? 0) + 1);
    bookedSessions.add(`${memberId}|${session.id}`);

    const walkIn = outcome === "attended" && stream.chance(plan.walkInRate);
    let bookingId: string | null = null;
    if (!walkIn) {
      bookingId = nextBookingId();
      bookings.push({
        id: bookingId,
        memberId,
        classSessionId: session.id,
        bookedAt: `${dateOfDayNumber(day - 1)}T18:00:00`,
        status: "booked",
      });
    }
    const endMin = minutesOfTimestamp(session.startsAt) + session.durationMinutes;
    attendance.push({
      id: nextAttendanceId(),
      memberId,
      classSessionId: session.id,
      bookingId,
      status: outcome,
      recordedAt: `${date}T${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}:00`,
    });
    if (outcome === "attended") {
      const startMin = minutesOfTimestamp(session.startsAt);
      const key = `${memberId}|${date}`;
      const list = attendedSlots.get(key) ?? [];
      list.push([startMin, startMin + session.durationMinutes]);
      attendedSlots.set(key, list);
    }
    return session;
  };

  // Phase A — anchors: every attending member's LAST visit, placed first.
  const anchorTypeByMember = new Map<string, string>();
  for (let i = 0; i < plans.length; i += 1) {
    const plan = plans[i];
    const identity = identities[i];
    if (!plan || !identity || plan.anchorDaysAgo === null) continue;
    const behavior = makeStream(config.seed, `behavior:${i}`);
    const preferredType =
      schedule.classTypes[behavior.int(0, schedule.classTypes.length - 1)];
    anchorTypeByMember.set(identity.id, preferredType ? preferredType.id : "");
    const anchorDay = asOfDay - plan.anchorDaysAgo;
    const periods = periodsByMember.get(identity.id) ?? [];
    if (!activeOn(periods, dateOfDayNumber(anchorDay))) {
      throw new Error(
        `plan defect: ${plan.cohortKey} anchor ${plan.anchorDaysAgo}d ago falls outside an active period`,
      );
    }
    const placed = placeVisit(
      identity.id,
      plan,
      anchorDay,
      behavior,
      "attended",
      preferredType ? preferredType.id : null,
    );
    if (!placed) {
      throw new Error(
        `could not place anchored visit for ${identity.id} (${plan.cohortKey}) on ${dateOfDayNumber(anchorDay)}`,
      );
    }
  }

  // Phase B — earlier history: strictly before each member's anchor, so the
  // anchor stays their realized last visit. Fill respects membership state,
  // capacity, the returning cohort's deliberate gap, and a visit cap that
  // keeps 500-member volumes coherent rather than unbounded.
  for (let i = 0; i < plans.length; i += 1) {
    const plan = plans[i];
    const identity = identities[i];
    if (!plan || !identity || plan.anchorDaysAgo === null) continue;
    const behavior = makeStream(config.seed, `behavior-history:${i}`);
    const periods = periodsByMember.get(identity.id) ?? [];
    const preferredTypeId = anchorTypeByMember.get(identity.id) ?? null;
    const altType = schedule.classTypes.find((t) => t.id !== preferredTypeId);
    const joinDay = asOfDay - plan.joinDaysAgo;
    const stride = Math.max(2, Math.round(7 / Math.max(plan.cadencePerWeek, 0.4)));
    let day = asOfDay - plan.anchorDaysAgo;
    let visits = 0;
    while (visits < 60) {
      day -= stride + behavior.int(0, 2);
      if (day < windowStartDay || day < joinDay) break;
      const agoDays = asOfDay - day;
      if (plan.gapBand && agoDays >= plan.gapBand[0] && agoDays <= plan.gapBand[1]) {
        continue; // the returning cohort's silent stretch
      }
      if (!activeOn(periods, dateOfDayNumber(day))) continue; // paused/canceled span
      const isOlderHalf = agoDays > (plan.anchorDaysAgo + config.historyDays) / 2;
      const typeId =
        plan.switchesPreference && isOlderHalf && altType ? altType.id : preferredTypeId;
      const outcome: "attended" | "no_show" =
        behavior.chance(plan.noShowRate) ? "no_show" : "attended";
      placeVisit(identity.id, plan, day, behavior, outcome, typeId);
      visits += 1;
    }
  }

  // Phase C — recent unresolved outcomes and future bookings.
  for (let i = 0; i < plans.length; i += 1) {
    const plan = plans[i];
    const identity = identities[i];
    if (!plan || !identity) continue;
    const behavior = makeStream(config.seed, `behavior-recent:${i}`);
    const periods = periodsByMember.get(identity.id) ?? [];
    const preferredTypeId = anchorTypeByMember.get(identity.id) ?? null;

    // A yesterday-or-day-before class whose outcome nobody recorded yet.
    if (plan.anchorDaysAgo !== null && behavior.chance(0.08)) {
      const day = asOfDay - behavior.int(1, 2);
      if (activeOn(periods, dateOfDayNumber(day))) {
        placeVisit(identity.id, plan, day, behavior, "unknown", preferredTypeId);
      }
    }
    // Upcoming bookings, only while the membership is active on that day.
    for (let b = 0; b < plan.futureBookings; b += 1) {
      const day = asOfDay + behavior.int(1, 10);
      const date = dateOfDayNumber(day);
      if (!activeOn(periods, date)) continue;
      const todays = (schedule.sessionsByDate.get(date) ?? []).filter(
        (s) =>
          s.status === "scheduled" &&
          sessionSeatFree(s) &&
          !bookedSessions.has(`${identity.id}|${s.id}`),
      );
      const session = todays[0];
      if (!session) continue;
      seatsUsed.set(session.id, (seatsUsed.get(session.id) ?? 0) + 1);
      bookedSessions.add(`${identity.id}|${session.id}`);
      bookings.push({
        id: nextBookingId(),
        memberId: identity.id,
        classSessionId: session.id,
        bookedAt: `${config.asOfDate}T09:00:00`,
        status: "booked",
      });
    }
    // An occasional canceled booking on a past session — canceled bookings
    // release their seat and never gain attendance.
    if (plan.anchorDaysAgo !== null && behavior.chance(0.1)) {
      const day = asOfDay - behavior.int(3, 30);
      const date = dateOfDayNumber(day);
      if (activeOn(periods, date)) {
        const todays = (schedule.sessionsByDate.get(date) ?? []).filter(
          (s) => s.status !== "canceled" && !bookedSessions.has(`${identity.id}|${s.id}`),
        );
        const session = todays[0];
        if (session) {
          bookedSessions.add(`${identity.id}|${session.id}`);
          bookings.push({
            id: nextBookingId(),
            memberId: identity.id,
            classSessionId: session.id,
            bookedAt: `${dateOfDayNumber(day - 2)}T18:00:00`,
            status: "canceled",
          });
        }
      }
    }
  }

  // 10. Truth from construction intent — never from a product's engine.
  const truth: SyntheticTruth = {
    memberCohorts: {},
    expectedCurrentMembershipStatus: {},
    expectedQuietDays: {},
    expectedReengagementEligibility: {},
    expectedDashboardMetrics: {},
    declaredViolations: [],
  };
  for (let i = 0; i < plans.length; i += 1) {
    const plan = plans[i];
    const member = members[i];
    if (!plan || !member) continue;
    truth.memberCohorts[member.id] = plan.cohortKey;
    truth.expectedCurrentMembershipStatus[member.id] = member.currentStatusSnapshot;
    if (plan.anchorDaysAgo !== null) {
      truth.expectedQuietDays[member.id] = plan.anchorDaysAgo;
    }
    truth.expectedReengagementEligibility[member.id] =
      member.currentStatusSnapshot === "active" &&
      plan.anchorDaysAgo !== null &&
      plan.anchorDaysAgo > 14 &&
      plan.anchorDaysAgo <= 60;
  }
  const attendedRows = attendance.filter((a) => a.status === "attended");
  const peakSessionAttendance = Math.max(
    0,
    ...[...groupCount(attendedRows.map((a) => a.classSessionId)).values()],
  );
  truth.expectedDashboardMetrics = {
    activeMembers: members.filter((m) => m.currentStatusSnapshot === "active").length,
    pausedMembers: members.filter((m) => m.currentStatusSnapshot === "paused").length,
    canceledMembers: members.filter((m) => m.currentStatusSnapshot === "canceled").length,
    upcomingScheduledSessions: schedule.sessions.filter(
      (s) => s.status === "scheduled" && dayNumberOf(dateOfTimestamp(s.startsAt)) >= asOfDay,
    ).length,
    completedSessions: schedule.sessions.filter((s) => s.status === "completed").length,
    totalBookings: bookings.length,
    totalAttendanceRecords: attendance.length,
    totalAttended: attendedRows.length,
    totalNoShows: attendance.filter((a) => a.status === "no_show").length,
    peakSessionAttendance,
  };

  const dataset: SyntheticDataset = {
    meta: {
      generatorVersion: config.generatorVersion,
      seed: config.seed,
      asOfDate: config.asOfDate,
      timezone: config.timezone,
      mode: config.mode,
      memberCount: config.memberCount,
      historyDays: config.historyDays,
      counts: {
        members: members.length,
        memberships: memberships.length,
        instructors: schedule.instructors.length,
        classTypes: schedule.classTypes.length,
        classSessions: schedule.sessions.length,
        bookings: bookings.length,
        attendance: attendance.length,
      },
      note: "Synthetic studio — every person and record is fictional.",
    },
    studio,
    members,
    memberships,
    instructors: schedule.instructors,
    classTypes: schedule.classTypes,
    classSessions: schedule.sessions,
    bookings: bookings,
    attendance,
  };

  // 12 (mode). Edge-cases: inject DECLARED defects after the clean build.
  if (config.mode === "edge-cases") {
    truth.declaredViolations = injectEdgeCases(dataset, truth, plans, asOfDay);
    dataset.meta.counts["bookings"] = dataset.bookings.length;
    dataset.meta.counts["attendance"] = dataset.attendance.length;
    dataset.meta.counts["classSessions"] = dataset.classSessions.length;
  }

  return { dataset, truth };
}

function groupCount(keys: readonly string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const k of keys) out.set(k, (out.get(k) ?? 0) + 1);
  return out;
}

function buildPeriods(
  plan: CohortPlan,
  joinedOn: string,
  asOfDay: number,
  planName: string,
  nextId: () => string,
  memberId: string,
): MembershipPeriod[] {
  const mk = (
    state: MembershipPeriod["state"],
    startsOn: string,
    endsOn: string | null,
  ): MembershipPeriod => ({
    id: nextId(),
    memberId,
    state,
    startsOn,
    endsOn,
    planName,
  });
  if (plan.membershipKind === "paused" && plan.pauseStartDaysAgo !== null) {
    const pauseStart = dateOfDayNumber(asOfDay - plan.pauseStartDaysAgo);
    return [mk("active", joinedOn, pauseStart), mk("paused", pauseStart, null)];
  }
  if (
    plan.membershipKind === "resumed" &&
    plan.pauseStartDaysAgo !== null &&
    plan.pauseLengthDays !== null
  ) {
    const pauseStart = dateOfDayNumber(asOfDay - plan.pauseStartDaysAgo);
    const resumeOn = dateOfDayNumber(
      asOfDay - plan.pauseStartDaysAgo + plan.pauseLengthDays,
    );
    return [
      mk("active", joinedOn, pauseStart),
      mk("paused", pauseStart, resumeOn),
      mk("active", resumeOn, null),
    ];
  }
  if (plan.membershipKind === "canceled" && plan.cancelDaysAgo !== null) {
    const cancelOn = dateOfDayNumber(asOfDay - plan.cancelDaysAgo);
    return [mk("active", joinedOn, cancelOn), mk("canceled", cancelOn, null)];
  }
  return [mk("active", joinedOn, null)];
}

/** Deliberate, DECLARED defects — edge-cases mode only. Every injection is
 *  listed so the validator can be held to finding exactly these. */
function injectEdgeCases(
  dataset: SyntheticDataset,
  truth: SyntheticTruth,
  plans: readonly CohortPlan[],
  asOfDay: number,
): DeclaredViolation[] {
  const declared: DeclaredViolation[] = [];
  const nextAttendanceId = (): string =>
    makeId("attendance", dataset.attendance.length + 900001);
  const nextBookingId = (): string =>
    makeId("booking", dataset.bookings.length + 900001);

  const attendedRows = dataset.attendance.filter((a) => a.status === "attended");
  const sessionById = new Map(dataset.classSessions.map((s) => [s.id, s]));
  const memberIndexByCohort = (key: string): number =>
    plans.findIndex((p) => p.cohortKey === key);

  const pastSessionWithRoom = (): SyntheticClassSession | undefined =>
    dataset.classSessions.find((s) => {
      if (s.status !== "completed") return false;
      const attendedHere = dataset.attendance.filter(
        (a) => a.classSessionId === s.id && a.status === "attended",
      ).length;
      return attendedHere < s.capacity - 1;
    });

  // EC1 — attendance for a member that does not exist.
  {
    const session = pastSessionWithRoom();
    if (session) {
      const id = nextAttendanceId();
      dataset.attendance.push({
        id,
        memberId: "member:999901",
        classSessionId: session.id,
        bookingId: null,
        status: "attended",
        recordedAt: session.startsAt,
      });
      declared.push({
        code: "orphan-attendance-member",
        entityId: id,
        detail: "attendance row references member:999901, which does not exist",
      });
    }
  }

  // EC2 — booking for a session that does not exist.
  {
    const member = dataset.members[0];
    if (member) {
      const id = nextBookingId();
      dataset.bookings.push({
        id,
        memberId: member.id,
        classSessionId: "class-session:999901",
        bookedAt: `${dataset.meta.asOfDate}T08:00:00`,
        status: "booked",
      });
      declared.push({
        code: "orphan-booking-session",
        entityId: id,
        detail: "booking references class-session:999901, which does not exist",
      });
    }
  }

  // EC3 — an exact duplicate attendance row (same member, same session).
  {
    const source = attendedRows[0];
    if (source) {
      const id = nextAttendanceId();
      dataset.attendance.push({ ...source, id });
      declared.push({
        code: "duplicate-attendance",
        entityId: id,
        detail: `duplicates ${source.id} for ${source.memberId} at ${source.classSessionId}`,
      });
    }
  }

  // EC4 — conflicting outcomes for one member at one session.
  {
    const source = attendedRows[1];
    if (source) {
      const id = nextAttendanceId();
      dataset.attendance.push({ ...source, id, bookingId: null, status: "no_show" });
      declared.push({
        code: "conflicting-attendance",
        entityId: id,
        detail: `contradicts ${source.id}: attended and no_show at ${source.classSessionId}`,
      });
    }
  }

  // EC5 — an unreadable timestamp on a recorded outcome.
  {
    const idx = plans.findIndex((p) => p.cohortKey === "regular");
    const member = idx >= 0 ? dataset.members[idx] : undefined;
    const victim = member
      ? dataset.attendance.find(
          (a) =>
            a.memberId === member.id &&
            a.status === "attended" &&
            (truth.expectedQuietDays[member.id] ?? 0) !==
              asOfDay - dayNumberOf(dateOfTimestamp(a.recordedAt)),
        )
      : undefined;
    if (victim) {
      victim.recordedAt = "2026-13-45T09:00:00";
      declared.push({
        code: "invalid-timestamp",
        entityId: victim.id,
        detail: "recordedAt is 2026-13-45T09:00:00 — not a calendar timestamp",
      });
    }
  }

  // EC6 — attendance recorded for a session that has not happened.
  {
    const future = dataset.classSessions.find(
      (s) =>
        s.status === "scheduled" &&
        dayNumberOf(dateOfTimestamp(s.startsAt)) > asOfDay,
    );
    const member = dataset.members[1];
    if (future && member) {
      const id = nextAttendanceId();
      dataset.attendance.push({
        id,
        memberId: member.id,
        classSessionId: future.id,
        bookingId: null,
        status: "attended",
        recordedAt: future.startsAt,
      });
      declared.push({
        code: "future-attendance",
        entityId: id,
        detail: `attendance recorded for ${future.id}, which starts after asOfDate`,
      });
    }
  }

  // EC7 — a session booked past its capacity.
  {
    const session = dataset.classSessions.find((s) => s.status === "completed");
    if (session) {
      const bookedHere = new Set(
        dataset.bookings
          .filter((b) => b.classSessionId === session.id && b.status === "booked")
          .map((b) => b.memberId),
      );
      const needed = session.capacity - bookedHere.size + 1;
      let added = 0;
      for (const m of dataset.members) {
        if (added >= needed) break;
        if (bookedHere.has(m.id)) continue;
        dataset.bookings.push({
          id: nextBookingId(),
          memberId: m.id,
          classSessionId: session.id,
          bookedAt: session.startsAt,
          status: "booked",
        });
        added += 1;
      }
      declared.push({
        code: "session-over-capacity",
        entityId: session.id,
        detail: `bookings exceed capacity ${session.capacity} by 1`,
      });
    }
  }

  // EC8 — attendance during a paused period. This also shifts the member's
  // realized last-attended, so the truth-intent mismatch is DECLARED too:
  // one injected row, two honest consequences.
  {
    const idx = memberIndexByCohort("paused");
    const plan = idx >= 0 ? plans[idx] : undefined;
    const member = idx >= 0 ? dataset.members[idx] : undefined;
    if (plan && member && plan.pauseStartDaysAgo !== null) {
      const day = asOfDay - Math.max(1, plan.pauseStartDaysAgo - 2);
      const date = dateOfDayNumber(day);
      // Choose a session with head-room so this injection can never smuggle
      // in an UNDECLARED capacity violation alongside the declared ones.
      const session = dataset.classSessions.find((s) => {
        if (dateOfTimestamp(s.startsAt) !== date || s.status !== "completed") {
          return false;
        }
        const attendedHere = new Set(
          dataset.attendance
            .filter((a) => a.classSessionId === s.id && a.status === "attended")
            .map((a) => a.memberId),
        ).size;
        return attendedHere < s.capacity - 1;
      });
      if (session) {
        const id = nextAttendanceId();
        dataset.attendance.push({
          id,
          memberId: member.id,
          classSessionId: session.id,
          bookingId: null,
          status: "attended",
          recordedAt: session.startsAt,
        });
        declared.push({
          code: "attendance-outside-active-membership",
          entityId: id,
          detail: `attended ${date} while the membership was paused`,
        });
        declared.push({
          code: "truth-intent-mismatch",
          entityId: member.id,
          detail: "the paused-period injection shifts realized last-attended",
        });
      }
    }
  }

  // EC9 — one member attends two overlapping sessions. A new overlapping
  // session is added on the member's anchor date so quiet-days intent holds.
  {
    const idx = memberIndexByCohort("regular");
    const plan = idx >= 0 ? plans[idx] : undefined;
    const member = idx >= 0 ? dataset.members[idx] : undefined;
    if (plan && member && plan.anchorDaysAgo !== null) {
      const date = dateOfDayNumber(asOfDay - plan.anchorDaysAgo);
      const anchorRow = dataset.attendance.find(
        (a) =>
          a.memberId === member.id &&
          a.status === "attended" &&
          dateOfTimestamp(
            sessionById.get(a.classSessionId)?.startsAt ?? "1970-01-01T00:00:00",
          ) === date,
      );
      const anchorSession = anchorRow
        ? sessionById.get(anchorRow.classSessionId)
        : undefined;
      const template = dataset.classTypes[0];
      if (anchorSession && template) {
        const overlapping: SyntheticClassSession = {
          id: makeId("class-session", dataset.classSessions.length + 900001),
          classTypeId: template.id,
          instructorId: anchorSession.instructorId,
          startsAt: anchorSession.startsAt,
          durationMinutes: anchorSession.durationMinutes,
          capacity: template.capacity,
          status: "completed",
        };
        dataset.classSessions.push(overlapping);
        const id = nextAttendanceId();
        dataset.attendance.push({
          id,
          memberId: member.id,
          classSessionId: overlapping.id,
          bookingId: null,
          status: "attended",
          recordedAt: overlapping.startsAt,
        });
        declared.push({
          code: "overlapping-attendance",
          entityId: id,
          detail: "attends two sessions occupying the same time",
        });
      }
    }
  }

  // EC10 — a snapshot that contradicts the authoritative periods.
  {
    const idx = memberIndexByCohort("ordinary");
    const member = idx >= 0 ? dataset.members[idx] : undefined;
    if (member) {
      member.currentStatusSnapshot = "paused";
      declared.push({
        code: "snapshot-mismatch",
        entityId: member.id,
        detail: "snapshot says paused; the membership periods say active",
      });
    }
  }

  return declared;
}
