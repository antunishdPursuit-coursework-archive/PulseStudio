/* Product A — Member Booking App. Kerrian's lane.
   Shared studio records come from sharedStudio() — the same generator and
   member ids the top-bar sign-in lists. Runtime reservations are stored in
   localStorage under pulse-reservations-a and never written back into
   shared fixtures. The log is append-only: member book / waitlist / cancel
   only — this page never seeds occupancy on load. Members see only their
   own reservation records. Sign-in is the shared pulse-session; this page
   never keeps a second key.

   The RULES live in rules.ts, with no DOM and no clock, so the unit suite
   (tests.html) can hold them to the brief's acceptance checks. This file
   reads the log and the studio clock ONCE per render, hands both in, and
   renders what comes back. */

import type { Reservation } from "../../shared/contract.js";
import { currentSession, onSessionChange } from "../../shared/auth/session.js";
import { sharedStudio } from "../../shared/auth/studio.js";
import { dismissAlert, showAlert } from "../../shared/components/alert.js";
import type {
  SyntheticClassSession,
  SyntheticMember,
} from "../../shared/synthetic/contracts.js";
import { loadRuntimeReservations, saveRuntimeReservations } from "./reservations.js";
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
  sessionDate,
  staleDeepLinkMessage,
  studioNowTimestamp,
} from "./rules.js";

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Member booking could not find ${selector}.`);
  return element;
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

/* The studio's own cancellation policy — the same current record the
 * support surface answers from, rendered beside the Cancel buttons so the
 * rule is on the surface that takes the cancel, not only in a chat. */
const cancellationPolicy = dataset.studioPolicies.find(
  (policy) => policy.topic === "cancellation" && policy.isCurrent,
);

const statusEl = requiredElement<HTMLParagraphElement>("#status");
const confirmationEl = requiredElement<HTMLElement>("#confirmation");
const daysEl = requiredElement<HTMLElement>("#days");
const dayTitleEl = requiredElement<HTMLElement>("#day-title");
const scheduleEl = requiredElement<HTMLElement>("#schedule");
const mineWrap = requiredElement<HTMLElement>("#mine-wrap");
const mineEl = requiredElement<HTMLElement>("#mine");

const requestedSessionId = new URLSearchParams(location.search).get("session");

/* Everything the rules may look at, rebuilt at the top of every render:
 * the log is read from storage ONCE per render instead of once per rule
 * call (a signed-in render used to issue ~600 getItem+parse calls, each
 * parsing the whole log), and "now" is read once so one render never
 * straddles a minute boundary. */
let ctx: BookingContext = {
  sessions: dataset.classSessions,
  bookings: dataset.bookings,
  rows: [],
  nowLocal: studioNowTimestamp(dataset.meta.timezone),
};

function scheduleDays(): string[] {
  return [...new Set(openSessions(ctx).map(sessionDate))];
}

function sessionsOnDay(day: string): SyntheticClassSession[] {
  return openSessions(ctx).filter((session) => sessionDate(session) === day);
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

/* Refusals go through the shared alert region — one wording, one live
 * region, already role="alert" for the problem level — instead of the old
 * silent <p id="error"> no screen reader was ever told about. */
function showError(message: string): void {
  showAlert({ id: "booking-error", level: "problem", message });
}

function clearError(): void {
  dismissAlert("booking-error");
}

/* Append and SAY SO when the browser would not take it. writeStored
 * reports a refused write as false rather than throwing; claiming a spot
 * was reserved when nothing was recorded would be the lie the stated-
 * negative rule exists to prevent. The wording matches the sentence
 * theme-boot raises on the same condition. On success the render context
 * adopts the re-read log, so another tab's writes are kept, not clobbered. */
function appendRows(newRows: Reservation[]): void {
  const all = loadRuntimeReservations();
  all.push(...newRows);
  if (!saveRuntimeReservations(all)) {
    throw new Error("This browser is not saving site data, so the studio could not record that reservation.");
  }
  ctx.rows = all;
}

function pill(session: SyntheticClassSession): { text: string; className: string } {
  const left = remainingSpots(ctx, session);
  const reserved = session.capacity - left;
  if (left <= 0) return { text: `Full · ${session.capacity} reserved`, className: "full" };
  if (left <= 4) return { text: `${reserved} reserved · ${left} of ${session.capacity} left`, className: "warn" };
  return { text: `${reserved} reserved · ${left} of ${session.capacity} left`, className: "ok" };
}

function remainingOnDay(day: string): number {
  return sessionsOnDay(day).reduce((total, session) => total + remainingSpots(ctx, session), 0);
}

function fullOnDay(day: string): number {
  return sessionsOnDay(day).filter((session) => remainingSpots(ctx, session) <= 0).length;
}

let lastConfirmation: { sessionId: string; reservationId: string; waitlisted: boolean } | null = null;
let selectedDay = "";
/* Cancel asks once before it acts: the first press arms THIS session's
 * button, the second confirms. State, not window.confirm, so the policy
 * sentence stays readable while the person decides. */
let cancelArmed: string | null = null;
/* Where focus should land after the next render. Every interaction here
 * rebuilds the DOM with innerHTML, which silently dropped keyboard focus
 * to <body> after every successful click; each handler now names its
 * follow-up target and render() restores it. Cards carry tabindex="-1" so
 * a card can catch focus when the pressed button no longer exists. */
let focusAfterRender: string | null = null;
/* The deep-link scroll fires once, not on every render — it used to yank
 * the page back to the linked card after every book, cancel and day
 * change, including moments after the confirmation rendered up top. */
let deepLinkScrolled = false;

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
      focusAfterRender = `[data-day="${selectedDay}"]`;
      clearError();
      render();
    });
  });
}

function renderSchedule(member: SyntheticMember | undefined): void {
  const memberId = member?.id ?? "";
  const memberProblem = member ? membershipProblem(member) : null;
  const allUpcoming = openSessions(ctx);
  if (allUpcoming.length === 0) {
    scheduleEl.innerHTML = `<p class="status">${dataset.classSessions.length} class sessions checked, 0 still to come.</p>`;
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
      const spots = remainingSpots(ctx, session);
      const status = memberId ? memberStatus(ctx, memberId, session.id) : "none";
      const full = spots <= 0;
      const highlight = requestedSessionId === session.id ? " highlight" : "";
      const badge = pill(session);
      let action = "";
      if (!memberId) {
        action = `<button class="btn ghost" type="button" disabled>Member sign-in required.</button>`;
      } else if (memberProblem) {
        /* Said before the click, not only after: the same sentence
         * bookSession would refuse with. */
        action = `<span class="meta">${escapeHtml(memberProblem)}</span>`;
      } else if (status === "reserved") {
        action = `<button class="btn ghost" type="button" disabled>Booked</button>`;
      } else if (status === "waitlisted") {
        action = `<button class="btn ghost" type="button" disabled>Waitlisted</button>`;
      } else if (full) {
        action = `<button class="btn" type="button" data-wait="${escapeHtml(session.id)}">Join waitlist</button>`;
      } else {
        action = `<button class="btn" type="button" data-book="${escapeHtml(session.id)}">Book</button>`;
      }
      return `<article class="card${highlight}" tabindex="-1" data-session-card="${escapeHtml(session.id)}" ${requestedSessionId === session.id ? 'id="requested-session"' : ""}>
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
      if (!session || !member) return;
      /* THE CLOCK AT THE CLICK, NOT THE CLOCK AT THE LAST RENDER. ctx.nowLocal
       * is only refreshed at the top of render() (line ~462); on a page left
       * open with no interaction, a click on an already-rendered Book button
       * for a class that has since started would otherwise compare
       * session.startsAt against a STALE, earlier "now" — the started-class
       * refusal never fires, and the reservation is stamped with a backdated
       * time. Refreshed here, immediately before the rule reads it, so the
       * check that exists to close this exact gap is checking the truth. */
      ctx.nowLocal = studioNowTimestamp(dataset.meta.timezone);
      try {
        const reservation = bookSession(ctx, member, session, {
          reservationId: newReservationId(),
          at: ctx.nowLocal,
        });
        appendRows([reservation]);
        lastConfirmation = { sessionId: session.id, reservationId: reservation.reservation_id, waitlisted: false };
        focusAfterRender = `[data-session-card="${session.id}"]`;
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
      if (!session || !member) return;
      /* Same staleness the Book handler above guards against — refreshed for
       * the same reason. */
      ctx.nowLocal = studioNowTimestamp(dataset.meta.timezone);
      try {
        const reservation = joinWaitlist(ctx, member, session, {
          reservationId: newReservationId(),
          at: ctx.nowLocal,
        });
        appendRows([reservation]);
        lastConfirmation = { sessionId: session.id, reservationId: reservation.reservation_id, waitlisted: true };
        focusAfterRender = `[data-session-card="${session.id}"]`;
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
  const held = memberReservations(ctx, memberId);
  mineWrap.hidden = false;
  if (held.length === 0) {
    mineEl.innerHTML = `<p class="status">${openSessions(ctx).length} scheduled classes checked, 0 reserved under your name.</p>`;
    return;
  }
  const next = held.find(({ status }) => status === "reserved");
  const nextLine = next
    ? `<p class="next-class">Your next class: <strong>${escapeHtml(sessionLabel(next.session).name)}</strong> — ${escapeHtml(formatWhen(next.session))} with ${escapeHtml(sessionLabel(next.session).instructor)}.</p>`
    : "";
  /* The studio's cancellation rule, from the same current policy record the
   * support chat answers from — stated beside the buttons it governs. */
  const policyLine = cancellationPolicy
    ? `<p class="lede">${escapeHtml(cancellationPolicy.answer)}</p>`
    : "";
  mineEl.innerHTML =
    nextLine +
    policyLine +
    held
    .map(({ session, status }) => {
      const label = sessionLabel(session);
      const state = status === "waitlisted" ? "Waitlisted" : "Reserved";
      const armed = cancelArmed === session.id;
      const buttons = armed
        ? `<button class="btn" type="button" data-cancel-confirm="${escapeHtml(session.id)}">Confirm cancel</button>
           <button class="btn ghost" type="button" data-cancel-keep="${escapeHtml(session.id)}">Keep it</button>`
        : `<button class="btn ghost" type="button" data-cancel="${escapeHtml(session.id)}">Cancel</button>`;
      return `<article class="card" tabindex="-1" data-mine-card="${escapeHtml(session.id)}">
        <div class="session">
          <div>
            <h3>${escapeHtml(label.name)}</h3>
            <p class="meta">${escapeHtml(formatWhen(session))} · ${escapeHtml(label.instructor)} · ${state}</p>
          </div>
          <div class="session-actions">${buttons}</div>
        </div>
      </article>`;
    })
    .join("");
  mineEl.querySelectorAll<HTMLButtonElement>("[data-cancel]").forEach((button) => {
    button.addEventListener("click", () => {
      cancelArmed = button.dataset.cancel ?? null;
      focusAfterRender = `[data-cancel-confirm="${cancelArmed ?? ""}"]`;
      clearError();
      render();
    });
  });
  mineEl.querySelectorAll<HTMLButtonElement>("[data-cancel-keep]").forEach((button) => {
    button.addEventListener("click", () => {
      cancelArmed = null;
      focusAfterRender = `[data-cancel="${button.dataset.cancelKeep ?? ""}"]`;
      clearError();
      render();
    });
  });
  mineEl.querySelectorAll<HTMLButtonElement>("[data-cancel-confirm]").forEach((button) => {
    button.addEventListener("click", () => {
      const sessionId = button.dataset.cancelConfirm ?? "";
      /* canceled_at should stamp the moment of the click, not whatever "now"
       * was at the last render — the same reason Book and Join waitlist
       * refresh it above. */
      ctx.nowLocal = studioNowTimestamp(dataset.meta.timezone);
      try {
        appendRows(cancelReservation(ctx, memberId, sessionId, ctx.nowLocal, newReservationId));
        cancelArmed = null;
        lastConfirmation = null;
        /* The card this button lived in is gone after the render; the
         * schedule card for the same class is still there and can hold
         * focus, so the keyboard does not fall back to <body>. */
        focusAfterRender = `[data-session-card="${sessionId}"]`;
        clearError();
        render();
      } catch (error: unknown) {
        showError(error instanceof Error ? error.message : "Could not cancel that reservation.");
      }
    });
  });
}

function render(): void {
  ctx.rows = loadRuntimeReservations();
  ctx.nowLocal = studioNowTimestamp(dataset.meta.timezone);
  const member = bookingMember();
  const memberId = member?.id ?? "";
  const sessions = openSessions(ctx);
  const openSpots = sessions.reduce((total, session) => total + remainingSpots(ctx, session), 0);
  const fullStudio = sessions.filter((session) => remainingSpots(ctx, session) <= 0).length;
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
  renderSchedule(member);
  renderMine(memberId);
  /* A link to a class that has since started, completed, or never existed
   * used to fall back to the first day in silence; the miss is now stated,
   * the fallback stays. Dismissed again if a later render can show it. */
  const staleMessage = staleDeepLinkMessage(ctx, requestedSessionId, formatDayChip(selectedDay));
  if (staleMessage) {
    showAlert({
      id: "session-not-on-schedule",
      level: "notice",
      message: staleMessage,
      detail: `${scheduleDays().length} upcoming days are below — pick another time.`,
    });
  } else {
    dismissAlert("session-not-on-schedule");
  }
  if (requestedSessionId && !deepLinkScrolled) {
    const target = document.getElementById("requested-session");
    if (target) {
      target.scrollIntoView({ block: "center" });
      deepLinkScrolled = true;
    }
  }
  if (focusAfterRender) {
    /* When the named target is not on this render (a cancel for a class on
     * an unselected day), the status line catches focus instead of <body>. */
    (document.querySelector<HTMLElement>(focusAfterRender) ?? statusEl).focus();
    focusAfterRender = null;
  }
}

onSessionChange(() => {
  lastConfirmation = null;
  cancelArmed = null;
  clearError();
  render();
});

render();
