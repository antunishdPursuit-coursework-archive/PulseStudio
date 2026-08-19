/* Shared synthetic studio data — the authoritative contract. TEAM-OWNED.
 *
 * STATUS: PROPOSED. Built on the owner's direction; the other three product
 * owners still ratify it. Until they do, nothing outside app/shared/synthetic
 * depends on these types.
 *
 * One studio, one identity system, one normalized source of truth. Products
 * A-D consume these records through their own adapters, in their own lanes.
 * Dependency direction is one-way: this module never imports from a product.
 *
 * The position this contract takes on the ambiguity the legacy shared
 * contract left open:
 *
 *   MEMBERSHIP PERIODS ARE AUTHORITATIVE. A member's currentStatusSnapshot
 *   is a derived convenience — derived as of the dataset's asOfDate — and
 *   validation asserts it agrees with the periods. When they disagree, the
 *   periods win and the snapshot is the defect.
 *
 * Identity: every entity carries a stable, opaque, namespaced id
 * ("member:000042"). Names and emails are attributes, never keys.
 * Relationships are by id only — never by display name.
 *
 * Serialization order is part of the contract: every collection is sorted
 * by ascending id before output, so identical configurations reproduce
 * byte-for-byte and diffs are meaningful. "No event after asOfDate" means
 * OUTCOMES — attendance never post-dates the reference date; scheduled
 * future sessions and the bookings pointing at them are the studio's
 * forward calendar and are expected.
 *
 * Time: dates are strict YYYY-MM-DD. Timestamps are strict
 * YYYY-MM-DDTHH:MM:SS in STUDIO-LOCAL time; the timezone is stated once in
 * the dataset meta. No per-row offsets: one studio, one zone, deterministic
 * arithmetic, no daylight-saving surprises inside generated history.
 */

export type SyntheticMode = "clean" | "edge-cases" | "scale";

export type MembershipState = "active" | "paused" | "canceled";

/** Derived status can also be "none" — the date precedes the member's
 *  first period. Clean datasets never surface "none" at asOfDate. */
export type DerivedStatus = MembershipState | "none";

export type AttendanceStatus = "attended" | "no_show" | "unknown";

export interface SyntheticStudio {
  id: string; // studio:000001
  name: string;
  timezone: string;
  /** Maximum people the building holds across overlapping sessions. */
  facilityCapacity: number;
}

export interface SyntheticMember {
  id: string; // member:000001
  /** Attribute, never a key. Unicode preserved exactly as written. */
  displayName: string;
  /** Normalized lower-case, always a reserved .invalid address, or null
   *  (missing optional identifier is a supported, generated case). */
  email: string | null;
  joinedOn: string; // YYYY-MM-DD
  /** SNAPSHOT ONLY — derived from the membership periods as of the
   *  dataset's asOfDate. The periods are authoritative; validation
   *  asserts this field agrees with them. */
  currentStatusSnapshot: DerivedStatus;
}

/** One contiguous stretch of one membership state. A member's history is
 *  their periods sorted by startsOn: contiguous, non-overlapping, starting
 *  at joinedOn, with exactly one open (endsOn null) period. */
export interface MembershipPeriod {
  id: string; // membership:000001
  memberId: string;
  state: MembershipState;
  startsOn: string; // inclusive, YYYY-MM-DD
  endsOn: string | null; // exclusive; null = open-ended
  planName: string;
}

export interface SyntheticInstructor {
  id: string; // instructor:000001
  displayName: string;
}

export interface SyntheticClassType {
  id: string; // class-type:000001
  name: string;
  level: string;
  durationMinutes: number;
  capacity: number;
}

export interface SyntheticClassSession {
  id: string; // class-session:000001
  classTypeId: string;
  instructorId: string;
  startsAt: string; // YYYY-MM-DDTHH:MM:SS studio-local
  durationMinutes: number;
  capacity: number;
  status: "scheduled" | "completed" | "canceled";
}

export interface SyntheticPolicy {
  id: string; // policy:000001
  topic: string;
  answer: string;
  effectiveFrom: string; // YYYY-MM-DD
  updatedAt: string; // timestamp
  /** Exactly one current policy per topic; superseded versions stay, so
   *  the support surface can prove it answers from CURRENT policy only. */
  isCurrent: boolean;
}

export interface SyntheticBooking {
  id: string; // booking:000001
  memberId: string;
  classSessionId: string;
  bookedAt: string; // timestamp
  status: "booked" | "canceled";
}

export interface SyntheticAttendance {
  id: string; // attendance:000001
  memberId: string;
  classSessionId: string;
  /** null = walk-in: attended without a booking. */
  bookingId: string | null;
  status: AttendanceStatus;
  recordedAt: string; // timestamp
}

export interface DatasetMeta {
  generatorVersion: string;
  seed: string;
  asOfDate: string;
  timezone: string;
  mode: SyntheticMode;
  memberCount: number;
  historyDays: number;
  /** Records generated, by entity type. */
  counts: Record<string, number>;
  note: string;
}

export interface SyntheticDataset {
  meta: DatasetMeta;
  studio: SyntheticStudio;
  members: SyntheticMember[];
  memberships: MembershipPeriod[];
  instructors: SyntheticInstructor[];
  classTypes: SyntheticClassType[];
  classSessions: SyntheticClassSession[];
  bookings: SyntheticBooking[];
  attendance: SyntheticAttendance[];
  studioPolicies: SyntheticPolicy[];
}

/** A deliberately injected defect (edge-cases mode only), declared so the
 *  validator can be held to finding exactly these and nothing else. */
export interface DeclaredViolation {
  code: string;
  entityId: string;
  detail: string;
}

/** Expected truth, generated from CONSTRUCTION INTENT — never by importing
 *  a product's engine. Products consume the records; tests and reviewers
 *  additionally consume this, so it can catch product defects rather than
 *  repeat them.
 *
 *  expectedDashboardMetrics keys: activeMembers, pausedMembers,
 *  canceledMembers, upcomingScheduledSessions, completedSessions,
 *  totalBookings, totalAttendanceRecords, totalAttended, totalNoShows,
 *  peakSessionAttendance, currentPolicies, upcomingBookedSeats.
 */
export interface SyntheticTruth {
  memberCohorts: Record<string, string>;
  expectedCurrentMembershipStatus: Record<string, string>;
  /** Days since last attended class as of asOfDate. Members who have never
   *  attended are absent from this record. */
  expectedQuietDays: Record<string, number>;
  /** Attended classes in the 60 days up to and including the last visit —
   *  the evidence count a re-engagement surface should show. Same key rule
   *  as expectedQuietDays. */
  expectedPriorAttendance: Record<string, number>;
  /** The shared re-engagement policy, computed independently here:
   *  derived status is active AND quiet days > 14 AND <= 60. */
  expectedReengagementEligibility: Record<string, boolean>;
  expectedDashboardMetrics: Record<string, number>;
  /** Spots left per UPCOMING scheduled session (capacity minus active
   *  bookings) — the booking surface's known answers. */
  expectedUpcomingAvailability: Record<string, number>;
  declaredViolations: DeclaredViolation[];
}

export interface GeneratedStudioBundle {
  dataset: SyntheticDataset;
  truth: SyntheticTruth;
}

export const ID_PATTERN =
  /^(studio|member|membership|instructor|class-type|class-session|booking|attendance|policy):\d{6}$/;

export function makeId(
  kind:
    | "studio"
    | "member"
    | "membership"
    | "instructor"
    | "class-type"
    | "class-session"
    | "booking"
    | "attendance"
    | "policy",
  n: number,
): string {
  return `${kind}:${String(n).padStart(6, "0")}`;
}
