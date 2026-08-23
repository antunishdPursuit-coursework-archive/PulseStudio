/* Product A — the booking rules, with no DOM and no clock. Kerrian's lane.
 *
 * WHY THIS FILE EXISTS. Every rule on this page used to live inside main.ts
 * next to the innerHTML that rendered it, reading the clock and localStorage
 * for itself. Nothing could call a rule without a browser, so not one of the
 * brief's six acceptance checks was checked by anything — and the two clock
 * defects this split was made to fix (past classes still bookable, UTC
 * stamps in a studio-local field) had sat unnoticed for exactly that reason.
 *
 * Every function here takes what it needs as an argument: the sessions, the
 * generator's own bookings, the reservation log as already read, and "now"
 * as a studio-local timestamp string. A check can ask what the page would do
 * at 20:00 without waiting until 20:00. The page (main.ts) reads the log
 * and the clock ONCE per render and hands them in.
 *
 * Timestamps everywhere are YYYY-MM-DDTHH:MM:SS in the studio's zone with
 * no offset — the shared contract's shape — so two of them compare with a
 * plain string comparison and nothing here ever constructs a Date from one.
 */

import type { Reservation } from "../../shared/contract.js";
import type {
  SyntheticBooking,
  SyntheticClassSession,
  SyntheticMember,
} from "../../shared/synthetic/contracts.js";
import { latestReservation } from "./reservations.js";

/** Everything a rule may look at. Built once per render. */
export interface BookingContext {
  sessions: SyntheticClassSession[];
  bookings: SyntheticBooking[];
  rows: Reservation[];
  /** Studio-local now, YYYY-MM-DDTHH:MM:SS. */
  nowLocal: string;
}

/** The studio's wall clock as the contract writes it. `reserved_at` and
 *  `canceled_at` are defined studio-local with no offset, and the previous
 *  `toISOString().slice(0, 19)` wrote UTC into them — four hours ahead in
 *  summer, five in winter. Product D dates a reservation by the day in that
 *  string and drops anything dated after its own today, so a booking made
 *  after 20:00 vanished from D's activity line instead of merely reading
 *  wrong. `en-CA` formats as YYYY-MM-DD, the same dependency today.ts pins;
 *  `hourCycle: "h23"` keeps midnight at 00, not 24. */
export function studioNowTimestamp(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const at = (type: string): string => parts.find((part) => part.type === type)?.value ?? "00";
  return `${at("year")}-${at("month")}-${at("day")}T${at("hour")}:${at("minute")}:${at("second")}`;
}

/** The sessions a member may still act on: scheduled, and not yet started.
 *  The generator marks a session completed only once its DAY is past, so
 *  without the clock every class earlier today kept a live Book button all
 *  evening. Once a class has started it is gone from here, which takes it
 *  out of the day chips, the counts, "Your classes" and the Book button in
 *  one move, since all of them read this list. */
export function openSessions(ctx: BookingContext): SyntheticClassSession[] {
  return ctx.sessions
    .filter((session) => session.status === "scheduled" && session.startsAt > ctx.nowLocal)
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
}

export function sessionDate(session: SyntheticClassSession): string {
  return session.startsAt.slice(0, 10);
}

function studioBooked(ctx: BookingContext, sessionId: string): SyntheticBooking[] {
  return ctx.bookings.filter(
    (booking) => booking.classSessionId === sessionId && booking.status === "booked",
  );
}

/** Last row wins. A member with no runtime row falls back to the generator's
 *  own booking, which is how the studio's existing occupancy shows. */
export function memberStatus(
  ctx: BookingContext,
  memberId: string,
  sessionId: string,
): Reservation["reservation_status"] | "none" {
  const latest = latestReservation(ctx.rows, sessionId, memberId);
  if (latest) return latest.reservation_status;
  if (studioBooked(ctx, sessionId).some((booking) => booking.memberId === memberId)) return "reserved";
  return "none";
}

function memberIdsTouching(ctx: BookingContext, sessionId: string): string[] {
  const ids = new Set<string>();
  for (const booking of studioBooked(ctx, sessionId)) ids.add(booking.memberId);
  for (const row of ctx.rows) {
    if (row.session_id === sessionId) ids.add(row.member_id);
  }
  return [...ids];
}

export function confirmedMemberIds(ctx: BookingContext, sessionId: string): string[] {
  return memberIdsTouching(ctx, sessionId).filter(
    (memberId) => memberStatus(ctx, memberId, sessionId) === "reserved",
  );
}

export function remainingSpots(ctx: BookingContext, session: SyntheticClassSession): number {
  return Math.max(0, session.capacity - confirmedMemberIds(ctx, session.id).length);
}

/** Earliest waitlisted first — the promotion order. */
export function waitlist(ctx: BookingContext, sessionId: string): Reservation[] {
  return memberIdsTouching(ctx, sessionId)
    .map((memberId) => latestReservation(ctx.rows, sessionId, memberId))
    .filter((row): row is Reservation => row?.reservation_status === "waitlisted")
    .sort((left, right) => left.reserved_at.localeCompare(right.reserved_at));
}

/** Why this member may not take a seat, or null. The generator refuses to
 *  seat a paused or canceled membership (activeOn in generate.ts); this page
 *  was the one writer in the repo that did not, because it never read
 *  membership at all. The snapshot is validated against the periods as of
 *  the dataset's today, so it is the cheap and correct thing to read. */
export function membershipProblem(member: SyntheticMember): string | null {
  if (member.currentStatusSnapshot === "active") return null;
  return "Your membership is not active. The front desk can restart it.";
}

export interface Stamp {
  reservationId: string;
  at: string;
}

/** The reserved row for this member, or a thrown reason. Nothing is saved
 *  here; the caller appends what comes back. */
export function bookSession(
  ctx: BookingContext,
  member: SyntheticMember,
  session: SyntheticClassSession,
  stamp: Stamp,
): Reservation {
  const problem = membershipProblem(member);
  if (problem) throw new Error(problem);
  if (session.status !== "scheduled") throw new Error("This class is not open for reservations.");
  if (session.startsAt <= ctx.nowLocal) throw new Error("This class has already started.");
  const status = memberStatus(ctx, member.id, session.id);
  if (status === "reserved") throw new Error("You already have a spot in this class.");
  if (status === "waitlisted") throw new Error("You are already on the waitlist.");
  if (remainingSpots(ctx, session) <= 0) throw new Error("This class is full. Join the waitlist instead.");
  return {
    reservation_id: stamp.reservationId,
    member_id: member.id,
    session_id: session.id,
    reservation_status: "reserved",
    reserved_at: stamp.at,
    canceled_at: null,
  };
}

export function joinWaitlist(
  ctx: BookingContext,
  member: SyntheticMember,
  session: SyntheticClassSession,
  stamp: Stamp,
): Reservation {
  const problem = membershipProblem(member);
  if (problem) throw new Error(problem);
  if (session.status !== "scheduled") throw new Error("This class is not open for reservations.");
  if (session.startsAt <= ctx.nowLocal) throw new Error("This class has already started.");
  const status = memberStatus(ctx, member.id, session.id);
  if (status === "reserved") throw new Error("You already have a spot in this class.");
  if (status === "waitlisted") throw new Error("You are already on the waitlist.");
  if (remainingSpots(ctx, session) > 0) throw new Error("This class still has open spots. Book it instead.");
  return {
    reservation_id: stamp.reservationId,
    member_id: member.id,
    session_id: session.id,
    reservation_status: "waitlisted",
    reserved_at: stamp.at,
    canceled_at: null,
  };
}

/** The rows a cancellation appends, in order: the canceled row (REUSING the
 *  prior reservation_id — the folder brief records that as deliberate), then,
 *  when a reserved seat was freed, one reserved row for the earliest
 *  waitlisted member. `nextId` mints the promoted row's id only if one is
 *  needed. Returns at most two rows; a check pins that count. */
export function cancelReservation(
  ctx: BookingContext,
  memberId: string,
  sessionId: string,
  at: string,
  nextId: () => string,
): Reservation[] {
  const status = memberStatus(ctx, memberId, sessionId);
  if (status !== "reserved" && status !== "waitlisted") {
    throw new Error("No reservation found to cancel.");
  }
  const previous = latestReservation(ctx.rows, sessionId, memberId);
  const canceled: Reservation = {
    reservation_id: previous?.reservation_id ?? nextId(),
    member_id: memberId,
    session_id: sessionId,
    reservation_status: "canceled",
    reserved_at: previous?.reserved_at ?? at,
    canceled_at: at,
  };
  if (status !== "reserved") return [canceled];
  const next = waitlist(ctx, sessionId)[0];
  if (!next) return [canceled];
  return [
    canceled,
    { ...next, reservation_id: nextId(), reservation_status: "reserved", reserved_at: at, canceled_at: null },
  ];
}

/** The open sessions this member holds or waits on, in start order. */
export function memberReservations(
  ctx: BookingContext,
  memberId: string,
): { session: SyntheticClassSession; status: Reservation["reservation_status"] }[] {
  const held: { session: SyntheticClassSession; status: Reservation["reservation_status"] }[] = [];
  for (const session of openSessions(ctx)) {
    const status = memberStatus(ctx, memberId, session.id);
    if (status === "reserved" || status === "waitlisted") held.push({ session, status });
  }
  return held;
}

/** What to say when a `?session=<id>` link points at a class that is not on
 *  the open schedule. The id still resolves most days — the generator mints
 *  the same ids every day over a sliding window — so the usual miss is a
 *  class that has since started or completed, not an unknown id. Either
 *  way the page used to fall back to the first day in silence. */
export function staleDeepLinkMessage(
  ctx: BookingContext,
  requestedSessionId: string | null,
  shownDayLabel: string,
): string | null {
  if (!requestedSessionId) return null;
  if (openSessions(ctx).some((session) => session.id === requestedSessionId)) return null;
  return `That class is no longer on the schedule — showing ${shownDayLabel} instead.`;
}
