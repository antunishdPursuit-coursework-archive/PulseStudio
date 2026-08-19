/* Product A — Member Booking App. Kerrian's lane.
   Shared studio records come from generateStudio() with DEFAULT_CONFIG,
   the same generator Product C uses. Runtime reservations are stored in
   localStorage under pulse-reservations-a and never written back into
   shared fixtures. Members see only their own reservation records. */

import { DEFAULT_CONFIG } from "../../shared/synthetic/config.js";
import type {
  SyntheticBooking,
  SyntheticClassSession,
  SyntheticDataset,
  SyntheticMember,
} from "../../shared/synthetic/contracts.js";
import { generateStudio } from "../../shared/synthetic/generate.js";

const RUNTIME_KEY = "pulse-reservations-a";
const MEMBER_KEY = "pulse-booking-member-a";

type ReservationStatus = "reserved" | "waitlisted" | "canceled";

interface RuntimeReservation {
  reservation_id: string;
  member_id: string;
  session_id: string;
  reservation_status: ReservationStatus;
  reserved_at: string;
  canceled_at: string | null;
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Member booking could not find ${selector}.`);
  return element;
}

function studioDate(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DEFAULT_CONFIG.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
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

function timestampNow(): string {
  const iso = new Date().toISOString();
  return iso.slice(0, 19);
}

const dataset: SyntheticDataset = generateStudio({
  ...DEFAULT_CONFIG,
  asOfDate: studioDate(),
}).dataset;

const classTypeById = new Map(dataset.classTypes.map((item) => [item.id, item]));
const instructorById = new Map(dataset.instructors.map((item) => [item.id, item]));
const memberById = new Map(dataset.members.map((item) => [item.id, item]));

const statusEl = requiredElement<HTMLParagraphElement>("#status");
const errorEl = requiredElement<HTMLParagraphElement>("#error");
const whoEl = requiredElement<HTMLElement>("#who");
const memberSelect = requiredElement<HTMLSelectElement>("#member-select");
const confirmationEl = requiredElement<HTMLElement>("#confirmation");
const scheduleEl = requiredElement<HTMLElement>("#schedule");
const mineWrap = requiredElement<HTMLElement>("#mine-wrap");
const mineEl = requiredElement<HTMLElement>("#mine");

const requestedSessionId = new URLSearchParams(location.search).get("session");

function loadRuntime(): RuntimeReservation[] {
  try {
    const raw = localStorage.getItem(RUNTIME_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RuntimeReservation[]) : [];
  } catch {
    return [];
  }
}

function saveRuntime(rows: RuntimeReservation[]): void {
  localStorage.setItem(RUNTIME_KEY, JSON.stringify(rows));
}

function latestRuntime(sessionId: string, memberId: string): RuntimeReservation | undefined {
  return loadRuntime()
    .filter((row) => row.session_id === sessionId && row.member_id === memberId)
    .at(-1);
}

function studioBooked(sessionId: string): SyntheticBooking[] {
  return dataset.bookings.filter(
    (booking) => booking.classSessionId === sessionId && booking.status === "booked",
  );
}

/** Confirmed spots for a session: studio bookings plus runtime reserved,
 *  minus anyone whose latest runtime row is canceled. */
function memberHoldsSpot(memberId: string, sessionId: string): boolean {
  const latest = latestRuntime(sessionId, memberId);
  if (latest) return latest.reservation_status === "reserved";
  return studioBooked(sessionId).some((booking) => booking.memberId === memberId);
}

function confirmedMemberIds(sessionId: string): string[] {
  const ids = new Set<string>();
  for (const booking of studioBooked(sessionId)) ids.add(booking.memberId);
  for (const row of loadRuntime()) {
    if (row.session_id === sessionId) ids.add(row.member_id);
  }
  return [...ids].filter((memberId) => memberHoldsSpot(memberId, sessionId));
}

function remainingSpots(session: SyntheticClassSession): number {
  return Math.max(0, session.capacity - confirmedMemberIds(session.id).length);
}

function upcomingSessions(): SyntheticClassSession[] {
  return dataset.classSessions
    .filter((session) => session.status === "scheduled")
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
}

function formatWhen(session: SyntheticClassSession): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: dataset.meta.timezone,
  }).format(new Date(`${session.startsAt}-04:00`));
}

function sessionLabel(session: SyntheticClassSession): { name: string; instructor: string; level: string } {
  return {
    name: classTypeById.get(session.classTypeId)?.name ?? "Class",
    instructor: instructorById.get(session.instructorId)?.displayName ?? "studio staff",
    level: classTypeById.get(session.classTypeId)?.level ?? "all levels",
  };
}

function activeMembers(): SyntheticMember[] {
  return dataset.members
    .filter((member) => member.currentStatusSnapshot === "active")
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
}

function selectedMemberId(): string {
  return memberSelect.value;
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
  if (left <= 0) return { text: "Full", className: "full" };
  if (left <= 2) return { text: `${left} left`, className: "warn" };
  return { text: `${left} left`, className: "ok" };
}

function bookSession(memberId: string, session: SyntheticClassSession): RuntimeReservation {
  if (session.status === "canceled") throw new Error("This class was canceled.");
  if (session.status !== "scheduled") throw new Error("This class is not open for reservations.");
  if (memberHoldsSpot(memberId, session.id)) {
    throw new Error("You already have a spot in this class.");
  }
  if (remainingSpots(session) <= 0) throw new Error("This class is full.");

  const reservation: RuntimeReservation = {
    reservation_id: `res-a-${Date.now()}`,
    member_id: memberId,
    session_id: session.id,
    reservation_status: "reserved",
    reserved_at: timestampNow(),
    canceled_at: null,
  };
  const rows = loadRuntime();
  rows.push(reservation);
  saveRuntime(rows);
  return reservation;
}

function cancelReservation(memberId: string, sessionId: string): void {
  if (!memberHoldsSpot(memberId, sessionId)) throw new Error("No reservation found to cancel.");
  const previous = latestRuntime(sessionId, memberId);
  const reservation: RuntimeReservation = {
    reservation_id: previous?.reservation_id ?? `res-a-${Date.now()}`,
    member_id: memberId,
    session_id: sessionId,
    reservation_status: "canceled",
    reserved_at: previous?.reserved_at ?? timestampNow(),
    canceled_at: timestampNow(),
  };
  const rows = loadRuntime();
  rows.push(reservation);
  saveRuntime(rows);
}

function memberReservations(memberId: string): SyntheticClassSession[] {
  return upcomingSessions().filter((session) => memberHoldsSpot(memberId, session.id));
}

let lastConfirmation: { sessionId: string; reservationId: string } | null = null;

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
  confirmationEl.hidden = false;
  confirmationEl.innerHTML = `<strong>You're booked, ${escapeHtml(member.displayName)}.</strong><span>${escapeHtml(label.name)} on ${escapeHtml(formatWhen(session))} with ${escapeHtml(label.instructor)}. Confirmation ${escapeHtml(lastConfirmation.reservationId)}.</span>`;
}

function renderSchedule(memberId: string): void {
  const sessions = upcomingSessions();
  if (sessions.length === 0) {
    scheduleEl.innerHTML = `<p class="status">${dataset.classSessions.length} class sessions checked, 0 currently scheduled.</p>`;
    return;
  }
  scheduleEl.innerHTML = sessions
    .map((session) => {
      const label = sessionLabel(session);
      const spots = remainingSpots(session);
      const held = memberId !== "" && memberHoldsSpot(memberId, session.id);
      const canceled = session.status === "canceled";
      const full = spots <= 0;
      const highlight = requestedSessionId === session.id ? " highlight" : "";
      const badge = pill(session);
      let action = "";
      if (!memberId) {
        action = `<button class="btn ghost" type="button" disabled>Choose a name to book</button>`;
      } else if (canceled) {
        action = `<button class="btn ghost" type="button" disabled>Canceled</button>`;
      } else if (held) {
        action = `<button class="btn ghost" type="button" disabled>Booked</button>`;
      } else {
        action = `<button class="btn" type="button" data-book="${escapeHtml(session.id)}" ${full ? "disabled" : ""}>${full ? "Full" : "Book"}</button>`;
      }
      return `<article class="card${highlight}" ${requestedSessionId === session.id ? 'id="requested-session"' : ""}>
        <div class="session">
          <div>
            <h3>${escapeHtml(label.name)}</h3>
            <p class="meta">${escapeHtml(formatWhen(session))} · ${escapeHtml(label.level)} · ${escapeHtml(label.instructor)}</p>
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
      const sessionId = button.dataset.book ?? "";
      const session = sessions.find((item) => item.id === sessionId);
      const member = memberById.get(memberId);
      if (!session || !member) return;
      try {
        const reservation = bookSession(memberId, session);
        lastConfirmation = { sessionId: session.id, reservationId: reservation.reservation_id };
        clearError();
        render();
      } catch (error: unknown) {
        showError(error instanceof Error ? error.message : "Could not book that class.");
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
  mineEl.innerHTML = held
    .map((session) => {
      const label = sessionLabel(session);
      return `<article class="card">
        <div class="session">
          <div>
            <h3>${escapeHtml(label.name)}</h3>
            <p class="meta">${escapeHtml(formatWhen(session))} · ${escapeHtml(label.instructor)}</p>
          </div>
          <button class="btn ghost" type="button" data-cancel="${escapeHtml(session.id)}">Cancel</button>
        </div>
      </article>`;
    })
    .join("");
  mineEl.querySelectorAll<HTMLButtonElement>("[data-cancel]").forEach((button) => {
    button.addEventListener("click", () => {
      const sessionId = button.dataset.cancel ?? "";
      try {
        cancelReservation(memberId, sessionId);
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
  const memberId = selectedMemberId();
  const member = memberById.get(memberId);
  const sessions = upcomingSessions();
  const openSpots = sessions.reduce((total, session) => total + remainingSpots(session), 0);
  statusEl.textContent = `${sessions.length} scheduled classes checked. ${openSpots} spots remaining across the shared studio. ${dataset.members.length} members in the studio.`;
  renderConfirmation(member);
  renderSchedule(memberId);
  renderMine(memberId);
  mineWrap.hidden = memberId === "";
  if (requestedSessionId) {
    document.getElementById("requested-session")?.scrollIntoView({ block: "center" });
  }
}

function fillMemberSelect(): void {
  const members = activeMembers();
  const saved = sessionStorage.getItem(MEMBER_KEY) ?? "";
  memberSelect.innerHTML = `<option value="">Choose your name to reserve a spot</option>${members
    .map((member) => `<option value="${escapeHtml(member.id)}">${escapeHtml(member.displayName)}</option>`)
    .join("")}`;
  if (saved && members.some((member) => member.id === saved)) {
    memberSelect.value = saved;
  }
  whoEl.hidden = false;
}

memberSelect.addEventListener("change", () => {
  sessionStorage.setItem(MEMBER_KEY, memberSelect.value);
  lastConfirmation = null;
  clearError();
  render();
});

fillMemberSelect();
render();
