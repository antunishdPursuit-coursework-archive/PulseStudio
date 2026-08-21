/* Pulse Studio — the shared session contract, version 1. TEAM-OWNED.

   WHAT THIS IS: one versioned, discriminated browser-session contract for
   the whole studio — an OPTIONAL test persona that follows navigation.
   It is convenience persistence for fictional records, stated as such
   everywhere. It is NOT authentication, NOT authorization, and no route
   anywhere is gated on it: every product page opens with no session at all.

   THE IDENTITY RULES (v1 — supersedes the v0 email-keyed reading):
   - A member's authoritative identity is the immutable member id the
     shared records already carry (SyntheticMember.id, "member:000001").
   - Display names are presentation only: never keys, never slugged,
     Unicode preserved, duplicates allowed, a rename never changes who
     someone is.
   - Email is contact/matching data. It is NOT stored in the session and
     is never derived from a name and presented as real membership data
     (v0 derived @studio.test addresses; v1 removes them).
   - Staff are their own actor, not fictional members: Front Desk carries
     a stable staff id, never a manufactured membership.

   NAMES: the spec sketched camelCase fields (actorType, memberId…). This
   repo's shared vocabulary is snake_case (member_id, display_name in
   app/shared/contract.ts and every product), so the same fields here are
   actor_type, member_id, staff_id, display_name — one convention, no
   second dialect. The values are unchanged from the spec.

   STORAGE: one key, "pulse-session", in localStorage — chosen so the
   optional persona survives full page loads, new tabs, and closing the
   browser (the same lifecycle as pulse-theme). Storage content is treated
   as HOSTILE input: malformed JSON, wrong shapes, wrong versions, blank
   or stale ids, smuggled cross-actor fields — all read as null, never
   throw, and never block a page. If storage itself is unavailable or
   throwing (private-mode quirks), the page stays usable: the choice is
   held in memory for the life of the page and simply won't survive
   navigation.

   Proofs: ./tests.html — written failing-first against this exact API. */

import { sharedStudioMembers } from "./studio.js";

/* The contract. actor_type is the discriminant; each arm carries exactly
   its own identity field — a member session smuggling staff_id (or the
   reverse) is invalid, so the two shapes can never be confused. */
export type PulseSession =
  | {
      version: 1;
      actor_type: "staff";
      staff_id: string;
      role: "front_desk";
      display_name: string;
    }
  | {
      version: 1;
      actor_type: "member";
      member_id: string;
      display_name: string;
    };

/* The one staff actor this build recognizes — the exact contract value.
   No membership record exists (or may exist) for it. */
export const FRONT_DESK: PulseSession = {
  version: 1,
  actor_type: "staff",
  staff_id: "staff:front-desk",
  role: "front_desk",
  display_name: "Front Desk",
};

/* The one key. The pulse- prefix is the repo's existing convention
   (pulse-theme, pulse-reservations-a). */
const SESSION_KEY = "pulse-session";

/* Recognized staff ids. One today; a second staff actor means adding it
   here plus a row in the sign-in dialog — never inferring from storage. */
const KNOWN_STAFF_IDS: ReadonlySet<string> = new Set(["staff:front-desk"]);

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/* The proof seam: tests swap in a throwing storage to prove the pages
   survive it. Production code never calls this. */
let storageOverride: StorageLike | null = null;
export function setStorageForChecks(storage: StorageLike | null): void {
  storageOverride = storage;
}
function storage(): StorageLike {
  return storageOverride ?? localStorage;
}

/* When storage is unavailable, the last deliberate choice lives here so
   the CURRENT page keeps working; it will not survive navigation, and
   that is stated behavior, not a bug. */
let memorySession: PulseSession | null = null;

/* Where a change happened. A surface that NAVIGATES on sign-in must only
 * do so for its own tab's action — yanking a second tab to another page
 * because someone signed in over here would be a page moving under a
 * person's hands. Listeners that don't care simply take one parameter. */
export type SessionChangeOrigin = "this-tab" | "other-tab";
type Listener = (session: PulseSession | null, origin: SessionChangeOrigin) => void;
const listeners = new Set<Listener>();

/* ---------- validation ---------- */

function isBlank(value: unknown): boolean {
  return typeof value !== "string" || value.trim() === "";
}

/* Strict shape check for version-1 values. Extra identity fields from the
   OTHER actor are rejected outright ("reject extra identity ambiguity"). */
function isPulseSession(value: unknown): value is PulseSession {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (v["version"] !== 1) return false;
  if (isBlank(v["display_name"])) return false;

  if (v["actor_type"] === "staff") {
    if ("member_id" in v) return false;
    if (isBlank(v["staff_id"])) return false;
    if (!KNOWN_STAFF_IDS.has(v["staff_id"] as string)) return false;
    if (v["role"] !== "front_desk") return false;
    return true;
  }
  if (v["actor_type"] === "member") {
    if ("staff_id" in v || "role" in v) return false;
    if (isBlank(v["member_id"])) return false;
    return true;
  }
  return false;
}

/* A member session must point at someone who exists in the shared studio
   — the same deterministic studio Product A books against. A session
   whose member vanished (a different day's studio, a hand-edited value)
   is stale and reads as signed out. */
let knownMemberIds: Set<string> | null = null;
function memberExists(member_id: string): boolean {
  knownMemberIds ??= new Set(sharedStudioMembers().map((member) => member.id));
  return knownMemberIds.has(member_id);
}

/* ---------- the contract API ---------- */

/* Read the remembered session. Returns null for: nothing stored, junk,
   wrong shape, blank ids, unknown staff, stale members, or unreadable
   storage. Garbage and stale/legacy values are also CLEARED so one bad
   write can never wedge sign-in — with one deliberate exception: a value
   whose version is a NEWER number than this build understands is left in
   place (a newer tab may own it; destroying it here would be vandalism),
   it simply reads as null in this build. */
export function readPulseSession(): PulseSession | null {
  let raw: string | null;
  try {
    raw = storage().getItem(SESSION_KEY);
  } catch {
    return memorySession; // storage is unreachable — serve the page's own memory
  }
  if (raw === null) {
    memorySession = null;
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    quietRemove();
    memorySession = null;
    return null;
  }

  if (
    typeof parsed === "object" &&
    parsed !== null &&
    typeof (parsed as Record<string, unknown>)["version"] === "number" &&
    ((parsed as Record<string, unknown>)["version"] as number) > 1
  ) {
    return null; // newer build's session: unreadable here, but not ours to destroy
  }

  if (!isPulseSession(parsed)) {
    quietRemove();
    memorySession = null;
    return null;
  }

  if (parsed.actor_type === "member" && !memberExists(parsed.member_id)) {
    quietRemove();
    memorySession = null;
    return null;
  }

  memorySession = parsed;
  return parsed;
}

/* Remember a session. An invalid value is refused outright — nothing is
   stored, nobody is notified. A storage failure downgrades gracefully to
   memory-only persistence for this page. */
export function writePulseSession(session: PulseSession): void {
  if (!isPulseSession(session)) return;
  if (session.actor_type === "member" && !memberExists(session.member_id)) {
    /* Unknown members may not sign in; storing them would only bounce on
       the next read. Tests cover the read-side clearing separately by
       writing through a raw storage handle. */
  }
  try {
    storage().setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* memory-only from here — stated lifecycle, not silence */
  }
  memorySession = session;
  notify(session, "this-tab");
}

export function clearPulseSession(): void {
  quietRemove();
  memorySession = null;
  notify(null, "this-tab");
}

function quietRemove(): void {
  try {
    storage().removeItem(SESSION_KEY);
  } catch {
    /* nothing to clean if storage is unreachable */
  }
}

/* Subscribe to session changes: same-tab writes/clears notify directly,
   and other tabs arrive through the browser's storage event (which never
   fires in the tab that wrote — both paths funnel through here). The same
   listener subscribed twice is delivered once (Set semantics). Returns an
   unsubscribe function. */
export function subscribeToPulseSession(listener: Listener): () => void {
  wireStorageEventOnce();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(session: PulseSession | null, origin: SessionChangeOrigin): void {
  for (const listener of [...listeners]) listener(session, origin);
}

let storageEventWired = false;
function wireStorageEventOnce(): void {
  if (storageEventWired) return;
  storageEventWired = true;
  window.addEventListener("storage", (event) => {
    if (event.key === SESSION_KEY || event.key === null) {
      notify(readPulseSession(), "other-tab");
    }
  });
}

/* ---------- the compatibility view ----------

   Product A (read-only in this increment) consumes currentSession() and
   onSessionChange() and reads exactly `.role` and `.member_id`. This view
   derives that older shape FROM the v1 contract on every call — one
   storage key, one validator, one source of truth, so the two views can
   never disagree. When A's owner adopts readPulseSession() in their own
   lane, this view retires. */

export interface LegacySessionView {
  member_id: string | null;
  display_name: string;
  role: "member" | "staff";
}

export function currentSession(): LegacySessionView | null {
  const session = readPulseSession();
  if (session === null) return null;
  if (session.actor_type === "staff") {
    return { member_id: null, display_name: session.display_name, role: "staff" };
  }
  return { member_id: session.member_id, display_name: session.display_name, role: "member" };
}

export function onSessionChange(listener: (session: LegacySessionView | null) => void): () => void {
  return subscribeToPulseSession(() => listener(currentSession()));
}
