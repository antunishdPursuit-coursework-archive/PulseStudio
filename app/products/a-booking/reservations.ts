/* Runtime reservations created by Product A.
   Stored in localStorage under pulse-reservations-a so Product B can
   read them. Shared fixtures are never written. Shape matches
   SHARED_DATA_CONTRACT.md / app/shared/contract.ts.
   Writes go through writeStored so a blocked store reports false
   instead of throwing mid-Book.

   Session ids are positions in a sliding window: after midnight the same
   id can name a different class. The log stays a Reservation[] — B, D,
   and the shared assistant parse it that way. The companion stamp
   pulse-reservations-a-schedule is today's asOfDate. A missing or
   other-date stamp means the rows are not today's schedule. */

import type { Reservation } from "../../shared/contract.js";
import { readStored, writeStored } from "../../shared/storage.js";

export const RUNTIME_KEY = "pulse-reservations-a";
export const SCHEDULE_KEY = "pulse-reservations-a-schedule";

export function loadRuntimeReservations(): Reservation[] {
  const raw = readStored(RUNTIME_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Reservation[]) : [];
  } catch {
    return [];
  }
}

export function readScheduleStamp(): string | null {
  return readStored(SCHEDULE_KEY);
}

/** Rows stamped for a different studio date than `asOfDate` are not
 *  evidence about TODAY's schedule — the session ids they name have since
 *  been reassigned. No stamp at all is the same as a mismatch. */
export function reservationsForSchedule(
  rows: readonly Reservation[],
  storedDate: string | null,
  asOfDate: string,
): Reservation[] {
  return storedDate === asOfDate ? [...rows] : [];
}

export function loadScheduleReservations(asOfDate: string): Reservation[] {
  return reservationsForSchedule(loadRuntimeReservations(), readScheduleStamp(), asOfDate);
}

/** If the stamp is missing or not `asOfDate`, let the log go. Empty
 *  unstamped storage is only dated, never rewritten, so a booking that
 *  lands in the same moment is not wiped. True `cleared` means the store
 *  accepted the writes this page needed. */
export function reconcileSchedule(asOfDate: string): { dropped: number; cleared: boolean } {
  const storedDate = readScheduleStamp();
  const all = loadRuntimeReservations();
  if (storedDate === asOfDate) return { dropped: 0, cleared: true };
  const dropped = all.length;
  const logOk = dropped === 0 ? true : writeStored(RUNTIME_KEY, JSON.stringify([]));
  const stampOk = writeStored(SCHEDULE_KEY, asOfDate);
  return { dropped, cleared: logOk && stampOk };
}

/** True when the log was actually written and today's date was stamped.
 *  False means this browser refused site data — callers must say that,
 *  not claim a booking stuck. The log is written first: a stamp without
 *  a matching write would make yesterday's rows look like today's. */
export function saveRuntimeReservations(rows: Reservation[], asOfDate: string): boolean {
  if (!writeStored(RUNTIME_KEY, JSON.stringify(rows))) return false;
  return writeStored(SCHEDULE_KEY, asOfDate);
}

export function latestReservation(
  rows: readonly Reservation[],
  sessionId: string,
  memberId: string,
): Reservation | undefined {
  return rows.filter((row) => row.session_id === sessionId && row.member_id === memberId).at(-1);
}
