import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isValidRevision } from "./revision.mjs";
import {
  beginOAuthTransaction,
  buildAuthorizeUrl,
  createJwksCache,
  createTransactionStore,
  createUsedCodeStore,
  exchangeCodeForToken,
  isAuthorizedStaffSubject,
  parseStaffSubjects,
  verifyGithatIdentityTokenLive,
} from "../app/shared/auth/githat-oauth.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const appRoot = resolve(root, "app");
const publishedSchedulePath = resolve(root, "data", "published-schedule.json");
const port = Number.parseInt(process.env["PORT"] ?? "4173", 10);
/* WHERE TO LISTEN IS A DEPLOYMENT FACT, NOT A CODE FACT. Loopback is the
 * right default on a developer's machine — a key-holding process should not
 * answer the whole LAN by accident. A host that fronts this with its own
 * reverse proxy sets HOST=0.0.0.0 (or its container's interface) in the
 * same environment it sets the key in. Nothing here names a host, a domain
 * or a provider; the repository is the same file on every machine. */
const host = process.env["HOST"] ?? "127.0.0.1";
const model = process.env["ANTHROPIC_MODEL"] ?? "claude-haiku-4-5-20251001";

/* WHICH COMMIT IS ACTUALLY RUNNING, proven rather than assumed. The value
 * is read ONCE, at process start, from the compiled `app/shared/revision.js`
 * — a plain string constant that `scripts/stamp-revision.mjs` burns in from
 * `git rev-parse HEAD` at BUILD time (see that script for why). There is no
 * environment variable here on purpose: `HOST`, `PORT` and the rest above
 * are deployment facts and are meant to be set per box, but a revision is
 * not something a box gets to declare about itself — if an env var could
 * override it, "prove which commit is running" would mean nothing more
 * than "state whatever REVISION_OVERRIDE happens to be set to". A build
 * that has not run yet, or a copy with no compiled module at all, reports
 * `null` rather than guessing — the same as any other value this file
 * refuses to treat as valid. */
let stampedRevision = null;
try {
  ({ REVISION: stampedRevision } = await import(new URL("../app/shared/revision.js", import.meta.url).href));
} catch {
  stampedRevision = null;
}
/* Never trust the import blindly: a hand-edited stamp, a build run outside
 * a git checkout, or a stale artifact copied in some other way could all
 * leave a string here that is not a real 40-hex commit SHA. Anything that
 * is not is reported as `null` — absent, not a fabricated-looking answer —
 * exactly like "unknown", "dev", a blank string or an HTML fragment must
 * all read as absent per this same rule. */
const revision = isValidRevision(stampedRevision) ? stampedRevision : null;
/* A comma-separated allow-list of page origins that may call /api/chat
 * from a DIFFERENT origin. Unset means same-origin only, which is what a
 * host running this script as the site's own server needs. Set only when
 * the static pages live on one origin and this on another. */
const allowedOrigins = new Set(
  (process.env["ALLOWED_ORIGINS"] ?? "").split(",").map((o) => o.trim()).filter((o) => o !== ""),
);

/* WHAT ACTUALLY STOPS SOMEBODY SPENDING THE STUDIO'S KEY.
 *
 * Not the origin list above. That is a BROWSER rule: it decides whether
 * another web page may read this answer. It is sent by the browser and can
 * be typed by anything else, so `curl -X POST /api/chat` with no Origin
 * header at all reaches the model. That was true and unguarded until this
 * block existed, and the boot line below used to call it "same-origin
 * only", which was a claim the code did not keep.
 *
 * A token bucket per caller is the guard, plus a whole-process ceiling so
 * that a thousand callers cannot do together what one is stopped from
 * doing alone. Both are counted only for POST — the GET probe costs
 * nothing and the page asks it on every load. */
const perCallerPerMinute = Number.parseInt(process.env["CHAT_RATE_PER_MINUTE"] ?? "12", 10);
const totalPerMinute = Number.parseInt(process.env["CHAT_RATE_TOTAL_PER_MINUTE"] ?? "120", 10);
/* Behind a reverse proxy every request arrives from the proxy, so the
 * socket address is the same for everybody and the per-caller bucket
 * becomes one global bucket. TRUST_PROXY says "x-forwarded-for is written
 * by something I control". It is OFF by default because a caller can
 * otherwise forge that header and mint a fresh bucket per request. */
const trustProxy = (process.env["TRUST_PROXY"] ?? "") !== "";
const RATE_WINDOW_MS = 60_000;
const callerHits = new Map();
let windowStartedAt = 0;
let hitsThisWindow = 0;

function callerKey(request) {
  if (trustProxy) {
    const forwarded = request.headers["x-forwarded-for"];
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded ?? "").split(",")[0].trim();
    if (first !== "") return first;
  }
  return request.socket.remoteAddress ?? "unknown";
}

/* Returns 0 when the call may proceed, or the seconds to wait. The window
 * is fixed rather than sliding: one Map cleared each minute, so a long run
 * cannot grow memory per distinct caller the way per-caller timestamps
 * would. */
function chatRateDelay(request, now) {
  if (now - windowStartedAt >= RATE_WINDOW_MS) {
    windowStartedAt = now;
    hitsThisWindow = 0;
    callerHits.clear();
  }
  const retryAfter = Math.max(1, Math.ceil((windowStartedAt + RATE_WINDOW_MS - now) / 1000));
  if (hitsThisWindow >= totalPerMinute) return retryAfter;
  const key = callerKey(request);
  const used = callerHits.get(key) ?? 0;
  if (used >= perCallerPerMinute) return retryAfter;
  callerHits.set(key, used + 1);
  hitsThisWindow += 1;
  return 0;
}

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".xml": "application/xml; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

function json(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

async function requestBody(request) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 100_000) throw new Error("Request is too large.");
  }
  return JSON.parse(raw);
}

function validChatBody(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof value.question === "string" &&
    value.question.length > 0 &&
    value.question.length <= 1_000
  );
}

function safeContext(value) {
  if (typeof value !== "object" || value === null) return null;
  const classes = value.class_sessions;
  const policies = value.studio_policies;
  if (
    typeof value.timezone !== "string" ||
    typeof value.current_date !== "string" ||
    !Array.isArray(classes) || !Array.isArray(policies)
  ) return null;

  const classSessions = classes.slice(0, 20).map((item) => {
    if (
      typeof item !== "object" || item === null ||
      typeof item.session_id !== "string" || typeof item.class_type !== "string" ||
      typeof item.level !== "string" || typeof item.starts_at !== "string" ||
      typeof item.ends_at !== "string" || item.session_status !== "scheduled"
    ) return null;
    return {
      session_id: item.session_id,
      class_type: item.class_type,
      level: item.level,
      starts_at: item.starts_at,
      ends_at: item.ends_at,
      session_status: item.session_status,
    };
  });
  const currentPolicies = policies.slice(0, 20).map((item) => {
    if (
      typeof item !== "object" || item === null ||
      typeof item.policy_id !== "string" || typeof item.topic !== "string" ||
      typeof item.answer !== "string" || typeof item.effective_from !== "string" ||
      typeof item.updated_at !== "string" || item.is_current !== true
    ) return null;
    return {
      policy_id: item.policy_id,
      topic: item.topic,
      answer: item.answer,
      effective_from: item.effective_from,
      updated_at: item.updated_at,
      is_current: item.is_current,
    };
  });
  if (classSessions.includes(null) || currentPolicies.includes(null)) return null;

  return {
    timezone: value.timezone,
    current_date: value.current_date,
    class_sessions: classSessions,
    studio_policies: currentPolicies,
  };
}

async function chat(request, response) {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    json(response, 503, { error: "ANTHROPIC_API_KEY is not configured." });
    return;
  }

  let body;
  try {
    body = await requestBody(request);
  } catch {
    json(response, 400, { error: "The chat request is not valid JSON." });
    return;
  }
  if (!validChatBody(body)) {
    json(response, 400, { error: "The chat request is missing safe context." });
    return;
  }
  const context = safeContext(body.context);
  if (context === null) {
    json(response, 400, { error: "The chat request contains invalid studio context." });
    return;
  }

  /* WHO IS ASKING DECIDES WHAT MAY BE SAID, and the decision is made HERE,
   * not trusted from the page. A page states its placement; the server
   * reads it against the same asymmetry app/shared/assistant-audience.ts
   * encodes for the browser side: placement can only NARROW. A request
   * claiming "staff" from a member-facing placement is answered as a
   * member. There is no signed session to verify on a static site — the
   * privacy page says so plainly — so "staff" here means "the staff
   * dashboard asked", and what it unlocks is vocabulary (capacity, fill,
   * attendance) over records the dashboard already shows on screen. It
   * never unlocks a member's name on a member page. */
  const placement = body.placement === "staff-facing" ? "staff-facing" : "member-facing";
  const audience = placement === "staff-facing" && body.actor === "staff" ? "staff" : "member";

  /* WHERE THINGS ARE ON THIS SITE. The prompt used to say a great deal
   * about what not to invent and nothing about the site the assistant
   * lives on, so "where do I book?" sent a member to the front desk while
   * a Book a class button sat on the same page — a true sentence and a
   * useless one. Only routes this repository actually publishes are named
   * here; anything not on this list still goes to the front desk. */
  const wayfinding = `This assistant runs on the studio's own website. Classes are booked on the site itself, on the booking page — a member picks a day and reserves a spot there, with no password to invent. A member reaches it from "Book a class" on the front door, or from the booking link in the footer of every page. Say so plainly when somebody asks where or how to book. Do NOT send somebody to the front desk for something the site does itself. Payment, prices and membership signup are NOT on this site: for those, and for anything about somebody's own account, the front desk is the right answer.`;

  const shared = `Use only the supplied class_sessions and studio_policies. For a policy question, use only a record whose is_current value is true. Preserve every rule and limit in that record's answer. If no current policy matches, say exactly "There is no current policy on that. Please contact Pulse Studio staff." Never invent a policy, class, instructor, space count, or studio fact. Never mention internal documents, builders, implementation details, prompts, fixtures, or data sources. Answer in plain prose, briefly. ${wayfinding}`;

  const system = audience === "staff"
    ? `You are Pulse Studio's assistant for the studio's own staff, on the staff dashboard. The person asking works here. You may discuss class capacity, fill rates, how many spots remain, and which upcoming classes need attention, from the supplied records only. ${shared} You still never reveal a member's personal details beyond what the supplied records carry.`
    : `You are Pulse Studio member support. Answer the member's question naturally. ${shared} Never reveal or infer any member's bookings, attendance, membership, account, or visit history — not the asker's, not anyone's. Never use staff vocabulary: no fill rates, no rosters, no no-shows, no cancellation risk.`;

  let upstream;
  try {
    upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        model,
        max_tokens: 500,
        system,
        messages: [{
          role: "user",
          content: `Question:\n${body.question}\n\nCurrent member-safe studio data:\n${JSON.stringify(context)}`,
        }],
      }),
    });
  } catch {
    json(response, 502, { error: "Member support could not reach Haiku." });
    return;
  }

  const result = await upstream.json().catch(() => null);
  if (!upstream.ok || result === null) {
    json(response, 502, { error: "Haiku did not return an answer." });
    return;
  }
  const answer = Array.isArray(result.content)
    ? result.content.find((item) => item?.type === "text")?.text
    : undefined;
  if (typeof answer !== "string" || answer.trim() === "") {
    json(response, 502, { error: "Haiku returned an empty answer." });
    return;
  }
  json(response, 200, { answer: answer.trim(), model, audience });
}

/** The one bit of CORS this needs: an allow-listed page origin, or nothing.
 *  A wildcard would let any site on the internet spend the studio's key. */
function cors(request, response) {
  const origin = request.headers.origin;
  if (typeof origin !== "string" || !allowedOrigins.has(origin)) return false;
  response.setHeader("access-control-allow-origin", origin);
  response.setHeader("vary", "origin");
  response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type, accept");
  return true;
}

function serveFile(request, response) {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  let pathname;
  try {
    pathname = decodeURIComponent(requestUrl.pathname);
  } catch {
    response.writeHead(400).end("Bad request");
    return;
  }
  const relative = pathname.replace(/^\/+/, "") || "index.html";
  let filePath = resolve(appRoot, relative);
  if (filePath !== appRoot && !filePath.startsWith(`${appRoot}${sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  if (existsSync(filePath) && statSync(filePath).isDirectory()) filePath = resolve(filePath, "index.html");
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404).end("Not found");
    return;
  }
  /* REVALIDATE, ALWAYS. With no cache header at all a browser applies its
   * own heuristic and may hold a file for hours. That is not a local
   * annoyance: it is a deploy that does not reach anybody, and it already
   * cost one round of "the code is on the server and the page still runs
   * the old one". `no-cache` does not mean do not store — it means ask
   * first, which is the honest default for a site whose pages and modules
   * change together. */
  response.writeHead(200, {
    "content-type": contentTypes[extname(filePath)] ?? "application/octet-stream",
    "cache-control": "no-cache",
  });
  createReadStream(filePath).pipe(response);
}

/* ------------------------------------------------------------------ *
 * STAFF ACCESS, ENFORCED WHERE A BROWSER CANNOT REACH IT.
 *
 * The studio's member records used to sit in app/shared/fixtures.json.
 * Everything under app/ is served at a URL — that is the filing law — so
 * those records were readable by anyone who typed the path, and a sign-in
 * screen on the dashboard would only have hidden the VIEW while leaving the
 * DATA one request away. A lock a person can walk around is not a lock.
 *
 * So the records that name a person moved to data/staff-records.json, which
 * sits outside app/ where serveFile() answers 403, and the only way to them
 * is this endpoint. The decision is made in this process, on a secret the
 * browser never holds. That is the difference between access control and a
 * picture of access control.
 *
 * WHAT THIS IS NOT. One shared staff passphrase, not per-person accounts:
 * there is no user store yet (docs/hosted-schema.sql is the design for
 * one, and nothing runs it). It cannot tell one staff member from another
 * and so cannot show you who looked at what. Say that plainly rather than
 * implying an audit trail that does not exist.
 * ------------------------------------------------------------------ */

const staffPassphrase = process.env["STAFF_PASSPHRASE"] ?? "";

/* The signing key is generated per process and never leaves it, so sessions
 * end when the server restarts. A deliberate trade: no key to store, no key
 * to leak, and a restart is the fastest way to revoke everyone. */
const staffSigningKey = randomBytes(32);
const STAFF_SESSION_MINUTES = 60;
const STAFF_COOKIE = "__Host-pulse-staff";

function digest(value) {
  return createHash("sha256").update(value, "utf8").digest();
}

/* Compare through fixed-length digests so the check cannot leak the
 * passphrase's length or its matching prefix through timing. */
function passphraseMatches(offered) {
  if (staffPassphrase === "") return false;
  return timingSafeEqual(digest(offered), digest(staffPassphrase));
}

function signStaffToken(expiresAt) {
  const payload = Buffer.from(JSON.stringify({ exp: expiresAt }), "utf8").toString("base64url");
  const mac = createHmac("sha256", staffSigningKey).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

function staffTokenIsValid(token) {
  if (typeof token !== "string") return false;
  const [payload, mac] = token.split(".");
  if (payload === undefined || mac === undefined) return false;
  const expected = createHmac("sha256", staffSigningKey).update(payload).digest("base64url");
  const offered = Buffer.from(mac, "utf8");
  const wanted = Buffer.from(expected, "utf8");
  if (offered.length !== wanted.length) return false;
  if (!timingSafeEqual(offered, wanted)) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof exp === "number" && Date.now() < exp;
  } catch {
    return false;
  }
}

function cookieValue(request, name) {
  const header = request.headers["cookie"];
  if (typeof header !== "string") return null;
  for (const part of header.split(";")) {
    const at = part.indexOf("=");
    if (at < 0) continue;
    if (part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
  }
  return null;
}

function requestIsSignedInStaff(request) {
  /* EITHER DOOR GRANTS ACCESS. requestIsSignedInViaGithat is declared below
   * this point in the file, in the GitHat block, but a top-level `function`
   * declaration is hoisted for the whole module — this is not a
   * forward-reference bug. */
  return staffTokenIsValid(cookieValue(request, STAFF_COOKIE)) || requestIsSignedInViaGithat(request);
}

/* __Host- is not decoration. The prefix forbids a Domain attribute
 * outright, so the cookie is pinned to exactly this origin and cannot be
 * set for, or sent to, a sibling host. It also REQUIRES Secure, so this
 * works over HTTPS or on localhost and refuses to pretend anywhere else. A
 * deployment on plain HTTP should fail to sign in rather than quietly hand
 * out a session anyone on the wire can copy. */
function staffCookie(value, maxAgeSeconds) {
  return `${STAFF_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

/* ------------------------------------------------------------------ *
 * A SECOND STAFF DOOR: "Sign in with GitHat" — OAuth 2.0 authorization
 * code + PKCE(S256) against the sibling GitHat service at api.githat.io.
 * See app/shared/auth/githat-oauth.ts for the protocol logic itself
 * (state, PKCE, JWT verification, JWKS caching, staff-subject matching —
 * all of it browser-and-Node portable and unit-checked in auth/tests.ts).
 * What lives HERE is only the HTTP plumbing and Pulse's own session
 * cookie for this door.
 *
 * DEPLOYED ALONGSIDE THE PASSPHRASE DOOR ABOVE, not instead of it. The
 * passphrase path is the tested rollback; removing it is a later, separate
 * step, taken only after this door has run live and been verified.
 *
 * AUTHENTICATION IS NOT AUTHORIZATION. A valid GitHat identity proves who
 * signed in; STAFF_GITHAT_SUBJECTS decides whether that person is staff
 * HERE, by an exact match on the immutable `sub` claim only — never an
 * email, display name, or provider username. Read ONCE at startup, the
 * same way STAFF_PASSPHRASE is, so a running process has one fixed answer
 * for its whole lifetime. Unset or empty denies everyone; nothing here
 * ever falls back to allowing everyone. ------------------------------ */

const staffGithatSubjects = parseStaffSubjects(process.env["STAFF_GITHAT_SUBJECTS"]);
const oauthTransactions = createTransactionStore();
const usedAuthorizationCodes = createUsedCodeStore();
const jwksCache = createJwksCache();

/* A signing key separate from staffSigningKey above, and a cookie name
 * separate from STAFF_COOKIE (__Host-pulse_session, not __Host-pulse-staff)
 * — so one door's cookie can never satisfy the other door's check: each
 * verifies only against its own HMAC key. Same per-process-only lifetime
 * as the passphrase door, for the same reason (no key to store, no key to
 * leak; a restart is the fastest way to revoke everyone). */
const githatSigningKey = randomBytes(32);
const GITHAT_SESSION_MINUTES = 60;
const GITHAT_COOKIE = "__Host-pulse_session";

function signGithatToken(sub, expiresAt) {
  const payload = Buffer.from(JSON.stringify({ sub, exp: expiresAt }), "utf8").toString("base64url");
  const mac = createHmac("sha256", githatSigningKey).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

function githatTokenIsValid(token) {
  if (typeof token !== "string") return false;
  const [payload, mac] = token.split(".");
  if (payload === undefined || mac === undefined) return false;
  const expected = createHmac("sha256", githatSigningKey).update(payload).digest("base64url");
  const offered = Buffer.from(mac, "utf8");
  const wanted = Buffer.from(expected, "utf8");
  if (offered.length !== wanted.length) return false;
  if (!timingSafeEqual(offered, wanted)) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof exp === "number" && Date.now() < exp;
  } catch {
    return false;
  }
}

/* Same __Host- discipline as staffCookie above: no Domain attribute (so
 * this can never be shared across subdomains), Secure (so it refuses to
 * set anywhere but HTTPS or localhost), HttpOnly (so no script on this
 * origin — including a future one with an injected-content bug — can ever
 * read it), SameSite=Lax. */
function githatCookie(value, maxAgeSeconds) {
  return `${GITHAT_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function requestIsSignedInViaGithat(request) {
  return githatTokenIsValid(cookieValue(request, GITHAT_COOKIE));
}

/* GET /auth/githat/start — the browser's own click on "Sign in with
 * GitHat" (staff-gate.ts) lands here. A fresh state + PKCE pair is
 * generated and held SERVER-SIDE, in oauthTransactions above — never in a
 * cookie, never in the URL, never in browser storage — and the browser is
 * redirected straight to GitHat's own authorize endpoint. */
async function githatStart(request, response) {
  if (request.method !== "GET") {
    response.writeHead(405).end("Method not allowed");
    return;
  }
  const now = Date.now();
  const tx = await beginOAuthTransaction(now);
  oauthTransactions.save(tx);
  response.writeHead(302, {
    location: buildAuthorizeUrl(tx.state, tx.codeChallenge),
    "cache-control": "no-store",
  });
  response.end();
}

/* A small, self-contained confirmation page — never a redirect loop and
 * never a bare generic error. `message` is ALWAYS one of the fixed literal
 * strings each call site below passes; the `state`, `code`, and `error`
 * query parameters this route reads are validated and then discarded,
 * NEVER echoed into this HTML, so a crafted callback URL has nothing here
 * to inject into. */
function sendGithatResult(response, status, message, redirectTo) {
  const script = redirectTo
    ? `<script type="module">
  import { signInAsFrontDesk } from "/shared/auth/sign-in.js";
  signInAsFrontDesk();
  window.location.replace(${JSON.stringify(redirectTo)});
</script>`
    : "";
  response.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  response.end(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Pulse Studio staff sign-in</title></head>` +
      `<body><p>${message}</p><p><a href="/index.html">Back to Pulse Studio</a></p>${script}</body></html>`,
  );
}

/* GET /auth/callback — GitHat redirects the browser back here with
 * ?code=...&state=.... EVERY step below fails CLOSED: a state mismatch, a
 * reused state, a reused code, a failed exchange, a token that does not
 * verify, or a sub that is not on STAFF_GITHAT_SUBJECTS all end in a
 * plain, specific refusal — never a partial session, never a silent
 * redirect loop. NOTHING FROM THIS EXCHANGE — the code, the retained PKCE
 * verifier, or the token itself — is ever logged; the one line this route
 * logs on denial names only a short machine-readable reason. */
async function githatCallback(request, response) {
  if (request.method !== "GET") {
    response.writeHead(405).end("Method not allowed");
    return;
  }
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const state = requestUrl.searchParams.get("state");
  const code = requestUrl.searchParams.get("code");
  const errorParam = requestUrl.searchParams.get("error");

  if (typeof errorParam === "string" && errorParam !== "") {
    sendGithatResult(response, 400, "GitHat sign-in was not completed.", null);
    return;
  }
  if (typeof state !== "string" || state === "" || typeof code !== "string" || code === "") {
    sendGithatResult(response, 400, "This sign-in link is missing required information.", null);
    return;
  }

  const now = Date.now();
  const tx = oauthTransactions.take(state, now);
  if (tx === null) {
    sendGithatResult(
      response,
      400,
      "This sign-in attempt has expired, was already used, or does not match. Please try again.",
      null,
    );
    return;
  }
  if (!usedAuthorizationCodes.claim(code, now)) {
    sendGithatResult(response, 400, "This authorization code was already used.", null);
    return;
  }

  const exchange = await exchangeCodeForToken({ code, codeVerifier: tx.codeVerifier, fetcher: fetch });
  if (!exchange.ok || exchange.identityToken === undefined) {
    sendGithatResult(response, 502, "GitHat could not confirm this sign-in.", null);
    return;
  }

  const verdict = await verifyGithatIdentityTokenLive(exchange.identityToken, {
    fetcher: fetch,
    now,
    cache: jwksCache,
  });
  if (!verdict.ok) {
    console.error(`githat sign-in rejected: ${verdict.reason}`); // never the token itself
    sendGithatResult(response, 401, "GitHat could not verify this sign-in.", null);
    return;
  }

  if (!isAuthorizedStaffSubject(verdict.sub, staffGithatSubjects)) {
    sendGithatResult(response, 403, "Your GitHat account is not authorized for staff access here.", null);
    return;
  }

  const expiresAt = now + GITHAT_SESSION_MINUTES * 60 * 1000;
  response.setHeader("set-cookie", githatCookie(signGithatToken(verdict.sub, expiresAt), GITHAT_SESSION_MINUTES * 60));
  sendGithatResult(response, 200, "Signed in with GitHat.", "/index.html");
}

/* CSRF, and why SameSite=Lax alone is judged sufficient for every
 * state-changing request this app actually has.
 *
 * The state-changing staff operations that exist today are: signing in
 * with the passphrase (POST /api/staff/session), signing out (DELETE
 * /api/staff/session), publishing a schedule (POST /api/schedule), and now
 * the GitHat exchange this route performs on the server's own initiative
 * after a top-level GET redirect. None of them is reachable the way a
 * classic CSRF attack needs:
 *
 *   - POST and DELETE cannot be issued by a plain cross-site <a> or a
 *     browser navigation at all — only same-origin `fetch()` calls
 *     (staff-gate.ts, topbar.ts) ever issue them, and SameSite=Lax cookies
 *     are withheld from a cross-site POST/DELETE regardless of how it was
 *     triggered (an auto-submitting cross-site FORM included) — Lax only
 *     ever forwards a cookie on a cross-site TOP-LEVEL GET navigation.
 *   - The one top-level GET a cross-site page COULD trigger is exactly
 *     that class of request, and this app never treats a GET as
 *     state-changing on its own: /auth/githat/start only ever *starts* a
 *     transaction (nothing is granted yet), and /auth/callback requires a
 *     `state` this server itself issued and a `code` GitHat itself issued
 *     — a cross-site page cannot forge either, so tricking a signed-in
 *     visitor into loading that URL grants the attacker nothing (they get
 *     no cookie back; it lands in the VICTIM's browser) and cannot forge a
 *     result on the victim's behalf either, because the code and state
 *     must both come from a real GitHat sign-in the attacker does not
 *     control.
 *
 * A double-submit token would add a second secret to manage for no
 * request shape this app actually has to defend. If a state-changing POST
 * ever moves behind a plain cross-site-triggerable form, add one then. */

async function staffSession(request, response) {
  if (request.method === "GET") {
    json(response, 200, {
      configured: staffPassphrase !== "",
      signedIn: requestIsSignedInStaff(request),
      minutes: STAFF_SESSION_MINUTES,
    });
    return;
  }
  if (request.method === "DELETE") {
    // Both doors' cookies are cleared, whichever (if either) was set —
    // "Sign out" ends the session regardless of which door opened it. Node
    // sends multiple Set-Cookie headers for an array value on this header
    // specifically; each clears its own cookie by name.
    response.setHeader("set-cookie", [staffCookie("", 0), githatCookie("", 0)]);
    json(response, 200, { signedIn: false });
    return;
  }
  if (request.method !== "POST") {
    response.writeHead(405).end("Method not allowed");
    return;
  }
  if (staffPassphrase === "") {
    json(response, 503, {
      error: "Staff sign-in is not configured on this server. Set STAFF_PASSPHRASE and restart.",
    });
    return;
  }
  /* requestBody() already returns parsed JSON — parsing its result again
     turns every sign-in into a 400, which is exactly what it did once. */
  let body;
  try {
    body = await requestBody(request);
  } catch {
    json(response, 400, { error: "Body must be JSON." });
    return;
  }
  const offered = typeof body?.passphrase === "string" ? body.passphrase : "";
  if (!passphraseMatches(offered)) {
    /* One message for a wrong passphrase and for none at all: a caller
     * learns whether they are in, never anything about what would work. */
    json(response, 401, { error: "That passphrase was not accepted." });
    return;
  }
  const expiresAt = Date.now() + STAFF_SESSION_MINUTES * 60 * 1000;
  response.setHeader("set-cookie", staffCookie(signStaffToken(expiresAt), STAFF_SESSION_MINUTES * 60));
  json(response, 200, { signedIn: true, minutes: STAFF_SESSION_MINUTES });
}

function staffRecords(request, response) {
  if (request.method !== "GET") {
    response.writeHead(405).end("Method not allowed");
    return;
  }
  if (staffPassphrase === "") {
    json(response, 503, {
      error: "Staff records are not available: this server has no STAFF_PASSPHRASE set.",
    });
    return;
  }
  if (!requestIsSignedInStaff(request)) {
    json(response, 401, { error: "Staff sign-in required." });
    return;
  }
  let records;
  try {
    records = readFileSync(resolve(root, "data", "staff-records.json"), "utf8");
  } catch {
    json(response, 500, { error: "Staff records could not be read on the server." });
    return;
  }
  response.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(records);
}

function validPublishedSession(value) {
  return typeof value === "object" && value !== null &&
    /^local-\d+$/.test(value.id) &&
    typeof value.type === "string" && value.type.length > 0 &&
    typeof value.level === "string" && value.level.length > 0 &&
    typeof value.startsAt === "string" && !Number.isNaN(Date.parse(value.startsAt)) &&
    typeof value.room === "string" && value.room.length > 0 &&
    typeof value.instructor === "string" && value.instructor.length > 0 &&
    Number.isInteger(value.capacity) && value.capacity > 0 &&
    value.status === "scheduled";
}

async function publishedSchedule(request, response) {
  if (request.method === "GET") {
    try {
      const stored = JSON.parse(readFileSync(publishedSchedulePath, "utf8"));
      json(response, 200, { sessions: Array.isArray(stored.sessions) ? stored.sessions : [] });
    } catch {
      json(response, 200, { sessions: [] });
    }
    return;
  }
  if (request.method !== "POST") {
    response.writeHead(405).end("Method not allowed");
    return;
  }
  if (staffPassphrase === "" || !requestIsSignedInStaff(request)) {
    json(response, 401, { error: "Staff sign-in required." });
    return;
  }
  let body;
  try {
    body = await requestBody(request);
  } catch {
    json(response, 400, { error: "Body must be JSON." });
    return;
  }
  if (!Array.isArray(body?.sessions) || body.sessions.length > 500 || !body.sessions.every(validPublishedSession)) {
    json(response, 400, { error: "Schedule must contain at most 500 valid scheduled sessions." });
    return;
  }
  let existing = [];
  try {
    const stored = JSON.parse(readFileSync(publishedSchedulePath, "utf8"));
    existing = Array.isArray(stored.sessions) ? stored.sessions : [];
  } catch { /* Start with an empty published schedule. */ }
  const byId = new Map(existing.map((session) => [session.id, session]));
  body.sessions.forEach((session) => byId.set(session.id, session));
  const sessions = [...byId.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  writeFileSync(publishedSchedulePath, JSON.stringify({ sessions }, null, 2) + "\n");
  json(response, 200, { published: body.sessions.length, sessions });
}

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`).pathname;
  if (pathname === "/api/chat") cors(request, response);
  if (pathname === "/api/chat" && request.method === "OPTIONS") {
    response.writeHead(204).end();
    return;
  }
  if (pathname === "/api/chat" && request.method === "GET") {
    json(response, 200, { available: Boolean(process.env["ANTHROPIC_API_KEY"]), model, revision });
    return;
  }
  if (pathname === "/api/chat" && request.method === "POST") {
    const retryAfter = chatRateDelay(request, Date.now());
    if (retryAfter > 0) {
      response.setHeader("retry-after", String(retryAfter));
      json(response, 429, { error: "Too many questions right now. Please wait a moment." });
      return;
    }
    await chat(request, response);
    return;
  }
  if (pathname === "/api/staff/session") {
    await staffSession(request, response);
    return;
  }
  if (pathname === "/api/staff/records") {
    staffRecords(request, response);
    return;
  }
  if (pathname === "/api/schedule") {
    await publishedSchedule(request, response);
    return;
  }
  if (pathname === "/auth/githat/start") {
    await githatStart(request, response);
    return;
  }
  if (pathname === "/auth/callback") {
    await githatCallback(request, response);
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405).end("Method not allowed");
    return;
  }
  serveFile(request, response);
});

server.listen(port, host, () => {
  console.log(`Pulse Studio with Haiku support: http://${host}:${port}`);
  console.log(revision !== null ? `Running commit ${revision}.` : "Running commit unknown: app/shared/revision.js was missing, unbuilt, or not a valid 40-hex SHA. Run `npm run build` inside a git checkout.");
  console.log(process.env["ANTHROPIC_API_KEY"] ? `Haiku ready (${model}).` : "Haiku unavailable: set ANTHROPIC_API_KEY before starting.");
  console.log(staffPassphrase !== ""
    ? `Staff records behind /api/staff/records; sessions last ${STAFF_SESSION_MINUTES} minutes. Sign-in needs HTTPS or localhost — the session cookie is __Host- prefixed and refuses to set otherwise.`
    : "Staff records locked: set STAFF_PASSPHRASE to let the dashboard and re-engagement tool sign in.");
  console.log(staffGithatSubjects.size > 0
    ? `Sign in with GitHat is wired at /auth/githat/start, and ${staffGithatSubjects.size} GitHat subject(s) are authorized for staff access.`
    : "Sign in with GitHat is wired at /auth/githat/start, but STAFF_GITHAT_SUBJECTS is unset — a valid GitHat identity will be denied staff access until an operator sets it.");
  console.log(allowedOrigins.size > 0
    ? `Other pages allowed to read /api/chat answers: ${[...allowedOrigins].join(", ")}`
    : "No ALLOWED_ORIGINS set, so no OTHER page may read an /api/chat answer in a browser.");
  /* This line used to say "same-origin only", which read as a lock and was
   * not one — a browser rule cannot bind a caller that is not a browser. */
  console.log(`Spending guard on /api/chat: ${perCallerPerMinute} questions per caller per minute, ${totalPerMinute} in total`
    + `${trustProxy ? ", callers identified by x-forwarded-for" : ", callers identified by socket address (set TRUST_PROXY behind a proxy)"}.`);
});
