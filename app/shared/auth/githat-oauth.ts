/* Pulse Studio — the GitHat OAuth client. TEAM-OWNED.

   WHAT THIS IS. GitHat (a sibling project, a separate live service at
   api.githat.io) runs its own "Continue with GitHat" authorization-code
   flow — its own dialect, not standard OAuth 2.0, measured against five
   other fleet apps that already use it in production (SebasTN, Colmado,
   Quantl, and others, via a shared `@fleet/auth` package or hand-rolled
   equivalents). This module is PULSE'S SIDE of that conversation: send a
   staff member to GitHat to sign in, get back a single-use code, exchange
   it for their identity server-to-server.

   THIS FILE USED TO SPEAK STANDARD OAUTH — `client_id`, `response_type`,
   PKCE (S256 challenge/verifier), a form-encoded token POST — none of
   which any working fleet consumer sends. Measured 2026-08-26 by reading
   every proven-working integration and GitHat's own backend source: the
   real wire contract is `app` (a slug, not `client_id`) + `redirect_url` +
   `state` on the authorize leg, and a bare JSON `{code}` on the token
   leg. PKCE appears nowhere in the fleet — GitHat's backend happens to
   support a code_challenge/code_verifier pair if a caller sends one, but
   nothing verifies that support actually works, and Pulse was the only
   caller ever exercising it. Real sign-ins failed at the token exchange
   every time this was tried for real, and the PKCE gate was the leading
   suspect precisely because it was the one code path unique to Pulse.
   Removed rather than kept "just in case" — inert crypto plumbing implies
   a security property nothing here has verified GitHat honors, which is
   worse than not having it. `state` alone, single-use and server-held,
   still gates CSRF the same way it does for every other fleet consumer.

   THIS IS AN AUTHENTICATION-PROTOCOL ADDITION, laid in ALONGSIDE the
   existing staff passphrase (staff-gate.ts, and STAFF_PASSPHRASE in
   scripts/start-haiku.mjs) — not a replacement. Both doors issue their own
   session cookie and neither is removed here. See scripts/start-haiku.mjs
   for how the two routes (`/auth/githat/start`, `/auth/callback`) use the
   functions below, and STAFF_GITHAT_SUBJECTS for the authorization list.

   WHY THIS FILE RUNS IN THE BROWSER TOO, NOT ONLY ON THE SERVER. Every
   cryptographic operation here — random bytes, SHA-256, RSA signature
   verification — goes through the standard Web Crypto API
   (`crypto.subtle`, `crypto.getRandomValues`) plus `atob`/`btoa` and
   `TextEncoder`/`TextDecoder`, all of which are global platform APIs in
   BOTH a real browser and Node 20+. Nothing here imports `node:crypto`.
   That is not a style preference: this file is imported by
   `auth/tests.ts`, which is loaded two ways — as a real page
   (`tests.html`, an actual browser) and headlessly in Node
   (`scripts/run-suites.mjs`, which stubs the DOM but runs in a REAL Node
   process, not a browser emulator). A module that reached for `node:crypto`
   would load fine under the second and silently fail to resolve under the
   first, which is exactly the kind of gap `app/shared/CLAUDE.md` already
   warns about for `color.ts` and `storage.ts`: one implementation, checked
   the same way everywhere it runs. `scripts/start-haiku.mjs` — the actual
   server, plain Node, never loaded by a browser — imports this same
   compiled module for the live routes, and separately uses `node:crypto`
   directly for signing PULSE'S OWN session cookie (a different, symmetric
   secret that never needs to leave that one process), the same way it
   already signs the passphrase door's cookie.

   THOSE TWO ASSUMPTIONS ARE NOW MEASURED, AND BOTH WERE WRONG. This
   header used to name them as guesses — that the client id would arrive
   in `aud`, and that the exchange would return an OIDC `id_token` — made
   because no live GitHat token was readable when the file was written.
   Both were checked against the running service and its source on
   2026-08-25: GitHat mints no ID token at all, its identity claim is
   `userId` rather than `sub`, and `aud` is the fleet-wide constant
   `githat`, never `pulse`. Every genuine sign-in would have been refused.
   See the long comment above `extractIdentity` for the measurements and
   for why this door now trusts the server-to-server exchange itself
   instead of a signature over its payload.

   TESTS: see `./tests.ts`. The synchronous pieces (state bookkeeping,
   claim checks, staff authorization) are proven directly by this repo's
   ordinary check() harness. The one genuinely asynchronous seam left
   (the token exchange itself) is resolved with a top-level `await`
   before being handed to check() — the same technique `synthetic/tests.ts`
   already uses for its own `await fetch(...)` calls — because the harness
   itself has no async support (see the comment next to `mountSessionControl`
   in tests.ts). A test-only fetcher is injected as a plain function
   argument (`FetchLike`); there is no fallback inside this module that
   would let a test double reach a production call by accident — every
   call site must supply its own fetcher explicitly. */

/* ---------------------------------------------------------------- *
 * THE REGISTERED FACTS. Not secrets — GitHat's endpoints are public. The
 * "pulse" slug is what GitHat's own dashboard/registry has on file, sent
 * as the `app` query param (not `client_id` — see buildAuthorizeUrl).
 * Pulse has no client secret and never sends one; there is no equivalent
 * of PKCE in the real fleet protocol to make that safe with, and none is
 * needed — `redirect_url` is allowlist-checked server-side by GitHat, and
 * `state`, generated and held here, is what actually stops CSRF.
 * ---------------------------------------------------------------- */

export const GITHAT_ISSUER = "https://api.githat.io";
export const GITHAT_AUTHORIZE_ENDPOINT = "https://api.githat.io/oauth/authorize";
export const GITHAT_TOKEN_ENDPOINT = "https://api.githat.io/oauth/token";
export const GITHAT_APP_SLUG = "pulse";
export const PULSE_REDIRECT_URI = "https://pulse.githat.io/auth/callback";
export const PULSE_TRUSTED_ORIGIN = "https://pulse.githat.io";

/* "a few minutes" (the task's own words) for how long a sign-in attempt in
   flight is allowed to sit before it must be restarted. */
export const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;
/* Authorization codes are meant to be exchanged within seconds of issuance;
   this only bounds how long THIS PROCESS remembers a code as "already
   spent" for replay detection, not how long GitHat itself honors one. */
export const OAUTH_CODE_TTL_MS = 5 * 60 * 1000;
/* ---------------------------------------------------------------- *
 * BASE64URL. What turns random bytes into a URL-safe `state` and invite
 * token. Still hand-written rather than reaching for `Buffer`, because
 * this module has to run in a real browser too (see the file header).
 * ---------------------------------------------------------------- */

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/* ---------------------------------------------------------------- *
 * STATE. One per sign-in attempt — the whole CSRF defense (see the file
 * header for why PKCE is not part of this any more).
 * ---------------------------------------------------------------- */

export function generateState(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
}

/* GitHat's own API takes the callback address as `redirect_url`, not the
   OAuth-standard `redirect_uri` — verified live against
   https://api.githat.io/oauth/authorize: the spec-standard param name
   alone gets a flat 400 ("redirect_url is required"), and swapping in
   `redirect_url` turns that into a real 302 to GitHat's own sign-in page
   with this exact authorize URL threaded through as where to return.
   Nothing about state or the app slug changes — only this one
   query-parameter NAME, on both the authorize leg here and the token
   exchange below, matches what the live service actually reads rather
   than what the spec would suggest. */
export function buildAuthorizeUrl(state: string): string {
  const url = new URL(GITHAT_AUTHORIZE_ENDPOINT);
  url.searchParams.set("app", GITHAT_APP_SLUG);
  url.searchParams.set("redirect_url", PULSE_REDIRECT_URI);
  url.searchParams.set("state", state);
  return url.toString();
}

/** EXACT match, on purpose. A suffix check ("ends with .pulse.githat.io")
 *  or a prefix check can both be fooled — "evil.pulse.githat.io" ends with
 *  the right suffix, and "pulse.githat.io.evil.example" starts with the
 *  right prefix. String equality against the one registered value cannot
 *  be fooled by either shape of look-alike. */
export function isTrustedRedirectUri(uri: string): boolean {
  return uri === PULSE_REDIRECT_URI;
}

export function isTrustedOrigin(origin: string): boolean {
  return origin === PULSE_TRUSTED_ORIGIN;
}

/* ---------------------------------------------------------------- *
 * THE TRANSACTION STORE. One entry per sign-in attempt in flight, held
 * server-side (never in localStorage, sessionStorage, or the URL after the
 * redirect). `take()` deletes on read regardless of outcome, so a state
 * value is single-use whether the read succeeds or the entry has already
 * expired — a legitimate first read and a replay attempt both see "not
 * found" from every read after the first.
 * ---------------------------------------------------------------- */

export interface OAuthTransaction {
  readonly state: string;
  readonly expiresAt: number;
  /** Set only when this sign-in started from an invite link
   *  (`/auth/invite/:token`) rather than the plain "Sign in with GitHat"
   *  door. The callback redeems this exact invite on a successful
   *  identity check — never any other invite, and never this one twice. */
  readonly inviteToken?: string;
  /** A server-approved route to resume after this exact sign-in succeeds.
   *  It is selected by the server, never trusted from the callback URL. */
  readonly returnTo?: string;
}

export function beginOAuthTransaction(now: number, inviteToken?: string, returnTo?: string): OAuthTransaction {
  const state = generateState();
  const tx: OAuthTransaction = { state, expiresAt: now + OAUTH_STATE_TTL_MS };
  return {
    ...tx,
    ...(inviteToken === undefined ? {} : { inviteToken }),
    ...(returnTo === undefined ? {} : { returnTo }),
  };
}

export interface TransactionStore {
  save(tx: OAuthTransaction): void;
  /** The transaction for `state`, or null for: never issued, already
   *  consumed, or expired. Always single-use: a hit is removed before this
   *  function even checks whether it was still within its lifetime. */
  take(state: string, now: number): OAuthTransaction | null;
  size(): number;
}

export function createTransactionStore(): TransactionStore {
  const byState = new Map<string, OAuthTransaction>();
  return {
    save(tx) {
      byState.set(tx.state, tx);
    },
    take(state, now) {
      const tx = byState.get(state);
      if (tx === undefined) return null;
      byState.delete(state);
      if (now > tx.expiresAt) return null;
      return tx;
    },
    size() {
      return byState.size;
    },
  };
}

/* ---------------------------------------------------------------- *
 * AUTHORIZATION-CODE REPLAY. A code is claimed exactly once; a second
 * presentation of the same code — however it arrived — is refused. Kept
 * separate from the state store because a code and a state are consumed by
 * different checks (state gates "is this callback expected at all"; this
 * gates "has this exact code already been spent").
 * ---------------------------------------------------------------- */

export interface UsedCodeStore {
  /** True the first time `code` is claimed; false on every repeat. */
  claim(code: string, now: number): boolean;
}

export function createUsedCodeStore(ttlMs: number = OAUTH_CODE_TTL_MS): UsedCodeStore {
  const usedUntil = new Map<string, number>();
  return {
    claim(code, now) {
      for (const [seen, expiresAt] of usedUntil) {
        if (expiresAt < now) usedUntil.delete(seen);
      }
      if (usedUntil.has(code)) return false;
      usedUntil.set(code, now + ttlMs);
      return true;
    },
  };
}

/* ---------------------------------------------------------------- *
 * TOKEN EXCHANGE. Server-to-server only — nothing here is ever called
 * from a browser. The fetcher is always supplied by the caller: production
 * code passes the real `fetch`, tests pass a fake that never touches the
 * network. There is no default that would let one stand in for the other
 * by accident.
 * ---------------------------------------------------------------- */

export interface FetchLike {
  (url: string, init?: RequestInit): Promise<{
    readonly ok: boolean;
    readonly status: number;
    readonly json: () => Promise<unknown>;
  }>;
}

/* WHAT COMES BACK, AND WHY NOTHING HERE VERIFIES A JWT.
 *
 * This module used to treat the exchange as OpenID Connect: pull an
 * `id_token` (or a JWT-shaped `access_token`) out of the response and
 * verify it RS256 against GitHat's JWKS, checking `iss`, `aud` and `sub`.
 * The file header carried that as an explicitly UNVERIFIED assumption,
 * because no live GitHat token was available to read when it was written.
 *
 * It was wrong, and measured against the running service on 2026-08-25 it
 * was wrong three separate ways at once:
 *
 *   1. GITHAT MINTS NO ID TOKEN. `POST /oauth/token` answers RFC 6749
 *      §5.1 and nothing more — `{ access_token, token_type, expires_in,
 *      refresh_token, scope, user, org }`. There is no `id_token` field to
 *      find. (GitHat's own discovery document advertised OIDC anyway; its
 *      maintainers documented that as an overclaim and are correcting it.)
 *   2. THE IDENTITY CLAIM IS `userId`, NOT `sub`. GitHat's access token
 *      carries `{ userId, email, type, tv, app, ... }`. A `sub` lookup
 *      finds nothing, so every real sign-in read as an empty subject.
 *   3. THE AUDIENCE IS `githat`, NOT `pulse`. `aud` is
 *      `appId || app || 'githat'`, and Pulse has no registered appId, so
 *      the check for `"pulse"` refused every genuine token.
 *
 * So the verification was not merely unnecessary — it could never have
 * admitted a single real user. Deleting it removes ~200 lines that
 * implied a security property this door does not actually rest on.
 *
 * WHAT IT RESTS ON INSTEAD — the ordinary RFC 6749 §4.1 authorization-code
 * argument every proven-working fleet consumer (SebasTN, Quantl, and the
 * shared `@fleet/auth` package) already relies on, measured by reading
 * their actual client code rather than assumed:
 *
 *   - The `state` is 32 random bytes this server minted, held SERVER-SIDE
 *     and single-use, so a callback nobody here started is refused before
 *     any exchange happens.
 *   - The code itself is single-use (GitHat flips it atomically on first
 *     redemption) and short-lived.
 *   - The exchange is a DIRECT server-to-server HTTPS POST from this
 *     process to api.githat.io. TLS authenticates the responder, and no
 *     browser or third party is in the path to tamper with the reply.
 *
 * PKCE (code_challenge/code_verifier) used to sit alongside this. It is
 * gone: no fleet consumer uses it, GitHat's support for it was never
 * proven correct against a real sign-in, and it was the one code path
 * unique to Pulse when every real "Sign in with GitHat" attempt failed at
 * the token exchange. Removed rather than kept for defense-in-depth —
 * unverified crypto plumbing is not depth, it is a guess dressed as one.
 *
 * Given all this, the `user` object in that response is authoritative
 * BECAUSE OF WHERE IT CAME FROM, not because of a signature over it. A
 * JWT `aud` check would have added nothing on top: `aud` is the constant
 * `githat` for every app in the fleet, so it distinguishes nothing — a
 * token minted for any other GitHat app carries exactly the same value.
 * Trusting the transport we opened ourselves is the honest boundary. */

/** The identity GitHat returns for the person who just signed in.
 *  `sub` is GitHat's own immutable user id — the value that goes in
 *  STAFF_GITHAT_SUBJECTS / OWNER_GITHAT_SUBJECT. It is named `sub` here,
 *  rather than `userId`, because that is the vocabulary the rest of this
 *  door already speaks; the mapping from GitHat's wire name happens once,
 *  in extractIdentity below, so exactly one line has to change if GitHat
 *  ever renames it. */
export interface GithatIdentity {
  readonly sub: string;
  readonly email: string | null;
  readonly emailVerified: boolean;
  readonly name: string | null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** Read the identity out of a token-endpoint response, treating the body
 *  as hostile input the same way readPulseSession treats storage: any
 *  shape that is not exactly what GitHat documents reads as null, never a
 *  partially-filled identity and never a throw. A missing or blank user
 *  id is the one thing that MUST fail closed — an empty subject would
 *  otherwise sail through resolveStaffRole against an empty allowlist. */
export function extractIdentity(tokenResponse: unknown): GithatIdentity | null {
  if (typeof tokenResponse !== "object" || tokenResponse === null) return null;
  const body = tokenResponse as Record<string, unknown>;
  const user = body["user"];
  if (typeof user !== "object" || user === null) return null;
  const fields = user as Record<string, unknown>;
  /* GitHat's wire name for the identity is `id` inside `user` (the same
     value its access token carries as `userId`). This is the ONE place
     that mapping is written down. */
  const sub = nonEmptyString(fields["id"]);
  if (sub === null) return null;
  return {
    sub,
    email: nonEmptyString(fields["email"]),
    emailVerified: fields["emailVerified"] === true,
    name: nonEmptyString(fields["name"]),
  };
}

export interface TokenExchangeResult {
  readonly ok: boolean;
  readonly identity?: GithatIdentity;
  /** A short machine-readable reason. NEVER contains the code, the
   *  verifier, or any part of a token — the callback route logs this
   *  string verbatim. */
  readonly reason?: string;
}

export async function exchangeCodeForToken(params: {
  readonly code: string;
  readonly fetcher: FetchLike;
}): Promise<TokenExchangeResult> {
  /* Every proven-working fleet consumer POSTs exactly this — no
     grant_type, no client_id, no redirect_url echoed back, no
     code_verifier. GitHat's own oauth-token.js never reads any of those
     four fields; the code lookup alone (single-use, short-lived) is what
     it checks. Matching the verified-working shape byte-for-byte rather
     than the OAuth-spec shape is the whole fix (see the file header). */
  let response;
  try {
    response = await params.fetcher(GITHAT_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ code: params.code }),
    });
  } catch {
    return { ok: false, reason: "token_endpoint_unreachable" };
  }
  if (!response.ok) return { ok: false, reason: "token_endpoint_rejected" };
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return { ok: false, reason: "token_endpoint_bad_json" };
  }
  const identity = extractIdentity(json);
  if (identity === null) return { ok: false, reason: "no_identity_in_response" };
  return { ok: true, identity };
}

/* ---------------------------------------------------------------- *
 * STAFF AUTHORIZATION. Separate from authentication on purpose: a valid
 * GitHat identity, on its own, grants nothing. Only an EXACT match against
 * STAFF_GITHAT_SUBJECTS (an env var, comma-separated, read by
 * scripts/start-haiku.mjs) makes a visitor staff. Unset or empty means
 * deny everyone — never allow everyone — and the check is against the
 * immutable `sub` claim only, never an email, display name, or provider
 * username, none of which are guaranteed stable or unique.
 * ---------------------------------------------------------------- */

export function parseStaffSubjects(envValue: string | undefined): ReadonlySet<string> {
  return new Set(
    (envValue ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry !== ""),
  );
}

export function isAuthorizedStaffSubject(sub: string, subjects: ReadonlySet<string>): boolean {
  if (subjects.size === 0) return false;
  return subjects.has(sub);
}

/** The sentence a person sees when GitHat confirmed who they are and this
 *  studio still will not let them in.
 *
 *  It exists as a FUNCTION rather than a string literal inside the server
 *  for the reason app/shared/CLAUDE.md already gives twice: the server is a
 *  module no suite can import, so anything in it that becomes a RULE rather
 *  than markup moves somewhere a check can load. The rule here is "a denied
 *  person is told their own account id, because otherwise nobody can ever
 *  be authorized for the first time" — and that it is exactly this string,
 *  so a later edit cannot quietly drop the id and reintroduce the
 *  chicken-and-egg. */
export function unauthorizedDetail(sub: string): string {
  return `Your GitHat account id is ${sub} — an operator can authorize it by adding it to ` +
    `OWNER_GITHAT_SUBJECT (for the studio owner) or STAFF_GITHAT_SUBJECTS, then restarting the server.`;
}

/* ---------------------------------------------------------------- *
 * ROLES. The studio owner is one specific GitHat identity, set once as
 * OWNER_GITHAT_SUBJECT alongside STAFF_GITHAT_SUBJECTS. Everyone else who
 * reaches staff access — via the static subject list above, or by
 * accepting an owner-issued invite (see the invite store below) — is an
 * "employee". The role decides ONE thing in this MVP: only "owner" may
 * mint a new invite. Nothing here grants a role by email, display name,
 * or provider username — the immutable `sub` claim only, same as
 * isAuthorizedStaffSubject above.
 * ---------------------------------------------------------------- */

export type StaffRole = "owner" | "employee";

export function parseOwnerSubject(envValue: string | undefined): string | null {
  const trimmed = (envValue ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

export function resolveStaffRole(
  sub: string,
  params: {
    readonly ownerSubject: string | null;
    readonly staffSubjects: ReadonlySet<string>;
    readonly directorySubjects: ReadonlySet<string>;
    /** Subjects the directory itself records as "owner" — distinct from
     *  `directorySubjects` (which always means "employee") so a
     *  directory-granted owner and an env-var owner both resolve to the
     *  same role without the two lists needing to agree on shape. */
    readonly directoryOwnerSubjects?: ReadonlySet<string>;
  },
): StaffRole | null {
  if (params.ownerSubject !== null && sub === params.ownerSubject) return "owner";
  if (params.directoryOwnerSubjects?.has(sub)) return "owner";
  if (isAuthorizedStaffSubject(sub, params.staffSubjects)) return "employee";
  if (params.directorySubjects.has(sub)) return "employee";
  return null;
}

/** True once ANY owner exists, by either mechanism — the gate on the
 *  auto-bootstrap below. Deliberately conservative: as soon as one owner
 *  exists, by any means, bootstrap can never fire for a second subject. */
export function hasAnyOwnerConfigured(params: {
  readonly ownerSubject: string | null;
  readonly directoryOwnerSubjects: ReadonlySet<string>;
}): boolean {
  return params.ownerSubject !== null || params.directoryOwnerSubjects.size > 0;
}

/* ---------------------------------------------------------------- *
 * STAFF INVITES. The owner's whole MVP tool for growing the staff list:
 * mint a single-use, expiring link; send it themselves through their own
 * channel (same discipline as Product D's drafted messages — this app
 * never sends anything on anyone's behalf); the person who opens it signs
 * in with their own GitHat account and is added to the directory as
 * "employee" the moment that sign-in succeeds. Held server-side only,
 * same shape as the OAuth transaction store above and for the same
 * reason: never a cookie, never a URL the browser is trusted to keep
 * honest, never localStorage.
 * ---------------------------------------------------------------- */

/* A week is long enough that an owner sending a link "I'll get to this
   later" still works, short enough that a stale, forgotten invite is not
   a standing door. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface StaffInvite {
  readonly token: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  used: boolean;
}

export interface InviteStore {
  create(now: number): StaffInvite;
  /** Still pending (issued, not yet used, not yet expired) — read-only. */
  peek(token: string, now: number): StaffInvite | null;
  /** Single-use: returns the invite iff it was still pending, and marks it
   *  used in the same call so a second claim of the same token always
   *  fails, whether the second attempt is the same person reloading a page
   *  or someone else who intercepted the link. */
  claim(token: string, now: number): StaffInvite | null;
  list(now: number): readonly StaffInvite[];
}

export function createInviteStore(ttlMs: number = INVITE_TTL_MS): InviteStore {
  const invites = new Map<string, StaffInvite>();
  function sweep(now: number): void {
    for (const [token, invite] of invites) {
      if (invite.used || invite.expiresAt < now) invites.delete(token);
    }
  }
  return {
    create(now) {
      sweep(now);
      const token = generateState(); // same shape as OAuth `state`: random, URL-safe, single-use
      const invite: StaffInvite = { token, createdAt: now, expiresAt: now + ttlMs, used: false };
      invites.set(token, invite);
      return invite;
    },
    peek(token, now) {
      const invite = invites.get(token);
      if (invite === undefined || invite.used || invite.expiresAt < now) return null;
      return invite;
    },
    claim(token, now) {
      const invite = invites.get(token);
      if (invite === undefined || invite.used || invite.expiresAt < now) return null;
      invite.used = true;
      return invite;
    },
    list(now) {
      sweep(now);
      return [...invites.values()];
    },
  };
}
