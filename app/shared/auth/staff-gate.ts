/* Pulse Studio — the staff door.
   TEAM-OWNED.

   WHY THIS EXISTS, AND WHAT IT IS HONEST ABOUT.

   The staff surfaces used to render on page load. Anyone with the URL saw
   the dashboard and the re-engagement tool, and the audience law said that
   was acceptable because "the browser session is convenience, not access
   control". That reasoning was sound while this was only static files:
   nothing a page checks about itself can stop a person who can edit the
   page. A gate written in the browser is a picture of a gate.

   What changed is that the studio now runs a server. It holds a passphrase
   the browser never sees, it signs the session cookie itself, and it will
   not hand over data/staff-records.json to a request that cannot present
   one. So the answer to "is this person staff?" is no longer something the
   page decides — it is something the page ASKS, and the reply is computed
   somewhere a visitor cannot reach.

   WHAT IT STILL IS NOT. This gate stops a person from reading the studio's
   records. It does not stop a determined person from editing this file in
   their own browser to draw the page anyway — and it does not need to,
   because what that page would draw is generated in the browser and names
   nobody real. The records worth protecting are the ones behind the
   endpoint, and those never arrive without a session.

   And where there is no server at all — pages opened straight off a static
   host — this reports exactly that rather than failing open. A surface that
   cannot check its own door stays shut and says so.

   ONE SIGN-IN, NOT TWO. This panel used to draw its OWN "Sign in with
   GitHat" link and its own passphrase form, standing next to the "Sign in"
   control components/topbar.ts already renders into every page's header —
   two doors describing the same lock, one of them (this one) never
   threading the returnTo a person actually needs to land back where they
   were. topbar.ts's control is the one sign-in now: its Front Desk choice
   already reaches this exact decision — passphrase form if configured,
   GitHat redirect otherwise — through startFrontDeskSignIn(), and it is
   the only place either sign-in path runs. This module only ASKS the
   server who is signed in and states what it learns; it draws no form of
   its own. */

/** "front_desk" is the shared passphrase-door persona (no per-person
 *  identity to attribute anything to); "owner" and "employee" are real
 *  GitHat identities — see app/shared/auth/githat-oauth.ts's resolveStaffRole.
 *  null only while signedIn is false. */
export type StaffRole = "front_desk" | "owner" | "employee";

export interface StaffGate {
  /** The server answered, and a staff passphrase is configured on it. */
  readonly configured: boolean;
  /** This browser holds a session the server signed and still accepts. */
  readonly signedIn: boolean;
  /** No server answered at all — a static host, or one that is down. */
  readonly reachable: boolean;
  readonly role: StaffRole | null;
}

const SESSION_ENDPOINT = "/api/staff/session";
const INVITES_ENDPOINT = "/api/staff/invites";
const UNREACHABLE: StaffGate = { configured: false, signedIn: false, reachable: false, role: null };

/* ONE ANSWER PER PAGE LOAD. The top bar re-renders on every session change
   and each render used to ask the server again, so a page could fire this
   half a dozen times to learn the same thing. Both sign-in and sign-out
   reload the page, so the answer cannot go stale within one load — which is
   exactly the condition that makes caching it safe rather than clever. */
let pending: Promise<StaffGate> | null = null;

/** Ask the server who this is. Never throws: a door that errors is a door
    nobody can describe, and every caller here has to render something. */
export async function readStaffGate(): Promise<StaffGate> {
  if (pending === null) pending = askStaffGate();
  return await pending;
}

async function askStaffGate(): Promise<StaffGate> {
  let response: Response;
  try {
    response = await fetch(SESSION_ENDPOINT, { credentials: "same-origin" });
  } catch {
    return UNREACHABLE;
  }
  if (!response.ok) return UNREACHABLE;
  try {
    const body = (await response.json()) as { configured?: unknown; signedIn?: unknown; role?: unknown };
    const role = body.role === "front_desk" || body.role === "owner" || body.role === "employee" ? body.role : null;
    return {
      configured: body.configured === true,
      signedIn: body.signedIn === true,
      reachable: true,
      role,
    };
  } catch {
    return UNREACHABLE;
  }
}

export interface SignInResult {
  readonly ok: boolean;
  /** Shown to the person as-is. Never says which half was wrong. */
  readonly message: string;
}

export async function signInStaff(passphrase: string): Promise<SignInResult> {
  let response: Response;
  try {
    response = await fetch(SESSION_ENDPOINT, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passphrase }),
    });
  } catch {
    return { ok: false, message: "The studio's server did not answer." };
  }
  if (response.ok) {
    pending = null; // the answer just changed
    return { ok: true, message: "" };
  }
  let message = "That passphrase was not accepted.";
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error !== "") message = body.error;
  } catch {
    /* Keep the default: a server that cannot explain itself still refused. */
  }
  return { ok: false, message };
}

export async function signOutStaff(): Promise<void> {
  pending = null; // the answer is about to change
  try {
    await fetch(SESSION_ENDPOINT, { method: "DELETE", credentials: "same-origin" });
  } catch {
    /* Nothing to do: the cookie the server set is the only thing that
       grants anything, and a failed sign-out leaves it to expire. */
  }
}

/** Fetch the studio's staff-only records. Rejects with a readable message
    rather than returning half a page's worth of nothing. */
export async function loadStaffRecords(): Promise<unknown> {
  const response = await fetch("/api/staff/records", { credentials: "same-origin" });
  if (response.status === 401) throw new Error("Staff sign-in required.");
  if (!response.ok) throw new Error(`Staff records unavailable: HTTP ${response.status}.`);
  return await response.json();
}

export interface StaffInviteResult {
  readonly ok: boolean;
  /** An absolute URL when ok, ready to copy; the refusal message otherwise. */
  readonly urlOrMessage: string;
}

/** Owner-only — the server itself refuses this to anyone else (403). Mints
 *  ONE invite link; the owner copies it and sends it themselves, the same
 *  "never auto-send" discipline as Product D's drafted messages. */
export async function createStaffInvite(): Promise<StaffInviteResult> {
  let response: Response;
  try {
    response = await fetch(INVITES_ENDPOINT, { method: "POST", credentials: "same-origin" });
  } catch {
    return { ok: false, urlOrMessage: "The studio's server did not answer." };
  }
  if (!response.ok) {
    let message = "That invite could not be created.";
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body.error === "string" && body.error !== "") message = body.error;
    } catch { /* keep the default */ }
    return { ok: false, urlOrMessage: message };
  }
  const body = (await response.json()) as { url?: unknown };
  if (typeof body.url !== "string" || body.url === "") {
    return { ok: false, urlOrMessage: "The server did not return an invite link." };
  }
  return { ok: true, urlOrMessage: new URL(body.url, window.location.origin).toString() };
}

/* The sentence a person reads at the door, one per state. Kept here rather
   than in each product so both staff surfaces say the same thing — two
   doors describing the same lock differently is how a person learns to
   distrust both. */
export function doorMessage(gate: StaffGate): string {
  if (!gate.reachable) {
    return "This is a staff surface, and it needs the studio's own server to check who you are. " +
      "No server answered, so nothing is shown here.";
  }
  if (!gate.configured) {
    return "This is a staff surface. The server is running but has no staff passphrase set, " +
      "so nobody can sign in yet.";
  }
  return "This is a staff surface. Sign in with the studio's staff passphrase to see it.";
}

/* ---------------------------------------------------------------- *
 * THE DOOR ITSELF.
 *
 * One panel, mounted by both staff surfaces, so the dashboard and the
 * re-engagement tool cannot drift into describing the same lock two ways.
 * It draws from the shared theme's tokens only — the product's own accent
 * arrives through the body class, which is how a person still sees whose
 * screen they are standing in front of.
 * ---------------------------------------------------------------- */

const DOOR_ID = "staff-door";

/** Mount the door. Resolves true when the page may render its records:
    either a session was already held, or one was just signed in. */
export async function mountStaffDoor(root: HTMLElement): Promise<boolean> {
  const gate = await readStaffGate();
  if (gate.signedIn) {
    if (gate.role === "owner") mountOwnerInvitePanel();
    return true;
  }

  const panel = document.createElement("section");
  panel.id = DOOR_ID;
  panel.className = "staff-door";
  panel.setAttribute("aria-labelledby", `${DOOR_ID}-title`);

  const title = document.createElement("h2");
  title.id = `${DOOR_ID}-title`;
  title.textContent = "Staff sign-in";
  panel.append(title);

  const said = document.createElement("p");
  said.className = "staff-door-said";
  said.textContent = doorMessage(gate);
  panel.append(said);

  /* ONE SIGN-IN, IN THE HEADER — not here. This panel used to draw its own
   * "Sign in with GitHat" link plus, when a passphrase was configured, its
   * own separate passphrase form: a second sign-in UI standing next to the
   * one components/topbar.ts already renders into every page's header,
   * both claiming to do the same thing. topbar.ts's "Sign in" button
   * already reaches exactly this decision (passphrase form if configured,
   * GitHat redirect with the right returnTo otherwise) through
   * startFrontDeskSignIn() — so this panel now only STATES the door, and
   * points at the one control that opens it. */
  if (gate.reachable) {
    const said2 = document.createElement("p");
    said2.className = "staff-door-said";
    said2.textContent = "Use “Sign in”, above, to continue.";
    panel.append(said2);
  }

  /* BOTH STAFF SURFACES CALL THIS WITH document.body — so a bare
   * `root.replaceChildren(panel)` erased the page's own <header> (the ONE
   * sign-in control lives there, per the comment above) and, once
   * mounted, its <footer>, along with whatever the product had started
   * rendering. The point of replaceChildren was to make sure no staff
   * data renders underneath an unsigned-in visitor; it never meant to take
   * the shared chrome with it. Keep the elements theme-boot mounted before
   * this ran, and put them back either side of the panel — header above,
   * footer below — rather than both shoved ahead of it, which would read
   * top-to-bottom as header, footer, panel. */
  const header = [...root.children].find(
    (el) => el.tagName === "HEADER" || el.matches(".topnav, .page-head, .topbar"),
  );
  const footer = [...root.children].find((el) => el.tagName === "FOOTER");
  root.replaceChildren(...(header ? [header] : []), panel, ...(footer ? [footer] : []));
  return false;
}

/* ---------------------------------------------------------------- *
 * THE OWNER'S ONE TOOL: INVITE AN EMPLOYEE.
 *
 * Appended to document.body, never into `root` — the caller's own content
 * already lives there and this has nothing to do with it. Mounted once per
 * page load, only for the one signed-in identity resolveStaffRole calls
 * "owner"; an employee or the shared Front Desk persona never sees it, and
 * the server refuses the endpoint to them regardless. Reuses the staff
 * door's own card styling (`.staff-door`, `.staff-door-form`) so a new
 * owner-only surface does not need a second visual language, and — like
 * every shared-chrome piece in this file — carries no product colour.
 * ---------------------------------------------------------------- */

const OWNER_PANEL_ID = "owner-invite-panel";

function mountOwnerInvitePanel(): void {
  if (document.getElementById(OWNER_PANEL_ID) !== null) return;

  const panel = document.createElement("section");
  panel.id = OWNER_PANEL_ID;
  panel.className = "staff-door owner-invite-panel";
  panel.setAttribute("aria-labelledby", `${OWNER_PANEL_ID}-title`);

  const title = document.createElement("h2");
  title.id = `${OWNER_PANEL_ID}-title`;
  title.textContent = "Invite an employee";
  panel.append(title);

  const said = document.createElement("p");
  said.className = "staff-door-said";
  said.textContent = "Create a one-time link and send it yourself to someone who should have staff " +
    "access. It works once, for 7 days, for whoever opens it.";
  panel.append(said);

  const form = document.createElement("form");
  form.className = "staff-door-form";

  const create = document.createElement("button");
  create.type = "submit";
  create.textContent = "Create an invite link";
  form.append(create);

  const problem = document.createElement("p");
  problem.className = "staff-door-problem";
  problem.setAttribute("role", "alert");
  problem.hidden = true;
  form.append(problem);

  const result = document.createElement("div");
  result.hidden = true;

  const link = document.createElement("input");
  link.type = "text";
  link.readOnly = true;
  link.setAttribute("aria-label", "Invite link — copy and send this yourself");
  result.append(link);

  const copy = document.createElement("button");
  copy.type = "button";
  copy.textContent = "Copy";
  copy.addEventListener("click", () => {
    link.select();
    void navigator.clipboard?.writeText(link.value).then(
      () => { copy.textContent = "Copied"; },
      () => { /* Clipboard permission denied or unavailable: the link is already selected to copy by hand. */ },
    );
  });
  result.append(copy);
  form.append(result);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    create.disabled = true;
    create.textContent = "Creating…";
    problem.hidden = true;
    void createStaffInvite().then((outcome) => {
      create.disabled = false;
      create.textContent = "Create another invite link";
      if (!outcome.ok) {
        problem.textContent = outcome.urlOrMessage;
        problem.hidden = false;
        return;
      }
      link.value = outcome.urlOrMessage;
      copy.textContent = "Copy";
      result.hidden = false;
    });
  });

  panel.append(form);
  document.body.append(panel);
}
