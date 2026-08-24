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
   cannot check its own door stays shut and says so. */

export interface StaffGate {
  /** The server answered, and a staff passphrase is configured on it. */
  readonly configured: boolean;
  /** This browser holds a session the server signed and still accepts. */
  readonly signedIn: boolean;
  /** No server answered at all — a static host, or one that is down. */
  readonly reachable: boolean;
}

const SESSION_ENDPOINT = "/api/staff/session";
const UNREACHABLE: StaffGate = { configured: false, signedIn: false, reachable: false };

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
    const body = (await response.json()) as { configured?: unknown; signedIn?: unknown };
    return {
      configured: body.configured === true,
      signedIn: body.signedIn === true,
      reachable: true,
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
  if (gate.signedIn) return true;

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

  if (gate.configured) {
    const form = document.createElement("form");
    form.className = "staff-door-form";
    form.noValidate = true;

    const label = document.createElement("label");
    label.htmlFor = `${DOOR_ID}-pass`;
    label.textContent = "Staff passphrase";
    form.append(label);

    const field = document.createElement("input");
    field.id = `${DOOR_ID}-pass`;
    field.type = "password";
    field.name = "passphrase";
    field.autocomplete = "current-password";
    field.required = true;
    form.append(field);

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = "Sign in";
    form.append(submit);

    /* The failure line is created EMPTY and stays in the tree, so a screen
       reader is already listening when the first refusal arrives. A live
       region added at the moment it has something to say announces nothing. */
    const problem = document.createElement("p");
    problem.className = "staff-door-problem";
    problem.setAttribute("role", "alert");
    problem.hidden = true;
    form.append(problem);

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submit.disabled = true;
      submit.textContent = "Checking…";
      void signInStaff(field.value).then((result) => {
        if (result.ok) {
          panel.remove();
          /* Reload rather than render in place: every staff module reads
             its records at start-up, and a half-loaded page drawn before
             the session existed is harder to reason about than one honest
             second reload. */
          window.location.reload();
          return;
        }
        problem.textContent = result.message;
        problem.hidden = false;
        field.value = "";
        field.focus();
        submit.disabled = false;
        submit.textContent = "Sign in";
      });
    });

    panel.append(form);
  }

  root.replaceChildren(panel);
  return false;
}
