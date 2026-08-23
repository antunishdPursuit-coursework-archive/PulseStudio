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

export function latestReservation(
  rows: Reservation[],
  sessionId: string,
  memberId: string,
): Reservation | undefined {
  return rows.filter((row) => row.session_id === sessionId && row.member_id === memberId).at(-1);
}
