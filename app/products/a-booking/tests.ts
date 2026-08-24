/* Class booking checks. Kerrian's lane.
 *
 * Every check asks for an exact answer from the rules and the storage
 * seam, so a full class that still accepts Book, a waitlist on an open
 * class, a cancel that still holds a seat, or yesterday's session ids
 * resolved against today's schedule, each has a line that turns to FAIL.
 */

import type { Reservation } from "../../shared/contract.js";
import { setStorageForChecks } from "../../shared/storage.js";
import {
  RUNTIME_KEY,
  SCHEDULE_KEY,
  latestReservation,
  loadRuntimeReservations,
  loadScheduleReservations,
  readScheduleStamp,
  reconcileSchedule,
  reservationsForSchedule,
  saveRuntimeReservations,
} from "./reservations.js";
import {
  bookRefusal,
  heldStatus,
  letGoLine,
  reservedMemberIds,
  spotsLeft,
  waitlistRefusal,
  waitlistedInOrder,
} from "./rules.js";

interface Result { name: string; passed: boolean; detail: string }
const results: Result[] = [];

function check(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  results.push({ name, passed: a === e, detail: a === e ? `= ${e}` : `expected ${e}, got ${a}` });
}

function row(
  memberId: string,
  sessionId: string,
  status: Reservation["reservation_status"],
  reservedAt = "2026-08-24T12:00:00",
  reservationId = `res-${memberId}-${sessionId}-${status}`,
): Reservation {
  return {
    reservation_id: reservationId,
    member_id: memberId,
    session_id: sessionId,
    reservation_status: status,
    reserved_at: reservedAt,
    canceled_at: status === "canceled" ? "2026-08-24T13:00:00" : null,
  };
}

function memoryStore(initial: Record<string, string> = {}) {
  const data: Record<string, string> = { ...initial };
  return {
    data,
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
    removeItem: (key: string) => {
      delete data[key];
    },
  };
}

const reserved = row("m1", "s1", "reserved");
const canceled = row("m1", "s1", "canceled", "2026-08-24T12:05:00");
const waitlisted = row("m2", "s1", "waitlisted");
const otherClass = row("m1", "s2", "reserved");

check("last row wins: a later cancel is the held status", heldStatus([reserved, canceled], "s1", "m1"), "canceled");
check("last row wins: a cancel then a rebook is reserved", heldStatus([reserved, canceled, row("m1", "s1", "reserved", "2026-08-24T14:00:00")], "s1", "m1"), "reserved");
check("a cancel releases the seat", reservedMemberIds([reserved, canceled], "s1"), []);
check("a reserved row still holds a seat after someone else cancels", reservedMemberIds([reserved, row("m3", "s1", "canceled")], "s1"), ["m1"]);
check("waitlisted rows never count as reserved", reservedMemberIds([reserved, waitlisted], "s1"), ["m1"]);
check("another class's row does not take this class's seat", reservedMemberIds([reserved, otherClass], "s1"), ["m1"]);
check("generator bookings union with the log", reservedMemberIds([waitlisted], "s1", ["m-studio"]), ["m-studio"]);
check("a runtime cancel of a generator booking releases that seat", reservedMemberIds([row("m-studio", "s1", "canceled")], "s1", ["m-studio"]), []);

check("spots left on an empty class", spotsLeft(12, 0), 12);
check("spots left after one reserved", spotsLeft(12, 1), 11);
check("a full class has 0 spots", spotsLeft(1, 1), 0);
check("over capacity is stated as 0, never negative", spotsLeft(10, 11), 0);

check("duplicate book is refused", bookRefusal("scheduled", "reserved", 4), "You already have a spot in this class.");
check("a waitlisted member cannot book the same class", bookRefusal("scheduled", "waitlisted", 0), "You are already on the waitlist.");
check("book is refused when the class is full", bookRefusal("scheduled", "none", 0), "This class is full. Join the waitlist instead.");
check("book is refused on a canceled class", bookRefusal("canceled", "none", 4), "This class was canceled.");
check("book is allowed when a spot remains", bookRefusal("scheduled", "none", 1), null);

check("waitlist is refused while spots remain", waitlistRefusal("scheduled", "none", 1), "This class still has open spots. Book it instead.");
check("waitlist is allowed only when full", waitlistRefusal("scheduled", "none", 0), null);
check("waitlist is refused if already reserved", waitlistRefusal("scheduled", "reserved", 0), "You already have a spot in this class.");
check("waitlist is refused if already queued", waitlistRefusal("scheduled", "waitlisted", 0), "You are already on the waitlist.");

check("waitlist order follows reserved_at", waitlistedInOrder([
  row("m-late", "s1", "waitlisted", "2026-08-24T12:10:00"),
  row("m-early", "s1", "waitlisted", "2026-08-24T12:01:00"),
], "s1").map((item) => item.member_id), ["m-early", "m-late"]);
check("latestReservation is the last matching row", latestReservation([reserved, canceled], "s1", "m1")?.reservation_status, "canceled");

check("a log stamped for today's schedule is kept", reservationsForSchedule([reserved], "2026-08-24", "2026-08-24"), [reserved]);
check("a log stamped for another day is not evidence about today", reservationsForSchedule([reserved], "2026-08-23", "2026-08-24"), []);
check("a log with no stamp at all is the same as the wrong stamp", reservationsForSchedule([reserved], null, "2026-08-24"), []);
check("no rows, no stamp needed", reservationsForSchedule([], null, "2026-08-24"), []);

check("one reservation let go is singular", letGoLine(1), "1 reservation from another studio date was let go. ");
check("several reservations let go are plural", letGoLine(2), "2 reservations from another studio date were let go. ");
check("nothing let go is an empty line", letGoLine(0), "");

const matching = memoryStore({
  [RUNTIME_KEY]: JSON.stringify([reserved]),
  [SCHEDULE_KEY]: "2026-08-24",
});
setStorageForChecks(matching);
check("matching stamp keeps the log on load", reconcileSchedule("2026-08-24"), { dropped: 0, cleared: true });
check("matching stamp leaves the rows in place", loadRuntimeReservations(), [reserved]);
check("schedule-scoped load returns today's rows", loadScheduleReservations("2026-08-24"), [reserved]);

const stale = memoryStore({
  [RUNTIME_KEY]: JSON.stringify([reserved, waitlisted]),
  [SCHEDULE_KEY]: "2026-08-23",
});
setStorageForChecks(stale);
check("a moved date lets the log go", reconcileSchedule("2026-08-24"), { dropped: 2, cleared: true });
check("the log is empty after a date move", loadRuntimeReservations(), []);
check("today's date is stamped after a date move", readScheduleStamp(), "2026-08-24");

const unstamped = memoryStore({
  [RUNTIME_KEY]: JSON.stringify([reserved]),
});
setStorageForChecks(unstamped);
check("an unstamped log is let go", reconcileSchedule("2026-08-24"), { dropped: 1, cleared: true });
check("an unstamped log is cleared", loadRuntimeReservations(), []);

const emptyUnstamped = memoryStore();
setStorageForChecks(emptyUnstamped);
check("empty unstamped storage is only dated", reconcileSchedule("2026-08-24"), { dropped: 0, cleared: true });
check("empty unstamped storage does not write an empty log", Object.hasOwn(emptyUnstamped.data, RUNTIME_KEY), false);
check("empty unstamped storage still stamps today", readScheduleStamp(), "2026-08-24");

const written = memoryStore();
setStorageForChecks(written);
check("a successful save reports true", saveRuntimeReservations([reserved], "2026-08-24"), true);
check("a successful save writes the array log", loadRuntimeReservations(), [reserved]);
check("a successful save stamps today's date", readScheduleStamp(), "2026-08-24");

const blocked = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};
setStorageForChecks(blocked);
check("a refused write reports false", saveRuntimeReservations([reserved], "2026-08-24"), false);
check("a refused write is the storage-failure path", saveRuntimeReservations([reserved], "2026-08-24"), false);

const stampBlocked = memoryStore({ [RUNTIME_KEY]: "[]" });
setStorageForChecks({
  getItem: stampBlocked.getItem,
  setItem: (key: string, value: string) => {
    if (key === SCHEDULE_KEY) throw new Error("blocked");
    stampBlocked.setItem(key, value);
  },
  removeItem: stampBlocked.removeItem,
});
check("a stamp refusal fails the save even if the log wrote", saveRuntimeReservations([reserved], "2026-08-24"), false);

setStorageForChecks(memoryStore({ [RUNTIME_KEY]: "{not-json" }));
check("a malformed log is no rows", loadRuntimeReservations(), []);
setStorageForChecks(memoryStore({ [RUNTIME_KEY]: "{\"not\":\"an-array\"}" }));
check("a non-array log is no rows", loadRuntimeReservations(), []);

setStorageForChecks(null);

const passed = results.filter((result) => result.passed).length;
const failed = results.length - passed;
const summary = document.querySelector<HTMLParagraphElement>("#summary");
const list = document.querySelector<HTMLUListElement>("#results");
if (summary && list) {
  summary.textContent = `${results.length} checks run, ${passed} passed, ${failed} failed.`;
  summary.classList.add(failed === 0 ? "all-good" : "has-failures");
  for (const result of results) {
    const item = document.createElement("li");
    item.className = result.passed ? "pass" : "fail";
    item.textContent = `${result.passed ? "PASS" : "FAIL"} — ${result.name} (${result.detail})`;
    list.append(item);
  }
}
