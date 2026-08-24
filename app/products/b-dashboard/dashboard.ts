/* Product B — the dashboard's arithmetic, lifted out of staff-dashboard.js.
 *
 * WHY THIS FILE EXISTS. staff-dashboard.js is hand-written JavaScript that
 * no gate type-checks and, until 2026-08-23, no suite reached. Three of its
 * defects were found by reading, not by a check: session times printed
 * without their minutes (a 6:30 class showed "6 PM"), an over-capacity
 * session showed "-1 spots left", and "Needs attention" counted Full
 * sessions while its caption said "underbooked or filling soon". Every rule
 * here is pure — records in, strings or numbers out — so tests.ts can pin
 * each one at its boundary. The page keeps its DOM wiring in the .js file
 * and imports these.
 */

import { counted } from "../../shared/text.js";

/** The fill-rate bands. The three numbers were hardcoded twice in the
 *  page (status() and the filter) and nowhere else; the product brief
 *  still lists the threshold as an open decision. Until the team ratifies
 *  different ones, these are them — and this is the one place they live. */
export const UNDERBOOKED_BELOW = 70;
export const FILLING_SOON_AT = 90;
export const FULL_AT = 100;

export type SessionStatus = "Underbooked" | "On track" | "Filling soon" | "Full";

export interface RosterMember {
  member_id: string;
  display_name: string;
  reservation_status: string;
  attendance_status: string;
}

export interface DashboardSession {
  capacity: number;
  roster: RosterMember[];
}

/** Only `reserved` rows hold a seat: waitlisted and canceled never count,
 *  which is the product brief's "riskiest boundary". */
export function confirmedCount(session: DashboardSession): number {
  return session.roster.filter((member) => member.reservation_status === "reserved").length;
}

export function occupancy(session: DashboardSession): number {
  return Math.round((confirmedCount(session) / session.capacity) * 100);
}

export function status(session: DashboardSession): SessionStatus {
  const fill = occupancy(session);
  if (fill >= FULL_AT) return "Full";
  if (fill >= FILLING_SOON_AT) return "Filling soon";
  if (fill < UNDERBOOKED_BELOW) return "Underbooked";
  return "On track";
}

/** "Needs attention" means a staff person can still do something: promote
 *  an underbooked class or watch one about to fill. A Full class needs no
 *  action and has its own filter, so it is not in this set. The count
 *  above the list and the filter on the list both use this, so they can
 *  never disagree again. */
export function needsAttention(session: DashboardSession): boolean {
  const label = status(session);
  return label === "Underbooked" || label === "Filling soon";
}

/** Seats left, never negative. An over-capacity roster can arrive from the
 *  booking app's storage seam (a stale tab, or a second browser that saw
 *  the class as open), and the page used to print the raw subtraction:
 *  "-1 spots left". Staff need the fact stated, not a number that cannot
 *  be true. */
export function spotsLeftText(session: DashboardSession): string {
  const remaining = session.capacity - confirmedCount(session);
  if (remaining >= 0) return `${counted(remaining, "spot")} left`;
  return `0 spots left · ${-remaining} over capacity`;
}

/** The generator writes wall-clock studio time with no zone suffix
 *  ("2026-08-20T18:30:00"). `new Date()` on that reads it as the VIEWER's
 *  local time, and the old formatter then converted that into the studio's
 *  zone — so anyone outside America/New_York saw every class shifted by the
 *  difference. Pinning a Z and printing in UTC gives the wall clock back
 *  unchanged on every machine, the same way the booking app does it. The
 *  old formatter also asked for no minutes, so 18:30 printed as "6 PM". */
const sessionTimeFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC",
});
export function formatSessionTime(startsAt: string): string {
  const wallClock = /Z$|[+-]\d\d:\d\d$/.test(startsAt) ? startsAt : `${startsAt}Z`;
  return sessionTimeFormatter.format(new Date(wallClock));
}

/** What the "next action" callout should say: a real instruction driven by
 *  this week's numbers, never a data-source report (that moved to its own
 *  line under the capacity panel). */
export function nextActionText(sessions: DashboardSession[]): string {
  const underbooked = sessions.filter((session) => status(session) === "Underbooked").length;
  if (sessions.length === 0) return "0 sessions scheduled this week — add classes before publishing.";
  if (underbooked === 0) return `${counted(sessions.length, "session")} checked, 0 under ${UNDERBOOKED_BELOW}% full — ready to publish.`;
  return `${counted(underbooked, "class", "classes")} under ${UNDERBOOKED_BELOW}% full this week — review before publishing.`;
}

/** What the schedule panel says when it has nothing to show.
 *
 *  TWO REASONS, AND THEY ARE NOT THE SAME FACT: a week the studio has not
 *  scheduled yet, and a filter that excluded everything. The panel said
 *  "No sessions match this filter" for both, so a staff member looking at
 *  a week past the end of the schedule read it as "you filtered these
 *  out" and went hunting for a filter to clear. The room panel beside it
 *  has always said "no sessions scheduled for <week>"; this is the same
 *  sentence for the list. */
export function emptyScheduleText(checked: number, weekLabel: string): string {
  if (checked === 0) return `0 classes scheduled for ${weekLabel}.`;
  return `${counted(checked, "session")} checked. None match this filter for ${weekLabel}.`;
}

/** The line that used to sit in the callout, now worded for a staff reader:
 *  no product letter, and the rejected count reads as English. */
export function bookingDataLine(shown: number, outside: number, rejected: string[]): string {
  const tail = rejected.length === 0 ? "" : ` ${counted(rejected.length, "unreadable row")} skipped (first: ${rejected[0]}).`;
  return `Member bookings from the booking app: ${shown} in this schedule, ${outside} outside it.${tail}`;
}

/** Group sessions by room, busiest first. Generator sessions carry no room
 *  and default to "Studio"; a class added in the dialog carries the room
 *  typed there. The panel used to fold every room into one row labelled
 *  Studio, so a Loft class was reported as Studio demand. */
export interface RoomDemand { room: string; peakFill: number; sessions: number }
export function roomDemand(sessions: (DashboardSession & { room: string })[]): RoomDemand[] {
  const byRoom = new Map<string, RoomDemand>();
  for (const session of sessions) {
    const row = byRoom.get(session.room) ?? { room: session.room, peakFill: 0, sessions: 0 };
    row.peakFill = Math.max(row.peakFill, occupancy(session));
    row.sessions += 1;
    byRoom.set(session.room, row);
  }
  return [...byRoom.values()].sort((a, b) => b.peakFill - a.peakFill || a.room.localeCompare(b.room));
}

/** Whether Booking's reservation log is stamped for THIS studio date —
 *  pulled out as its own pure check so it can be pinned by a test, unlike
 *  the localStorage read around it in staff-dashboard.ts, which cannot be
 *  imported into a suite without running that page's whole boot sequence.
 *
 *  Session ids are positions in a window that slides at midnight, so a
 *  row this log holds from yesterday can point at a DIFFERENT class today
 *  — measured elsewhere in this repo: every future class changed type
 *  under its own id one day later. A staff member who opens this
 *  dashboard before Booking's own page has run today would otherwise see
 *  a member's reservation attached to whichever class now happens to sit
 *  at that id, not the one they actually booked. `storedDate === null`
 *  (no stamp at all — every log written before the stamp existed) is
 *  treated the same as a mismatch. */
export function scheduleMatches(storedDate: string | null, asOfDate: string): boolean {
  return storedDate === asOfDate;
}
