/* Product D — the RUNNING studio as this product's records. Rensley's lane.
 *
 * THE LIVE TRAIL: the default records on this page are no longer the
 * 5-member starter fixture — they are the running studio itself: the same
 * cached dataset Booking books against and the top-bar sign-in lists,
 * with Booking's own reservation log merged in. One studio, one trail,
 * every product reading the same records it writes.
 *
 * fixtureSetFrom() is PURE (dataset in, contract records out) so the unit
 * checks hold it to known answers; only readRuntimeReservations() touches
 * the browser, defensively — a corrupt log degrades to [] and never
 * breaks the page.
 */

import type {
  Attendance,
  ClassSession,
  FixtureSet,
  Instructor,
  Member,
  MembershipStatus,
  Reservation,
  StudioPolicy,
  SyntheticDataset,
} from "./deps.js";

/* Booking's PUBLISHED seam: the append-only, contract-shaped Reservation
 * log it writes (documented in a-booking/reservations.ts and both team
 * briefs). The key name is contract. Reading it — never importing another
 * product's code — is how "D has all that info" becomes true. */
export const BOOKING_LOG_KEY = "pulse-reservations-a";

const RESERVATION_STATUSES: ReadonlySet<string> = new Set([
  "reserved",
  "waitlisted",
  "canceled",
]);

function isReservation(value: unknown): value is Reservation {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r["reservation_id"] === "string" &&
    typeof r["member_id"] === "string" &&
    typeof r["session_id"] === "string" &&
    typeof r["reservation_status"] === "string" &&
    RESERVATION_STATUSES.has(r["reservation_status"] as string) &&
    typeof r["reserved_at"] === "string" &&
    (r["canceled_at"] === null || typeof r["canceled_at"] === "string")
  );
}

/** Parse the raw log defensively: junk is [], and every surviving row is a
 *  WHOLE contract Reservation — a half-row never sneaks into evidence. */
export function parseRuntimeReservations(raw: string | null): Reservation[] {
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isReservation);
  } catch {
    return [];
  }
}

export function readRuntimeReservations(): Reservation[] {
  try {
    return parseRuntimeReservations(localStorage.getItem(BOOKING_LOG_KEY));
  } catch {
    return []; // storage unavailable — the studio still renders
  }
}

/** The running studio in this product's contract vocabulary.
 *
 *  Mapping rules, each deliberate:
 *  - Order is preserved everywhere, and runtime reservations append AFTER
 *    the dataset's own bookings — the same last-row-wins reading Booking
 *    itself uses, so a cancel releases a spot here too.
 *  - A synthetic person whose status snapshot is "none" never held a
 *    membership: that is onboarding's concern, not re-engagement's, so
 *    they are left out rather than dressed in a status they never had.
 *    (Clean datasets never surface "none" at asOfDate — the guard exists
 *    for honesty, not because it fires.)
 *  - ends_at repeats starts_at: duration is not modeled in this product,
 *    nothing here reads ends_at, and inventing an end time would be a
 *    claim the records don't make. */
export function fixtureSetFrom(
  dataset: SyntheticDataset,
  runtimeReservations: Reservation[],
): FixtureSet {
  const typeById = new Map(dataset.classTypes.map((t) => [t.id, t]));

  const members: Member[] = [];
  for (const m of dataset.members) {
    if (m.currentStatusSnapshot === "none") continue;
    members.push({
      member_id: m.id,
      display_name: m.displayName,
      membership_status: m.currentStatusSnapshot as MembershipStatus,
    });
  }

  const instructors: Instructor[] = dataset.instructors.map((i) => ({
    instructor_id: i.id,
    display_name: i.displayName,
  }));

  const class_sessions: ClassSession[] = dataset.classSessions.map((s) => ({
    session_id: s.id,
    class_type: typeById.get(s.classTypeId)?.name ?? "class",
    level: typeById.get(s.classTypeId)?.level ?? "all levels",
    instructor_id: s.instructorId,
    starts_at: s.startsAt,
    ends_at: s.startsAt,
    capacity: s.capacity,
    session_status: s.status,
  }));

  const reservations: Reservation[] = [
    ...dataset.bookings.map(
      (b): Reservation => ({
        reservation_id: b.id,
        member_id: b.memberId,
        session_id: b.classSessionId,
        reservation_status: b.status === "booked" ? "reserved" : "canceled",
        reserved_at: b.bookedAt,
        canceled_at: null,
      }),
    ),
    ...runtimeReservations,
  ];

  const attendance: Attendance[] = dataset.attendance.map((a) => ({
    attendance_id: a.id,
    member_id: a.memberId,
    session_id: a.classSessionId,
    attendance_status: a.status,
    recorded_at: a.recordedAt,
  }));

  const studio_policies: StudioPolicy[] = dataset.studioPolicies.map((p) => ({
    policy_id: p.id,
    topic: p.topic,
    answer: p.answer,
    effective_from: p.effectiveFrom,
    updated_at: p.updatedAt,
    is_current: p.isCurrent,
  }));

  return {
    timezone: dataset.meta.timezone,
    note: "The running studio — the same records Booking writes.",
    members,
    memberships: [], // status lives on each member's snapshot in this trail
    instructors,
    class_sessions,
    reservations,
    attendance,
    studio_policies,
  };
}
