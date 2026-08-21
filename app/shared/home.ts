/* Pulse Studio — the front door's view logic. TEAM-OWNED.
 *
 * THE AUDIENCE LAW applied: this page speaks to the studio's MEMBER first
 * and adapts — never gates — by who is signed in. A member session gets a
 * greeting by name; a staff session gets the staff tools called out. No
 * route is ever hidden or blocked: the session only changes emphasis and
 * words, exactly the honesty rule the session contract itself states. */

import { readPulseSession, subscribeToPulseSession } from "./auth/session.js";

function applyView(): void {
  const session = readPulseSession();
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

applyView();
subscribeToPulseSession(applyView);
