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
        : "Staff only — sign in as Front Desk from the top bar.";
  }
}

/* The page's own memory of who was signed in a moment ago. Seeded from
 * the CURRENT session at load, which is precisely what makes rule 1 work:
 * arriving already signed in is not a transition, so nothing moves. */
let previous = readPulseSession();
applyView(previous);

subscribeToPulseSession((session, origin) => {
  const signedInJustNow = previous === null && session !== null;
  previous = session;
  applyView(session);

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
  window.setTimeout(() => {
    window.location.assign(HOME_FOR[session.actor_type]);
  }, 450);
});
