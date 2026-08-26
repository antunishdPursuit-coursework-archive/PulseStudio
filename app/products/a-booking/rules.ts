/* Booking rules Product A applies, as plain functions the suite can call
   without the page. Occupancy is last-row-wins over the runtime log,
   unioned with the generator's own booked rows. Waitlist is only when
   the class is full. */

import type { Reservation } from "../../shared/contract.js";
import { counted } from "../../shared/text.js";
import { latestReservation } from "./reservations.js";

export function heldStatus(
  rows: readonly Reservation[],
  sessionId: string,
  memberId: string,
  studioBookedMemberIds: readonly string[] = [],
): Reservation["reservation_status"] | "none" {
  const latest = latestReservation(rows, sessionId, memberId);
  if (latest) return latest.reservation_status;
  if (studioBookedMemberIds.includes(memberId)) return "reserved";
  return "none";
}

export function reservedMemberIds(
  rows: readonly Reservation[],
  sessionId: string,
  studioBookedMemberIds: readonly string[] = [],
): string[] {
  const ids = new Set<string>(studioBookedMemberIds);
  for (const row of rows) {
    if (row.session_id === sessionId) ids.add(row.member_id);
  }
  return [...ids].filter(
    (id) => heldStatus(rows, sessionId, id, studioBookedMemberIds) === "reserved",
  );
}

export function spotsLeft(capacity: number, reservedCount: number): number {
  return Math.max(0, capacity - reservedCount);
}

export function waitlistedInOrder(
  rows: readonly Reservation[],
  sessionId: string,
  studioBookedMemberIds: readonly string[] = [],
): Reservation[] {
  const ids = new Set<string>(studioBookedMemberIds);
  for (const row of rows) {
    if (row.session_id === sessionId) ids.add(row.member_id);
  }
  return [...ids]
    .map((id) => latestReservation(rows, sessionId, id))
    .filter((row): row is Reservation => row?.reservation_status === "waitlisted")
    .sort((left, right) => left.reserved_at.localeCompare(right.reserved_at));
}

export function bookRefusal(
  sessionStatus: string,
  memberHeld: Reservation["reservation_status"] | "none",
  remaining: number,
): string | null {
  if (sessionStatus === "canceled") return "This class was canceled.";
  if (sessionStatus !== "scheduled") return "This class is not open for reservations.";
  if (memberHeld === "reserved") return "You already have a spot in this class.";
  if (memberHeld === "waitlisted") return "You are already on the waitlist.";
  if (remaining <= 0) return "This class is full. Join the waitlist instead.";
  return null;
}

export function waitlistRefusal(
  sessionStatus: string,
  memberHeld: Reservation["reservation_status"] | "none",
  remaining: number,
): string | null {
  if (sessionStatus !== "scheduled") return "This class is not open for reservations.";
  if (memberHeld === "reserved") return "You already have a spot in this class.";
  if (memberHeld === "waitlisted") return "You are already on the waitlist.";
  if (remaining > 0) return "This class still has open spots. Book it instead.";
  return null;
}

/** Empty when nothing was let go. Trailing space so the live status can
 *  prefix it onto the schedule count without a glue ternary. */
export function letGoLine(dropped: number): string {
  if (dropped === 0) return "";
  const verb = dropped === 1 ? "was" : "were";
  return `${counted(dropped, "reservation")} from another studio date ${verb} let go. `;
}

/** The current answer for a topic, or null when none is current.
 *  A superseded row with the same topic is not this — there is one
 *  current cancellation policy, and Cancel has to show that one. */
export function currentPolicyAnswer(
  policies: readonly { topic: string; answer: string; isCurrent: boolean }[],
  topic: string,
): string | null {
  return policies.find((policy) => policy.topic === topic && policy.isCurrent)?.answer ?? null;
}
