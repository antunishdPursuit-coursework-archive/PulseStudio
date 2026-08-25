/* Pulse Studio — the GitHat OAuth client. TEAM-OWNED.

   WHAT THIS IS. GitHat (a sibling project, a separate live service at
   api.githat.io) runs its own OAuth 2.0 authorization-code + PKCE(S256)
   server. This module is PULSE'S SIDE of that conversation: everything
   needed to send a staff member to GitHat to sign in, get back an
   authorization code, exchange it for an identity token server-to-server,
   and verify that token ourselves rather than trusting it on sight.

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

   TWO ASSUMPTIONS THIS FILE MAKES, because no live GitHat token was
   available to read from this session, and the sibling backend task's
   response-shape source was not available either. Both are named here so
   the one seam to fix is obvious if either is wrong:

     1. The client identifier lives in the standard `aud` claim (a string
        equal to "pulse", or an array containing it) — see
        `audienceMatches` below.
     2. The token exchange may return an OIDC `id_token`, or the identity
        may simply BE the `access_token` if GitHat issues JWT access
        tokens — see `extractIdentityToken` below. Whichever field parses
        as a three-part JWT is treated as the identity token; if neither
        does, the exchange fails closed rather than guessing.

   TESTS: see `./tests.ts`. The synchronous pieces (state/PKCE bookkeeping,
   JWT parsing, claim checks, staff authorization) are proven directly by
   this repo's ordinary check() harness. The two genuinely asynchronous
   seams (RSA signature verification, JWKS fetching) are resolved with a
   top-level `await` before being handed to check() — the same technique
   `synthetic/tests.ts` already uses for its own `await fetch(...)` calls —
   because the harness itself has no async support (see the comment next to
   `mountSessionControl` in tests.ts). A test-only JWKS source is injected
   as a plain function argument (`FetchLike`); there is no fallback inside
   this module that would let a test double reach a production call by
   accident — every call site must supply its own fetcher explicitly. */

/* ---------------------------------------------------------------- *
 * THE REGISTERED FACTS. Not secrets — GitHat's endpoints are public, and
 * Pulse's client_id and redirect_uri are what GitHat's own dashboard has on
 * file for this client. Pulse is a PUBLIC client (no client secret was
 * provisioned), which is exactly what PKCE exists to make safe.
 * ---------------------------------------------------------------- */

export const GITHAT_ISSUER = "https://api.githat.io";
export const GITHAT_AUTHORIZE_ENDPOINT = "https://api.githat.io/oauth/authorize";
export const GITHAT_TOKEN_ENDPOINT = "https://api.githat.io/oauth/token";
export const GITHAT_JWKS_ENDPOINT = "https://api.githat.io/.well-known/jwks.json";
export const GITHAT_CLIENT_ID = "pulse";
export const PULSE_REDIRECT_URI = "https://pulse.githat.io/auth/callback";
export const PULSE_TRUSTED_ORIGIN = "https://pulse.githat.io";

/* "a few minutes" (the task's own words) for how long a sign-in attempt in
   flight is allowed to sit before it must be restarted. */
export const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;
/* Authorization codes are meant to be exchanged within seconds of issuance;
   this only bounds how long THIS PROCESS remembers a code as "already
   spent" for replay detection, not how long GitHat itself honors one. */
export const OAUTH_CODE_TTL_MS = 5 * 60 * 1000;
/* Bounded so a rotated signing key is picked up within a quarter hour
   rather than being cached indefinitely — long enough that an ordinary
   run of sign-ins costs one fetch, short enough that key rotation is not a
   multi-hour outage. */
export const JWKS_CACHE_TTL_MS = 15 * 60 * 1000;
/* Small tolerance for clock drift between this server and GitHat's. */
export const CLOCK_SKEW_SECONDS = 60;

/* ---------------------------------------------------------------- *
 * BASE64URL, written by hand because `Buffer` does not exist in a browser
 * and this module has to run in both places (see the file header).
 * ---------------------------------------------------------------- */

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/* Typed `Uint8Array<ArrayBuffer>` rather than the bare, wider
   `Uint8Array<ArrayBufferLike>` alias — the signature bytes this produces
   are handed straight to `crypto.subtle.verify`, which (as of the DOM
   types shipped with TypeScript 5.7+) wants a buffer it can prove is a
   real `ArrayBuffer`, not merely "some ArrayBuffer-like thing". `new
   Uint8Array(length)` always allocates a real one; naming that in the
   return type is what lets it flow through untouched. */
function base64UrlDecodeToBytes(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlDecodeToString(value: string): string {
  return new TextDecoder().decode(base64UrlDecodeToBytes(value));
}

/* ---------------------------------------------------------------- *
 * STATE + PKCE. Generated together, once per sign-in attempt.
 * ---------------------------------------------------------------- */

export function generateState(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
}

export function generateCodeVerifier(): string {
  /* RFC 7636 wants 43-128 characters from [A-Za-z0-9-._~]. base64url of 32
     random bytes is 43 characters — the shortest RFC-legal length, drawn
     from cryptographically random bytes rather than trimmed down from
     something longer. */
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
}

export async function codeChallengeFromVerifier(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

/** Defense in depth: even though nothing in this app accepts a
 *  caller-supplied verifier or challenge, this recomputes the relationship
 *  independently of whatever GitHat's own token endpoint decides, so a
 *  future bug that let a mismatched verifier through this process is
 *  caught here too rather than resting entirely on the far end. */
export async function pkceMatches(verifier: string, expectedChallenge: string): Promise<boolean> {
  if (typeof verifier !== "string" || verifier === "") return false;
  return (await codeChallengeFromVerifier(verifier)) === expectedChallenge;
}

/* GitHat's own API takes the callback address as `redirect_url`, not the
   OAuth-standard `redirect_uri` — verified live against
   https://api.githat.io/oauth/authorize: the spec-standard param name
   alone gets a flat 400 ("redirect_url is required"), and swapping in
   `redirect_url` turns that into a real 302 to GitHat's own sign-in page
   with this exact authorize URL threaded through as where to return.
   Nothing about PKCE, state, or the client id changes — only this one
   query-parameter NAME, on both the authorize leg here and the token
   exchange below, matches what the live service actually reads rather
   than what the spec would suggest. */
export function buildAuthorizeUrl(state: string, codeChallenge: string): string {
  const url = new URL(GITHAT_AUTHORIZE_ENDPOINT);
  url.searchParams.set("client_id", GITHAT_CLIENT_ID);
  url.searchParams.set("redirect_url", PULSE_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
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
  readonly codeVerifier: string;
  readonly codeChallenge: string;
  readonly expiresAt: number;
  /** Set only when this sign-in started from an invite link
   *  (`/auth/invite/:token`) rather than the plain "Sign in with GitHat"
   *  door. The callback redeems this exact invite on a successful
   *  identity check — never any other invite, and never this one twice. */
  readonly inviteToken?: string;
}

export async function beginOAuthTransaction(now: number, inviteToken?: string): Promise<OAuthTransaction> {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await codeChallengeFromVerifier(codeVerifier);
  const tx: OAuthTransaction = { state, codeVerifier, codeChallenge, expiresAt: now + OAUTH_STATE_TTL_MS };
  return inviteToken === undefined ? tx : { ...tx, inviteToken };
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

function looksLikeJwt(value: unknown): value is string {
  return typeof value === "string" && value.split(".").length === 3;
}

/** Which field of a token response is the identity token to verify. See
 *  the file header's second assumption: prefers an OIDC `id_token`, falls
 *  back to `access_token` when GitHat issues JWT access tokens, and
 *  refuses to guess further than that. */
export function extractIdentityToken(tokenResponse: unknown): string | null {
  if (typeof tokenResponse !== "object" || tokenResponse === null) return null;
  const body = tokenResponse as Record<string, unknown>;
  if (looksLikeJwt(body["id_token"])) return body["id_token"];
  if (looksLikeJwt(body["access_token"])) return body["access_token"];
  return null;
}

export interface TokenExchangeResult {
  readonly ok: boolean;
  readonly identityToken?: string;
  readonly reason?: string;
}

export async function exchangeCodeForToken(params: {
  readonly code: string;
  readonly codeVerifier: string;
  readonly fetcher: FetchLike;
}): Promise<TokenExchangeResult> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_url: PULSE_REDIRECT_URI, // see buildAuthorizeUrl's comment: GitHat's own param name
    client_id: GITHAT_CLIENT_ID,
    code_verifier: params.codeVerifier,
  });
  let response;
  try {
    response = await params.fetcher(GITHAT_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: body.toString(),
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
  const identityToken = extractIdentityToken(json);
  if (identityToken === null) return { ok: false, reason: "no_identity_token" };
  return { ok: true, identityToken };
}

/* ---------------------------------------------------------------- *
 * JWT VERIFICATION. RS256 only, hand-written against Web Crypto rather
 * than trusting a library — and rather than trusting the token's own
 * `alg` header past a hard-coded comparison against the one string this
 * door accepts. `none`, `HS256`, and anything else are refused before any
 * key lookup or signature check even runs, which is what keeps an
 * algorithm-confusion attack (an attacker resigning a token with a
 * different algorithm, or asserting no signature at all) from ever
 * reaching the part of this function that would grant anything.
 * ---------------------------------------------------------------- */

export interface DecodedJwt {
  readonly header: Record<string, unknown>;
  readonly payload: Record<string, unknown>;
  readonly signingInput: string;
  readonly signature: Uint8Array<ArrayBuffer>;
}

/* The DOM lib's own `JsonWebKey` interface does not carry `kid` (it is a
   real, optional JWK member the type just omits), so it is extended
   locally rather than reached around with a cast at every use. */
interface GithatJwk extends JsonWebKey {
  readonly kid?: string;
}

export function decodeJwt(token: string): DecodedJwt | null {
  if (typeof token !== "string" || token === "") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;
  if (headerB64 === undefined || payloadB64 === undefined || signatureB64 === undefined) return null;
  let header: unknown;
  let payload: unknown;
  try {
    header = JSON.parse(base64UrlDecodeToString(headerB64));
    payload = JSON.parse(base64UrlDecodeToString(payloadB64));
  } catch {
    return null;
  }
  if (typeof header !== "object" || header === null || Array.isArray(header)) return null;
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  let signature: Uint8Array<ArrayBuffer>;
  try {
    signature = base64UrlDecodeToBytes(signatureB64);
  } catch {
    return null;
  }
  return {
    header: header as Record<string, unknown>,
    payload: payload as Record<string, unknown>,
    signingInput: `${headerB64}.${payloadB64}`,
    signature,
  };
}

export type JwtVerifyResult =
  | { readonly ok: true; readonly sub: string }
  | { readonly ok: false; readonly reason: string };

async function verifyJwtSignature(
  decoded: DecodedJwt,
  jwks: readonly GithatJwk[],
): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }> {
  /* THE ALGORITHM CHECK COMES FIRST, AND IS A STRING COMPARISON, NOT A
   * DISPATCH. Nothing below this line ever asks the token which algorithm
   * to use — RS256 is the only value that gets past it, so a token
   * asserting "none" or "HS256" is refused right here, before any key
   * lookup, before any bytes are compared. */
  if (decoded.header["alg"] !== "RS256") {
    return { ok: false, reason: "unsupported_alg" };
  }
  const kid = decoded.header["kid"];
  if (typeof kid !== "string" || kid === "") {
    return { ok: false, reason: "missing_kid" };
  }
  const jwk = jwks.find((k) => k.kid === kid && k.kty === "RSA");
  if (jwk === undefined) {
    return { ok: false, reason: "unknown_kid" };
  }
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, [
      "verify",
    ]);
  } catch {
    return { ok: false, reason: "bad_key" };
  }
  let verified = false;
  try {
    verified = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      decoded.signature,
      new TextEncoder().encode(decoded.signingInput),
    );
  } catch {
    verified = false;
  }
  return verified ? { ok: true } : { ok: false, reason: "bad_signature" };
}

function audienceMatches(payload: Record<string, unknown>): boolean {
  /* ASSUMPTION (see the file header): the client id rides in the standard
   * `aud` claim, as a lone string or inside an array. This is the one seam
   * to edit if GitHat's tokens name the client a different way. */
  const aud = payload["aud"];
  if (typeof aud === "string") return aud === GITHAT_CLIENT_ID;
  if (Array.isArray(aud)) return aud.includes(GITHAT_CLIENT_ID);
  return false;
}

/** The claim checks alone, given an already signature-verified payload.
 *  Exported separately from signature verification so each half can be
 *  proven wrong on its own — a check that only ever exercised both
 *  together could not tell "the signature check is broken" from "the
 *  claim check is broken" when one produces a false pass. */
export function verifyIdentityClaims(payload: Record<string, unknown>, nowSeconds: number): JwtVerifyResult {
  if (payload["iss"] !== GITHAT_ISSUER) return { ok: false, reason: "wrong_issuer" };
  if (!audienceMatches(payload)) return { ok: false, reason: "wrong_audience" };
  const exp = payload["exp"];
  if (typeof exp !== "number" || nowSeconds > exp + CLOCK_SKEW_SECONDS) {
    return { ok: false, reason: "expired" };
  }
  const nbf = payload["nbf"];
  if (typeof nbf === "number" && nowSeconds < nbf - CLOCK_SKEW_SECONDS) {
    return { ok: false, reason: "not_yet_valid" };
  }
  const iat = payload["iat"];
  if (typeof iat === "number" && iat > nowSeconds + CLOCK_SKEW_SECONDS) {
    return { ok: false, reason: "issued_in_future" };
  }
  const sub = payload["sub"];
  if (typeof sub !== "string" || sub.trim() === "") return { ok: false, reason: "missing_sub" };
  return { ok: true, sub };
}

/** Full verification given an already-fetched JWKS key set: parse, check
 *  `alg`/`kid`, verify the RSA signature, then check every claim. */
export async function verifyGithatIdentityToken(
  token: string,
  jwks: readonly GithatJwk[],
  nowSeconds: number,
): Promise<JwtVerifyResult> {
  const decoded = decodeJwt(token);
  if (decoded === null) return { ok: false, reason: "malformed" };
  const signature = await verifyJwtSignature(decoded, jwks);
  if (!signature.ok) return signature;
  return verifyIdentityClaims(decoded.payload, nowSeconds);
}

/* ---------------------------------------------------------------- *
 * JWKS FETCH + CACHE. Bounded TTL (JWKS_CACHE_TTL_MS, named above), and a
 * fetch failure or timeout is NEVER papered over with a stale cache — it
 * fails closed, every time, even when a perfectly good cached key set is
 * sitting right there. A rotated-out key that still verified because the
 * fetch to notice the rotation happened to fail is the wrong kind of
 * leniency for a door that decides who is staff.
 * ---------------------------------------------------------------- */

export async function fetchJwksOnce(fetcher: FetchLike): Promise<readonly GithatJwk[] | null> {
  let response;
  try {
    response = await fetcher(GITHAT_JWKS_ENDPOINT);
  } catch {
    return null;
  }
  if (!response.ok) return null;
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return null;
  }
  if (typeof body !== "object" || body === null) return null;
  const keys = (body as Record<string, unknown>)["keys"];
  if (!Array.isArray(keys)) return null;
  return keys as readonly GithatJwk[];
}

export interface JwksCache {
  keys(fetcher: FetchLike, now: number): Promise<readonly GithatJwk[] | null>;
}

export function createJwksCache(ttlMs: number = JWKS_CACHE_TTL_MS): JwksCache {
  let cached: { readonly keys: readonly GithatJwk[]; readonly fetchedAt: number } | null = null;
  return {
    async keys(fetcher, now) {
      if (cached !== null && now - cached.fetchedAt < ttlMs) return cached.keys;
      const fetched = await fetchJwksOnce(fetcher);
      if (fetched === null) return null; // fail closed — see the block comment above
      cached = { keys: fetched, fetchedAt: now };
      return cached.keys;
    },
  };
}

/** The end-to-end verification the callback route actually calls: fetch
 *  (or reuse a cached) JWKS through the injected fetcher, then verify. A
 *  JWKS fetch failure denies access — it never falls through to "assume
 *  valid". */
export async function verifyGithatIdentityTokenLive(
  token: string,
  options: { readonly fetcher: FetchLike; readonly now: number; readonly cache: JwksCache },
): Promise<JwtVerifyResult> {
  const keys = await options.cache.keys(options.fetcher, options.now);
  if (keys === null) return { ok: false, reason: "jwks_unavailable" };
  return verifyGithatIdentityToken(token, keys, Math.floor(options.now / 1000));
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
  },
): StaffRole | null {
  if (params.ownerSubject !== null && sub === params.ownerSubject) return "owner";
  if (isAuthorizedStaffSubject(sub, params.staffSubjects)) return "employee";
  if (params.directorySubjects.has(sub)) return "employee";
  return null;
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
