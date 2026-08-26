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
  occupancy, roomDemand, spotsLeftText, status, statusCount,
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
check("condition summary separates every fill-rate status", statusCount([
  session(100, 20), session(100, 80), session(100, 95), session(100, 100),
], "Underbooked"), 1);
check("condition summary counts On track separately", statusCount([
  session(100, 20), session(100, 80), session(100, 95), session(100, 100),
], "On track"), 1);
check("condition summary counts Filling soon separately", statusCount([
  session(100, 20), session(100, 80), session(100, 95), session(100, 100),
], "Filling soon"), 1);

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
