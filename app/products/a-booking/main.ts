/* Product A — Member Booking App. Kerrian's lane.
   Shared studio records come from sharedStudio() — the same generator and
   member ids the top-bar sign-in lists. Runtime reservations are stored in
   localStorage under pulse-reservations-a and never written back into
   shared fixtures. The log is append-only: member book / waitlist / cancel
   only — this page never seeds occupancy on load. Members see only their
   own reservation records. Sign-in is the shared pulse-session; this page
   never keeps a second key. */

import type { Reservation } from "../../shared/contract.js";
import { currentSession, onSessionChange } from "../../shared/auth/session.js";
import { sharedStudio } from "../../shared/auth/studio.js";
import type {
  SyntheticBooking,
  SyntheticClassSession,
  SyntheticMember,
} from "../../shared/synthetic/contracts.js";
import {
  latestReservation,
  loadRuntimeReservations,
  saveRuntimeReservations,
} from "./reservations.js";

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Member booking could not find ${selector}.`);
  return element;
}

function timestampNow(): string {
  return new Date().toISOString().slice(0, 19);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return replacements[character] ?? character;
  });
}

let reservationSeq = 0;

function newReservationId(): string {
  reservationSeq += 1;
  return `res-a-${Date.now()}-${reservationSeq}`;
}

const dataset = sharedStudio();

/* Studio-local wall times: dataset timestamps carry no offset, so append
 * "Z" and format in UTC — prints them exactly as written, immune to DST.
 * (The old hardcoded -04:00 was an hour wrong every winter.) The dataset
 * is generated for today in the studio's timezone, so meta.asOfDate IS
 * the studio's today. */
const TODAY_ISO = dataset.meta.asOfDate;
const TOMORROW_ISO = (() => {
  const d = new Date(`${TODAY_ISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
})();

const classTypeById = new Map(dataset.classTypes.map((item) => [item.id, item]));
const instructorById = new Map(dataset.instructors.map((item) => [item.id, item]));
const memberById = new Map(dataset.members.map((item) => [item.id, item]));

const statusEl = requiredElement<HTMLParagraphElement>("#status");
const errorEl = requiredElement<HTMLParagraphElement>("#error");
const confirmationEl = requiredElement<HTMLElement>("#confirmation");
const daysEl = requiredElement<HTMLElement>("#days");
const dayTitleEl = requiredElement<HTMLElement>("#day-title");
const scheduleEl = requiredElement<HTMLElement>("#schedule");
const mineWrap = requiredElement<HTMLElement>("#mine-wrap");
const mineEl = requiredElement<HTMLElement>("#mine");

const requestedSessionId = new URLSearchParams(location.search).get("session");

function studioBooked(sessionId: string): SyntheticBooking[] {
  return dataset.bookings.filter(
    (booking) => booking.classSessionId === sessionId && booking.status === "booked",
  );
}

function memberStatus(memberId: string, sessionId: string): Reservation["reservation_status"] | "none" {
  const latest = latestReservation(loadRuntimeReservations(), sessionId, memberId);
  if (latest) return latest.reservation_status;
  if (studioBooked(sessionId).some((booking) => booking.memberId === memberId)) return "reserved";
  return "none";
}

function memberHoldsSpot(memberId: string, sessionId: string): boolean {
  return memberStatus(memberId, sessionId) === "reserved";
}

function memberWaitlisted(memberId: string, sessionId: string): boolean {
  return memberStatus(memberId, sessionId) === "waitlisted";
}

function confirmedMemberIds(sessionId: string): string[] {
  const ids = new Set<string>();
  for (const booking of studioBooked(sessionId)) ids.add(booking.memberId);
  for (const row of loadRuntimeReservations()) {
    if (row.session_id === sessionId) ids.add(row.member_id);
  }
  return [...ids].filter((memberId) => memberHoldsSpot(memberId, sessionId));
}

function remainingSpots(session: SyntheticClassSession): number {
  return Math.max(0, session.capacity - confirmedMemberIds(session.id).length);
}

function waitlist(sessionId: string): Reservation[] {
  const ids = new Set<string>();
  for (const booking of studioBooked(sessionId)) ids.add(booking.memberId);
  for (const row of loadRuntimeReservations()) {
    if (row.session_id === sessionId) ids.add(row.member_id);
  }
  return [...ids]
    .map((memberId) => latestReservation(loadRuntimeReservations(), sessionId, memberId))
    .filter((row): row is Reservation => row?.reservation_status === "waitlisted")
    .sort((left, right) => left.reserved_at.localeCompare(right.reserved_at));
}

function upcomingSessions(): SyntheticClassSession[] {
  return dataset.classSessions
    .filter((session) => session.status === "scheduled")
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
}

function sessionDate(session: SyntheticClassSession): string {
  return session.startsAt.slice(0, 10);
}

function scheduleDays(): string[] {
  return [...new Set(upcomingSessions().map(sessionDate))];
}

function sessionsOnDay(day: string): SyntheticClassSession[] {
  return upcomingSessions().filter((session) => sessionDate(session) === day);
}

function formatDayChip(day: string): string {
  if (day === TODAY_ISO) return "Today";
  if (day === TOMORROW_ISO) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));
}

function formatDayTitle(day: string): string {
  const full = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));
  if (day === TODAY_ISO) return `Today — ${full}`;
  if (day === TOMORROW_ISO) return `Tomorrow — ${full}`;
  return full;
}

function formatTime(session: SyntheticClassSession): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${session.startsAt}Z`));
}

function formatWhen(session: SyntheticClassSession): string {
  return `${formatDayChip(sessionDate(session))} · ${formatTime(session)}`;
}

function sessionLabel(session: SyntheticClassSession): { name: string; instructor: string; level: string } {
  return {
    name: classTypeById.get(session.classTypeId)?.name ?? "Class",
    instructor: instructorById.get(session.instructorId)?.displayName ?? "studio staff",
    level: classTypeById.get(session.classTypeId)?.level ?? "all levels",
  };
}

function bookingMember(): SyntheticMember | undefined {
  const session = currentSession();
  if (session === null || session.role !== "member" || session.member_id === null) {
    return undefined;
  }
  return memberById.get(session.member_id);
}

function showError(message: string): void {
  errorEl.hidden = false;
  errorEl.textContent = message;
}

function clearError(): void {
  errorEl.hidden = true;
  errorEl.textContent = "";
}

function pill(session: SyntheticClassSession): { text: string; className: string } {
  if (session.status === "canceled") return { text: "Canceled", className: "full" };
  const left = remainingSpots(session);
  const reserved = session.capacity - left;
  if (left <= 0) return { text: `Full · ${session.capacity} reserved`, className: "full" };
  if (left <= 4) return { text: `${reserved} reserved · ${left} of ${session.capacity} left`, className: "warn" };
  return { text: `${reserved} reserved · ${left} of ${session.capacity} left`, className: "ok" };
}

function remainingOnDay(day: string): number {
  return sessionsOnDay(day).reduce((total, session) => total + remainingSpots(session), 0);
}

function fullOnDay(day: string): number {
  return sessionsOnDay(day).filter((session) => remainingSpots(session) <= 0).length;
}

function appendReservation(reservation: Reservation): void {
  const rows = loadRuntimeReservations();
  rows.push(reservation);
  saveRuntimeReservations(rows);
}

function bookSession(memberId: string, session: SyntheticClassSession): Reservation {
  if (session.status === "canceled") throw new Error("This class was canceled.");
  if (session.status !== "scheduled") throw new Error("This class is not open for reservations.");
  if (memberHoldsSpot(memberId, session.id)) throw new Error("You already have a spot in this class.");
  if (memberWaitlisted(memberId, session.id)) throw new Error("You are already on the waitlist.");
  if (remainingSpots(session) <= 0) throw new Error("This class is full. Join the waitlist instead.");

  const reservation: Reservation = {
    reservation_id: newReservationId(),
    member_id: memberId,
    session_id: session.id,
    reservation_status: "reserved",
    reserved_at: timestampNow(),
    canceled_at: null,
  };
  appendReservation(reservation);
  return reservation;
}

function joinWaitlist(memberId: string, session: SyntheticClassSession): Reservation {
  if (session.status !== "scheduled") throw new Error("This class is not open for reservations.");
  if (memberHoldsSpot(memberId, session.id)) throw new Error("You already have a spot in this class.");
  if (memberWaitlisted(memberId, session.id)) throw new Error("You are already on the waitlist.");
  if (remainingSpots(session) > 0) throw new Error("This class still has open spots. Book it instead.");

  const reservation: Reservation = {
    reservation_id: newReservationId(),
    member_id: memberId,
    session_id: session.id,
    reservation_status: "waitlisted",
    reserved_at: timestampNow(),
    canceled_at: null,
  };
  appendReservation(reservation);
  return reservation;
}

function promoteWaitlist(sessionId: string): void {
  const next = waitlist(sessionId)[0];
  if (!next) return;
  appendReservation({
    ...next,
    reservation_id: newReservationId(),
    reservation_status: "reserved",
    reserved_at: timestampNow(),
    canceled_at: null,
  });
}

function cancelReservation(memberId: string, sessionId: string): void {
  const status = memberStatus(memberId, sessionId);
  if (status !== "reserved" && status !== "waitlisted") {
    throw new Error("No reservation found to cancel.");
  }
  const previous = latestReservation(loadRuntimeReservations(), sessionId, memberId);
  appendReservation({
    reservation_id: previous?.reservation_id ?? newReservationId(),
    member_id: memberId,
    session_id: sessionId,
    reservation_status: "canceled",
    reserved_at: previous?.reserved_at ?? timestampNow(),
    canceled_at: timestampNow(),
  });
  if (status === "reserved") promoteWaitlist(sessionId);
}

function memberReservations(memberId: string): { session: SyntheticClassSession; status: Reservation["reservation_status"] }[] {
  const held: { session: SyntheticClassSession; status: Reservation["reservation_status"] }[] = [];
  for (const session of upcomingSessions()) {
    const status = memberStatus(memberId, session.id);
    if (status === "reserved" || status === "waitlisted") {
      held.push({ session, status });
    }
  }
  return held;
}

let lastConfirmation: { sessionId: string; reservationId: string; waitlisted: boolean } | null = null;
let selectedDay = "";

function requestedSessionDay(): string {
  if (!requestedSessionId) return "";
  const session = dataset.classSessions.find((item) => item.id === requestedSessionId);
  return session ? sessionDate(session) : "";
}

function renderConfirmation(member: SyntheticMember | undefined): void {
  if (!lastConfirmation || !member) {
    confirmationEl.hidden = true;
    confirmationEl.innerHTML = "";
    return;
  }
  const session = dataset.classSessions.find((item) => item.id === lastConfirmation?.sessionId);
  if (!session) {
    confirmationEl.hidden = true;
    return;
  }
  const label = sessionLabel(session);
  const headline = lastConfirmation.waitlisted
    ? `You're on the waitlist, ${escapeHtml(member.displayName)}.`
    : `You're booked, ${escapeHtml(member.displayName)}.`;
  confirmationEl.hidden = false;
  confirmationEl.innerHTML = `<strong>${headline}</strong><span>${escapeHtml(label.name)} on ${escapeHtml(formatWhen(session))} with ${escapeHtml(label.instructor)}. Confirmation ${escapeHtml(lastConfirmation.reservationId)}.</span>`;
}

function renderDays(): void {
  const days = scheduleDays();
  if (days.length === 0) {
    daysEl.innerHTML = "";
    dayTitleEl.textContent = "";
    return;
  }
  const requested = requestedSessionDay();
  if (!days.includes(selectedDay)) {
    selectedDay = requested && days.includes(requested) ? requested : (days[0] ?? "");
  }
  const fewest = Math.min(...days.map(remainingOnDay));
  daysEl.innerHTML = days
    .map((day) => {
      const count = sessionsOnDay(day).length;
      const left = remainingOnDay(day);
      const active = day === selectedDay;
      const tight = left === fewest;
      return `<button type="button" class="${active ? "active" : ""}${tight ? " tight" : ""}" data-day="${escapeHtml(day)}" aria-pressed="${active ? "true" : "false"}">${escapeHtml(formatDayChip(day))} · ${count} classes · ${left} spots left</button>`;
    })
    .join("");
  dayTitleEl.textContent = selectedDay ? formatDayTitle(selectedDay) : "";
  daysEl.querySelectorAll<HTMLButtonElement>("[data-day]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedDay = button.dataset.day ?? "";
      clearError();
      render();
    });
  });
}

function renderSchedule(memberId: string): void {
  const allUpcoming = upcomingSessions();
  if (allUpcoming.length === 0) {
    scheduleEl.innerHTML = `<p class="status">${dataset.classSessions.length} class sessions checked, 0 currently scheduled.</p>`;
    return;
  }
  const sessions = sessionsOnDay(selectedDay);
  if (sessions.length === 0) {
    scheduleEl.innerHTML = `<p class="status">${allUpcoming.length} scheduled classes checked, 0 on the selected day.</p>`;
    return;
  }
  scheduleEl.innerHTML = sessions
    .map((session) => {
      const label = sessionLabel(session);
      const spots = remainingSpots(session);
      const held = memberId !== "" && memberHoldsSpot(memberId, session.id);
      const queued = memberId !== "" && memberWaitlisted(memberId, session.id);
      const canceled = session.status === "canceled";
      const full = spots <= 0;
      const highlight = requestedSessionId === session.id ? " highlight" : "";
      const badge = pill(session);
      let action = "";
      if (!memberId) {
        action = `<button class="btn ghost" type="button" disabled>Member sign-in required.</button>`;
      } else if (canceled) {
        action = `<button class="btn ghost" type="button" disabled>Canceled</button>`;
      } else if (held) {
        action = `<button class="btn ghost" type="button" disabled>Booked</button>`;
      } else if (queued) {
        action = `<button class="btn ghost" type="button" disabled>Waitlisted</button>`;
      } else if (full) {
        action = `<button class="btn" type="button" data-wait="${escapeHtml(session.id)}">Join waitlist</button>`;
      } else {
        action = `<button class="btn" type="button" data-book="${escapeHtml(session.id)}">Book</button>`;
      }
      return `<article class="card${highlight}" ${requestedSessionId === session.id ? 'id="requested-session"' : ""}>
        <div class="session">
          <div>
            <h3>${escapeHtml(label.name)}</h3>
            <p class="meta">${escapeHtml(formatTime(session))} · ${escapeHtml(label.level)} · ${escapeHtml(label.instructor)}</p>
          </div>
          <div class="session-actions">
            <span class="pill ${badge.className}">${escapeHtml(badge.text)}</span>
            ${action}
          </div>
        </div>
      </article>`;
    })
    .join("");

  scheduleEl.querySelectorAll<HTMLButtonElement>("[data-book]").forEach((button) => {
    button.addEventListener("click", () => {
      const session = sessions.find((item) => item.id === button.dataset.book);
      if (!session) return;
      try {
        const reservation = bookSession(memberId, session);
        lastConfirmation = { sessionId: session.id, reservationId: reservation.reservation_id, waitlisted: false };
        clearError();
        render();
      } catch (error: unknown) {
        showError(error instanceof Error ? error.message : "Could not book that class.");
      }
    });
  });
  scheduleEl.querySelectorAll<HTMLButtonElement>("[data-wait]").forEach((button) => {
    button.addEventListener("click", () => {
      const session = sessions.find((item) => item.id === button.dataset.wait);
      if (!session) return;
      try {
        const reservation = joinWaitlist(memberId, session);
        lastConfirmation = { sessionId: session.id, reservationId: reservation.reservation_id, waitlisted: true };
        clearError();
        render();
      } catch (error: unknown) {
        showError(error instanceof Error ? error.message : "Could not join the waitlist.");
      }
    });
  });
}

function renderMine(memberId: string): void {
  if (!memberId) {
    mineWrap.hidden = true;
    mineEl.innerHTML = "";
    return;
  }
  const held = memberReservations(memberId);
  mineWrap.hidden = false;
  if (held.length === 0) {
    mineEl.innerHTML = `<p class="status">${upcomingSessions().length} scheduled classes checked, 0 reserved under your name.</p>`;
    return;
  }
  const next = held.find(({ status }) => status === "reserved");
  const nextLine = next
    ? `<p class="next-class">Your next class: <strong>${escapeHtml(sessionLabel(next.session).name)}</strong> — ${escapeHtml(formatWhen(next.session))} with ${escapeHtml(sessionLabel(next.session).instructor)}.</p>`
    : "";
  mineEl.innerHTML =
    nextLine +
    held
    .map(({ session, status }) => {
      const label = sessionLabel(session);
      const state = status === "waitlisted" ? "Waitlisted" : "Reserved";
      return `<article class="card">
        <div class="session">
          <div>
            <h3>${escapeHtml(label.name)}</h3>
            <p class="meta">${escapeHtml(formatWhen(session))} · ${escapeHtml(label.instructor)} · ${state}</p>
          </div>
          <button class="btn ghost" type="button" data-cancel="${escapeHtml(session.id)}">Cancel</button>
        </div>
      </article>`;
    })
    .join("");
  mineEl.querySelectorAll<HTMLButtonElement>("[data-cancel]").forEach((button) => {
    button.addEventListener("click", () => {
      try {
        cancelReservation(memberId, button.dataset.cancel ?? "");
        lastConfirmation = null;
        clearError();
        render();
      } catch (error: unknown) {
        showError(error instanceof Error ? error.message : "Could not cancel that reservation.");
      }
    });
  });
}

function render(): void {
  const member = bookingMember();
  const memberId = member?.id ?? "";
  const sessions = upcomingSessions();
  const openSpots = sessions.reduce((total, session) => total + remainingSpots(session), 0);
  const fullStudio = sessions.filter((session) => remainingSpots(session) <= 0).length;
  renderConfirmation(member);
  renderDays();
  if (!selectedDay) {
    statusEl.textContent = `${sessions.length} scheduled classes checked, ${fullStudio} currently full. ${openSpots} spots remaining across the shared studio.`;
  } else {
    const shown = sessionsOnDay(selectedDay).length;
    const dayLabel = formatDayChip(selectedDay);
    statusEl.textContent = `${dayLabel}: ${shown} classes checked, ${fullOnDay(selectedDay)} full, ${remainingOnDay(selectedDay)} spots left. Studio-wide: ${sessions.length} scheduled classes, ${fullStudio} full, ${openSpots} spots left.`;
  }
  const session = currentSession();
  if (session?.role === "staff") {
    statusEl.textContent = `Staff session signed in. Member sign-in required. ${statusEl.textContent}`;
  }
  renderSchedule(memberId);
  renderMine(memberId);
  if (requestedSessionId) {
    document.getElementById("requested-session")?.scrollIntoView({ block: "center" });
  }
}

onSessionChange(() => {
  lastConfirmation = null;
  clearError();
  render();
});

render();
