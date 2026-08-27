/* Pulse Studio — the shared sign-in control. TEAM-OWNED.
   This file is the birth of app/shared/components/: pieces of interface
   every product shows but no product owns. First resident: the top-bar
   sign-in control (the logo half of the top bar already exists in each
   page's own header — what was missing everywhere was the person).

   HOW IT REACHES EVERY ROUTE WITHOUT TOUCHING ANY LANE: theme-boot.ts —
   which every application page loads — calls
   mountSessionControl() with the page's existing header. So Booking,
   Support, Re-engagement, and the front door all grow the same control
   with zero edits inside a product folder (the lane law holds).

   WHY THE STYLES ARE INJECTED FROM HERE: product pages never load the
   front door's stylesheet, and editing a product's stylesheet would cross
   a lane. A component that carries its own <style> is complete in one
   file and can break nobody else's page.

   THE COLOR LAW: every visual here paints with var(--accent, var(--fg)) —
   on a product's page the control carries THAT builder's color for free
   (the page's body class sets --accent), and on the front door, which
   belongs to no single builder, it falls back to neutral foreground.
   Backgrounds stay var(--bg); the dialog's backdrop uses the foreground at
   partial opacity so it stays legible with the selected appearance.

   TEST MODE, STATED IN THE OPEN: the dialog says it is a test sign-in,
   for testing purposes, with no password. Claiming a login is "secure"
   when nothing checks one would break the truth law; we say what it is
   instead.

   WHAT THAT SENTENCE USED TO CLAIM, and why it changed. It said "This
   site is a static build that runs entirely in your browser" and "The
   hosted version of Pulse Studio checks a real password against its
   Postgres database instead." The first stopped being true the day
   `npm start` began running the studio's server. The second was never
   watched working by anybody — `docs/hosted-schema.sql` describes the
   shape a sold copy would use, which is not the same as a hosted database
   that checks a password today, and the present tense said it was. A
   member reading both would conclude nothing anywhere is checked, at
   exactly the moment the staff door started being checked by the server.
   So the copy now names the one refusal this repo can demonstrate. */

import { counted } from "../text.js";
import type { SyntheticMember } from "../synthetic/contracts.js";
import {
  clearPulseSession,
  readPulseSession,
  subscribeToPulseSession,
} from "../auth/session.js";
import { readStaffGate, signInStaff, signOutStaff } from "../auth/staff-gate.js";
import {
  signInAsFrontDesk,
  signInAsMember,
  signInChoices,
} from "../auth/sign-in.js";

const CONTROL_ID = "pulse-session-control";
const STYLE_ID = "pulse-session-styles";
const DIALOG_ID = "pulse-session-dialog";

/* Mount the control into a page's existing header. Idempotent — a second
   call on the same page does nothing, so theme-boot can call it blindly.
   If the header also holds the light/dark switch, the session control slots
   in before it so the switch keeps its familiar end-of-row seat.

   THAT SELECTOR CHANGED ON 2026-08-23 and would have failed silently if it
   had not: it read `.appearance-control`, the <details> drawer that used to
   hold the whole settings surface in the header. The drawer is gone —
   settings is its own page now and the header keeps two buttons — so the
   old selector matched nothing, the session control appended instead of
   inserting, and the switch moved. Nothing would have thrown; the header
   would just have been in a different order on every page. */
export function mountSessionControl(host: Element): void {
  if (document.getElementById(CONTROL_ID)) return;
  injectStylesOnce();

  const root = document.createElement("div");
  root.id = CONTROL_ID;
  root.className = "pulse-session";

  const appearance = host.querySelector("#appearance-modes");
  if (appearance !== null) host.insertBefore(root, appearance);
  else host.appendChild(root);

  render(root);
  subscribeToPulseSession(() => render(root));
}

/* The control has exactly two states, and both state who you are — a
   stated result, never a mystery: signed out shows "Sign in"; signed in
   shows the member's display_name and a Sign out.

   WHO IS ALLOWED TO CALL SOMEBODY STAFF, AND WHY IT IS NOT THIS FILE.

   This control used to print "staff · front desk" whenever the BROWSER's
   remembered session said `actor_type: "staff"`. That session lives in
   localStorage. Anybody can write it. So the header was asserting an
   authority it had no way to hold, and once the staff surfaces grew a real
   door the two disagreed out loud: the header said "staff · front desk ·
   Sign out" on a page whose own body said "sign in to see this". Two
   answers to one question on one screen, which is how a person learns to
   believe neither.

   There is exactly one thing that can answer "is this staff?" now — the
   server, which holds the passphrase and signs the cookie. So the tag is
   NOT drawn from the local session at all. It is drawn only after
   readStaffGate() comes back confirming a session this browser could not
   have forged, and until then nothing is claimed. Rendering the unproven
   state first and correcting it later would flash a lie, however briefly.

   The local session keeps its real job: remembering a NAME so member
   surfaces can greet a person. A name is not a permission. */
function render(root: HTMLElement): void {
  /* readPulseSession() also handles recovery: a malformed, legacy, or
     stale value reads as null (and is cleaned up), so this render can
     never show a person who no longer exists. */
  const session = readPulseSession();
  root.textContent = "";

  if (session === null) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pulse-session-signin";
    button.textContent = "Sign in";
    /* A STAFF PAGE HAS NO MEMBER TO PICK. auth/staff-gate.ts's door panel
     * (#staff-door) only ever mounts on the dashboard and the re-engagement
     * tool, and on those pages the member-picker dialog below is the wrong
     * question — there is no fictional member to choose, only the staff
     * decision startFrontDeskSignIn() already knows how to make (passphrase
     * form if configured, a GitHat redirect otherwise). Everywhere else,
     * the dialog opens as before. */
    button.addEventListener("click", () => {
      if (document.getElementById("staff-door") !== null) {
        void startFrontDeskSignIn();
        return;
      }
      void openDialog();
    });
    root.appendChild(button);
    return;
  }

  const who = document.createElement("span");
  who.className = "pulse-session-who";
  const dot = document.createElement("i");
  dot.className = "pulse-session-dot";
  dot.setAttribute("aria-hidden", "true");
  who.appendChild(dot);
  who.appendChild(document.createTextNode(session.display_name));
  /* No tag yet, on purpose. If the server confirms a staff session it is
     appended below, after the answer arrives. */
  if (session.actor_type === "staff") {
    void readStaffGate().then((gate) => {
      if (!gate.signedIn) return;
      if (!who.isConnected) return; // a re-render happened first
      const tag = document.createElement("em");
      tag.className = "pulse-session-role";
      tag.textContent = "staff · front desk";
      who.appendChild(tag);
    });
  }

  const out = document.createElement("button");
  out.type = "button";
  out.className = "pulse-session-signout";
  out.textContent = "Sign out";
  /* Sign out means BOTH: the name this browser remembers, and the session
     the server signed. Clearing one and leaving the other is how a person
     ends up still holding staff access after they thought they left. */
  out.addEventListener("click", () => {
    clearPulseSession();
    void signOutStaff().then(() => { window.location.reload(); });
  });

  root.appendChild(who);
  root.appendChild(out);
}

/* ---------- the sign-in dialog (test mode) ---------- */

async function openDialog(): Promise<void> {
  let dialog = document.getElementById(DIALOG_ID) as HTMLDialogElement | null;
  if (dialog === null) {
    dialog = buildDialogShell();
    document.body.appendChild(dialog);
  }
  dialog.showModal();

  /* List the same synthetic studio Product A books against, so the
     remembered member_id is a real booking identity. The wait and any
     failure are stated in the dialog, never a blank panel. */
  const state = dialog.querySelector(".pulse-session-state");
  const rows = dialog.querySelector(".pulse-session-rows");
  if (!(state instanceof HTMLElement) || !(rows instanceof HTMLElement)) return;
  if (rows.childElementCount > 0) return; // already loaded once

  state.textContent = "Loading the member records…";
  try {
    const { members } = signInChoices();
    state.textContent =
      members.length === 0
        ? "0 members in the shared studio — there is nobody to sign in as."
        : `${counted(members.length, "member")} in the shared studio. Pick who you are:`;
    for (const member of members) rows.appendChild(memberRow(member));
    rows.appendChild(staffRow());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.textContent = `The member records could not load: ${message}`;
  }
}

function buildDialogShell(): HTMLDialogElement {
  const dialog = document.createElement("dialog");
  dialog.id = DIALOG_ID;
  dialog.className = "pulse-session-dialog";
  dialog.setAttribute("aria-label", "Sign in");

  const title = document.createElement("h2");
  title.textContent = "Sign in";

  /* The honesty block — what this sign-in is and is not. */
  const intro = document.createElement("p");
  intro.className = "pulse-session-intro";
  intro.textContent =
    "Test sign-in, for testing purposes — no password. Every member below " +
    "is fictional, and choosing one only decides what this browser shows " +
    "you. Staff sign-in is not on this list: the studio's server checks it, " +
    "and it is the only thing here that can refuse.";

  const state = document.createElement("p");
  state.className = "pulse-session-state";
  state.setAttribute("aria-live", "polite");

  const rows = document.createElement("div");
  rows.className = "pulse-session-rows";

  const close = document.createElement("button");
  close.type = "button";
  close.className = "pulse-session-close";
  close.textContent = "Close";
  close.addEventListener("click", () => dialog.close());

  dialog.appendChild(title);
  dialog.appendChild(intro);
  dialog.appendChild(state);
  dialog.appendChild(rows);
  dialog.appendChild(close);
  return dialog;
}

/* One row per member, in the studio's own order. The row shows the
   display name, the immutable member id, and the membership status — the
   id IS the identity that gets remembered, so it is shown, not hidden.
   No email appears: v1 stores none, derives none, and manufactures none. */
function memberRow(member: SyntheticMember): HTMLButtonElement {
  /* Presentation only: WHO may sign in and WHAT gets written is
   * auth/sign-in.ts's decision — this file just draws the rows. */
  return row(member.displayName, member.id, member.currentStatusSnapshot, () => {
    signInAsMember(member);
  });
}

function staffRow(): HTMLButtonElement {
  const { staff } = signInChoices();
  return row(
    staff.display_name,
    staff.actor_type === "staff" ? staff.staff_id : "",
    "staff · front desk",
    () => { void startFrontDeskSignIn(); },
    false,
  );
}

/* A local browser persona is not authorization. Front Desk verifies the
 * existing staff passphrase here, then the server-held session and local
 * name arrive together at Product B. If the passphrase is unavailable,
 * GitHat remains the separate server-held route. */
async function startFrontDeskSignIn(): Promise<void> {
  const gate = await readStaffGate();
  if (gate.signedIn) {
    signInAsFrontDesk();
    window.location.assign("/products/b-dashboard/");
    return;
  }
  if (!gate.reachable) {
    window.location.assign("/products/b-dashboard/");
    return;
  }
  if (!gate.configured) {
    window.location.assign("/auth/githat/start?next=/products/b-dashboard/");
    return;
  }
  showFrontDeskPassphrase();
}

function showFrontDeskPassphrase(): void {
  /* This used to assume openDialog() had already run and built the shell —
   * true whenever the member-picker dialog opened first. Now that a
   * staff-gated page's "Sign in" button calls startFrontDeskSignIn()
   * directly (never touching openDialog()), the shell may not exist yet:
   * build it exactly the way openDialog() does. */
  let dialog = document.getElementById(DIALOG_ID) as HTMLDialogElement | null;
  if (dialog === null) {
    dialog = buildDialogShell();
    document.body.appendChild(dialog);
  }
  if (!dialog.open) dialog.showModal();
  const intro = dialog.querySelector(".pulse-session-intro");
  const state = dialog.querySelector(".pulse-session-state");
  const rows = dialog.querySelector(".pulse-session-rows");
  if (!(intro instanceof HTMLElement) || !(state instanceof HTMLElement) || !(rows instanceof HTMLElement)) return;

  intro.textContent = "Enter the staff passphrase to open the staff dashboard.";
  state.textContent = "";
  const form = document.createElement("form");
  form.className = "pulse-session-staff-form";
  const label = document.createElement("label");
  label.htmlFor = "pulse-session-staff-passphrase";
  label.textContent = "Staff passphrase";
  const field = document.createElement("input");
  field.id = "pulse-session-staff-passphrase";
  field.type = "password";
  field.autocomplete = "current-password";
  field.required = true;
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "Open staff dashboard";
  form.append(label, field, submit);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submit.disabled = true;
    submit.textContent = "Checking…";
    void signInStaff(field.value).then((result) => {
      if (result.ok) {
        signInAsFrontDesk();
        window.location.assign("/products/b-dashboard/");
        return;
      }
      state.textContent = result.message;
      field.value = "";
      field.focus();
      submit.disabled = false;
      submit.textContent = "Open staff dashboard";
    });
  });
  rows.replaceChildren(form);
  field.focus();
}

function row(
  name: string,
  identity: string,
  note: string,
  choose: () => void,
  closeOnChoose: boolean = true,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pulse-session-row";

  const strong = document.createElement("strong");
  strong.textContent = name;
  const address = document.createElement("span");
  address.textContent = identity;
  const tag = document.createElement("em");
  tag.textContent = note;

  button.appendChild(strong);
  button.appendChild(address);
  button.appendChild(tag);
  button.addEventListener("click", () => {
    choose();
    if (!closeOnChoose) return;
    const dialog = document.getElementById(DIALOG_ID);
    if (dialog instanceof HTMLDialogElement) dialog.close();
  });
  return button;
}

/* ---------- styles, carried by the component ---------- */

function injectStylesOnce(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.pulse-session { display: inline-flex; align-items: center; gap: 10px; }
.pulse-session-signin,
.pulse-session-signout,
.pulse-session-close {
  background: transparent;
  color: var(--fg);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 8px 14px;
  font: inherit;
  cursor: pointer;
}
.pulse-session-signin { border-color: var(--accent, var(--line)); font-weight: 600; }
.pulse-session-signin:hover, .pulse-session-signout:hover, .pulse-session-close:hover,
.pulse-session-signin:focus-visible, .pulse-session-signout:focus-visible,
.pulse-session-close:focus-visible { border-color: var(--fg); }
.pulse-session-who { display: inline-flex; align-items: center; gap: 8px; font-weight: 600; color: var(--fg); }
.pulse-session-dot {
  width: 9px; height: 9px; border-radius: 50%;
  background: var(--accent, var(--fg)); /* solid accent — the sanctioned fill */
}
.pulse-session-role { font-style: normal; font-size: 0.78rem; white-space: nowrap; color: var(--muted); border: 1px solid var(--line); border-radius: 999px; padding: 1px 8px; }
.pulse-session-dialog {
  background: var(--bg); /* the law: surfaces are black or white only */
  color: var(--fg);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 22px;
  width: min(30rem, calc(100vw - 3rem));
}
.pulse-session-dialog::backdrop { background: color-mix(in srgb, var(--fg) 60%, transparent); }
.pulse-session-dialog h2 { margin: 0 0 8px; font-size: 1.15rem; }
.pulse-session-intro { margin: 0 0 12px; color: var(--muted); font-size: 0.9rem; line-height: 1.5; }
.pulse-session-state { margin: 0 0 10px; color: var(--muted); font-size: 0.9rem; }
.pulse-session-rows { display: grid; gap: 8px; max-height: 46vh; overflow-y: auto; margin-bottom: 14px; }
.pulse-session-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 10px;
  text-align: left;
  background: transparent;
  color: var(--fg);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 10px 14px;
  font: inherit;
  cursor: pointer;
}
.pulse-session-row:hover, .pulse-session-row:focus-visible { border-color: var(--accent, var(--fg)); }
.pulse-session-row strong { grid-column: 1; }
.pulse-session-row span { grid-column: 1; color: var(--muted); font-size: 0.85rem; }
.pulse-session-row em { grid-column: 2; grid-row: 1 / 3; align-self: center; font-style: normal; font-size: 0.78rem; color: var(--muted); }
.pulse-session-staff-form { display: grid; gap: 10px; }
.pulse-session-staff-form label { color: var(--fg); display: grid; font-size: .85rem; font-weight: 600; gap: 6px; }
.pulse-session-staff-form input { background: var(--bg); border: 1px solid var(--line); border-radius: 8px; color: var(--fg); font: inherit; padding: 9px 11px; }
.pulse-session-staff-form button { background: var(--accent, var(--fg)); border: 0; border-radius: 8px; color: var(--accent-ink, var(--bg)); cursor: pointer; font: inherit; font-weight: 600; padding: 9px 11px; }
.pulse-session-staff-form button:focus-visible, .pulse-session-staff-form input:focus-visible { outline: 3px solid var(--fg); outline-offset: 2px; }
`;
  document.head.appendChild(style);
}
