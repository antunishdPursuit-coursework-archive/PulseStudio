/* Product A — unit checks. Kerrian's lane.
 *
 * These run in the browser (open tests.html) and headlessly through the
 * suite runner, with ZERO clock dependence: every check pins "now" to a
 * fixed studio-local moment, so the same records give the same verdicts
 * forever. The shape follows Product D's tests.ts: known answers, not "it
 * ran", and near-misses on both sides of every boundary.
 *
 * What these hold, one for one, is the brief's acceptance list — which
 * shipped with nothing checking any line of it — plus the two clock rules
 * whose absence let real defects sit: a class that has started is not
 * bookable, and the log is stamped in the studio's zone, not UTC. */

import type { Reservation } from "../../shared/contract.js";
import type {
  SyntheticBooking,
  SyntheticClassSession,
  SyntheticMember,
} from "../../shared/synthetic/contracts.js";
import { setStorageForChecks } from "../../shared/storage.js";
import { latestReservation, loadRuntimeReservations, saveRuntimeReservations } from "./reservations.js";
import {
  type BookingContext,
  bookSession,
  cancelReservation,
  confirmedMemberIds,
  joinWaitlist,
  memberReservations,
  memberStatus,
  membershipProblem,
  openSessions,
  remainingSpots,
  staleDeepLinkMessage,
  studioNowTimestamp,
  waitlist,
} from "./rules.js";

const results: { name: string; passed: boolean; detail: string }[] = [];

function check(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  results.push({
    name,
    passed: a === e,
    detail: a === e ? `= ${e}` : `expected ${e}, got ${a}`,
  });
}

/** The refusal sentence, or "no error" — so a check pins WHICH guard fired. */
function refusal(run: () => unknown): string {
  try {
    run();
    return "no error";
  } catch (error: unknown) {
    return error instanceof Error ? error.message : "not an Error";
  }
}

/* ------------------------------------------------------------------ */
/* Deterministic records: the reference moment is 2026-08-18T12:00:00  */
/* studio-local. Sessions sit on both sides of it.                     */
/* ------------------------------------------------------------------ */

const NOW = "2026-08-18T12:00:00";

function member(id: string, status: SyntheticMember["currentStatusSnapshot"] = "active"): SyntheticMember {
  return { id, displayName: `Member ${id}`, email: null, joinedOn: "2026-01-05", currentStatusSnapshot: status };
}

function session(id: string, startsAt: string, capacity: number, status: SyntheticClassSession["status"] = "scheduled"): SyntheticClassSession {
  return { id, classTypeId: "class-type:000001", instructorId: "instructor:000001", startsAt, durationMinutes: 60, capacity, status };
}

function booking(memberId: string, classSessionId: string, status: SyntheticBooking["status"] = "booked"): SyntheticBooking {
  return { id: `booking:${memberId}:${classSessionId}`, memberId, classSessionId, bookedAt: "2026-08-17T09:00:00", status };
}

function row(memberId: string, sessionId: string, status: Reservation["reservation_status"], at: string, canceledAt: string | null = null): Reservation {
  return { reservation_id: `res-${memberId}-${sessionId}-${at}`, member_id: memberId, session_id: sessionId, reservation_status: status, reserved_at: at, canceled_at: canceledAt };
}

function ctxOf(sessions: SyntheticClassSession[], bookings: SyntheticBooking[] = [], rows: Reservation[] = [], nowLocal: string = NOW): BookingContext {
  return { sessions, bookings, rows, nowLocal };
}

const ada = member("member:000001");
const bea = member("member:000002");
const cyd = member("member:000003");

let idSeq = 0;
function nextId(): string {
  idSeq += 1;
  return `res-check-${idSeq}`;
}
function stampAt(at: string): { reservationId: string; at: string } {
  return { reservationId: nextId(), at };
}

/* ------------------------------------------------------------------ */
/* The schedule: only scheduled sessions, and only ones still to come  */
/* ------------------------------------------------------------------ */
{
  const later = session("class-session:000004", "2026-08-18T17:30:00", 10);
  const evening = session("class-session:000005", "2026-08-18T19:00:00", 10);
  const done = session("class-session:000001", "2026-08-17T08:00:00", 10, "completed");
  const off = session("class-session:000002", "2026-08-17T09:30:00", 10, "canceled");
  const morning = session("class-session:000003", "2026-08-18T08:00:00", 10);
  const ctx = ctxOf([evening, later, done, off, morning]);

  check("only scheduled, still-to-come sessions reach the calendar",
    openSessions(ctx).map((s) => s.id),
    ["class-session:000004", "class-session:000005"]);
  check("...sorted by start time even when handed out of order",
    openSessions(ctx)[0]?.startsAt, "2026-08-18T17:30:00");

  /* The defect this rule was written against: at noon, the 8:00 class
   * still carried a live Book button. Both boundary sides: */
  const atStart = ctxOf([morning], [], [], "2026-08-18T08:00:00");
  check("a class is off the schedule the second it starts",
    openSessions(atStart).length, 0);
  const justBefore = ctxOf([morning], [], [], "2026-08-18T07:59:59");
  check("...and on it one second before", openSessions(justBefore).length, 1);
  check("booking a started class is refused",
    refusal(() => bookSession(ctxOf([morning], [], [], NOW), ada, morning, stampAt(NOW))),
    "This class has already started.");
  check("the waitlist of a started class is closed too",
    refusal(() => joinWaitlist(ctxOf([morning], [], [], NOW), ada, morning, stampAt(NOW))),
    "This class has already started.");

  /* ON THE SECOND, not four hours after it. Both refusals above hand the
   * rules a class that started at 08:00 with the clock at noon, which is
   * true of `<` and `<=` alike — `npm run mutate` weakened both guards to
   * `<` and no check here objected. The schedule already drops a class at
   * its start time, so reaching this guard means a link, not the
   * calendar: a member opening yesterday's message at exactly 08:00:00
   * would have been let in. */
  check("booking is refused on the exact second the class starts",
    refusal(() => bookSession(atStart, ada, morning, stampAt("2026-08-18T08:00:00"))),
    "This class has already started.");
  check("...and so is the waitlist",
    refusal(() => joinWaitlist(atStart, ada, morning, stampAt("2026-08-18T08:00:00"))),
    "This class has already started.");
  check("...while one second earlier both still open",
    refusal(() => bookSession(justBefore, ada, morning, stampAt("2026-08-18T07:59:59"))),
    "no error");
}

/* ------------------------------------------------------------------ */
/* The studio clock: stamps are studio-local, never UTC                */
/* ------------------------------------------------------------------ */
{
  /* 23:30Z on Aug 18 is 19:30 in New York (EDT, UTC-4). The old
   * toISOString() stamp said 23:30 — a time Product D dated tomorrow and
   * silently dropped from its activity evidence. */
  check("summer: 23:30 UTC stamps as 19:30 studio time",
    studioNowTimestamp("America/New_York", new Date("2026-08-18T23:30:00Z")),
    "2026-08-18T19:30:00");
  check("winter: the offset is five hours, not a hardcoded four",
    studioNowTimestamp("America/New_York", new Date("2026-01-15T03:30:00Z")),
    "2026-01-14T22:30:00");
  check("midnight prints as 00, not 24",
    studioNowTimestamp("America/New_York", new Date("2026-08-19T04:00:00Z")),
    "2026-08-19T00:00:00");
}

/* ------------------------------------------------------------------ */
/* Booking: once, within capacity, and the record matches the contract */
/* ------------------------------------------------------------------ */
{
  const open = session("class-session:000010", "2026-08-19T09:00:00", 2);
  const ctx = ctxOf([open]);
  const first = bookSession(ctx, ada, open, { reservationId: "res-check-a", at: NOW });
  check("a member can reserve an available session",
    { member: first.member_id, session: first.session_id, status: first.reservation_status },
    { member: "member:000001", session: "class-session:000010", status: "reserved" });
  check("the reservation carries the contract's six fields",
    Object.keys(first).sort(),
    ["canceled_at", "member_id", "reservation_id", "reserved_at", "session_id"].concat(["reservation_status"]).sort());
  check("a fresh booking has no canceled_at", first.canceled_at, null);

  const after = ctxOf([open], [], [first]);
  check("repeating the booking does not create a duplicate",
    refusal(() => bookSession(after, ada, open, stampAt(NOW))),
    "You already have a spot in this class.");
  check("...and the log still holds one row", after.rows.length, 1);
  check("one seat of two is now taken", remainingSpots(after, open), 1);
}

/* ------------------------------------------------------------------ */
/* Capacity: generator bookings count, full refuses, never negative    */
/* ------------------------------------------------------------------ */
{
  const tight = session("class-session:000011", "2026-08-19T10:00:00", 2);
  const seeded = [booking("member:000008", tight.id), booking("member:000009", tight.id)];
  const ctx = ctxOf([tight], seeded);
  check("the generator's own bookings occupy seats", remainingSpots(ctx, tight), 0);
  check("a full session cannot receive a new reservation",
    refusal(() => bookSession(ctx, ada, tight, stampAt(NOW))),
    "This class is full. Join the waitlist instead.");
  check("a session that is not scheduled cannot either",
    refusal(() => bookSession(ctxOf([session("class-session:000012", "2026-08-19T11:00:00", 5, "canceled")], [], []), ada, session("class-session:000012", "2026-08-19T11:00:00", 5, "canceled"), stampAt(NOW))),
    "This class is not open for reservations.");
  /* A canceled runtime row overrides the generator's booking — last row
   * wins — and the freed seat comes back. */
  const freed = ctxOf([tight], seeded, [row("member:000008", tight.id, "canceled", NOW, NOW)]);
  check("canceling a seeded booking frees the seat", remainingSpots(freed, tight), 1);
  const over = ctxOf([tight], seeded.concat(booking("member:000007", tight.id)));
  check("spots never go negative when seeded past capacity", remainingSpots(over, tight), 0);

  /* EVERY BOOKING ABOVE BELONGS TO THIS SESSION, and that was the hole.
   * `npm run mutate` swapped the `&&` in studioBooked for `||` and no
   * check here noticed — because none of them ever handed the rules a
   * booking for a DIFFERENT class. With `||`, any booking anywhere in the
   * studio counts against this class's seats, and the member holding it
   * reads as reserved for a class they never booked. The tool could not
   * reach this suite at all until it learned to find its suites instead
   * of listing three by hand. */
  const elsewhere = session("class-session:000013", "2026-08-19T18:00:00", 2);
  const crossed = ctxOf([tight, elsewhere], [booking("member:000008", elsewhere.id)]);
  check("a booking in another class does not take a seat here",
    remainingSpots(crossed, tight), 2);
  check("...nor make that member reserved here",
    memberStatus(crossed, "member:000008", tight.id), "none");
  check("...while the class they did book still holds them",
    memberStatus(crossed, "member:000008", elsewhere.id), "reserved");
  check("...and this class's roster stays empty",
    confirmedMemberIds(crossed, tight.id), []);
}

/* ------------------------------------------------------------------ */
/* The waitlist: full class only, earliest first, promoted on cancel   */
/* ------------------------------------------------------------------ */
{
  const one = session("class-session:000013", "2026-08-19T12:00:00", 1);
  const base = [row(ada.id, one.id, "reserved", "2026-08-18T09:00:00")];
  check("an open class refuses the waitlist",
    refusal(() => joinWaitlist(ctxOf([one]), bea, one, stampAt(NOW))),
    "This class still has open spots. Book it instead.");
  const full = ctxOf([one], [], base);
  const queuedBea = joinWaitlist(full, bea, one, { reservationId: "res-check-w1", at: "2026-08-18T10:00:00" });
  const queuedCyd = joinWaitlist(ctxOf([one], [], base.concat(queuedBea)), cyd, one, { reservationId: "res-check-w2", at: "2026-08-18T11:00:00" });
  const rows = base.concat(queuedBea, queuedCyd);
  check("the waitlist orders by when members joined",
    waitlist(ctxOf([one], [], rows), one.id).map((r) => r.member_id),
    ["member:000002", "member:000003"]);
  check("a waitlisted member may not join twice",
    refusal(() => joinWaitlist(ctxOf([one], [], rows), bea, one, stampAt(NOW))),
    "You are already on the waitlist.");

  /* Cancel the held seat: exactly two rows come back — the canceled row
   * REUSING the prior reservation_id (deliberate, per the folder brief),
   * and one promotion for the EARLIEST waitlisted member. */
  idSeq = 100;
  const out = cancelReservation(ctxOf([one], [], rows), ada.id, one.id, NOW, nextId);
  check("cancel-then-promote appends exactly two rows", out.length, 2);
  check("the canceled row reuses the prior reservation_id",
    out[0]?.reservation_id, base[0]?.reservation_id);
  check("the canceled row records when", out[0]?.canceled_at, NOW);
  check("the earliest waitlisted member gets the seat",
    { member: out[1]?.member_id, status: out[1]?.reservation_status },
    { member: "member:000002", status: "reserved" });
  check("the promoted row gets a fresh id, not the canceled one",
    out[1]?.reservation_id === out[0]?.reservation_id, false);
  const settled = rows.concat(out);
  check("after promotion the class is exactly full again",
    remainingSpots(ctxOf([one], [], settled), one), 0);
  check("...held by the promoted member",
    confirmedMemberIds(ctxOf([one], [], settled), one.id), ["member:000002"]);

  /* Leaving the waitlist promotes nobody: one row, no second. */
  const left = cancelReservation(ctxOf([one], [], settled), cyd.id, one.id, NOW, nextId);
  check("canceling a waitlist spot promotes nobody", left.length, 1);
  check("with nothing to cancel, the refusal says so",
    refusal(() => cancelReservation(ctxOf([one], [], []), bea.id, one.id, NOW, nextId)),
    "No reservation found to cancel.");
}

/* ------------------------------------------------------------------ */
/* Membership: an inactive membership takes no seat                    */
/* ------------------------------------------------------------------ */
{
  const open = session("class-session:000014", "2026-08-19T09:00:00", 5);
  const fullSession = session("class-session:000015", "2026-08-19T10:00:00", 1);
  const fullRows = [row(ada.id, fullSession.id, "reserved", NOW)];
  const paused = member("member:000010", "paused");
  const canceledM = member("member:000012", "canceled");
  check("an active membership raises no problem", membershipProblem(ada), null);
  check("a paused membership cannot book",
    refusal(() => bookSession(ctxOf([open]), paused, open, stampAt(NOW))),
    "Your membership is not active. The front desk can restart it.");
  check("a canceled membership cannot join a waitlist",
    refusal(() => joinWaitlist(ctxOf([open, fullSession], [], fullRows), canceledM, fullSession, stampAt(NOW))),
    "Your membership is not active. The front desk can restart it.");
}

/* ------------------------------------------------------------------ */
/* Your classes: only this member's holds, in start order              */
/* ------------------------------------------------------------------ */
{
  const a = session("class-session:000016", "2026-08-19T09:00:00", 5);
  const b = session("class-session:000017", "2026-08-18T17:30:00", 1);
  const gone = session("class-session:000018", "2026-08-18T08:00:00", 5);
  const rows = [
    row(ada.id, a.id, "reserved", NOW),
    row(bea.id, a.id, "reserved", NOW),
    row(ada.id, b.id, "waitlisted", NOW),
    row(ada.id, gone.id, "reserved", "2026-08-17T09:00:00"),
  ];
  const ctx = ctxOf([a, b, gone], [], rows);
  check("the list holds only this member's reservations, in start order",
    memberReservations(ctx, ada.id).map((h) => ({ id: h.session.id, status: h.status })),
    [{ id: "class-session:000017", status: "waitlisted" }, { id: "class-session:000016", status: "reserved" }]);
  check("a class that already started is not listed as upcoming",
    memberReservations(ctx, ada.id).some((h) => h.session.id === gone.id), false);
  check("last row wins when a member cancels and rebooks",
    memberStatus(ctxOf([a], [], [
      row(ada.id, a.id, "reserved", "2026-08-18T09:00:00"),
      row(ada.id, a.id, "canceled", "2026-08-18T10:00:00", "2026-08-18T10:00:00"),
      row(ada.id, a.id, "reserved", "2026-08-18T11:00:00"),
    ]), ada.id, a.id),
    "reserved");
  check("latestReservation reads the last matching row",
    latestReservation([
      row(ada.id, a.id, "reserved", "2026-08-18T09:00:00"),
      row(ada.id, a.id, "canceled", "2026-08-18T10:00:00", "2026-08-18T10:00:00"),
    ], a.id, ada.id)?.reservation_status,
    "canceled");
}

/* ------------------------------------------------------------------ */
/* The deep link: a miss is stated, never silent                       */
/* ------------------------------------------------------------------ */
{
  const open = session("class-session:000019", "2026-08-19T09:00:00", 5);
  const done = session("class-session:000020", "2026-08-17T09:00:00", 5, "completed");
  const ctx = ctxOf([open, done]);
  check("a link to an open class says nothing extra",
    staleDeepLinkMessage(ctx, open.id, "Today"), null);
  check("a link to a finished class states the miss and the fallback",
    staleDeepLinkMessage(ctx, done.id, "Tomorrow"),
    "That class is no longer on the schedule — showing Tomorrow instead.");
  check("a link to an id the studio never minted states the same miss",
    staleDeepLinkMessage(ctx, "class-session:999999", "Today"),
    "That class is no longer on the schedule — showing Today instead.");
  check("no link, no message", staleDeepLinkMessage(ctx, null, "Today"), null);
}

/* ------------------------------------------------------------------ */
/* Storage: a browser that refuses site data is reported, not thrown   */
/* ------------------------------------------------------------------ */
{
  /* The write used to be a bare localStorage.setItem, so a blocked store
   * threw a DOMException out of the Book click. Through the shared proof
   * seam: a store that throws on every door must come back as "not saved"
   * and "nothing stored", never as an exception. */
  const blocked = {
    getItem(): string | null { throw new Error("blocked"); },
    setItem(): void { throw new Error("blocked"); },
    removeItem(): void { throw new Error("blocked"); },
  };
  setStorageForChecks(blocked);
  check("a refused write reports false instead of throwing",
    refusal(() => check("...the save call itself", saveRuntimeReservations([]), false)),
    "no error");
  check("a blocked read reports an empty log",
    refusal(() => check("...the load call itself", loadRuntimeReservations(), [])),
    "no error");
  setStorageForChecks(null);
}

/* EVERY CHECK MUST RUN BEFORE THE VERDICT IS COUNTED — new blocks go
 * ABOVE here, for the same reason D's suite says so: a block appended
 * below this line grows `results` after `passed` was read, and the page
 * reports green over failures. */
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

// Also state the verdict where a terminal can read it.
console.log(`member booking checks: ${results.length} run, ${passed} passed, ${failed} failed`);
for (const r of results.filter((x) => !x.passed)) {
  console.error(`FAIL: ${r.name} — ${r.detail}`);
}
