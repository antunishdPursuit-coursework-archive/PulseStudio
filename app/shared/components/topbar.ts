/* Pulse Studio — the shared sign-in control. TEAM-OWNED.
   This file is the birth of app/shared/components/: pieces of interface
   every product shows but no product owns. First resident: the top-bar
   sign-in control (the logo half of the top bar already exists in each
   page's own header — what was missing everywhere was the person).

   HOW IT REACHES EVERY ROUTE WITHOUT TOUCHING ANY LANE: theme-boot.ts —
   which every page except the staff dashboard already loads — calls
   mountSessionControl() with the page's existing header. So Booking,
   Support, Re-engagement, and the front door all grow the same control
   with zero edits inside a product folder (the lane law holds). The staff
   dashboard joins the day its owner adds the one theme-boot script tag.

   WHY THE STYLES ARE INJECTED FROM HERE: product pages never load the
   front door's stylesheet, and editing a product's stylesheet would cross
   a lane. A component that carries its own <style> is complete in one
   file and can break nobody else's page.

   THE COLOR LAW: every visual here paints with var(--accent, var(--fg)) —
   on a product's page the control carries THAT builder's color for free
   (the page's body class sets --accent), and on the front door, which
   belongs to no single builder, it falls back to neutral foreground.
   Backgrounds stay var(--bg); the dialog's backdrop is black at partial
   opacity — black is one of the two lawful grounds, nothing tinted.

   TEST MODE, STATED IN THE OPEN: the dialog says it is a test sign-in,
   for testing purposes, with no password — and where the real password
   check lives when the site is sold (Postgres, app/shared/auth/schema.sql).
   Claiming a login is "secure" on a static page would break the truth law;
   we say what it is instead. */

import type { SyntheticMember } from "../synthetic/contracts.js";
import {
  currentSession,
  onSessionChange,
  signIn,
  signOut,
  testEmailFor,
  STAFF_TEST_LOGIN,
} from "../auth/session.js";
import { sharedStudioMembers } from "../auth/studio.js";

const CONTROL_ID = "pulse-session-control";
const STYLE_ID = "pulse-session-styles";
const DIALOG_ID = "pulse-session-dialog";

/* Mount the control into a page's existing header. Idempotent — a second
   call on the same page does nothing, so theme-boot can call it blindly.
   If the header also holds the theme toggle, the control slots in before
   it so the toggle keeps its familiar end-of-row seat. */
export function mountSessionControl(host: Element): void {
  if (document.getElementById(CONTROL_ID)) return;
  injectStylesOnce();

  const root = document.createElement("div");
  root.id = CONTROL_ID;
  root.className = "pulse-session";

  const toggle = host.querySelector(".theme-toggle");
  if (toggle !== null) host.insertBefore(root, toggle);
  else host.appendChild(root);

  render(root);
  onSessionChange(() => render(root));
}

/* The control has exactly two states, and both state who you are — a
   stated result, never a mystery: signed out shows "Sign in"; signed in
   shows the member's display_name (with a
   staff tag when the login is staff) and a Sign out. */
function render(root: HTMLElement): void {
  const session = currentSession();
  root.textContent = "";

  if (session === null) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pulse-session-signin";
    button.textContent = "Sign in";
    button.addEventListener("click", () => { void openDialog(); });
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
  if (session.role === "staff") {
    const tag = document.createElement("em");
    tag.className = "pulse-session-role";
    tag.textContent = "staff";
    who.appendChild(tag);
  }

  const out = document.createElement("button");
  out.type = "button";
  out.className = "pulse-session-signout";
  out.textContent = "Sign out";
  out.addEventListener("click", () => signOut());

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
    const members = sharedStudioMembers();
    state.textContent =
      members.length === 0
        ? "0 members in the shared studio — there is nobody to sign in as."
        : `${members.length} members in the shared studio. Pick who you are:`;
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
    "Test sign-in, for testing purposes — no password. This site is a " +
    "static build that runs entirely in your browser, and every member " +
    "below is fictional. The hosted version of Pulse Studio checks a real " +
    "password against its Postgres database instead.";

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

/* One row per member, in the records' own order. The row shows the
   contract's display_name and the derived test address, so what you click
   is exactly what gets remembered. */
function memberRow(member: SyntheticMember): HTMLButtonElement {
  const email = member.email ?? testEmailFor(member.displayName, member.id);
  return row(member.displayName, email, member.currentStatusSnapshot, () => {
    signIn({
      member_id: member.id,
      display_name: member.displayName,
      email,
      role: "member",
    });
  });
}

function staffRow(): HTMLButtonElement {
  return row(
    STAFF_TEST_LOGIN.display_name,
    STAFF_TEST_LOGIN.email,
    "staff",
    () => { signIn(STAFF_TEST_LOGIN); },
  );
}

function row(
  name: string,
  email: string,
  note: string,
  choose: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pulse-session-row";

  const strong = document.createElement("strong");
  strong.textContent = name;
  const address = document.createElement("span");
  address.textContent = email;
  const tag = document.createElement("em");
  tag.textContent = note;

  button.appendChild(strong);
  button.appendChild(address);
  button.appendChild(tag);
  button.addEventListener("click", () => {
    choose();
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
.pulse-session-role { font-style: normal; font-size: 0.78rem; color: var(--muted); border: 1px solid var(--line); border-radius: 999px; padding: 1px 8px; }
.pulse-session-dialog {
  background: var(--bg); /* the law: surfaces are black or white only */
  color: var(--fg);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 22px;
  width: min(30rem, calc(100vw - 3rem));
}
.pulse-session-dialog::backdrop { background: rgba(0, 0, 0, 0.6); }
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
`;
  document.head.appendChild(style);
}
