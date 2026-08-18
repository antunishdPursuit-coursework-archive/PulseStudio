import { loadFixtures } from "../../shared/data.js";
import type { AttendanceStatus, ClassSession, FixtureSet, Reservation } from "../../shared/contract.js";

const underbookedThreshold = 70;
const fillingSoonThreshold = 90;
function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`The staff dashboard could not find ${selector}.`);
  }
  return element;
}

const statusEl = requiredElement<HTMLParagraphElement>("#status");
const summaryEl = requiredElement<HTMLElement>("#summary");
const sessionsEl = requiredElement<HTMLElement>("#sessions");
const rosterDialog = requiredElement<HTMLDialogElement>("#roster-dialog");
const rosterContent = requiredElement<HTMLElement>("#roster-content");
const rosterTitle = requiredElement<HTMLHeadingElement>("#roster-title");
const closeRoster = requiredElement<HTMLButtonElement>("#close-roster");

function escapeHtml(value: string): string {
  const replacements: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" };
  return value.replace(/[&<>"']/g, (character) => replacements[character] ?? character);
}

function formatSessionTime(session: ClassSession, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(session.starts_at));
}

function confirmedReservations(reservations: Reservation[], sessionId: string): Reservation[] {
  return reservations.filter((reservation) => reservation.session_id === sessionId && reservation.reservation_status === "reserved");
}

function occupancy(session: ClassSession, reservations: Reservation[]): number {
  return Math.round((confirmedReservations(reservations, session.session_id).length / session.capacity) * 100);
}

function attentionLabel(fillRate: number): { label: string; className: string } {
  if (fillRate >= 100) return { label: "Full", className: "full" };
  if (fillRate >= fillingSoonThreshold) return { label: "Filling soon", className: "attention" };
  if (fillRate < underbookedThreshold) return { label: "Underbooked", className: "attention" };
  return { label: "On track", className: "good" };
}

function rosterStatus(attendanceStatus: AttendanceStatus | undefined, reservationStatus: Reservation["reservation_status"]): string {
  return attendanceStatus ? `Attendance: ${attendanceStatus.replace("_", " ")}` : `Reservation: ${reservationStatus}`;
}

function showRoster(session: ClassSession, data: FixtureSet): void {
  const memberById = new Map(data.members.map((member) => [member.member_id, member]));
  const attendanceByMember = new Map(data.attendance.filter((record) => record.session_id === session.session_id).map((record) => [record.member_id, record.attendance_status]));
  const roster = data.reservations.filter((reservation) => reservation.session_id === session.session_id);
  rosterTitle.textContent = `${session.class_type} roster`;
  rosterContent.innerHTML = roster.length === 0
    ? "<p class=\"status\">0 members checked, 0 roster records found for this session.</p>"
    : `<p class="roster-meta">Staff-only member names, reservation state, and attendance state.</p><ul class="roster">${roster.map((reservation) => {
      const member = memberById.get(reservation.member_id);
      const attendance = attendanceByMember.get(reservation.member_id);
      return `<li><strong>${escapeHtml(member?.display_name ?? reservation.member_id)}</strong><span class="roster-meta">${escapeHtml(rosterStatus(attendance, reservation.reservation_status))}</span></li>`;
    }).join("")}</ul>`;
  rosterDialog.showModal();
}

function render(data: FixtureSet): void {
  const instructors = new Map(data.instructors.map((instructor) => [instructor.instructor_id, instructor.display_name]));
  const scheduled = data.class_sessions.filter((session) => session.session_status === "scheduled").sort((left, right) => left.starts_at.localeCompare(right.starts_at));
  const attentionCount = scheduled.filter((session) => {
    const fillRate = occupancy(session, data.reservations);
    return fillRate < underbookedThreshold || fillRate >= fillingSoonThreshold;
  }).length;
  const confirmedCount = scheduled.reduce((total, session) => total + confirmedReservations(data.reservations, session.session_id).length, 0);

  summaryEl.innerHTML = `<article class="metric"><span>Scheduled sessions</span><strong>${scheduled.length}</strong><span>in the shared fixture</span></article><article class="metric"><span>Confirmed reservations</span><strong>${confirmedCount}</strong><span>waitlisted and canceled excluded</span></article><article class="metric"><span>Needs attention</span><strong>${attentionCount}</strong><span>under 70% or at least 90% full</span></article>`;
  statusEl.textContent = `${scheduled.length} scheduled sessions checked. ${attentionCount} need staff attention.`;
  sessionsEl.innerHTML = scheduled.length === 0
    ? "<p class=\"status\">0 scheduled sessions checked, 0 available to review.</p>"
    : scheduled.map((session) => {
      const reserved = confirmedReservations(data.reservations, session.session_id).length;
      const fillRate = occupancy(session, data.reservations);
      const attention = attentionLabel(fillRate);
      return `<article class="card"><div class="session-row"><div><h2>${escapeHtml(session.class_type)} · ${escapeHtml(session.level)}</h2><p class="session-meta">${formatSessionTime(session, data.timezone)} · ${escapeHtml(instructors.get(session.instructor_id) ?? session.instructor_id)}</p></div><span class="tag ${attention.className}">${attention.label}</span></div><div class="occupancy"><strong>${reserved}/${session.capacity} reserved</strong><br><progress value="${fillRate}" max="100">${fillRate}%</progress> <span>${fillRate}% full · ${session.capacity - reserved} spots remaining</span></div><button class="btn" type="button" data-session-id="${session.session_id}">View staff roster</button></article>`;
    }).join("");
  sessionsEl.querySelectorAll<HTMLButtonElement>("[data-session-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const session = scheduled.find((item) => item.session_id === button.dataset.sessionId);
      if (session) showRoster(session, data);
    });
  });
}

closeRoster.addEventListener("click", () => rosterDialog.close());

loadFixtures().then(render).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  statusEl.textContent = `The dashboard could not load shared records: ${message}`;
});
