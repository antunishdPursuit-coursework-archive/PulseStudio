/* Product B — unit checks. Manny's lane.
 *
 * The dashboard had no suite at all until 2026-08-23: the only product
 * where a wrong number on the page could not turn anything red. These run
 * in the browser (open tests.html) and headlessly through
 * scripts/run-suites.mjs once that team-owned list names this page.
 *
 * Rules applied: known answers, not "it ran"; a near-miss on both sides of
 * every band edge (69/70, 89/90, 99/100); and the forbidden bugs — a
 * negative seat count, a waitlisted row holding a seat, a Full class in the
 * attention count, a dropped half-hour — each has a line that fails loudly.
 */

import {
  FILLING_SOON_AT, FULL_AT, UNDERBOOKED_BELOW,
  bookingDataLine, confirmedCount, formatSessionTime, needsAttention, nextActionText,
  emptyScheduleText, occupancy, publishedSessionProblem, reservationProblem, roomDemand,
  scheduleMatches, spotsLeftText, status,
} from "./dashboard.js";
import type { DashboardSession, RosterMember } from "./dashboard.js";

interface Result { name: string; passed: boolean; detail: string }
const results: Result[] = [];

function check(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  results.push({ name, passed: a === e, detail: a === e ? `= ${e}` : `expected ${e}, got ${a}` });
}

const member = (i: number, reservation_status: string): RosterMember => ({
  member_id: `m-${i}`, display_name: `Member ${i}`, reservation_status, attendance_status: "unknown",
});
/** A session of `capacity` seats with `reserved` confirmed rows plus any extras. */
const session = (capacity: number, reserved: number, extras: RosterMember[] = []): DashboardSession => ({
  capacity,
  roster: [...Array.from({ length: reserved }, (_, i) => member(i, "reserved")), ...extras],
});

// The bands are the numbers the page and the brief talk about.
check("underbooked band starts below 70", UNDERBOOKED_BELOW, 70);
check("filling-soon band starts at 90", FILLING_SOON_AT, 90);
check("full is 100", FULL_AT, 100);

// Only reserved rows hold a seat — the brief's riskiest boundary.
check("waitlisted rows never count as confirmed", confirmedCount(session(10, 3, [member(90, "waitlisted")])), 3);
check("canceled rows never count as confirmed", confirmedCount(session(10, 3, [member(91, "canceled")])), 3);
check("occupancy is a rounded percentage", occupancy(session(15, 10)), 67);

// Near-misses on both sides of every edge.
check("69% is Underbooked", status(session(100, 69)), "Underbooked");
check("70% is On track", status(session(100, 70)), "On track");
check("89% is On track", status(session(100, 89)), "On track");
check("90% is Filling soon", status(session(100, 90)), "Filling soon");
check("99% is Filling soon", status(session(100, 99)), "Filling soon");
check("100% is Full", status(session(100, 100)), "Full");
check("over capacity is still Full", status(session(10, 11)), "Full");

// The attention count matches its caption: underbooked or filling soon, not Full.
check("Underbooked needs attention", needsAttention(session(100, 50)), true);
check("Filling soon needs attention", needsAttention(session(100, 95)), true);
check("On track does not need attention", needsAttention(session(100, 80)), false);
check("Full does NOT need attention", needsAttention(session(100, 100)), false);

// Seats left: plural, singular, zero, and the over-capacity case stated out loud.
check("spots left pluralises", spotsLeftText(session(10, 7)), "3 spots left");
check("one spot left is singular", spotsLeftText(session(10, 9)), "1 spot left");
check("zero spots left", spotsLeftText(session(10, 10)), "0 spots left");
check("over capacity is stated, never negative", spotsLeftText(session(15, 16)), "0 spots left · 1 over capacity");

// The clock: studio wall time with no zone suffix, minutes kept, on any machine.
check("half-hour is kept", formatSessionTime("2026-08-20T18:30:00"), "Thu, Aug 20, 6:30 PM");
check("on the hour prints :00", formatSessionTime("2026-08-20T07:00:00"), "Thu, Aug 20, 7:00 AM");
check("an already-zoned stamp is not double-suffixed", formatSessionTime("2026-08-20T18:30:00Z"), "Thu, Aug 20, 6:30 PM");
check("the dialog's datetime-local value formats too", formatSessionTime("2026-08-24T09:15"), "Mon, Aug 24, 9:15 AM");

// The callout gives an action; the data line reports the source without a product letter.
check("next action: nothing scheduled", nextActionText([]), "0 sessions scheduled this week — add classes before publishing.");
check("next action: all healthy", nextActionText([session(10, 8)]), "1 session checked, 0 under 70% full — ready to publish.");
check("next action: one underbooked", nextActionText([session(10, 2), session(10, 9)]), "1 class under 70% full this week — review before publishing.");
check("next action: plural classes", nextActionText([session(10, 2), session(10, 1)]), "2 classes under 70% full this week — review before publishing.");
check("data line with nothing rejected", bookingDataLine(4, 1, []), "Member bookings from the booking app: 4 in this schedule, 1 outside it.");
check("data line names the first rejected row", bookingDataLine(0, 0, ["row 1: member_id must be a string", "row 2: x"]),
  "Member bookings from the booking app: 0 in this schedule, 0 outside it. 2 unreadable rows skipped (first: row 1: member_id must be a string).");
check("data line never carries a product letter", /Product [A-D]/.test(bookingDataLine(1, 1, ["x"])), false);

// Room demand groups by the room field instead of folding everything into Studio.
const studio = { ...session(10, 5), room: "Studio" };
const loft = { ...session(10, 9), room: "Loft" };
check("rooms are grouped and the busiest leads", roomDemand([studio, loft, { ...session(10, 2), room: "Studio" }]),
  [{ room: "Loft", peakFill: 90, sessions: 1 }, { room: "Studio", peakFill: 50, sessions: 2 }]);
check("no sessions means no rooms", roomDemand([]), []);

/* An empty list has two causes and the panel used to name only one of
 * them — "No sessions match this filter" for a week the studio has not
 * scheduled yet, which sends a staff member looking for a filter to
 * clear. */
check("a week with nothing scheduled says so, and does not blame a filter",
  emptyScheduleText(0, "September 13\u201319"), "0 classes scheduled for September 13\u201319.");
check("a filter that excluded everything says what it checked",
  emptyScheduleText(12, "August 23\u201329"), "12 sessions checked. None match this filter for August 23\u201329.");
check("one session checked reads as one, not 1 sessions",
  emptyScheduleText(1, "August 23\u201329"), "1 session checked. None match this filter for August 23\u201329.");

/* THE CHECK ABOVE CANNOT TELL THE TWO RULES APART. Loft is both the
 * busiest room and the first alphabetically, so it leads either way —
 * which `npm run mutate` proved by turning the comparator's `||` into
 * `&&`, making it sort by ROOM NAME and leaving every check green. These
 * two put the rules in conflict: Annex is quiet and sorts first, Loft is
 * busy and sorts last. A staff member reads this panel to find where the
 * demand is, so name order leading would be the wrong answer quietly. */
const annex = { ...session(10, 2), room: "Annex" };
check("a quiet room does not lead on its name alone",
  roomDemand([annex, loft]).map((row) => row.room), ["Loft", "Annex"]);
check("rooms level on demand fall back to name order",
  roomDemand([{ ...session(10, 5), room: "Zephyr" }, studio]).map((row) => row.room),
  ["Studio", "Zephyr"]);

/* THE SAME SCHEDULE-STALENESS GUARD Booking's own page has, on the read
 * side: this dashboard reads Booking's log defensively, but had no way to
 * tell a log stamped for TODAY from one left over from yesterday — proven
 * live: booking through the shared assistant, then opening this page
 * before Booking's own page had run today, showed the reservation
 * attached to whichever class currently sits at that session id, not the
 * one actually booked. scheduleMatches() is the one line staff-dashboard
 * checks before trusting the log at all. */
check("a log stamped for today's schedule is trusted", scheduleMatches("2026-08-18", "2026-08-18"), true);
check("a log stamped for another day is not evidence about today", scheduleMatches("2026-08-17", "2026-08-18"), false);
check("a log with no stamp at all is the same as the wrong stamp", scheduleMatches(null, "2026-08-18"), false);

/* THE TRUST BOUNDARY ON BOOKING'S LOG. reservationProblem() had never run
 * outside a real page load — staff-dashboard.ts reads document and
 * localStorage at module scope, so no suite could import it, the same
 * reason scheduleMatches() was pulled out above it on 2026-08-23. This is
 * the OTHER half of that same read: every field a hostile or merely stale
 * row could get wrong, one at a time. */
const knownMembers = new Set(["m-1", "m-2"]);
const knownSessions = new Set(["s-1", "s-2"]);
const soundReservation = {
  reservation_id: "r-1", member_id: "m-1", session_id: "s-1",
  reserved_at: "2026-08-18T09:00:00Z", reservation_status: "reserved", canceled_at: null,
};
check("a sound reservation row passes", reservationProblem(soundReservation, knownMembers, knownSessions), "");
check("a row that is not an object is refused", reservationProblem("m-1", knownMembers, knownSessions), "record must be an object");
check("an array is refused too, despite being typeof object", reservationProblem([], knownMembers, knownSessions), "record must be an object");
check("a missing required field is named", reservationProblem({ ...soundReservation, reservation_id: 7 }, knownMembers, knownSessions),
  "reservation_id must be a string");
check("a member outside the shared studio is refused",
  reservationProblem({ ...soundReservation, member_id: "ghost" }, knownMembers, knownSessions),
  "member_id must reference the shared studio");
check("a session outside the shared studio is refused",
  reservationProblem({ ...soundReservation, session_id: "ghost" }, knownMembers, knownSessions),
  "session_id must reference the shared studio");
check("an unrecognized reservation_status is refused",
  reservationProblem({ ...soundReservation, reservation_status: "pending" }, knownMembers, knownSessions),
  "reservation_status must be reserved, waitlisted, or canceled");
check("an unparsable reserved_at is refused",
  reservationProblem({ ...soundReservation, reserved_at: "not a date" }, knownMembers, knownSessions),
  "reserved_at must be a datetime");
check("canceled_at may be null", reservationProblem({ ...soundReservation, canceled_at: null }, knownMembers, knownSessions), "");
check("canceled_at may be a real datetime",
  reservationProblem({ ...soundReservation, canceled_at: "2026-08-19T09:00:00Z" }, knownMembers, knownSessions), "");
check("canceled_at cannot be a number", reservationProblem({ ...soundReservation, canceled_at: 1 }, knownMembers, knownSessions),
  "canceled_at must be a string or null");
check("canceled_at cannot be an unparsable string",
  reservationProblem({ ...soundReservation, canceled_at: "whenever" }, knownMembers, knownSessions),
  "canceled_at must be a datetime or null");

const soundLocalSession = {
  id: "local-3", type: "Yoga", level: "All levels", startsAt: "2026-08-25T18:30:00",
  time: "6:30 PM", room: "Loft", instructor: "Staff assigned", capacity: 12, roster: [],
};
check("a sound published session passes", publishedSessionProblem(soundLocalSession), "");
check("a published session that is not an object is refused, same as a runtime reservation row",
  publishedSessionProblem("local-3"), "record must be an object");
check("a session id must look locally minted, never a shared studio id",
  publishedSessionProblem({ ...soundLocalSession, id: "s-1" }), "id must be a local session id");
check("an unparsable startsAt is refused", publishedSessionProblem({ ...soundLocalSession, startsAt: "whenever" }),
  "startsAt must be a datetime");
check("capacity zero is refused — a class of zero seats is not a class", publishedSessionProblem({ ...soundLocalSession, capacity: 0 }),
  "capacity must be a positive integer");
check("capacity one is a real class, not a boundary violation", publishedSessionProblem({ ...soundLocalSession, capacity: 1 }), "");
check("a fractional capacity is refused", publishedSessionProblem({ ...soundLocalSession, capacity: 12.5 }),
  "capacity must be a positive integer");
check("a published session may never arrive pre-booked — the roster is built fresh from bookings, not trusted from storage",
  publishedSessionProblem({ ...soundLocalSession, roster: [{ member_id: "m-1" }] }), "roster must be an empty array");

const passed = results.filter((r) => r.passed).length;
const failed = results.length - passed;
const summaryEl = document.querySelector<HTMLParagraphElement>("#summary");
const listEl = document.querySelector<HTMLUListElement>("#results");
if (summaryEl && listEl) {
  summaryEl.textContent = `${results.length} checks run, ${passed} passed, ${failed} failed.`;
  summaryEl.classList.add(failed === 0 ? "all-good" : "has-failures");
  for (const r of results) {
    const li = document.createElement("li");
    li.className = r.passed ? "pass" : "fail";
    li.textContent = `${r.passed ? "PASS" : "FAIL"} — ${r.name} (${r.detail})`;
    listEl.append(li);
  }
}
