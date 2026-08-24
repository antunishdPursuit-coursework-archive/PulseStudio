/* Pulse Studio — the front door's view logic. TEAM-OWNED.
 *
 * THE AUDIENCE LAW applied: this page speaks to the studio's MEMBER first
 * and adapts — never gates — by who is signed in. A member session gets a
 * greeting by name; a staff session gets the staff tools called out. No
 * route is ever hidden or blocked: the session only changes emphasis and
 * words, exactly the honesty rule the session contract itself states.
 *
 * AND: signing in HERE takes a person to their own home — a member to
 * booking, staff to the dashboard — because nobody signs in to keep
 * reading the front page. The three rules that keep that from becoming a
 * trap:
 *   1. Only on the ACT of signing in (signed-out → signed-in), never on
 *      page load. A signed-in person can open the front door any time —
 *      click the brand, the Home link, or type the URL — and it stays put.
 *   2. Only when the sign-in happened in THIS tab. A second tab does not
 *      lurch to another page because someone signed in over here.
 *   3. Never on sign-out, and never on any product page: this file loads
 *      only on the front door, so no product surface can be navigated by
 *      the session.
 * Every route stays reachable by link and by URL — this is where a person
 * lands, not what they are allowed to see. */

import {
  readPulseSession,
  subscribeToPulseSession,
  type PulseSession,
  type SessionChangeOrigin,
} from "./auth/session.js";
import { mountFigures } from "./components/figures.js";

/* THE STUDIO FLOOR. The front door's markup names which figure goes where
 * (`data-figure="lift"`, `data-figure="cycle"`, `data-figure-lane`) and
 * this fills them — the same split the brand header uses, where the page
 * owns the hook and the shared component owns what arrives in it.
 *
 * A NAME WITH NO FIGURE BEHIND IT IS SAID OUT LOUD. An empty box that was
 * meant to hold a drawing looks exactly like a box that was meant to be
 * empty, and the language law is explicit that a surface states what it
 * checked rather than showing nothing. */
const unknownFigures = mountFigures();
if (unknownFigures.length > 0) {
  console.warn(
    `front door: ${unknownFigures.length} figure hook(s) name a drawing that does not exist — ` +
      `${unknownFigures.join(", ")}. The names components/figures.ts knows are lift, cycle and run.`,
  );
}

/** Where each actor's own home is, relative to the front door. */
const HOME_FOR = {
  member: "./products/a-booking/",
  staff: "./products/b-dashboard/",
} as const;

function applyView(session: PulseSession | null): void {
  document.body.dataset["view"] = session === null ? "" : session.actor_type;

  const hello = document.getElementById("member-hello");
  if (hello !== null) {
    hello.textContent =
      session !== null && session.actor_type === "member"
        ? `Welcome back, ${session.display_name}.`
        : "";
  }

  const staffNote = document.getElementById("staff-note");
  if (staffNote !== null) {
    staffNote.textContent =
      session !== null && session.actor_type === "staff"
        ? `Signed in as ${session.display_name} — these are your tools.`
        : session !== null
          ? "The studio team's tools. Staff sign in as Front Desk from the top bar."
          : "Staff only — sign in as Front Desk from the top bar.";
  }

  /* ONE DOOR INTO THE STAFF ROOM, NOT THREE. A signed-in member could reach
   * the staff dashboard from the front door's product card, from the
   * footer, AND from the sign-in landing — three doors into a room that is
   * not theirs, on a page that had just greeted them by name. Every route
   * stays reachable by URL, because the audience law says a session is
   * convenience and never access control, and the privacy page says so to
   * the person's face. What changes is what a member is SHOWN: the two
   * staff cards fold into the one named heading, which still links. A
   * staff person sees them open, as before. Nobody signed in sees them
   * open too — the front door leads with members, but a visitor has not
   * told the page who they are, and hiding the studio's own tools from an
   * unknown reader would be the wrong guess. */
  const staffSection = document.getElementById("staff");
  if (staffSection !== null) {
    const foldForMember = session !== null && session.actor_type === "member";
    for (const card of document.querySelectorAll<HTMLElement>("#schedule, #reengagement")) {
      card.hidden = foldForMember;
    }
    staffSection.dataset["folded"] = foldForMember ? "true" : "false";
  }
}

/* The page's own memory of who was signed in a moment ago. Seeded from
 * the CURRENT session at load, which is precisely what makes rule 1 work:
 * arriving already signed in is not a transition, so nothing moves. */
let previous = readPulseSession();
applyView(previous);

/* The pending landing, so a later change can cancel it. */
let pendingNavigation: number | null = null;

/** Did the sign-in actually reach storage? readPulseSession() falls back to
 *  an in-memory session when storage is unavailable, and that session does
 *  NOT survive a navigation — so it must never trigger one. */
function sessionPersisted(): boolean {
  try {
    return localStorage.getItem("pulse-session") !== null;
  } catch {
    return false;
  }
}

subscribeToPulseSession((session, origin) => {
  const signedInJustNow = previous === null && session !== null;
  previous = session;
  applyView(session);

  /* Any change at all cancels a landing already in flight — signing out
     during the pause must not still send you to a members-only page. */
  if (pendingNavigation !== null) {
    window.clearTimeout(pendingNavigation);
    pendingNavigation = null;
  }

  if (!signedInJustNow || origin !== "this-tab" || session === null) return;

  /* Say where they are going before going — a page that moves without a
   * word is a page that feels broken. */
  const hello = document.getElementById("member-hello");
  if (hello !== null) {
    hello.textContent =
      session.actor_type === "member"
        ? `Welcome back, ${session.display_name} — taking you to your classes…`
        : `Signed in as ${session.display_name} — taking you to the dashboard…`;
  }
  /* The pause exists so the sentence above can be read. Three things it
     must survive, each one an audit finding:
       · a sign-out (or any change) during the pause CANCELS it — otherwise
         the timer fires later and hijacks wherever the person went next;
       · a session that did not actually persist never navigates — with
         storage unavailable the destination page would read no session and
         the person would arrive signed out, which is worse than staying;
       · coming BACK to this page from the destination restores it from the
         browser's cache mid-sentence, so pageshow repaints the view. */
  if (!sessionPersisted()) {
    if (hello !== null) {
      hello.textContent =
        `Signed in as ${session.display_name} — this browser will not remember it, ` +
        `so you are staying here. Your links still work.`;
    }
    return;
  }
  pendingNavigation = window.setTimeout(() => {
    pendingNavigation = null;
    window.location.assign(HOME_FOR[session.actor_type]);
  }, 450);
});

/* A page restored from the back/forward cache keeps whatever it said when
   it left — including "taking you to…" for a trip that already happened. */
window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  if (pendingNavigation !== null) {
    window.clearTimeout(pendingNavigation);
    pendingNavigation = null;
  }
  previous = readPulseSession();
  applyView(previous);
});

/* ---------- scroll reveal (the Pudding touch) ----------
 * Below-the-fold sections ease in as the reader reaches them. Fail-open by
 * construction: the hiding class goes on the BODY only here, only after
 * confirming the observer exists and the reader is fine with motion — so
 * with JS off, an old browser, or reduced motion, every section is simply
 * visible, exactly as before this existed. Sections already on screen at
 * load reveal immediately (no flash of hidden content). */
{
  const wantsMotion = window.matchMedia(
    "(prefers-reduced-motion: no-preference)",
  ).matches;
  const sections = Array.from(
    document.querySelectorAll<HTMLElement>(".home-product, .products-head, .truths"),
  );
  if (wantsMotion && sections.length > 0 && "IntersectionObserver" in window) {
    document.body.classList.add("reveal-ready");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("revealed");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );
    for (const section of sections) observer.observe(section);
    // The safety net that makes "fail open" true rather than claimed: if
    // the observer never delivers (a prerendered tab, a bfcache restore,
    // anything that pauses rendering), everything reveals anyway. Motion
    // is an accent here, never a gate on the content.
    window.setTimeout(() => {
      for (const section of sections) section.classList.add("revealed");
    }, 1600);
  }
}
