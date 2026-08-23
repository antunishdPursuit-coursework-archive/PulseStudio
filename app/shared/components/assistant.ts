/* Pulse Studio — the assistant launcher. TEAM-OWNED.
 *
 * ONE CHATBOX, BOTTOM-RIGHT, ON EVERY PAGE THAT WANTS ONE. The page says
 * where it stands (`<body data-assistant="member-facing|staff-facing">`);
 * the session says who is reading; those two decide which of three
 * assistants this is — and the decision is made twice, here and again on
 * the server, so neither side can widen what the other narrowed.
 *
 *   visitor          — nobody signed in, member-facing page. Answers about
 *                      classes and policies from the studio's records.
 *   signed-in member — the same, and it can BOOK: it writes the very row
 *                      the Book button writes, into the same log, so
 *                      booking, the dashboard and re-engagement all see it.
 *   staff            — staff-facing page AND a staff session. May talk
 *                      capacity, fill and attention over records the page
 *                      already shows. Never a member's name on a member page.
 *
 * WHAT THIS DOES NOT DO. It does not answer anything itself: every reply
 * comes from the studio's own service at /api/chat, same-origin, which
 * holds the key. It does not trust the model to book: a booking is a row
 * this code writes after ITS OWN checks, and the reply only describes what
 * was written. It holds no key, names no host, sends no identifier with a
 * question, and writes no HTML as a string.
 *
 * WHY IT IS CHROME AND NOT PRODUCT C. The answering is Dennis's lane and
 * stays there — his page and this launcher post the same body to the same
 * endpoint. What every page shares is the DOOR: the button, the panel, the
 * audience decision and the outbound guard. Two products each drawing
 * their own chat window would drift the way four headers once did.
 */

import { readPulseSession, subscribeToPulseSession } from "../auth/session.js";
import { answerProblems, audiencePolicy, type Actor, type Placement } from "../assistant-audience.js";
import { sharedStudio } from "../auth/studio.js";
import { readStored, writeStored } from "../storage.js";
import { STUDIO_NAME } from "../brand.js";
import { pulseLogo } from "./logo.js";
import type { Reservation } from "../contract.js";
import type { SyntheticClassSession, SyntheticDataset } from "../synthetic/contracts.js";

const ENDPOINT = new URL("../../api/chat", import.meta.url);
const BOOKING_LOG = "pulse-reservations-a";
const PANEL_ID = "pulse-assistant";

/** Booking's published log, read the guarded way — a malformed value is
 *  simply no rows, never a throw into the panel. */
function readRuntimeReservedRows(): Reservation[] {
  try {
    const parsed: unknown = JSON.parse(readStored(BOOKING_LOG) ?? "[]");
    return Array.isArray(parsed) ? (parsed as Reservation[]) : [];
  } catch {
    return [];
  }
}

/** The bits the launcher needs about one session, resolved once from the
 *  dataset's own tables rather than guessed at — a class type's name and
 *  level live in `classTypes`, not on the session, and how many spots are
 *  taken has to count both the generator's own bookings AND Booking's
 *  runtime reservation log, the same union `remainingSpots()` in Product
 *  A's main.ts already computes. Two independent readers of one contract,
 *  which is why the counting rule is written down here rather than
 *  imported from a product folder shared code may not depend on. */
interface Session {
  raw: SyntheticClassSession;
  classType: string;
  level: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  bookedCount: number;
}

function endTime(startsAt: string, durationMinutes: number): string {
  const [datePart, timePart] = startsAt.split("T");
  const [h = "0", m = "0"] = (timePart ?? "").split(":");
  const start = new Date(Date.UTC(1970, 0, 1, Number(h), Number(m)));
  start.setUTCMinutes(start.getUTCMinutes() + durationMinutes);
  const hh = String(start.getUTCHours()).padStart(2, "0");
  const mm = String(start.getUTCMinutes()).padStart(2, "0");
  return `${datePart}T${hh}:${mm}:00`;
}

function resolveSessions(dataset: SyntheticDataset, runtimeReservedBySession: Map<string, number>): Session[] {
  const typeById = new Map(dataset.classTypes.map((t) => [t.id, t] as const));
  return dataset.classSessions.map((raw) => {
    const type = typeById.get(raw.classTypeId);
    const generatorBooked = dataset.bookings.filter(
      (b) => b.classSessionId === raw.id && b.status === "booked",
    ).length;
    return {
      raw,
      classType: type?.name ?? "Class",
      level: type?.level ?? "",
      startsAt: raw.startsAt,
      endsAt: endTime(raw.startsAt, raw.durationMinutes),
      capacity: raw.capacity,
      bookedCount: generatorBooked + (runtimeReservedBySession.get(raw.id) ?? 0),
    };
  });
}

/** The three assistants, as data, so a check can hold what each may say.
 *
 *  PLACEMENT NARROWS, NEVER WIDENS — the same asymmetry
 *  app/shared/assistant-audience.ts encodes for the outbound guard. The
 *  first version of this function forgot to gate the member tier on
 *  placement at all, so a signed-in member on a STAFF-FACING page (the
 *  dashboard, re-engagement) was handed the booking assistant — a
 *  capability that page has no business offering. Booking only makes
 *  sense where the member's own page is. */
export function assistantFor(actor: Actor, placement: Placement): "visitor" | "member" | "staff" {
  if (placement === "staff-facing" && actor === "staff") return "staff";
  if (placement === "member-facing" && actor === "member") return "member";
  return "visitor";
}

/** The one line each assistant opens with. Stated, because a box that
 *  says "Ask me anything" is promising something it cannot do. */
export function openingLine(kind: ReturnType<typeof assistantFor>, firstName: string | null): string {
  if (kind === "staff") return "Ask about capacity, fill and which classes need attention this week.";
  if (kind === "member") {
    return `${firstName === null ? "Ask" : `${firstName}, ask`} about classes or policies — or say which class you'd like and I'll book it.`;
  }
  return "Ask about classes, levels or studio policies. Sign in to book.";
}

/* ---------- the booking intent: a rule, not a guess ---------- */

/** Does this question ask to BOOK, and which session? Kept deliberately
 *  narrow: a class type and a day word (or date), and the word book/reserve.
 *  A question that merely mentions yoga is a question, not a booking. The
 *  model never decides this; it is a pattern a check can reach. */
export function bookingIntent(
  question: string,
  sessions: readonly Session[],
  todayIso: string,
): Session | null {
  const q = question.toLowerCase();
  if (!/\b(book|reserve|sign me up|save me a spot|put me in)\b/.test(q)) return null;
  const upcoming = sessions
    .filter((s) => s.raw.status === "scheduled" && s.startsAt.slice(0, 10) >= todayIso)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const byType = upcoming.filter((s) => q.includes(s.classType.toLowerCase()));
  if (byType.length === 0) return null;
  const dayWords: Record<string, number> = { today: 0, tomorrow: 1 };
  for (const [word, offset] of Object.entries(dayWords)) {
    if (q.includes(word)) {
      const target = shiftIso(todayIso, offset);
      return byType.find((s) => s.startsAt.slice(0, 10) === target) ?? null;
    }
  }
  const date = /\b(\d{4}-\d{2}-\d{2})\b/.exec(q);
  if (date !== null) return byType.find((s) => s.startsAt.startsWith(date[1] ?? "")) ?? null;
  /* "book yoga" with no day: the next one. Said back to them by date. */
  return byType[0] ?? null;
}

function shiftIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days);
  return new Date(t).toISOString().slice(0, 10);
}

/** Write the booking the way the Book button does: the same row shape, the
 *  same key, appended, last-row-wins. Returns what was written or the
 *  reason nothing was — never a throw into the chat. */
export function bookForMember(memberId: string, session: Session): { ok: true; row: Reservation } | { ok: false; why: string } {
  const raw = readStored(BOOKING_LOG);
  let rows: Reservation[] = [];
  try {
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    rows = Array.isArray(parsed) ? (parsed as Reservation[]) : [];
  } catch {
    rows = [];
  }
  /* LAST ROW WINS, the same reading Booking's own memberStatus() uses: the
   * most recent row for this member and session is the truth, whatever an
   * earlier cancel or rebook says. */
  const mine = rows.filter((r) => r.member_id === memberId && r.session_id === session.raw.id).at(-1);
  if (mine !== undefined && mine.reservation_status === "reserved") {
    return { ok: false, why: "You already have a spot in that class." };
  }
  /* LAST ROW PER MEMBER, THEN COUNT — never a blanket count of every row
   * whose status happens to say "reserved". The log is append-only: a
   * cancel is a NEW row, not a rewrite, so the member's original "reserved"
   * row is still sitting there with that status. Counting rows directly
   * double-counts every cancel-and-rebook and — the case a check pins —
   * makes a cancelled spot look permanently taken. This is the same
   * last-row-wins union Product A's own remainingSpots()/
   * confirmedMemberIds() compute in main.ts. */
  const latestPerMember = new Map<string, Reservation>();
  for (const r of rows) {
    if (r.session_id !== session.raw.id) continue;
    latestPerMember.set(r.member_id, r); // rows are append order; last write wins
  }
  const runtimeReserved = [...latestPerMember.values()].filter((r) => r.reservation_status === "reserved").length;
  if (session.bookedCount + runtimeReserved >= session.capacity) {
    return { ok: false, why: "That class is full. The booking page has the waitlist." };
  }
  const row: Reservation = {
    reservation_id: `res_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    member_id: memberId,
    session_id: session.raw.id,
    reservation_status: "reserved",
    reserved_at: session.startsAt.slice(0, 19),
    canceled_at: null,
  };
  const written = writeStored(BOOKING_LOG, JSON.stringify([...rows, row]));
  if (!written) return { ok: false, why: "This browser is not saving site data, so the booking could not be kept." };
  return { ok: true, row };
}

/* ---------- the panel ---------- */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== "") node.textContent = text;
  return node;
}

export function mountAssistant(): void {
  const placementAttr = document.body.dataset["assistant"];
  if (placementAttr !== "member-facing" && placementAttr !== "staff-facing") return;
  if (document.getElementById(PANEL_ID) !== null) return;
  const placement: Placement = placementAttr;

  const launcher = el("button", "assistant-launcher");
  launcher.type = "button";
  launcher.setAttribute("aria-expanded", "false");
  launcher.setAttribute("aria-controls", PANEL_ID);
  /* The launcher carries the studio's own mark, not a generic chat glyph —
   * the same brand every header and footer already carries, so the one
   * new fixed element on the page still reads as part of one system
   * rather than a bolted-on widget. */
  launcher.append(pulseLogo(18, true));
  const launcherLabel = el("span", "assistant-launcher-label", "Ask");
  launcher.append(launcherLabel);

  const panel = el("section", "assistant-panel");
  panel.id = PANEL_ID;
  panel.hidden = true;
  panel.setAttribute("aria-label", `${STUDIO_NAME} assistant`);

  const head = el("div", "assistant-head");
  const heading = el("div", "assistant-heading");
  heading.append(pulseLogo(16, true));
  const title = el("h2", "assistant-title", "Ask the studio");
  heading.append(title);
  const close = el("button", "assistant-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Close the assistant");
  head.append(heading, close);

  const log = el("div", "assistant-log");
  log.setAttribute("role", "log");
  log.setAttribute("aria-live", "polite");

  const form = el("form", "assistant-form");
  const input = el("input", "assistant-input");
  input.type = "text";
  input.maxLength = 1000;
  input.autocomplete = "off";
  input.setAttribute("aria-label", "Your question");
  const send = el("button", "assistant-send", "Send");
  send.type = "submit";
  form.append(input, send);

  const status = el("p", "assistant-status");
  status.setAttribute("aria-live", "polite");

  panel.append(head, log, form, status);
  document.body.append(launcher, panel);

  const say = (text: string, who: "you" | "studio"): void => {
    const line = el("p", `assistant-line assistant-${who}`, text);
    log.append(line);
    line.scrollIntoView({ block: "nearest" });
  };

  let kind = assistantFor(null, placement);
  const refresh = (): void => {
    const session = readPulseSession();
    const actor: Actor = session === null ? null : session.actor_type;
    kind = assistantFor(actor, placement);
  };
  refresh();
  subscribeToPulseSession(refresh);

  /* THE GREETING IS A MESSAGE, NOT A FOOTNOTE. It used to live only in the
   * small muted line under the input, which meant the panel opened to an
   * empty log every time — a blank box until somebody typed into it. Said
   * once, as the studio's own first line in the conversation, the moment
   * the panel is first opened; the status line under the form goes back
   * to reporting only what is happening right now ("Checking…"), never
   * standing in for a message. */
  let greeted = false;
  const open = (show: boolean): void => {
    panel.hidden = !show;
    launcher.setAttribute("aria-expanded", String(show));
    if (show) {
      if (!greeted) {
        const session = readPulseSession();
        const first = session === null ? null : session.display_name.split(" ")[0] ?? null;
        say(openingLine(kind, first), "studio");
        greeted = true;
      }
      input.focus();
    } else {
      launcher.focus();
    }
  };
  launcher.addEventListener("click", () => open(panel.hidden));
  close.addEventListener("click", () => open(false));
  panel.addEventListener("keydown", (e) => { if (e.key === "Escape") open(false); });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const question = input.value.trim();
    if (question === "") return;
    say(question, "you");
    input.value = "";

    const session = readPulseSession();
    const actor: Actor = session === null ? null : session.actor_type;
    const policy = audiencePolicy(actor, placement);
    const studio = sharedStudio();
    const runtimeReservedBySession = new Map<string, number>();
    for (const row of readRuntimeReservedRows()) {
      if (row.reservation_status !== "reserved") continue;
      runtimeReservedBySession.set(row.session_id, (runtimeReservedBySession.get(row.session_id) ?? 0) + 1);
    }
    const sessions = resolveSessions(studio, runtimeReservedBySession);

    /* BOOKING IS A ROW, NOT A REPLY. Decided here, written here, and only
     * then described. The model is never asked to do it. */
    if (kind === "member" && session !== null && session.actor_type === "member") {
      const target = bookingIntent(question, sessions, studio.meta.asOfDate);
      if (target !== null) {
        const result = bookForMember(session.member_id, target);
        say(
          result.ok
            ? `Booked: ${target.classType} on ${target.startsAt.slice(0, 10)} at ${target.startsAt.slice(11, 16)}. It is on your classes page.`
            : result.why,
          "studio",
        );
        return;
      }
    }

    send.disabled = true;
    status.textContent = "Checking the studio's records.";
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          question,
          placement,
          actor,
          context: {
            timezone: studio.meta.timezone,
            current_date: studio.meta.asOfDate,
            class_sessions: sessions
              .filter((s) => s.raw.status === "scheduled" && s.startsAt.slice(0, 10) >= studio.meta.asOfDate)
              .slice(0, 20)
              .map((s) => ({
                session_id: s.raw.id, class_type: s.classType, level: s.level,
                starts_at: s.startsAt, ends_at: s.endsAt, session_status: "scheduled",
              })),
            /* CURRENT POLICIES ONLY — this repeats the "current policy or
             * say so" rule at the data layer as well as in the prompt, the
             * same defence-in-depth Dennis's own product uses. Field names
             * are the server's contract (safeContext in start-haiku.mjs). */
            studio_policies: studio.studioPolicies
              .filter((p) => p.isCurrent)
              .slice(0, 20)
              .map((p) => ({
                policy_id: p.id, topic: p.topic, answer: p.answer,
                effective_from: p.effectiveFrom, updated_at: p.updatedAt, is_current: p.isCurrent,
              })),
          },
        }),
      });
      const result: unknown = await response.json().catch(() => null);
      const answer = typeof result === "object" && result !== null && typeof (result as Record<string, unknown>)["answer"] === "string"
        ? ((result as Record<string, unknown>)["answer"] as string)
        : null;
      if (!response.ok || answer === null) {
        say(response.status === 503
          ? "The assistant is not running on this site yet. The front desk can help — the number is at the bottom of the page."
          : "I could not get an answer just now. The front desk can help.", "studio");
        return;
      }
      /* THE OUTBOUND GUARD RUNS LAST. Whatever the server decided, a
       * member-facing page checks the text against the member policy
       * before a word is shown — the half that matters, as the shared
       * module says. */
      const names = studio.members.map((m) => m.displayName).filter((n) => session === null || n !== session.display_name);
      const problems = answerProblems(answer, policy, names);
      say(problems.length === 0 ? answer : policy.refusal, "studio");
    } finally {
      send.disabled = false;
      /* CLEARED IN finally, NOT AFTER THE LAST say(). "Checking the
       * studio's records." is a progress line, and every early `return`
       * above — the 503 path, the unparseable-answer path — used to skip
       * past the one place that cleared it, so the panel sat claiming to
       * still be checking under an answer that had already arrived.
       * finally runs on every exit, which is exactly the guarantee a
       * progress line needs. */
      status.textContent = "";
      refresh();
    }
  });
}
