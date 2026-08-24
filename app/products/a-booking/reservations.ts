/* Runtime reservations created by Product A.
   Stored in localStorage under pulse-reservations-a so Product B can
   read them. Shared fixtures are never written. Shape matches
   SHARED_DATA_CONTRACT.md / app/shared/contract.ts.

   Storage goes through the shared guarded doors (app/shared/storage.ts).
   The write used to call localStorage.setItem bare, so a browser with site
   data blocked threw a raw DOMException out of whatever asked to save —
   while the read one function above it was guarded. writeStored returns
   whether the write happened; the caller says so when it did not, which is
   the language law's stated negative, not this module's decision. */

import type { Reservation } from "../../shared/contract.js";
import { readStored, writeStored } from "../../shared/storage.js";

export const RUNTIME_KEY = "pulse-reservations-a";

/* WHICH SCHEDULE THE ROWS WERE WRITTEN AGAINST, and why a saved booking
 * cannot be trusted without it.
 *
 * A reservation names its class by `session_id`, and the studio's session
 * ids are positions in a window that starts at today minus the history and
 * ends fourteen days out. The window slides every midnight, so the ids
 * slide with it. Measured on 2026-08-23 with the shared seed: of 1,900
 * sessions, 1,900 carry a different start time under the same id the next
 * day. `class-session:000001` is the 08:00 class on one date and the 08:00
 * class on the NEXT date tomorrow.
 *
 * Nothing errors when that happens, which is what makes it worth guarding.
 * A member who books Thursday's 18:00 class and opens the page on Friday
 * would have been shown holding a seat in a class they never booked, and
 * Product B's roster would have listed them in it.
 *
 * The id scheme itself is a team question — `SHARED_DATA_CONTRACT.md` says
 * every record has a stable id and these do not, which is raised in
 * `docs/REQUESTFOR-A-B-C.md` and belongs to nobody alone. What this
 * product can decide on its own is that it will not RESOLVE a saved id
 * against a schedule it was not written for. So the log carries the
 * studio date it was written against, and a log from another date is let
 * go rather than pointed at whatever now sits at that id. */
export const SCHEDULE_KEY = "pulse-reservations-a-schedule";

export function loadRuntimeReservations(): Reservation[] {
  try {
    const raw = readStored(RUNTIME_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Reservation[]) : [];
  } catch {
    return [];
  }
}

/** True when the log was actually written. */
export function saveRuntimeReservations(rows: Reservation[]): boolean {
  return writeStored(RUNTIME_KEY, JSON.stringify(rows));
}

/** The studio date the stored log was written against, or null when the
 *  log predates the stamp — which is the same thing as not knowing. */
export function storedScheduleDate(): string | null {
  const raw = readStored(SCHEDULE_KEY);
  return raw ? raw : null;
}

/** Bring the stored log into agreement with today's schedule, ONCE, before
 *  anything reads it.
 *
 *  Same date: nothing happens and `dropped` is 0. Different date, or a log
 *  with no stamp at all: every row is let go and the count is returned so
 *  the page can say so instead of quietly showing fewer reservations. The
 *  rows are cleared from storage rather than merely ignored, because
 *  Product B reads this same key for its rosters and a row this product
 *  refuses to resolve is not one another product should resolve either.
 *
 *  An empty log still gets stamped: that is what makes the FIRST booking
 *  of the day belong to a known schedule. */
export function reconcileSchedule(scheduleDate: string): { dropped: number } {
  const stored = storedScheduleDate();
  if (stored === scheduleDate) return { dropped: 0 };
  const dropped = loadRuntimeReservations().length;
  if (dropped > 0) saveRuntimeReservations([]);
  writeStored(SCHEDULE_KEY, scheduleDate);
  return { dropped };
}

export function latestReservation(
  rows: Reservation[],
  sessionId: string,
  memberId: string,
): Reservation | undefined {
  return rows.filter((row) => row.session_id === sessionId && row.member_id === memberId).at(-1);
}
