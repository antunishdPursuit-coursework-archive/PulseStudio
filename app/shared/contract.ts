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

export interface FixtureSet {
  timezone: string;
  note: string;
  members: Member[];
  memberships: Membership[];
  instructors: Instructor[];
  class_sessions: ClassSession[];
  reservations: Reservation[];
  attendance: Attendance[];
  studio_policies: StudioPolicy[];
}
