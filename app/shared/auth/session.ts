/* Pulse Studio — the shared sign-in session. TEAM-OWNED.

   THE IDENTITY LAW (locked 2026-08-20): a person is a MEMBER, identified by
   the email on their membership. One word in every UI (never customer,
   client, user, or guest), and one storage key — "pulse-session" — that
   every product reads. This file is that law as code.

   NAMES: every field here reuses the identifier the repo already has —
   member_id, display_name, membership_status come from
   app/shared/contract.ts, and email is the same field name the shared
   synthetic engine already carries. Nothing is renamed, nothing is invented.

   REMEMBERING, THE SIMPLEST WAY: localStorage, exactly like the black/white
   choice in theme-boot.ts (pulse-theme). Signing in survives closing the
   browser; Sign out (or an unreadable stored value) clears it. Because every
   product is served from the same origin, the same key is readable on every
   route — which is how sign-in reaches all four products without touching
   any product's folder.

   TEST MODE vs THE HOSTED VERSION: this is a static site — there is no
   server, so there is no password here and this session is FOR TESTING
   PURPOSES. The hosted (sold) version verifies a real password against
   Postgres: the schema is in ./schema.sql, and its tables use these same
   names. Swapping test mode for pg changes where a session comes from,
   not what a session is. */

import type { MembershipStatus } from "../contract.js";

export type SessionRole = "member" | "staff";

/* What being signed in means, in the contract's own vocabulary.
   member_id is null for staff logins that are not themselves members
   (mirrors logins.member_id being nullable in schema.sql). */
export interface Session {
  member_id: string | null;
  display_name: string;
  email: string;
  role: SessionRole;
  signed_in_at: string; // ISO timestamp, stamped by signIn()
}

/* What a caller provides to sign someone in — everything except the
   timestamp, which this module stamps so it is stamped one way. */
export type SignInDetails = Omit<Session, "signed_in_at">;

/* The one key. The pulse- prefix is the repo's existing convention:
   pulse-theme, pulse-reservations-a, pulse-outreach-ledger. */
const SESSION_KEY = "pulse-session";

type Listener = (session: Session | null) => void;
const listeners = new Set<Listener>();

/* Read the remembered session. An unreadable or wrong-shaped value is
   treated as signed out AND removed, so one bad write can never wedge the
   sign-in forever — the next read starts clean. */
export function currentSession(): Session | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isSession(parsed)) return parsed;
  } catch {
    /* fall through to the reset below */
  }
  localStorage.removeItem(SESSION_KEY);
  return null;
}

function isSession(value: unknown): value is Session {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v["member_id"] === null || typeof v["member_id"] === "string") &&
    typeof v["display_name"] === "string" &&
    typeof v["email"] === "string" &&
    (v["role"] === "member" || v["role"] === "staff") &&
    typeof v["signed_in_at"] === "string"
  );
}

export function signIn(details: SignInDetails): Session {
  const session: Session = { ...details, signed_in_at: new Date().toISOString() };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  notify(session);
  return session;
}

export function signOut(): void {
  localStorage.removeItem(SESSION_KEY);
  notify(null);
}

/* Subscribe to sign-in/out. Covers this tab (signIn/signOut call notify)
   and other tabs (the browser fires "storage" events across tabs for the
   same origin — the same mechanism that makes localStorage the simplest
   possible remembering). Returns an unsubscribe function. */
export function onSessionChange(listener: Listener): () => void {
  wireStorageOnce();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(session: Session | null): void {
  for (const listener of listeners) listener(session);
}

let storageWired = false;
function wireStorageOnce(): void {
  if (storageWired) return;
  storageWired = true;
  window.addEventListener("storage", (event) => {
    if (event.key === SESSION_KEY || event.key === null) notify(currentSession());
  });
}

/* ---------- test mode ----------

   The static build has no logins table to look in, so test sign-in derives
   a fictional address from identifiers the records already have. The .test
   top-level domain is reserved (RFC 2606): a @studio.test address can never
   be a real person's email, which keeps the public-repo law (every person
   in the fixtures is fictional) intact.

   Derivation is deterministic — same member, same address, every time.
   THE NAME TRAP (learned in Product D's CSV door): slugging a non-Latin
   display_name like 王伟 yields an empty string, and two such members would
   collapse into one address. member_id is the tie-breaker precisely because
   it is the contract's real key — names are attributes, never keys. */
export function testEmailFor(display_name: string, member_id: string): string {
  const slug = display_name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining accents: José -> jose
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const local = slug !== "" ? slug : member_id.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `${local}@studio.test`;
}

/* One staff login for testing the staff-facing surfaces (the scheduling
   dashboard and the re-engagement tool). Not a member — member_id is null,
   exactly as a seeded staff row would be in schema.sql's logins table. */
export const STAFF_TEST_LOGIN: SignInDetails = {
  member_id: null,
  display_name: "Front Desk",
  email: "frontdesk@studio.test",
  role: "staff",
};

/* Membership states that may sign in during testing: all of them. A paused
   or canceled member still owns their history and may need to talk to the
   studio — refusing them a sign-in is a product decision for the hosted
   version, not something test mode should quietly invent. */
export const SIGNABLE_STATUSES: readonly MembershipStatus[] = [
  "active",
  "paused",
  "canceled",
  "expired",
];
