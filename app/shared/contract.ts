/* Pulse Studio — the shared data contract as TypeScript types.
   TEAM-OWNED: this file mirrors SHARED_DATA_CONTRACT.md, which is the law.
   If this file and that document ever disagree, STOP and raise it with the
   team — never improvise a fix in one product.
   All datetimes are ISO 8601 in the studio timezone (see fixtures.json). */

export type MembershipStatus = "active" | "paused" | "canceled" | "expired";

export interface Member {
  member_id: string;
  display_name: string;
  membership_status: MembershipStatus;
}

export interface Membership {
  membership_id: string;
  member_id: string;
  plan_name: string;
  status: MembershipStatus;
  started_on: string;
  renews_on: string | null;
  canceled_on: string | null;
}

export type SessionStatus = "scheduled" | "canceled" | "completed";

export interface ClassSession {
  session_id: string;
  class_type: string;
  level: string;
  instructor_id: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  session_status: SessionStatus;
}

export interface Instructor {
  instructor_id: string;
  display_name: string;
}

export type ReservationStatus = "reserved" | "waitlisted" | "canceled";

export interface Reservation {
  reservation_id: string;
  member_id: string;
  session_id: string;
  reservation_status: ReservationStatus;
  reserved_at: string;
  canceled_at: string | null;
}

export type AttendanceStatus = "attended" | "no_show" | "unknown";

export interface Attendance {
  attendance_id: string;
  member_id: string;
  session_id: string;
  attendance_status: AttendanceStatus;
  recorded_at: string;
}

export interface StudioPolicy {
  policy_id: string;
  topic: string;
  answer: string;
  effective_from: string;
  updated_at: string;
  is_current: boolean;
}

/* THE RECORDS ARE ONE VOCABULARY IN TWO FILES, AND THE TYPES SAY WHICH.
 *
 * Everything under app/ is served at a URL. So the records that NAME A
 * PERSON live in data/staff-records.json, outside app/, behind
 * /api/staff/records; the rest stay in app/shared/fixtures.json where any
 * visitor may read them.
 *
 * These are separate types because a single one LIED. FixtureSet used to
 * declare `members` while loadFixtures() had stopped returning them, so
 * `fixtures.members.map(...)` type-checked and threw in the browser — dead
 * quiet at compile time, broken on the screen. Split, the compiler catches
 * the read instead of the customer. */

/** What loadFixtures() returns: the timetable, who teaches, the policies.
    Public by design — this is what a member needs to browse and book. */
export interface PublicFixtures {
  timezone: string;
  note: string;
  instructors: Instructor[];
  class_sessions: ClassSession[];
  studio_policies: StudioPolicy[];
}

/** What /api/staff/records returns, to an authenticated staff session only.
    Every field here names a person. */
export interface StaffRecords {
  members: Member[];
  memberships: Membership[];
  reservations: Reservation[];
  attendance: Attendance[];
}

/** Both halves together — the studio's complete record set. The synthetic
    engine builds one of these, the fixture gate validates one, and nothing
    ever FETCHES one in a single request. */
export interface FixtureSet extends PublicFixtures, StaffRecords {}
