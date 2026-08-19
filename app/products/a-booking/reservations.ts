/* Runtime reservations created by Product A.
   Stored in localStorage under pulse-reservations-a so Product B can
   read them. Shared fixtures are never written. Shape matches
   SHARED_DATA_CONTRACT.md / app/shared/contract.ts. */

import type { Reservation } from "../../shared/contract.js";

export const RUNTIME_KEY = "pulse-reservations-a";

export function loadRuntimeReservations(): Reservation[] {
  try {
    const raw = localStorage.getItem(RUNTIME_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Reservation[]) : [];
  } catch {
    return [];
  }
}

export function saveRuntimeReservations(rows: Reservation[]): void {
  localStorage.setItem(RUNTIME_KEY, JSON.stringify(rows));
}

export function latestReservation(
  rows: Reservation[],
  sessionId: string,
  memberId: string,
): Reservation | undefined {
  return rows.filter((row) => row.session_id === sessionId && row.member_id === memberId).at(-1);
}
