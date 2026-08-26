/* Pulse Studio — unit checks for the shared session contract (v1).
   TEAM-OWNED. Browser-run: open ./tests.html and read the verdict.

   These checks were written BEFORE the contract they test existed — the
   suite failed first (the module had none of these exports), then the
   implementation made it pass. They treat browser storage as hostile
   input: malformed JSON, wrong shapes, wrong versions, blank ids, stale
   ids, throwing storage — none of it may crash a page or invent an
   identity. */

import {
  currentSession,
  FRONT_DESK,
  clearPulseSession,
  readPulseSession,
  setStorageForChecks,
  subscribeToPulseSession,
  writePulseSession,
  type PulseSession,
} from "./session.js";
import { signInAsFrontDesk, signInAsMember, signInChoices } from "./sign-in.js";
import { sharedStudio, sharedStudioMembers, sharedStudioWithFill } from "./studio.js";
import { doorMessage } from "./staff-gate.js";
import {
  GITHAT_APP_SLUG,
  GITHAT_ISSUER,
  PULSE_REDIRECT_URI,
  PULSE_TRUSTED_ORIGIN,
  beginOAuthTransaction,
  buildAuthorizeUrl,
  createInviteStore,
  createTransactionStore,
  createUsedCodeStore,
  exchangeCodeForToken,
  extractIdentity,
  isAuthorizedStaffSubject,
  isTrustedOrigin,
  isTrustedRedirectUri,
  parseOwnerSubject,
  parseStaffSubjects,
  resolveStaffRole,
  unauthorizedDetail,
  type FetchLike,
} from "./githat-oauth.js";
import { escapeHtml } from "../html.js";
import { answerProblems, audienceFor, audiencePolicy } from "../assistant-audience.js";
import {
  PROBE_KEY,
  clearStored,
  readStored,
  setStorageForChecks as setSharedStorageForChecks,
  storageWorks,
  writeStored,
} from "../storage.js";
import { FOOTER_GROUPS, SETTINGS_HREF, isCurrentPage, siteFooter } from "../components/site-footer.js";
import { STUDIO_CONTACT, addressLine, dialable } from "../brand.js";
import { cyclingFigure, liftingFigure, mountFigures, runningFigure } from "../components/figures.js";
import { renderStudioBrand } from "../components/brand-header.js";
import { mountSessionControl } from "../components/topbar.js";
import { assistantFor, bookForMember, bookingIntent, openingLine, resolveSessions } from "../components/assistant.js";
import { generateStudio } from "../synthetic/generate.js";
import { DEFAULT_CONFIG } from "../synthetic/config.js";
import type { Reservation } from "../contract.js";
import type { SyntheticDataset } from "../synthetic/contracts.js";
import {
  ALERT_LEVELS,
  ALERT_REGION_ID,
  alertElement,
  dismissAlert,
  ensureAlertRegion,
  openAlerts,
  showAlert,
} from "../components/alert.js";

type Check = { name: string; run: () => string | true };
const checks: Check[] = [];
function check(name: string, run: () => string | true): void {
  checks.push({ name, run });
}
function eq(actual: unknown, expected: unknown): string | true {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  return a === e ? true : `expected ${e}, got ${a}`;
}

const KEY = "pulse-session";
const members = sharedStudioMembers();
const m1 = members[0];
const m2 = members[1];
if (m1 === undefined || m2 === undefined) {
  throw new Error("the shared studio produced fewer than two members — the checks need two");
}

function memberSession(member_id: string, display_name: string): PulseSession {
  return { version: 1, actor_type: "member", member_id, display_name };
}

/* Every check starts from a clean slate: real storage, empty key, AND an
   empty in-memory fallback — clearPulseSession() resets all three. (The
   first version of this fixture forgot the memory half, and the
   throwing-storage read check correctly served the previous check's
   leftover choice — the contract was right, the fixture was not.) */
function fresh(): void {
  setStorageForChecks(null);
  clearPulseSession();
}

/* ---------- round trips ---------- */

check("a valid member session round-trips", () => {
  fresh();
  writePulseSession(memberSession(m1.id, m1.displayName));
  const got = readPulseSession();
  if (got === null) return "read returned null";
  if (got.actor_type !== "member") return `actor_type ${got.actor_type}`;
  return eq(got.member_id, m1.id);
});

check("a valid staff session round-trips", () => {
  fresh();
  writePulseSession(FRONT_DESK);
  const got = readPulseSession();
  if (got === null) return "read returned null";
  if (got.actor_type !== "staff") return `actor_type ${got.actor_type}`;
  return eq(got.staff_id, "staff:front-desk");
});

check("the staff session is the exact contract value", () => {
  return eq(FRONT_DESK, {
    version: 1,
    actor_type: "staff",
    staff_id: "staff:front-desk",
    role: "front_desk",
    display_name: "Front Desk",
  });
});

/* ---------- shapes that must be rejected ---------- */

check("malformed JSON reads as null", () => {
  fresh();
  localStorage.setItem(KEY, "{not json");
  return eq(readPulseSession(), null);
});

check("malformed JSON is cleared so the next read starts clean", () => {
  fresh();
  localStorage.setItem(KEY, "{not json");
  readPulseSession();
  return eq(localStorage.getItem(KEY), null);
});

check("valid JSON with the wrong shape reads as null", () => {
  fresh();
  localStorage.setItem(KEY, JSON.stringify([1, 2, 3]));
  return eq(readPulseSession(), null);
});

/* EVERY OTHER SHAPE JSON CAN HOLD.
 *
 * The array above was the only non-object ever stored here, and it exits
 * through `Array.isArray`. The literal `null` exits through a different
 * clause, and it is the one that catches people out: `typeof null` is
 * "object", so without the explicit `value === null` the reader walks
 * straight into dereferencing it. Mutation showed that clause could be
 * turned inside out with the whole suite still green — this key is
 * written by four products and read on every page load, so a throw here
 * is a blank page, not a lost session. */

/* AN EMPTY STORE THAT REALLY IS EMPTY.
 *
 * readPulseSession trusts an empty store only when the browser would have
 * KEPT a write — otherwise the emptiness is a refusal, not a sign-out, and
 * the page's own memory is the better answer. That is two conditions, and
 * mutation showed they could be joined the other way with everything
 * still green: memory would then be served whenever the store was empty,
 * for any reason, and a key cleared out from under this tab would be
 * quietly resurrected. Nothing had ever set memory and emptied the store
 * independently, because the fixture's own reset clears both. */

check("a key cleared under a working store reads as signed out, not from memory", () => {
  fresh();
  writePulseSession(FRONT_DESK);
  if (readPulseSession() === null) return "the fixture never signed in";
  localStorage.removeItem(KEY); // another tab signed out; no event delivered here
  return eq(readPulseSession(), null);
});

check("...and the compatibility view says the same", () => {
  fresh();
  writePulseSession(FRONT_DESK);
  localStorage.removeItem(KEY);
  return eq(currentSession(), null);
});

check("a stored null reads as null rather than throwing", () => {
  fresh();
  localStorage.setItem(KEY, "null");
  return eq(readPulseSession(), null);
});

check("a stored bare string reads as null", () => {
  fresh();
  localStorage.setItem(KEY, JSON.stringify("front-desk"));
  return eq(readPulseSession(), null);
});

check("a stored number reads as null", () => {
  fresh();
  localStorage.setItem(KEY, "42");
  return eq(readPulseSession(), null);
});

check("a stored boolean reads as null", () => {
  fresh();
  localStorage.setItem(KEY, "true");
  return eq(readPulseSession(), null);
});

check("...and the compatibility view agrees, so Product A sees signed out", () => {
  fresh();
  localStorage.setItem(KEY, "null");
  return eq(currentSession(), null);
});

check("a missing version reads as null (the v0 shape is not guessed at)", () => {
  fresh();
  localStorage.setItem(
    KEY,
    JSON.stringify({ member_id: m1.id, display_name: "X", email: "x@studio.test", role: "member" }),
  );
  return eq(readPulseSession(), null);
});

check("an unsupported FUTURE version reads as null but is NOT cleared", () => {
  fresh();
  const future = JSON.stringify({ version: 2, actor_type: "member", member_id: m1.id, display_name: "X" });
  localStorage.setItem(KEY, future);
  const got = readPulseSession();
  if (got !== null) return "future version was accepted";
  return eq(localStorage.getItem(KEY), future);
});

check("a blank member_id reads as null", () => {
  fresh();
  localStorage.setItem(KEY, JSON.stringify(memberSession("  ", "X")));
  return eq(readPulseSession(), null);
});

check("a member session smuggling staff fields reads as null", () => {
  fresh();
  localStorage.setItem(
    KEY,
    JSON.stringify({ ...memberSession(m1.id, "X"), staff_id: "staff:front-desk" }),
  );
  return eq(readPulseSession(), null);
});

check("a staff session smuggling a member_id reads as null", () => {
  fresh();
  localStorage.setItem(KEY, JSON.stringify({ ...FRONT_DESK, member_id: m1.id }));
  return eq(readPulseSession(), null);
});

check("an unrecognized staff_id reads as null", () => {
  fresh();
  localStorage.setItem(KEY, JSON.stringify({ ...FRONT_DESK, staff_id: "staff:manager" }));
  return eq(readPulseSession(), null);
});

check("a wrong staff role reads as null", () => {
  fresh();
  localStorage.setItem(KEY, JSON.stringify({ ...FRONT_DESK, role: "owner" }));
  return eq(readPulseSession(), null);
});

check("wrong field types read as null", () => {
  fresh();
  localStorage.setItem(
    KEY,
    JSON.stringify({ version: 1, actor_type: "member", member_id: 7, display_name: "X" }),
  );
  return eq(readPulseSession(), null);
});

check("writePulseSession refuses an invalid value instead of storing it", () => {
  fresh();
  writePulseSession({ version: 1, actor_type: "member", member_id: "", display_name: "" } as PulseSession);
  return eq(localStorage.getItem(KEY), null);
});

/* ---------- identity rules ---------- */

check("a stale member_id (nobody in the studio) reads as null and clears", () => {
  fresh();
  writePulseSession(memberSession("member:999999", "Ghost"));
  const got = readPulseSession();
  if (got !== null) return "a stale member survived";
  return eq(localStorage.getItem(KEY), null);
});

check("duplicate display names stay distinct: identity follows the id", () => {
  fresh();
  writePulseSession(memberSession(m1.id, "Same Name"));
  const first = readPulseSession();
  writePulseSession(memberSession(m2.id, "Same Name"));
  const second = readPulseSession();
  if (first === null || second === null) return "a session read as null";
  if (first.actor_type !== "member" || second.actor_type !== "member") return "wrong actor";
  if (first.member_id === second.member_id) return "two people collapsed into one";
  return true;
});

check("a changed display name does not change identity", () => {
  fresh();
  writePulseSession(memberSession(m1.id, "A Former Name"));
  const got = readPulseSession();
  if (got === null || got.actor_type !== "member") return "session lost";
  return eq(got.member_id, m1.id);
});

check("a Unicode display name survives exactly (never slugged)", () => {
  fresh();
  writePulseSession(memberSession(m1.id, "王伟"));
  const got = readPulseSession();
  if (got === null) return "session lost";
  return eq(got.display_name, "王伟");
});

/* ---------- sign-out and events ---------- */

check("clearPulseSession signs out completely", () => {
  fresh();
  writePulseSession(FRONT_DESK);
  clearPulseSession();
  if (readPulseSession() !== null) return "still signed in";
  return eq(localStorage.getItem(KEY), null);
});

check("a same-tab subscriber hears the write and the clear", () => {
  fresh();
  const heard: Array<PulseSession | null> = [];
  const stop = subscribeToPulseSession((s) => heard.push(s));
  writePulseSession(FRONT_DESK);
  clearPulseSession();
  stop();
  if (heard.length !== 2) return `heard ${heard.length} events, expected 2`;
  const first = heard[0];
  if (!first || first.actor_type !== "staff") return "first event was not the staff sign-in";
  return eq(heard[1], null);
});

check("unsubscribe stops the listener", () => {
  fresh();
  let count = 0;
  const stop = subscribeToPulseSession(() => { count += 1; });
  stop();
  writePulseSession(FRONT_DESK);
  return eq(count, 0);
});

check("subscribing the same listener twice delivers once", () => {
  fresh();
  let count = 0;
  const listener = (): void => { count += 1; };
  const stopA = subscribeToPulseSession(listener);
  const stopB = subscribeToPulseSession(listener);
  writePulseSession(FRONT_DESK);
  stopA();
  stopB();
  return eq(count, 1);
});

check("a cross-tab storage event reaches subscribers", () => {
  fresh();
  writePulseSession(FRONT_DESK);
  const heard: { value: PulseSession | null; called: boolean } = { value: null, called: false };
  const stop = subscribeToPulseSession((s) => { heard.value = s; heard.called = true; });
  window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
  stop();
  if (!heard.called) return "the storage event was not heard";
  return heard.value !== null && heard.value.actor_type === "staff"
    ? true
    : "the staff session did not survive the event";
});

/* WHICH KEYS THE LISTENER WAKES FOR.
 *
 * Every cross-tab check above dispatches the session key, so the filter
 * that decides WHICH keys matter was never exercised — mutation could
 * invert it and all of them stayed green. This matters across lanes:
 * app/shared/CLAUDE.md records that Product D writes and deletes
 * `pulse-storage-probe` to find out whether this browser saves site data,
 * and that the shared listener must not wake for it. A listener that woke
 * on every key would re-render four products every time any of them
 * touched storage. */

check("a storage event for another product's key is ignored", () => {
  fresh();
  writePulseSession(FRONT_DESK);
  let woke = 0;
  const stop = subscribeToPulseSession(() => { woke += 1; });
  window.dispatchEvent(new StorageEvent("storage", { key: "pulse-storage-probe" }));
  window.dispatchEvent(new StorageEvent("storage", { key: "pulse-reservations-a" }));
  window.dispatchEvent(new StorageEvent("storage", { key: "pulse-theme" }));
  stop();
  return eq(woke, 0);
});

check("...while the session key still wakes it, so the filter is not simply off", () => {
  fresh();
  writePulseSession(FRONT_DESK);
  let woke = 0;
  const stop = subscribeToPulseSession(() => { woke += 1; });
  window.dispatchEvent(new StorageEvent("storage", { key: "pulse-storage-probe" }));
  window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
  stop();
  return eq(woke, 1);
});

check("a cleared storage (key null) wakes it, because that clears the session too", () => {
  fresh();
  writePulseSession(FRONT_DESK);
  let woke = 0;
  const stop = subscribeToPulseSession(() => { woke += 1; });
  window.dispatchEvent(new StorageEvent("storage", { key: null }));
  stop();
  return eq(woke, 1);
});

check("a same-tab change reports origin this-tab", () => {
  fresh();
  const seen: string[] = [];
  const stop = subscribeToPulseSession((_s, origin) => seen.push(origin));
  writePulseSession(FRONT_DESK);
  clearPulseSession();
  stop();
  return eq(seen, ["this-tab", "this-tab"]);
});

check("a cross-tab storage event reports origin other-tab", () => {
  fresh();
  writePulseSession(FRONT_DESK);
  const seen: string[] = [];
  const stop = subscribeToPulseSession((_s, origin) => seen.push(origin));
  window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
  stop();
  return eq(seen, ["other-tab"]);
});

/* ---------- the sign-in flow (auth owns the decisions) ---------- */

check("the flow lists the running studio plus exactly one staff actor", () => {
  const { members, staff } = signInChoices();
  if (members.length !== sharedStudioMembers().length) return "member list drifted";
  return eq(staff, FRONT_DESK);
});

check("signInAsMember writes exactly the v1 member record", () => {
  fresh();
  const member = sharedStudioMembers()[0];
  if (member === undefined) return "no members to test with";
  signInAsMember(member);
  return eq(readPulseSession(), {
    version: 1,
    actor_type: "member",
    member_id: member.id,
    display_name: member.displayName,
  });
});

check("signInAsFrontDesk writes exactly the staff record", () => {
  fresh();
  signInAsFrontDesk();
  return eq(readPulseSession(), FRONT_DESK);
});

/* ---------- the shared studio, topped up for the dashboard ---------- */

check("sharedStudioWithFill returns a real dataset on the FIRST call", () => {
  /* THE ONE THING THIS FUNCTION MUST NEVER DO. Its cache check reads
   * `existing !== undefined` before it has ever been called with this
   * fill target — a distinct value proves the cache was empty rather
   * than reusing whatever an earlier check in this file populated it
   * with. Nothing here checked this until `npm run mutate` found it: the
   * comparison flipped to `===` and no check noticed, which means the
   * planted bug — returning `undefined` in place of a dataset on a cold
   * cache — could have shipped silently. */
  const dataset = sharedStudioWithFill(0.41);
  return typeof dataset === "object" && dataset !== null && Array.isArray(dataset.classSessions)
    ? true
    : "expected a dataset, got " + JSON.stringify(dataset);
});

check("...and the same fill target is cached, not regenerated", () => {
  const first = sharedStudioWithFill(0.41);
  const second = sharedStudioWithFill(0.41);
  return first === second ? true : "expected the identical cached object back";
});

check("...while a different fill target gets its own dataset", () => {
  const a = sharedStudioWithFill(0.2);
  const b = sharedStudioWithFill(0.6);
  return a !== b ? true : "two different fill targets should not share one cache entry";
});

check("...and every upcoming class matches the schedule a plain sharedStudio() gives", () => {
  /* THE KNOB SEATS MEMBERS; IT DOES NOT TOUCH THE SCHEDULE. Measured
   * 2026-08-23: generating with and without upcomingFillTarget produced
   * 1,900 of 1,900 sessions identical in id, start time, class type and
   * status. This is that measurement, held as a check rather than left
   * as a one-time note — the property Product B's hand-off with Product
   * A now depends on. */
  const plain = sharedStudio();
  const filled = sharedStudioWithFill(0.85);
  const key = (d: typeof plain) => d.classSessions.map((s) => `${s.id}|${s.startsAt}|${s.classTypeId}|${s.status}`);
  return eq(key(filled), key(plain));
});

/* ---------- storage that is broken or missing ---------- */

const throwingStorage = {
  getItem(): string | null { throw new Error("storage unavailable"); },
  setItem(): void { throw new Error("storage unavailable"); },
  removeItem(): void { throw new Error("storage unavailable"); },
};

check("a throwing storage never crashes a read", () => {
  fresh();
  setStorageForChecks(throwingStorage);
  const got = readPulseSession();
  setStorageForChecks(null);
  return eq(got, null);
});

check("a throwing storage keeps the page usable: the choice still holds in-memory", () => {
  fresh();
  setStorageForChecks(throwingStorage);
  writePulseSession(FRONT_DESK); // must not throw
  const got = readPulseSession(); // served from memory, storage is dead
  setStorageForChecks(null);
  if (got === null) return "the in-memory session was lost";
  return eq(got.actor_type, "staff");
});

/* THE REAL PRIVATE-MODE SHAPE: reads work, writes are refused. Storage that
 * throws on everything is the obvious case and was already covered; this is
 * the one several browsers actually implement, and it used to sign a person
 * out the instant they signed in. */
const readOnlyStorage = {
  getItem(): string | null { return null; },
  setItem(): void { throw new Error("storage is full or blocked"); },
  removeItem(): void { /* accepted, nothing kept */ },
};

check("a store that reads fine but refuses writes still holds the sign-in", () => {
  fresh();
  setStorageForChecks(readOnlyStorage);
  writePulseSession(FRONT_DESK);
  const got = readPulseSession();
  setStorageForChecks(null);
  if (got === null) return "the sign-in was thrown away by the first read after it";
  return eq(got.actor_type, "staff");
});

check("...and holds it across repeated reads, not just the first", () => {
  fresh();
  setStorageForChecks(readOnlyStorage);
  writePulseSession(FRONT_DESK);
  readPulseSession();
  readPulseSession();
  const got = readPulseSession();
  setStorageForChecks(null);
  if (got === null) return "the session survived one read and then vanished";
  return eq(got.actor_type, "staff");
});

check("...and signing out in a write-refusing browser really does sign out", () => {
  fresh();
  setStorageForChecks(readOnlyStorage);
  writePulseSession(FRONT_DESK);
  clearPulseSession();
  const got = readPulseSession();
  setStorageForChecks(null);
  return eq(got, null);
});

/* A store that ACCEPTS writes and refuses deletes is not a store that
 * refuses writes. The probe used to wrap both in one try, so this reported
 * "nothing can be saved" about a store that had just saved something. */
const writesButNeverDeletes = {
  values: new Map<string, string>(),
  getItem(key: string): string | null { return this.values.get(key) ?? null; },
  setItem(key: string, value: string): void { this.values.set(key, String(value)); },
  removeItem(): void { throw new Error("delete refused"); },
};

check("a store that writes but refuses deletes still round-trips a session", () => {
  fresh();
  setStorageForChecks(writesButNeverDeletes);
  writesButNeverDeletes.values.clear();
  writePulseSession(FRONT_DESK);
  const got = readPulseSession();
  setStorageForChecks(null);
  if (got === null) return "the session was lost by a store that had just accepted it";
  return eq(got.actor_type, "staff");
});

check("an empty WORKING store still means nobody is signed in", () => {
  fresh();
  const got = readPulseSession();
  return eq(got, null);
});

check("clearing with a throwing storage still signs the page out", () => {
  fresh();
  setStorageForChecks(throwingStorage);
  writePulseSession(FRONT_DESK);
  clearPulseSession();
  const got = readPulseSession();
  setStorageForChecks(null);
  return eq(got, null);
});

/* ---------- where the session chip lands in the header ---------- *
 *
 * mountSessionControl() had no check at all. Its own comment records why
 * that matters: the selector it inserts before CHANGED on 2026-08-23 (the
 * settings drawer that used to sit in the header became its own page),
 * and the old selector would have matched nothing — nothing would have
 * thrown, the control would just have appended after the appearance
 * switch instead of before it, silently, on every page. That EXACT case —
 * a host that already has the switch present — cannot be checked here:
 * the branch calls `insertBefore`, which this stub does not implement,
 * the same limit `cloneNode` put on brand-header.ts's checks. What is
 * still reachable is the branch with no switch on the page (appendChild,
 * which the stub does support), plus the sign-in/signed-in content
 * `render()` settles synchronously — `readStaffGate()` for the staff tag
 * is fired and never awaited, so it cannot be part of what a check()
 * harness with no async support holds to a known answer here. */
check("with no appearance switch on the page, the chip is simply appended", () => {
  const host = document.createElement("div");
  fresh();
  mountSessionControl(host);
  return eq([...host.children].map((c) => c.id), ["pulse-session-control"]);
});
check("signed out, the chip is a Sign in button", () => {
  const host = document.createElement("div");
  fresh();
  mountSessionControl(host);
  const btn = host.querySelector(".pulse-session-signin");
  return eq([btn !== null, btn?.textContent], [true, "Sign in"]);
});
check("signed in, the chip names the member instead", () => {
  const host = document.createElement("div");
  fresh();
  writePulseSession({ version: 1, actor_type: "member", member_id: members[0]?.id ?? "", display_name: "Ada" });
  mountSessionControl(host);
  const who = host.querySelector(".pulse-session-who");
  return eq([host.querySelector(".pulse-session-signin"), who?.textContent], [null, "Ada"]);
});

/* ---------- escaping text before it goes into innerHTML ---------- *
 *
 * escapeHtml() lived twice, byte-identical, in Product A's and Product B's
 * entry modules — each an untestable page-load file, so neither copy had
 * ever run against a hostile string. Moved here the same way storage.ts
 * and today.ts were: one implementation, checked once. */

check("the five HTML-significant characters all escape", () =>
  eq(escapeHtml(`&<>"'`), "&amp;&lt;&gt;&quot;&#039;"));
check("ordinary text passes through untouched", () =>
  eq(escapeHtml("Yoga · Room 2 (all levels)"), "Yoga · Room 2 (all levels)"));
check("an ampersand is escaped FIRST, so its own entity is not re-escaped", () =>
  eq(escapeHtml("Tom & Jerry"), "Tom &amp; Jerry"));
check("a script tag typed into a name field cannot close and reopen a real tag", () =>
  eq(escapeHtml('<script>alert(1)</script>'), "&lt;script&gt;alert(1)&lt;/script&gt;"));
check("a quote cannot break out of a double-quoted HTML attribute", () =>
  eq(escapeHtml('room" onmouseover="steal()'), "room&quot; onmouseover=&quot;steal()"));
check("an empty string escapes to itself", () => eq(escapeHtml(""), ""));

/* ---------- the staff door's one pure function ---------- *
 *
 * doorMessage() had NO check on it at all until `npm run mutate` reached
 * this module for the first time and scored it 0% — every mutation
 * survived, because nothing here called it. The rest of staff-gate.ts asks
 * a real server (readStaffGate, signInStaff, signOutStaff,
 * loadStaffRecords), which this synchronous check() harness cannot stub;
 * that is verified by hand against a throwaway server instead, the same
 * way the rest of the staff door was proven this branch. doorMessage has
 * no such excuse — it is a plain function from a StaffGate value to a
 * sentence, and it is the ONE thing standing between "the server is down"
 * and "no passphrase is set" and "sign in" ever reading the same to a
 * visitor. */

check("no server answered: the door says so, not 'no passphrase'", () => {
  const said = doorMessage({ configured: false, signedIn: false, reachable: false, role: null });
  return said.includes("No server answered") ? true : `unexpected: ${said}`;
});
check("a server answered but no passphrase is set: says THAT, not 'no server'", () => {
  const said = doorMessage({ configured: false, signedIn: false, reachable: true, role: null });
  return said.includes("no staff passphrase set") && !said.includes("No server answered")
    ? true : `unexpected: ${said}`;
});
check("configured and not signed in: asks for the passphrase", () => {
  const said = doorMessage({ configured: true, signedIn: false, reachable: true, role: null });
  return said.includes("Sign in with the studio's staff passphrase") ? true : `unexpected: ${said}`;
});
check("configured and ALREADY signed in reads the same as not signed in", () => {
  /* mountStaffDoor never calls doorMessage once gate.signedIn is true — it
   * returns before building the panel — so this is what the function
   * itself does with that combination, not a claim about what the page
   * shows. Pinned so `signedIn` staying out of the branching is a decision,
   * not an oversight the next edit trips over. */
  const asked = doorMessage({ configured: true, signedIn: false, reachable: true, role: null });
  const alsoSignedIn = doorMessage({ configured: true, signedIn: true, reachable: true, role: "front_desk" });
  return eq(asked, alsoSignedIn);
});
check("unreachable outranks unconfigured — both true says the door is down", () => {
  const said = doorMessage({ configured: false, signedIn: false, reachable: false, role: null });
  return !said.includes("no staff passphrase set") ? true : `unexpected: ${said}`;
});

/* ---------- the door has to leave something for Sign out to end ---------- *
 *
 * Proven by hand against the real server first (STAFF_PASSPHRASE set,
 * scripts/start-haiku.mjs): sign in at the staff door directly — never
 * touching the topbar's own "Sign in" dialog — and the server session is
 * real (/api/staff/records answers, the studio's records render), yet the
 * top bar still reads plain "Sign in". topbar.ts's Sign out button is the
 * ONLY caller of signOutStaff() anywhere in this app, and it only renders
 * when readPulseSession() is non-null. A person who proved they are staff
 * at the door alone had NO control anywhere to end that session early —
 * only the sixty-minute expiry or clearing cookies by hand would do it.
 *
 * The fix has mountStaffDoor's success path remember Front Desk locally
 * the moment the server confirms — the exact value signInAsMember's sibling
 * signInAsFrontDesk() already writes and already round-trips (checked
 * above). What THIS check pins is that the door's OWN success branch
 * actually calls it: the surrounding sequence (fetch, a form submit,
 * window.location.reload()) is exactly what this synchronous check()
 * harness cannot run — the same limit doorMessage's neighboring comment
 * names for the rest of this module — so the shipped source is read
 * instead, the same way synthetic/tests.ts already reads topbar.ts's
 * source for a property no execution here can reach. */
const staffGateSource = await (await fetch("./staff-gate.ts")).text();
check("a confirmed staff sign-in remembers Front Desk locally, so Sign out has something to end", () =>
  /result\.ok[\s\S]{0,400}signInAsFrontDesk\(\)/.test(staffGateSource)
    ? true
    : "mountStaffDoor's success branch does not call signInAsFrontDesk()");

check("the staff door offers a GitHat sign-in link, alongside the passphrase form (not instead of it)", () =>
  /auth\/githat\/start/.test(staffGateSource) ? true : "no /auth/githat/start link found in staff-gate.ts");

/* The owner's invite panel: same "read the source" limit as above — it
 * only ever mounts after a real fetch() resolves signedIn/role, which
 * this synchronous harness cannot drive. What is pinned instead is the
 * ONE gate that decides whether it renders at all. */
check("mountStaffDoor only mounts the owner invite panel for gate.role === \"owner\"", () =>
  /gate\.role === "owner"[\s\S]{0,80}mountOwnerInvitePanel\(\)/.test(staffGateSource)
    ? true
    : "mountOwnerInvitePanel() is not gated on gate.role === \"owner\" in mountStaffDoor");
check("mountOwnerInvitePanel is not reachable from anywhere except the owner branch above", () =>
  // Two matches total: the function's own `(): void {` declaration, and
  // the one call site inside the gate.role === "owner" branch above.
  eq((staffGateSource.match(/mountOwnerInvitePanel\(\)/g) ?? []).length, 2));
check("the invite panel's create button calls createStaffInvite(), never fetch() directly", () =>
  /function mountOwnerInvitePanel[\s\S]*?createStaffInvite\(\)/.test(staffGateSource)
    ? true
    : "mountOwnerInvitePanel does not call createStaffInvite()");

/* ---------- "Sign in with GitHat": OAuth 2.0 + PKCE(S256) against the
 * sibling GitHat service ----------
 *
 * Written failing-first the same way this whole suite was: every negative
 * case below is proven to fail for the SPECIFIC reason it should, not just
 * to return "not ok". The genuinely asynchronous seams — RSA signature
 * verification and JWKS fetching both go through `crypto.subtle`, which
 * has no synchronous form — are resolved with a top-level `await` before
 * being handed to this file's check() harness, exactly the way
 * `synthetic/tests.ts` already resolves its own `await fetch(...)` calls
 * before registering a check; see the comment beside `mountSessionControl`
 * above for why the harness itself cannot await anything. */

const OAUTH_NOW_SECONDS = 1_800_000_000; // a fixed instant, so a token minted "expired" here stays expired regardless of when this suite runs
const OAUTH_NOW_MS = OAUTH_NOW_SECONDS * 1000;

/* THE TOKEN-ENDPOINT RESPONSE, which is the only thing this door reads.
 *
 * This block used to generate a real RSA key pair and check RS256
 * signature verification, `alg:none`, algorithm confusion, unknown `kid`,
 * issuer/audience pinning and JWKS cache behaviour — about thirty checks
 * over roughly two hundred lines of `githat-oauth.ts`.
 *
 * All of it verified a token GitHat does not mint. Measured against the
 * live service on 2026-08-25: `POST /oauth/token` returns RFC 6749 §5.1
 * only, there is no `id_token`, the identity claim is `userId` rather
 * than `sub`, and `aud` is the fleet-wide constant `githat` rather than
 * this client. The checks all PASSED, against a fixture token shaped the
 * way the code wished the provider behaved — which is exactly the failure
 * mode worth naming: a green suite proving a module agrees with itself.
 *
 * What replaced it is smaller because the trust argument is smaller and
 * real: the identity arrives in the body of a direct server-to-server
 * HTTPS POST that this process makes itself, carrying a single-use code
 * and a PKCE verifier that never left it. So what has to be checked is
 * that the body is parsed defensively and that a malformed one fails
 * CLOSED — never that a signature validates. */

const GITHAT_TOKEN_RESPONSE = {
  access_token: "fixture-opaque-access-token",
  token_type: "Bearer",
  expires_in: 900,
  refresh_token: "fixture-opaque-refresh-token",
  scope: "githat",
  user: {
    id: "githat-user-1",
    email: "front.desk@pulse.test",
    name: "Front Desk",
    avatarUrl: null,
    emailVerified: true,
  },
  org: { id: "org-1", name: "Pulse Studio", slug: "pulse", role: "owner", tier: "free" },
};

const extracted = extractIdentity(GITHAT_TOKEN_RESPONSE);
check("the real GitHat token-response shape yields the signed-in identity", () =>
  eq(extracted, {
    sub: "githat-user-1",
    email: "front.desk@pulse.test",
    emailVerified: true,
    name: "Front Desk",
  }));

/* Every one of these is a FAIL-CLOSED case. The blank-id pair matter most:
 * an empty subject would otherwise reach resolveStaffRole, and while an
 * empty STAFF_GITHAT_SUBJECTS denies it anyway, a door should never depend
 * on a second check to refuse an identity it could not read. */
check("a response with no user object at all is refused", () =>
  eq(extractIdentity({ access_token: "x", token_type: "Bearer" }), null));
check("a response whose user is null is refused", () => eq(extractIdentity({ user: null }), null));
check("a response whose user is a string is refused", () => eq(extractIdentity({ user: "githat-user-1" }), null));
check("a user with no id is refused", () =>
  eq(extractIdentity({ user: { email: "someone@pulse.test" } }), null));
check("a user whose id is an empty string is refused", () => eq(extractIdentity({ user: { id: "" } }), null));
check("a user whose id is only whitespace is refused", () => eq(extractIdentity({ user: { id: "   " } }), null));
check("a user whose id is a number is refused (never coerced to a string)", () =>
  eq(extractIdentity({ user: { id: 12345 } }), null));
check("a null response is refused", () => eq(extractIdentity(null), null));
check("a string response is refused", () => eq(extractIdentity("githat-user-1"), null));
check("an array response is refused", () => eq(extractIdentity([{ id: "githat-user-1" }]), null));

/* Optional fields degrade to null rather than to a wrong value, and
 * emailVerified is TRUE only for a literal true — never for "true", 1, or
 * any other truthy stand-in. */
check("a user with an id but no email yields a null email, not a missing identity", () =>
  eq(extractIdentity({ user: { id: "githat-user-1" } }), {
    sub: "githat-user-1",
    email: null,
    emailVerified: false,
    name: null,
  }));
check("emailVerified is false unless it is literally true", () =>
  eq(extractIdentity({ user: { id: "u", emailVerified: "true" } })?.emailVerified, false));
check("emailVerified true is carried through", () =>
  eq(extractIdentity({ user: { id: "u", emailVerified: true } })?.emailVerified, true));

/* Staff authorization: separate from authentication. A valid identity
 * grants nothing by itself. */
check("an unset STAFF_GITHAT_SUBJECTS denies every subject, including one that would otherwise match", () =>
  eq(isAuthorizedStaffSubject("githat-user-1", parseStaffSubjects(undefined)), false));
check("an empty STAFF_GITHAT_SUBJECTS denies every subject", () =>
  eq(isAuthorizedStaffSubject("githat-user-1", parseStaffSubjects("   ")), false));
check("a valid token's sub NOT on STAFF_GITHAT_SUBJECTS is denied staff access", () =>
  eq(isAuthorizedStaffSubject(extracted?.sub ?? "", parseStaffSubjects("someone-else")), false));
check("a valid token's sub present in STAFF_GITHAT_SUBJECTS is authorized", () =>
  eq(
    isAuthorizedStaffSubject(extracted?.sub ?? "", parseStaffSubjects("someone-else, githat-user-1 ,a-third-one")),
    true,
  ));

/* Roles: owner vs. employee vs. neither. An unset OWNER_GITHAT_SUBJECT
 * denies the capability to everyone, same "deny by default" shape as an
 * unset STAFF_GITHAT_SUBJECTS — never a fallback that hands "owner" to
 * whoever happens to sign in first. */
check("parseOwnerSubject treats unset as absent", () => eq(parseOwnerSubject(undefined), null));
check("parseOwnerSubject treats blank/whitespace as absent", () => eq(parseOwnerSubject("   "), null));
check("parseOwnerSubject trims a real subject", () => eq(parseOwnerSubject("  owner-sub  "), "owner-sub"));

const roleParams = {
  ownerSubject: parseOwnerSubject("owner-sub"),
  staffSubjects: parseStaffSubjects("preset-employee"),
  directorySubjects: new Set(["invited-employee"]),
};
check("resolveStaffRole: the owner subject resolves to owner", () => eq(resolveStaffRole("owner-sub", roleParams), "owner"));
check("resolveStaffRole: a subject on the static STAFF_GITHAT_SUBJECTS list resolves to employee", () =>
  eq(resolveStaffRole("preset-employee", roleParams), "employee"));
check("resolveStaffRole: a subject only in the invited directory resolves to employee", () =>
  eq(resolveStaffRole("invited-employee", roleParams), "employee"));
check("resolveStaffRole: an unrecognized subject resolves to no role at all", () =>
  eq(resolveStaffRole("nobody-in-particular", roleParams), null));
check("resolveStaffRole: an unset owner subject never matches, even a literal empty string sub cannot slip through", () =>
  eq(resolveStaffRole("", { ownerSubject: null, staffSubjects: parseStaffSubjects(undefined), directorySubjects: new Set() }), null));

/* THE BOOTSTRAP RULE. Authorizing the first person requires their GitHat
 * account id, and nothing in GitHat's dashboard shows it — so the denial
 * page is the only place it can come from. These pin that it is actually
 * there, because a well-meaning edit that trimmed the message back to a
 * bare "not authorized" would silently restore a dead end that costs shell
 * access on the server to escape. */
check("the denial detail names the account id that was refused", () =>
  unauthorizedDetail("githat-user-1").includes("githat-user-1")
    ? true
    : `the sub is missing from: ${unauthorizedDetail("githat-user-1")}`);
check("the denial detail names both env vars an operator could add it to", () => {
  const detail = unauthorizedDetail("githat-user-1");
  return detail.includes("OWNER_GITHAT_SUBJECT") && detail.includes("STAFF_GITHAT_SUBJECTS")
    ? true
    : `expected both env var names in: ${detail}`;
});
check("the denial detail says a restart is required, since both are read once at startup", () =>
  /restart/i.test(unauthorizedDetail("githat-user-1")) ? true : "the restart requirement is not stated");

/* Trusted origin / redirect_uri — exact match, checked against the exact
 * shapes an attacker would actually try. */
check("isTrustedRedirectUri accepts the exact registered redirect_uri", () => eq(isTrustedRedirectUri(PULSE_REDIRECT_URI), true));
check("isTrustedRedirectUri rejects an unrelated, untrusted origin", () =>
  eq(isTrustedRedirectUri("https://evil.example.com/auth/callback"), false));
check("isTrustedRedirectUri rejects a one-character difference", () =>
  eq(isTrustedRedirectUri(PULSE_REDIRECT_URI.slice(0, -1)), false));
check("isTrustedRedirectUri rejects a subdomain-confusion look-alike (evil.pulse.githat.io)", () =>
  eq(isTrustedRedirectUri("https://evil.pulse.githat.io/auth/callback"), false));
check("isTrustedOrigin accepts the trusted Pulse origin", () => eq(isTrustedOrigin(PULSE_TRUSTED_ORIGIN), true));
check("isTrustedOrigin rejects an untrusted origin", () => eq(isTrustedOrigin("https://evil.example.com"), false));
check("isTrustedOrigin rejects a subdomain-confusion look-alike", () => eq(isTrustedOrigin("https://evil.pulse.githat.io"), false));

/* STATE + authorization-code replay. PKCE checks used to live here —
 * removed along with the rest of the PKCE machinery (see githat-oauth.ts's
 * file header): no fleet consumer uses it, and it was the one code path
 * unique to Pulse when every real sign-in attempt failed at the token
 * exchange. `state` alone, single-use and server-held, is the actual CSRF
 * defense, proven below. */
const oauthTx = beginOAuthTransaction(OAUTH_NOW_MS);

const transactionStore = createTransactionStore();
check("state store: an unknown state is not found", () => eq(transactionStore.take("no-such-state", OAUTH_NOW_MS), null));
transactionStore.save(oauthTx);
check("state store: a missing state (never saved) is not found", () => eq(transactionStore.take("still-unknown", OAUTH_NOW_MS), null));
const firstStateTake = transactionStore.take(oauthTx.state, OAUTH_NOW_MS);
check("state store: the saved transaction is found on its first use", () => eq(firstStateTake?.state, oauthTx.state));
check("state store: the SAME state is refused on reuse (single-use, not merely time-limited)", () =>
  eq(transactionStore.take(oauthTx.state, OAUTH_NOW_MS), null));

const expiringTx = await beginOAuthTransaction(0);
const expiringStore = createTransactionStore();
expiringStore.save(expiringTx);
check("state store: an expired transaction is treated as not found", () =>
  eq(expiringStore.take(expiringTx.state, expiringTx.expiresAt + 1), null));

const codeStoreUnderTest = createUsedCodeStore();
check("an authorization code is accepted the first time it is claimed", () => eq(codeStoreUnderTest.claim("code-1", OAUTH_NOW_MS), true));
check("the SAME authorization code is refused on replay", () => eq(codeStoreUnderTest.claim("code-1", OAUTH_NOW_MS), false));
check("a DIFFERENT authorization code is still accepted", () => eq(codeStoreUnderTest.claim("code-2", OAUTH_NOW_MS), true));

/* A sign-in that started from an invite link carries the invite token on
 * its OAuth transaction, all the way to the callback — the one thing that
 * lets the server redeem THAT specific invite and no other. */
const inviteTx = await beginOAuthTransaction(OAUTH_NOW_MS, "invite-token-abc");
check("beginOAuthTransaction threads an invite token onto the transaction when given one", () =>
  eq(inviteTx.inviteToken, "invite-token-abc"));
const plainTx = await beginOAuthTransaction(OAUTH_NOW_MS);
check("beginOAuthTransaction carries no invite token for the plain sign-in door", () => eq(plainTx.inviteToken, undefined));

/* THE INVITE STORE. Single-use and expiring, same shape as the state store
 * above and for the same reason: a link is good for exactly one sign-in.
 *
 * Every read below is SNAPSHOTTED into a const at the point in the file
 * where the action actually happens, exactly like countAfterCachedCalls
 * above — check()'s own run() closures are not evaluated until every
 * top-level statement in this file has already executed once, so a
 * closure that called inviteStore.peek() itself would see the state as it
 * stands at the very END of the file (after every claim() below has
 * already run), not at the narrative point the test describes. */
const inviteStore = createInviteStore(1000);
const invite = inviteStore.create(OAUTH_NOW_MS);
/* Primitive snapshots, not the object itself: claim() below mutates the
 * SAME stored object in place (see its own comment), so a reference held
 * here would read whatever it was mutated to by the time this file's
 * deferred check() closures finally run — the same reason
 * countAfterCachedCalls above snapshots a number, not the cache. */
const tokenWhilePending = inviteStore.peek(invite.token, OAUTH_NOW_MS)?.token;
const usedWhilePending = inviteStore.peek(invite.token, OAUTH_NOW_MS)?.used;
check("a freshly created invite is pending", () => eq(tokenWhilePending, invite.token));
check("an unknown invite token is not pending", () => eq(inviteStore.peek("no-such-token", OAUTH_NOW_MS), null));
check("peek does not consume the invite", () => eq(usedWhilePending, false));
const claimed = inviteStore.claim(invite.token, OAUTH_NOW_MS);
check("claiming a pending invite succeeds and returns it", () => eq(claimed?.token, invite.token));
const secondClaim = inviteStore.claim(invite.token, OAUTH_NOW_MS);
check("the SAME invite token is refused on a second claim (single-use)", () => eq(secondClaim, null));
const peekAfterClaim = inviteStore.peek(invite.token, OAUTH_NOW_MS);
check("a used invite no longer peeks as pending either", () => eq(peekAfterClaim, null));

const expiringInviteStore = createInviteStore(1000);
const expiringInvite = expiringInviteStore.create(OAUTH_NOW_MS);
const expiredClaim = expiringInviteStore.claim(expiringInvite.token, expiringInvite.expiresAt + 1);
check("an expired invite is refused on claim", () => eq(expiredClaim, null));
const expiredPeek = expiringInviteStore.peek(expiringInvite.token, expiringInvite.expiresAt + 1);
check("an expired invite does not peek as pending", () => eq(expiredPeek, null));

const listingInviteStore = createInviteStore(1000);
const pendingA = listingInviteStore.create(OAUTH_NOW_MS);
const pendingB = listingInviteStore.create(OAUTH_NOW_MS);
listingInviteStore.claim(pendingA.token, OAUTH_NOW_MS);
check("list() reports only still-pending invites, not a claimed one", () =>
  eq(listingInviteStore.list(OAUTH_NOW_MS).map((entry) => entry.token), [pendingB.token]));

/* Token exchange: the server-to-server leg. A fetcher is always supplied
 * explicitly — none of these calls ever touch a real network. */
const rejectingTokenFetcher: FetchLike = async () => ({ ok: false, status: 400, json: async () => ({ error: "invalid_grant" }) });
const rejectedExchange = await exchangeCodeForToken({ code: "any-code", fetcher: rejectingTokenFetcher });
check("a token endpoint rejection fails the exchange", () => eq(rejectedExchange.ok, false));

/* THE PROVEN FLEET SHAPE, PINNED. Matched 2026-08-26 to what SebasTN and
 * Quantl's shared @fleet/auth package actually send — every real sign-in
 * failed at this exact leg while Pulse sent grant_type/client_id/
 * code_verifier/form-encoding instead, none of which GitHat's oauth-token.js
 * reads. A regression here silently reintroduces the outage. */
let capturedInit: RequestInit | undefined;
const capturingFetcher: FetchLike = async (_url, init) => {
  capturedInit = init;
  return { ok: true, status: 200, json: async () => GITHAT_TOKEN_RESPONSE };
};
await exchangeCodeForToken({ code: "the-code-under-test", fetcher: capturingFetcher });
check("the token POST sends Content-Type: application/json", () =>
  eq((capturedInit?.headers as Record<string, string> | undefined)?.["content-type"], "application/json"));
check("the token POST body is JSON {code} — nothing else", () =>
  eq(typeof capturedInit?.body === "string" ? JSON.parse(capturedInit.body) : null, { code: "the-code-under-test" }));

const unreachableTokenFetcher: FetchLike = async () => {
  throw new Error("simulated network failure");
};
const unreachableExchange = await exchangeCodeForToken({ code: "any-code", fetcher: unreachableTokenFetcher });
check("a token endpoint that cannot be reached fails the exchange rather than silently succeeding", () =>
  eq(unreachableExchange.ok, false));

const acceptingTokenFetcher: FetchLike = async () => ({
  ok: true,
  status: 200,
  json: async () => GITHAT_TOKEN_RESPONSE,
});
const acceptedExchange = await exchangeCodeForToken({ code: "any-code", fetcher: acceptingTokenFetcher });
check("a successful exchange yields the identity from the response body", () =>
  eq(acceptedExchange, {
    ok: true,
    identity: { sub: "githat-user-1", email: "front.desk@pulse.test", emailVerified: true, name: "Front Desk" },
  }));

/* A 200 whose body is the WRONG SHAPE must fail closed. This is the case
 * the old JWT path got wrong in production without anyone noticing: it
 * treated "no identity found" as a reason string and the callback turned
 * it into a 502, which is right — but nothing ever exercised it against
 * the shape GitHat actually sends. */
const shapelessTokenFetcher: FetchLike = async () => ({
  ok: true,
  status: 200,
  json: async () => ({ access_token: "opaque", token_type: "Bearer" }),
});
const shapelessExchange = await exchangeCodeForToken({ code: "any-code", fetcher: shapelessTokenFetcher });
check("a 200 with no user object fails the exchange closed", () =>
  eq(shapelessExchange, { ok: false, reason: "no_identity_in_response" }));

const badJsonFetcher: FetchLike = async () => ({
  ok: true,
  status: 200,
  json: async () => { throw new Error("not json"); },
});
const badJsonExchange = await exchangeCodeForToken({ code: "any-code", fetcher: badJsonFetcher });
check("a 200 whose body is not JSON fails the exchange closed", () =>
  eq(badJsonExchange, { ok: false, reason: "token_endpoint_bad_json" }));

/* buildAuthorizeUrl: matched to the ACTUAL fleet wire contract (measured
 * 2026-08-26 from SebasTN, Quantl, and the shared @fleet/auth package) —
 * `app`, `redirect_url`, `state`. Not `client_id`/`response_type`/PKCE:
 * see the file's own header for why those were removed rather than kept. */
const testAuthorizeUrl = new URL(buildAuthorizeUrl("state-under-test"));
check("buildAuthorizeUrl targets GitHat's authorize endpoint", () =>
  eq(testAuthorizeUrl.origin + testAuthorizeUrl.pathname, "https://api.githat.io/oauth/authorize"));
check("buildAuthorizeUrl carries exactly app, redirect_url, and state — the proven fleet shape", () =>
  eq(
    [
      testAuthorizeUrl.searchParams.get("app"),
      /* GitHat's OWN param name, not the OAuth-standard "redirect_uri" —
       * see buildAuthorizeUrl's own comment: verified live, the spec name
       * alone gets a flat 400 from the real service. */
      testAuthorizeUrl.searchParams.get("redirect_url"),
      testAuthorizeUrl.searchParams.get("state"),
    ],
    [GITHAT_APP_SLUG, PULSE_REDIRECT_URI, "state-under-test"],
  ));
check("buildAuthorizeUrl does NOT use the spec-standard redirect_uri param name (GitHat does not read it)", () =>
  eq(testAuthorizeUrl.searchParams.get("redirect_uri"), null));
check("buildAuthorizeUrl carries no client_id, response_type, or PKCE params — no fleet consumer sends them", () =>
  eq(
    [
      testAuthorizeUrl.searchParams.get("client_id"),
      testAuthorizeUrl.searchParams.get("response_type"),
      testAuthorizeUrl.searchParams.get("code_challenge"),
      testAuthorizeUrl.searchParams.get("code_challenge_method"),
    ],
    [null, null, null, null],
  ));

/* Source-text properties this synchronous harness cannot exercise by
 * running the server — the same limit, and the same remedy, already named
 * beside the Front-Desk-remembering check just above. */
const githatOauthSource = await (await fetch("./githat-oauth.ts")).text();
const serverSource = await (await fetch("../../../scripts/start-haiku.mjs")).text();

check("the OAuth client module never imports node:crypto, so it still loads in a real browser tab", () =>
  !/from\s+["']node:crypto["']/.test(githatOauthSource) ? true : "githat-oauth.ts imports node:crypto");

check("the callback route logs only a reason string on denial, never the token/code/verifier themselves", () => {
  const suspiciousLogLines = serverSource
    .split("\n")
    .filter((line) => /console\.(log|error|warn)/.test(line))
    .filter((line) => /\bidentity\.sub\b|\bcodeVerifier\b|\bcode_verifier\b|\baccess_token\b/.test(line));
  return suspiciousLogLines.length === 0 ? true : `suspicious log line(s): ${suspiciousLogLines.join(" | ")}`;
});

check("both staff session cookies are HttpOnly, Secure, SameSite=Lax, with no Domain attribute anywhere in the server", () => {
  const cookieLines = serverSource.split("\n").filter((line) => line.includes("HttpOnly; Secure; SameSite=Lax"));
  const hasDomainAttribute = /;\s*Domain=/.test(serverSource);
  return cookieLines.length >= 2 && !hasDomainAttribute
    ? true
    : `cookie-shaped lines found: ${cookieLines.length}, a Domain= attribute present: ${hasDomainAttribute}`;
});

/* The denial page is the ONE place this server prints a value it did not
 * author. It arrives over TLS from GitHat rather than from the callback
 * URL, so it is not attacker-controlled today — but "today" is the kind of
 * assumption that rots, and the blast radius is stored XSS on the staff
 * door, so the escaping is pinned rather than trusted. */
check("the value interpolated into the denial page is HTML-escaped, not trusted raw", () =>
  /const detailHtml = detail === null \? "" : `<p>\$\{escapeHtml\(detail\)\}<\/p>`/.test(serverSource)
    ? true
    : "sendGithatResult no longer escapes its detail before interpolating it");

/* REVOCATION MUST STAY REAL. This door's signed-in check was once the
 * cookie's HMAC and expiry alone, so the authorization lists were read
 * once at callback time and never again: removing somebody from
 * STAFF_GITHAT_SUBJECTS left their cookie opening /api/staff/records for
 * the rest of its 30 days, ACROSS the restart meant to apply the removal
 * (measured: signedIn:true beside role:null, and a 200 with every member
 * record). The fix is that the role is resolved per request. Pinned here
 * because the tempting "optimisation" is to trust the cookie again. */
check("the GitHat signed-in check resolves the role per request, never the cookie alone", () => {
  const body = serverSource.slice(serverSource.indexOf("function requestIsSignedInViaGithat"));
  const fn = body.slice(0, body.indexOf("\n}") + 2);
  if (/githatTokenIsValid\s*\(/.test(fn)) {
    return "requestIsSignedInViaGithat is back to trusting the cookie's HMAC alone — a removed staff member would keep access";
  }
  return /githatRoleFromRequest\s*\(/.test(fn) ? true : `unrecognised shape: ${fn}`;
});

check("the per-request role resolution actually consults both authorization lists", () => {
  const body = serverSource.slice(serverSource.indexOf("function githatRoleFromRequest"));
  const fn = body.slice(0, body.indexOf("\n}") + 2);
  return /staffSubjects/.test(fn) && /directorySubjects/.test(fn) && /ownerSubject/.test(fn)
    ? true
    : `githatRoleFromRequest no longer consults every list: ${fn}`;
});

check("the GitHat door and the passphrase door issue distinctly named cookies", () =>
  serverSource.includes('"__Host-pulse_session"') && serverSource.includes('"__Host-pulse-staff"')
    ? true
    : "expected both distinct cookie-name constants in scripts/start-haiku.mjs");

check("the passphrase door's own check is still wired into requestIsSignedInStaff, unchanged", () =>
  /staffTokenIsValid\(cookieValue\(request, STAFF_COOKIE\)\)/.test(serverSource)
    ? true
    : "requestIsSignedInStaff no longer checks the passphrase cookie");

check("requestIsSignedInStaff accepts EITHER door's session, not only the passphrase one", () =>
  serverSource.includes(
    "staffTokenIsValid(cookieValue(request, STAFF_COOKIE)) || requestIsSignedInViaGithat(request)",
  )
    ? true
    : "requestIsSignedInStaff does not also check the GitHat session");

/* ---------- run ---------- */

/* ---------- the compatibility view Product A reads ---------- */

/* THE ONE SHAPE ANOTHER PRODUCT DEPENDS ON.
 *
 * app/shared/CLAUDE.md names this as load-bearing: "Product A consumes the
 * compatibility view (currentSession() / onSessionChange(), reading .role
 * and .member_id). Do not remove those exports until Kerrian migrates."
 * It had no checks at all — mutation found that flipping one comparison in
 * currentSession hands a MEMBER role "staff" and a null member_id, which
 * would show a member the staff view and lose their identity, inside
 * somebody else's lane, with nothing here to notice. */

check("a signed-in member reads as role member, with their id kept", () => {
  fresh();
  writePulseSession(memberSession(m1.id, m1.displayName));
  const view = currentSession();
  if (view === null) return "compatibility view returned null";
  if (view.role !== "member") return `role ${view.role}`;
  return eq(view.member_id, m1.id);
});

check("...and carries the name the header shows", () => {
  fresh();
  writePulseSession(memberSession(m1.id, m1.displayName));
  return eq(currentSession()?.display_name, m1.displayName);
});

check("a signed-in staff person reads as role staff", () => {
  fresh();
  writePulseSession(FRONT_DESK);
  return eq(currentSession()?.role, "staff");
});

check("...and carries NO member_id, so no member's data can be keyed off it", () => {
  fresh();
  writePulseSession(FRONT_DESK);
  return eq(currentSession()?.member_id, null);
});

check("signed out reads as null, not as an empty member", () => {
  fresh();
  return eq(currentSession(), null);
});

check("the two roles are never the same value", () => {
  fresh();
  writePulseSession(memberSession(m1.id, m1.displayName));
  const asMember = currentSession()?.role;
  fresh();
  writePulseSession(FRONT_DESK);
  const asStaff = currentSession()?.role;
  return asMember === asStaff ? `both read as ${asMember}` : true;
});

/* THE SESSION THAT GOES STALE OVERNIGHT.
 *
 * studio.ts dates the studio to TODAY, so a remembered member_id can name
 * somebody who is no longer in the roster. The read side clears that
 * session by design — shared/CLAUDE.md says so — and nothing checked it.
 * Mutation could invert the condition and every check stayed green. */

check("a session naming a member who is not in the roster is cleared", () => {
  fresh();
  writePulseSession(memberSession("member:gone-yesterday", "Someone Who Left"));
  return eq(readPulseSession(), null);
});

check("...and the compatibility view reports it as signed out, not as a ghost", () => {
  fresh();
  writePulseSession(memberSession("member:gone-yesterday", "Someone Who Left"));
  return eq(currentSession(), null);
});

check("...while a staff session survives, having no member to go stale", () => {
  fresh();
  writePulseSession(FRONT_DESK);
  return eq(currentSession()?.role, "staff");
});

/* ------------------------------------------------------------------ */
/* Who the assistant is talking to                                      */
/* ------------------------------------------------------------------ */

/* THE DATA LAW, AT THE ONE PLACE MOST LIKELY TO BREAK IT. An assistant that
 * answers from studio records is the easiest surface in this repo on which
 * to show a member somebody else's roster by accident. These checks pin the
 * asymmetry that makes that hard: placement can NARROW what may be said and
 * can never widen it, so a member on a staff page is still a member. */

check("staff answers need a staff page AND a staff person", () =>
  eq(audienceFor("staff", "staff-facing"), "staff"));
check("a member on a staff page is still a member", () =>
  eq(audienceFor("member", "staff-facing"), "member"));
/* The one people get wrong: the screen may be turned toward a member, so a
 * staff person on a member-facing page gets member answers. */
check("a staff person on a member page gets member answers", () =>
  eq(audienceFor("staff", "member-facing"), "member"));
check("nobody signed in is a member audience", () =>
  eq(audienceFor(null, "staff-facing"), "member"));

check("a member policy may not use staff records", () =>
  eq(audiencePolicy("member", "member-facing").mayUseStaffRecords, false));
check("...nor name another member", () =>
  eq(audiencePolicy("member", "member-facing").mayNameOtherMembers, false));
check("a staff policy may do both", () => {
  const p = audiencePolicy("staff", "staff-facing");
  return eq([p.mayUseStaffRecords, p.mayNameOtherMembers].join(","), "true,true");
});
check("the greeting uses a first name only when there is one", () =>
  eq(audiencePolicy("member", "member-facing", "Ada").greeting.startsWith("Hi Ada"), true));
check("...and assumes nothing about an unsigned reader", () =>
  eq(audiencePolicy(null, "member-facing").greeting.includes("Hi "), false));
check("...and an empty name is treated the same as no name", () =>
  eq(audiencePolicy("member", "member-facing", "").greeting.includes("Hi "), false));
/* THE STAFF GREETING HAD NO CHECK ON IT AT ALL — every check above this
 * line reads a member policy's greeting; the one staff-policy check
 * above stops at mayUseStaffRecords/mayNameOtherMembers. `npm run mutate`
 * found the gap once these modules became reachable: the whole
 * `firstName === null || firstName === ""` condition in the staff branch
 * could be broken and nothing here would notice. */
check("a staff greeting with no name asks plainly, uncredited", () =>
  eq(audiencePolicy("staff", "staff-facing").greeting, "Ask about the schedule, capacity, attendance, or policies."));
check("...and a named staff person is greeted by it", () =>
  eq(audiencePolicy("staff", "staff-facing", "Sam").greeting.startsWith("Sam — "), true));
check("...with an empty name treated the same as no name, same as members", () =>
  eq(audiencePolicy("staff", "staff-facing", "").greeting.startsWith("Sam"), false));
/* A refusal states what it checked rather than shrugging. */
check("a refusal says where the answer would have come from", () =>
  eq(audiencePolicy("member", "member-facing").refusal.includes("studio's records"), true));

/* The outgoing guard. Deciding the audience is the easy half; the failure
 * mode is an answer composed for staff reaching a member's screen after the
 * decision was made. */
check("a member's answer may not name another member", () =>
  eq(answerProblems("Priya Patel has not been in for a while.",
    audiencePolicy("member", "member-facing"), ["Priya Patel"]).length > 0, true));
check("...and matching ignores case", () =>
  eq(answerProblems("ask priya patel about it",
    audiencePolicy("member", "member-facing"), ["Priya Patel"]).length > 0, true));
check("a member's answer may not carry roster vocabulary", () =>
  eq(answerProblems("Twelve booked and three no-shows.",
    audiencePolicy("member", "member-facing")).length > 0, true));
check("...nor cancellation risk", () =>
  eq(answerProblems("She is at-risk of cancelling.",
    audiencePolicy("member", "member-facing")).length > 0, true));
check("...nor fill rate", () =>
  eq(answerProblems("That class has a low fill rate.",
    audiencePolicy("member", "member-facing")).length > 0, true));
/* An ordinary member answer passes, or the guard would refuse everything and
 * prove nothing. */
check("an ordinary member answer passes the guard", () =>
  eq(answerProblems("Yoga is on Thursday at 9:00 AM, and there are spots left.",
    audiencePolicy("member", "member-facing"), ["Priya Patel"]), []));
/* Staff are allowed all of it — that is the whole point of the flag. */
check("staff answers are not filtered", () =>
  eq(answerProblems("Priya Patel: three no-shows, at-risk.",
    audiencePolicy("staff", "staff-facing"), ["Priya Patel"]), []));


/* ------------------------------------------------------------------ */
/* The guarded storage doors                                            */
/* ------------------------------------------------------------------ */

/* THESE MOVED HERE FROM TWO PLACES AT ONCE, and the move is what they are
 * checking. theme-boot.ts and Product D's main.ts each carried their own
 * readStored / writeStored / clearStored / storageWorks, and the two had
 * DRIFTED: D split the write from the cleanup inside storageWorks after
 * finding that a store which accepted the write and refused the delete
 * reported "this browser is not saving site data" — the opposite of what
 * had just happened. theme-boot's copy still had them in one try. Neither
 * copy had a single check on it, because both sat in a module no suite can
 * import (each reads `document` at load).
 *
 * The fixtures below are the ones this file already keeps for the session
 * contract, which is the reason the doors landed in this suite rather than
 * a new one: the interesting storage failures were already modelled here. */

check("a working store round-trips a value", () => {
  setSharedStorageForChecks(null);
  writeStored("pulse-check-probe", "kept");
  const got = readStored("pulse-check-probe");
  clearStored("pulse-check-probe");
  return eq(got, "kept");
});

check("a throwing store reads as nothing rather than crashing", () => {
  setSharedStorageForChecks(throwingStorage);
  const got = readStored("anything");
  setSharedStorageForChecks(null);
  return eq(got, null);
});

check("a write that lands says so", () => {
  setSharedStorageForChecks(writesButNeverDeletes);
  writesButNeverDeletes.values.clear();
  const got = writeStored("k", "v");
  setSharedStorageForChecks(null);
  return eq(got, true);
});

check("a write that is refused says so instead of throwing", () => {
  setSharedStorageForChecks(readOnlyStorage);
  const got = writeStored("k", "v");
  setSharedStorageForChecks(null);
  return eq(got, false);
});

check("a delete that is refused says so instead of throwing", () => {
  setSharedStorageForChecks(writesButNeverDeletes);
  const got = clearStored("k");
  setSharedStorageForChecks(null);
  return eq(got, false);
});

check("storageWorks is true when the browser really does save", () => {
  setSharedStorageForChecks(writesButNeverDeletes);
  writesButNeverDeletes.values.clear();
  const got = storageWorks();
  setSharedStorageForChecks(null);
  return eq(got, true);
});

/* THE REGRESSION THE SPLIT TRY EXISTS FOR. This exact store — writes
 * accepted, deletes refused — is what made the one-try version report a
 * blocked browser to somebody whose browser had just saved their choice.
 * The check above is the same fixture; this one names why it matters, and
 * both fail together if the two try blocks are ever merged again. */
check("...even when that browser refuses to delete the probe afterwards", () => {
  setSharedStorageForChecks(writesButNeverDeletes);
  writesButNeverDeletes.values.clear();
  const answer = storageWorks();
  const leftBehind = writesButNeverDeletes.values.get(PROBE_KEY) ?? null;
  setSharedStorageForChecks(null);
  if (answer !== true) return "reported a blocked browser about a store that had just accepted the write";
  /* Stated rather than assumed: the probe IS left behind here, and that is
   * the accepted cost. Nothing in this repo reads that key. */
  return eq(leftBehind, "1");
});

check("storageWorks is false when the browser refuses the write", () => {
  setSharedStorageForChecks(readOnlyStorage);
  const got = storageWorks();
  setSharedStorageForChecks(null);
  return eq(got, false);
});

check("...and false when it refuses everything", () => {
  setSharedStorageForChecks(throwingStorage);
  const got = storageWorks();
  setSharedStorageForChecks(null);
  return eq(got, false);
});

check("a working browser is left with no probe behind", () => {
  setSharedStorageForChecks(null);
  localStorage.removeItem(PROBE_KEY);
  storageWorks();
  return eq(localStorage.getItem(PROBE_KEY), null);
});

/* The probe key is the one the cross-tab session listener deliberately
 * ignores — app/shared/CLAUDE.md records why: a listener waking on every
 * key would re-render four products whenever any one of them touched
 * storage. Pinned to the literal, not to the constant, so renaming the
 * constant cannot make this check agree with itself. */
check("the probe key is the one the session listener ignores", () =>
  eq(PROBE_KEY, "pulse-storage-probe"));

/* ------------------------------------------------------------------ */
/* The one footer                                                       */
/* ------------------------------------------------------------------ */

/* ONE FOOTER FOR THIRTEEN PAGES, which is only true while every href
 * resolves from every depth the site has. The pages sit at the root, one
 * folder down, and two folders down; a link built relative to the PAGE
 * rather than to the module would be right at one depth and quietly wrong
 * at the other two — a footer full of 404s that no gate opens a browser to
 * see. So the resolution is checked at all three. */

const ROOT_AT = (depth: string): string => new URL(depth, "https://studio.example/base/").href;

check("the footer builds one element with every link group", () => {
  const f = siteFooter(ROOT_AT("./"), "https://studio.example/base/");
  /* Scoped to the GROUPS. The contact band below them carries headings of
   * the same class — Visit, Contact — and an unscoped selector counted
   * those as link groups the moment that band was added. */
  const headings = [...f.querySelectorAll(".site-footer-group .site-footer-heading")]
    .map((h) => h.textContent);
  return eq(headings, FOOTER_GROUPS.map((g) => g.heading));
});

check("every group link is rendered, none silently dropped", () => {
  const f = siteFooter(ROOT_AT("./"), "https://studio.example/base/");
  const rendered = f.querySelectorAll(".site-footer-group a").length;
  return eq(rendered, FOOTER_GROUPS.reduce((n, g) => n + g.links.length, 0));
});

/* THE PROPERTY, STATED SO IT CAN FAIL: the hrefs come from the site ROOT
 * and never from the page. Three pages at three depths are rendered with
 * the one root the module resolves for itself; if any href were built
 * relative to the page instead — a bare "products/a-booking/", or a
 * new URL(..., location.href) — the three lists would part company here.
 *
 * The first version of this check passed the same page URL three times and
 * therefore could not fail at all. That mistake has been made twice in this
 * repository; it is written down rather than quietly corrected. */
check("every link resolves from the site root, not from the page it is on", () => {
  const root = ROOT_AT("./");
  const hrefsOn = (page: string): string[] =>
    [...siteFooter(root, page).querySelectorAll(".site-footer-group a")]
      .map((a) => (a as HTMLAnchorElement).href);
  const fromRoot = hrefsOn("https://studio.example/base/").join("|");
  const fromProduct = hrefsOn("https://studio.example/base/products/b-dashboard/").join("|");
  const fromDeep = hrefsOn("https://studio.example/base/shared/synthetic/tests.html").join("|");
  if (fromRoot !== fromProduct) return `a product page got different links: ${fromProduct}`;
  if (fromRoot !== fromDeep) return `a two-deep page got different links: ${fromDeep}`;
  return eq(fromRoot.split("|")[0], "https://studio.example/base/products/a-booking/");
});

/* EVERY href CARRIES ITS OWN SCHEME. A relative href in a shared footer is
 * right at one page depth and a 404 at the other two, and no gate here
 * opens a browser to find that out.
 *
 * The test is "has a scheme", not "starts with http": the contact band's
 * links are mailto:, tel: and sms:, which are absolute and correct. The
 * first version of this check tested for http and started failing the
 * moment the studio's phone number arrived. */
check("no footer link is left relative, which would break at depth", () => {
  const f = siteFooter(ROOT_AT("./"), "https://studio.example/base/");
  const bad = [...f.querySelectorAll("a")]
    .map((a) => a.getAttribute("href") ?? "")
    .filter((h) => !/^[a-z][a-z0-9+.-]*:/.test(h));
  return eq(bad, []);
});

check("the page you are on is marked, not hidden", () => {
  const here = "https://studio.example/base/products/a-booking/index.html";
  const f = siteFooter(ROOT_AT("./"), here);
  const marked = [...f.querySelectorAll("a[aria-current=\"page\"]")].map((a) => a.textContent);
  return eq(marked, ["Book a class"]);
});

check("index.html and the bare folder are the same page", () =>
  eq(isCurrentPage("https://s/x/index.html", "https://s/x/"), true));
check("...and a fragment does not make it a different one", () =>
  eq(isCurrentPage("https://s/x/", "https://s/x/#staff"), true));
check("...nor does a query string", () =>
  eq(isCurrentPage("https://s/x/", "https://s/x/?from=mail"), true));
check("...while two different pages stay different", () =>
  eq(isCurrentPage("https://s/x/", "https://s/y/"), false));

check("the footer's studio word comes from brand.ts, not from a string here", () => {
  const f = siteFooter(ROOT_AT("./"), "https://studio.example/base/");
  const word = f.querySelector(".brand-word")?.textContent ?? "";
  /* studioWordParts uppercases and splits the name from shared/brand.ts.
   * Checking the SHAPE rather than the literal keeps this true for a clone
   * that renamed the studio, which is the whole point of the seam. */
  return eq(word === word.toUpperCase() && word.length > 0, true);
});
check("...and the word carries BOTH the lead and the accent, not just the lead", () => {
  /* The check above reads the whole textContent, which stays uppercase and
   * non-empty even if the accent span is never appended — a studio name's
   * second word could go missing from the footer with nothing here to
   * notice. Read the nested span on its own, the same way the header's
   * equivalent check does, so the two halves cannot silently collapse into
   * one. */
  const f = siteFooter(ROOT_AT("./"), "https://studio.example/base/");
  const word = f.querySelector(".brand-word");
  return eq([word?.textContent, word?.querySelector("span")?.textContent], ["PULSESTUDIO", "STUDIO"]);
});

check("the footer carries the mark, and only one of it", () => {
  const f = siteFooter(ROOT_AT("./"), "https://studio.example/base/");
  return eq(f.querySelectorAll("svg.pulse-mark").length, 1);
});

check("the footer states the studio's outreach promise", () => {
  const f = siteFooter(ROOT_AT("./"), "https://studio.example/base/");
  const said = f.querySelector(".site-footer-promise")?.textContent ?? "";
  return eq(said.includes("A person at the studio reads and decides"), true);
});

/* WHAT THE PROMISE MUST NOT SAY. The first draft claimed nothing leaves the
 * browser, which is false — the support assistant posts each question to a
 * studio endpoint. A comfortable sentence in a footer is still a claim. */
check("...and does not claim that nothing leaves the browser", () => {
  const f = siteFooter(ROOT_AT("./"), "https://studio.example/base/");
  const said = (f.querySelector(".site-footer-promise")?.textContent ?? "").toLowerCase();
  return eq(/never leaves|stays in your browser|nothing leaves/.test(said), false);
});

/* SETTINGS IS REACHED FROM THE FOOTER, on every page, because the header
 * stopped carrying it. The top bar keeps light and dark; everything past
 * that is one page, and the only thing pointing at it from thirteen pages
 * is this link. If it breaks, settings becomes a URL people have to know. */
check("the footer carries the way to settings", () => {
  const f = siteFooter(ROOT_AT("./"), "https://studio.example/base/");
  const found = [...f.querySelectorAll(".site-footer-base a")]
    .map((a) => `${a.textContent}|${(a as HTMLAnchorElement).href}`);
  return eq(found[0], "Settings|https://studio.example/base/shared/settings.html");
});

check("...and it is the one shared settings page, not a per-page guess", () =>
  eq(SETTINGS_HREF, "shared/settings.html"));

/* THE FOOTER'S INFORMATION HAS TO BE COPYABLE, and that is a property with
 * a real failure mode rather than a nicety. An address and a phone number
 * in a footer exist to be lifted into a maps app, a contacts entry or a
 * message. The way sites break this without meaning to is CSS `content:` —
 * a word set on ::before renders, takes up space, and even highlights
 * inside a selection, but it is not in the DOM and never reaches the
 * clipboard. It looks like a browser bug to the person it happens to.
 *
 * So the check is: every detail the footer shows must come back out of
 * textContent. If somebody moves one into a stylesheet, this fails. */
check("the studio's address is real text, not a CSS decoration", () => {
  const f = siteFooter(ROOT_AT("./"), "https://studio.example/base/");
  const said = f.textContent ?? "";
  const missing = [
    STUDIO_CONTACT.streetAddress,
    STUDIO_CONTACT.addressLocality,
    STUDIO_CONTACT.postalCode,
    STUDIO_CONTACT.email,
    STUDIO_CONTACT.callPhone,
    STUDIO_CONTACT.textPhone,
  ].filter((detail) => !said.includes(detail));
  return eq(missing, []);
});

check("...and it is inside an <address>, which is what it is", () => {
  const f = siteFooter(ROOT_AT("./"), "https://studio.example/base/");
  const postal = f.querySelector(".site-footer-address");
  return eq((postal?.textContent ?? "").includes(STUDIO_CONTACT.postalCode), true);
});

check("a phone can act on both numbers, and the readable form survives", () => {
  const f = siteFooter(ROOT_AT("./"), "https://studio.example/base/");
  const reach = [...f.querySelectorAll(".site-footer-reach a")].map(
    (a) => `${(a as HTMLAnchorElement).getAttribute("href")}`,
  );
  return eq(reach, [
    `mailto:${STUDIO_CONTACT.email}`,
    "tel:+19733378259",
    "sms:+19735765370",
  ]);
});

/* Punctuation is for the reader; a dialer wants digits. Derived from the
 * readable form rather than stored twice, so the two cannot disagree. */
check("a dialable number is digits and a country code", () =>
  eq(dialable("(973) 337-8259"), "+19733378259"));
check("...and an already-international number is not given a second one", () =>
  eq(dialable("+44 20 7946 0018"), "+442079460018"));
check("the address renders in the order an envelope wants it", () =>
  eq(addressLine(), "50 Upper Montclair Plaza, Montclair, NJ 07043"));

/* THE CLONE SEAM ITSELF HAD NO CHECK ON IT. renderStudioBrand() is what
 * check-brand.mjs's whole premise depends on — "every header follows
 * shared/brand.ts" is a promise about this function's behavior, and
 * nothing here had ever run it. It reads a DOM root as a parameter
 * rather than the live document, which is exactly what makes it testable
 * without the module-load side effects theme-boot.ts has. */
check("the brand word fills as lead + accent, split on the first space", () => {
  const root = document.createElement("div");
  const word = document.createElement("span");
  word.className = "brand-word";
  const home = document.createElement("a");
  home.className = "home-brand";
  home.append(word);
  root.append(home);
  renderStudioBrand(root);
  return eq([word.textContent, word.querySelector("span")?.textContent], ["PULSESTUDIO", "STUDIO"]);
});
check("the home link gets a real aria-label naming the studio, not a leftover placeholder", () => {
  const root = document.createElement("div");
  const home = document.createElement("a");
  home.className = "home-brand";
  root.append(home);
  renderStudioBrand(root);
  return eq(home.getAttribute("aria-label"), "Return to Pulse Studio home");
});
check("the home link gets exactly one mark, even mounted twice", () => {
  const root = document.createElement("div");
  const home = document.createElement("a");
  home.className = "home-brand";
  root.append(home);
  renderStudioBrand(root);
  renderStudioBrand(root);
  return eq(home.querySelectorAll("svg").length, 1);
});
check("a page that already drew its own mark inline is left alone, not doubled", () => {
  const root = document.createElement("div");
  const home = document.createElement("a");
  home.className = "home-brand";
  home.innerHTML = "<svg><path/></svg>";
  root.append(home);
  renderStudioBrand(root);
  return eq(home.querySelectorAll("svg").length, 1);
});
check("any element asking for the plain name gets it, unsplit", () => {
  const root = document.createElement("div");
  const label = document.createElement("span");
  label.dataset["studioName"] = "";
  root.append(label);
  renderStudioBrand(root);
  return eq(label.textContent, "Pulse Studio");
});

/* The legal pages are linked from every page's footer, and a footer link to
 * a page that does not exist is worse than no link at all. */
check("the footer links terms and privacy, resolved from the site root", () => {
  const f = siteFooter(ROOT_AT("./"), "https://studio.example/base/");
  const legal = [...f.querySelectorAll(".site-footer-group a")]
    .map((a) => (a as HTMLAnchorElement).href)
    .filter((h) => h.includes("terms") || h.includes("privacy"));
  return eq(legal, [
    "https://studio.example/base/shared/terms.html",
    "https://studio.example/base/shared/privacy.html",
  ]);
});

/* ONE DOOR INTO THE STAFF ROOM. A signed-in member used to be shown the
 * dashboard three ways — front-door card, footer list, sign-in landing —
 * on a page that had just greeted them by name. The law keeps every route
 * reachable, so nothing may DISAPPEAR: for a member the staff group folds
 * to one link that is the heading itself. Staff and the signed-out see the
 * group whole. These pin the fold, the reachability, and the asymmetry. */
check("a signed-out reader sees the staff group whole", () => {
  const f = siteFooter(ROOT_AT("./"), "https://studio.example/base/", null);
  const staff = [...f.querySelectorAll<HTMLElement>(".site-footer-group")].find(
    (g) => g.getAttribute("aria-label") === "For staff",
  );
  return eq(staff?.querySelectorAll("ul a").length, 2);
});

check("a staff reader sees it whole too", () => {
  const f = siteFooter(ROOT_AT("./"), "https://studio.example/base/", "staff");
  const staff = [...f.querySelectorAll<HTMLElement>(".site-footer-group")].find(
    (g) => g.getAttribute("aria-label") === "For staff",
  );
  return eq([staff?.querySelectorAll("ul a").length, staff?.dataset["folded"] ?? "false"].join("|"), "2|false");
});

check("a member sees the staff group folded to one door", () => {
  const f = siteFooter(ROOT_AT("./"), "https://studio.example/base/", "member");
  const staff = [...f.querySelectorAll<HTMLElement>(".site-footer-group")].find(
    (g) => g.getAttribute("aria-label") === "For staff",
  );
  const door = staff?.querySelector(".site-footer-heading a") as HTMLAnchorElement | null;
  return eq(
    [staff?.dataset["folded"], staff?.querySelectorAll("ul").length, door?.textContent, door?.href].join("|"),
    "true|0|For staff|https://studio.example/base/products/b-dashboard/",
  );
});

/* THE ROUTE IS STILL THERE. Folding is not hiding: the dashboard href a
 * member is shown is the same one staff are shown, and it resolves. */
check("...and the door still reaches the dashboard, not a dead end", () => {
  const f = siteFooter(ROOT_AT("./"), "https://studio.example/base/", "member");
  const hrefs = [...f.querySelectorAll("a")].map((a) => (a as HTMLAnchorElement).href);
  return eq(hrefs.includes("https://studio.example/base/products/b-dashboard/"), true);
});

check("only the staff group folds; the member's own links never do", () => {
  const f = siteFooter(ROOT_AT("./"), "https://studio.example/base/", "member");
  const folded = [...f.querySelectorAll<HTMLElement>(".site-footer-group")]
    .filter((g) => g.dataset["folded"] === "true")
    .map((g) => g.getAttribute("aria-label"));
  return eq(folded, ["For staff"]);
});

/* ------------------------------------------------------------------ */
/* The studio floor                                                     */
/* ------------------------------------------------------------------ */

/* EVERY JOINT NEEDS A PIVOT, and a missing one fails quietly. A <g> with
 * no transform-origin rotates about the corner of the viewBox, so a leg
 * does not bend — it swings the whole figure round the top-left of the
 * drawing. Nothing throws, nothing logs, and the page just looks wrong in
 * a way that is hard to attribute. These check that every bone carries
 * one, and that it is stated in the viewBox's own coordinates rather than
 * against a bounding box that changes as the limb moves. */
const BONE_CLASSES = [
  "run-thigh", "run-shin", "run-foot", "run-upper-arm", "run-forearm",
  "cycle-thigh", "cycle-shin", "cycle-foot",
];

check("every bone in every figure pivots about a stated point", () => {
  const missing: string[] = [];
  for (const [name, build] of [["run", runningFigure], ["cycle", cyclingFigure]] as const) {
    const svg = build();
    for (const cls of BONE_CLASSES) {
      for (const g of svg.querySelectorAll(`.${cls}`)) {
        const origin = (g as SVGGElement).style.transformOrigin ?? "";
        if (!/^-?[\d.]+px -?[\d.]+px$/.test(origin)) missing.push(`${name}/${cls} → ${JSON.stringify(origin)}`);
      }
    }
  }
  return eq(missing, []);
});

check("...measured against the viewBox, not a bounding box that moves", () => {
  const svg = runningFigure();
  const boxes = [...svg.querySelectorAll(".run-thigh, .run-shin, .run-upper-arm")]
    .map((g) => (g as SVGGElement).style.transformBox ?? "");
  return eq([...new Set(boxes)], ["view-box"]);
});

/* The shin hangs off the thigh and the forearm off the upper arm. Nested,
 * not siblings — that nesting is what makes a knee travel with its hip
 * without either one knowing the other exists. */
check("the knee is inside the hip, and the elbow inside the shoulder", () => {
  const svg = runningFigure();
  const shinsInThighs = svg.querySelectorAll(".run-thigh .run-shin").length;
  const foreInUpper = svg.querySelectorAll(".run-upper-arm .run-forearm").length;
  return eq([shinsInThighs, foreInUpper].join(","), "2,2");
});

check("the lifter's arms and bar are separate groups, so the plates stay round", () => {
  const svg = liftingFigure();
  /* The arms scale on Y to press; the bar translates the matching
   * distance. One group doing both would squash the plates into ovals at
   * the bottom of every rep. */
  return eq([svg.querySelectorAll(".lift-arms").length, svg.querySelectorAll(".lift-bar").length].join(","), "1,1");
});

check("a figure is decorative — it announces nothing", () => {
  const hidden = [liftingFigure(), cyclingFigure(), runningFigure()]
    .map((s) => s.getAttribute("aria-hidden"));
  return eq(hidden, ["true", "true", "true"]);
});

/* mountFigures fills named hooks. A name it does not know is REPORTED
 * rather than left as an empty box — the language law's stated negative,
 * applied to a drawing that did not arrive. */
check("a named hook gets the figure it names", () => {
  const host = document.createElement("div");
  const slot = document.createElement("div");
  slot.dataset["figure"] = "lift";
  host.append(slot);
  const unknown = mountFigures(host);
  return eq([slot.querySelectorAll("svg").length, unknown.length].join(","), "1,0");
});

check("...and a hook naming a drawing that does not exist is reported, not ignored", () => {
  const host = document.createElement("div");
  const slot = document.createElement("div");
  slot.dataset["figure"] = "swim";
  host.append(slot);
  const unknown = mountFigures(host);
  return eq([unknown, slot.querySelectorAll("svg").length].join("|"), "swim|0");
});

check("mounting twice does not stack two drawings in one hook", () => {
  const host = document.createElement("div");
  const slot = document.createElement("div");
  slot.dataset["figure"] = "cycle";
  host.append(slot);
  mountFigures(host);
  mountFigures(host);
  return eq(slot.querySelectorAll("svg").length, 1);
});

check("the runner gets a lane to cross, and only one", () => {
  const host = document.createElement("div");
  const lane = document.createElement("div");
  lane.setAttribute("data-figure-lane", "");
  host.append(lane);
  mountFigures(host);
  mountFigures(host);
  return eq([lane.querySelectorAll(".run-lane").length, lane.querySelectorAll(".figure-run").length].join(","), "1,1");
});

/* ------------------------------------------------------------------ */
/* The assistant launcher                                               */
/* ------------------------------------------------------------------ */

/* THE AUDIENCE ASYMMETRY, checked the same way assistant-audience.ts is
 * checked above: placement can only NARROW what an actor is shown, never
 * widen it. A staff person on a member-facing page is still shown the
 * visitor/member assistant — the screen may be turned toward a member. */
check("nobody signed in is a visitor on a member-facing page", () =>
  eq(assistantFor(null, "member-facing"), "visitor"));
check("a signed-in member is the booking assistant", () =>
  eq(assistantFor("member", "member-facing"), "member"));
check("staff AND a staff-facing page is the staff assistant", () =>
  eq(assistantFor("staff", "staff-facing"), "staff"));
check("a staff person on a member-facing page never becomes the staff assistant", () =>
  eq(assistantFor("staff", "member-facing"), "visitor"));
check("a member on a staff-facing page never becomes the staff assistant either", () =>
  eq(assistantFor("member", "staff-facing"), "visitor"));
check("every opening line names what that assistant may actually do", () => {
  const lines = [openingLine("visitor", null), openingLine("member", "Ada"), openingLine("staff", null)];
  if (lines.some((l) => l.trim() === "")) return "an assistant opened with nothing to say";
  if (!(lines[2] ?? "").toLowerCase().includes("capacity")) return "the staff line does not mention capacity";
  if (!(lines[1] ?? "").includes("book")) return "the member line never mentions booking";
  return true;
});
/* THE MEMBER LINE AND THE VISITOR LINE BOTH SAY "book", and the check
 * above never noticed that "member" could fall through to the VISITOR
 * line and still pass it — `npm run mutate` found `kind === "member"` can
 * flip to `!==` with nothing objecting. The visitor line's own "Sign in
 * to book" carries the substring the old check went looking for. What
 * actually tells the two apart is that a signed-in member is never asked
 * to sign in, and is greeted by name when one is given. */
check("a member is never told to sign in — they already are", () =>
  eq(openingLine("member", "Ada").toLowerCase().includes("sign in"), false));
check("...and is greeted by their own first name", () =>
  eq(openingLine("member", "Ada").startsWith("Ada,"), true));
check("a visitor with no name IS told to sign in", () =>
  eq(openingLine("visitor", null).toLowerCase().includes("sign in"), true));

/* BOOKING, AGAINST A REAL GENERATED STUDIO — not a hand-built fixture, so
 * a fill-count off by one shows up here the way it would on the live page.
 * upcomingFillTarget guarantees a mix of open and full classes. */
const assistantStudio = generateStudio({
  ...DEFAULT_CONFIG,
  seed: "assistant-launcher-checks",
  asOfDate: "2026-08-19",
  memberCount: 60,
  upcomingFillTarget: 0.5,
}).dataset;

/* bookingIntent/bookForMember take a resolved Session — a shape
 * assistant.ts builds from a dataset via resolveSessions(). What follows
 * first checks those two functions against hand-built Session values, so
 * their rule is pinned without needing a dataset at all — then checks
 * resolveSessions() itself, against the real generated studio below. */
function assistantSession(overrides: {
  id?: string; classType?: string; startsAt?: string; capacity?: number; bookedCount?: number;
  status?: "scheduled" | "completed" | "canceled";
} = {}) {
  const id = overrides.id ?? "class-session:900001";
  const classType = overrides.classType ?? "Yoga";
  const startsAt = overrides.startsAt ?? `${assistantStudio.meta.asOfDate}T09:00:00`;
  const capacity = overrides.capacity ?? 10;
  const status = overrides.status ?? "scheduled";
  return {
    raw: { id, classTypeId: "x", instructorId: "x", startsAt, durationMinutes: 60, capacity, status },
    classType,
    level: "All levels",
    startsAt,
    endsAt: startsAt,
    capacity,
    bookedCount: overrides.bookedCount ?? 0,
  };
}

check('"book yoga tomorrow" finds tomorrow\'s yoga session', () => {
  const day = Number(assistantStudio.meta.asOfDate.slice(8, 10)) + 1;
  const tomorrow = `${assistantStudio.meta.asOfDate.slice(0, 8)}${String(day).padStart(2, "0")}`;
  const s = assistantSession({ startsAt: `${tomorrow}T09:00:00` });
  const found = bookingIntent("can you book yoga tomorrow", [s], assistantStudio.meta.asOfDate);
  return eq(found?.raw.id, s.raw.id);
});
check("merely mentioning a class is not a booking request", () =>
  eq(bookingIntent("what levels does yoga have", [assistantSession()], assistantStudio.meta.asOfDate), null));
check("a class type the studio does not run finds nothing", () =>
  eq(bookingIntent("book underwater basket weaving today", [assistantSession()], assistantStudio.meta.asOfDate), null));
check("with no day named, a matching session is still offered", () =>
  eq(bookingIntent("book me into yoga", [assistantSession()], assistantStudio.meta.asOfDate) !== null, true));
check("a past session is never offered, even matching by name", () =>
  eq(bookingIntent("book yoga", [assistantSession({ startsAt: "2020-01-01T09:00:00" })], assistantStudio.meta.asOfDate), null));

const BOOKING_SCHEDULE_KEY = "pulse-reservations-a-schedule";
const ASSISTANT_TODAY = assistantStudio.meta.asOfDate;

check("booking a class with room succeeds and returns the row", () => {
  const key = "pulse-reservations-a";
  localStorage.removeItem(key);
  const result = bookForMember("member:checks-1", assistantSession({ id: "class-session:900002", capacity: 10, bookedCount: 2 }), ASSISTANT_TODAY);
  const stored = JSON.parse(localStorage.getItem(key) ?? "[]");
  localStorage.removeItem(key);
  if (!result.ok) return `expected success, got: ${result.why}`;
  return eq([stored.length, stored[0]?.member_id, stored[0]?.reservation_status], [1, "member:checks-1", "reserved"]);
});
check("...and stamps the log with the schedule it was booked against", () => {
  return eq(localStorage.getItem(BOOKING_SCHEDULE_KEY), ASSISTANT_TODAY);
});

check("a full class is refused, and nothing is written", () => {
  const key = "pulse-reservations-a";
  localStorage.removeItem(key);
  const full = assistantSession({ id: "class-session:900003", capacity: 5, bookedCount: 5 });
  const result = bookForMember("member:checks-2", full, ASSISTANT_TODAY);
  const stored = JSON.parse(localStorage.getItem(key) ?? "[]");
  localStorage.removeItem(key);
  if (result.ok) return "a full class accepted a booking";
  return eq(stored.length, 0);
});

/* THE COUNT THAT MATTERS IS THE UNION, NOT JUST THE GENERATOR'S OWN. A
 * class the generator reports empty (bookedCount 0) can still be full
 * because Booking's own runtime log already filled it — a check that only
 * read bookedCount would wrongly accept a second booking here. Seeded
 * WITH today's stamp: a row from an unstamped or differently-stamped log
 * is exactly what this function must refuse to trust, so leaving the
 * stamp off here would test the wrong thing by accident. */
/* bookedCount IS THE CURRENT COUNT, not a stale display value bookForMember
 * has to double-check against the raw log. resolveSessions() and
 * bookForMember() run back-to-back in mountAssistant() with no `await`
 * between them, so nothing can change the log in between — the log
 * bookForMember would re-read is the exact one bookedCount was already
 * computed from. A fixture built here with a real accurate count is what
 * that guarantee looks like from the caller's side. */
check("a class already at capacity is refused", () => {
  const key = "pulse-reservations-a";
  localStorage.removeItem(key);
  const target = assistantSession({ id: "class-session:900004", capacity: 1, bookedCount: 1 });
  const result = bookForMember("member:checks-3", target, ASSISTANT_TODAY);
  localStorage.removeItem(key);
  if (result.ok) return "a class already at capacity accepted another booking";
  return eq(result.ok === false && result.why.includes("full"), true);
});
/* THE BUG THIS ARCHITECTURE REPLACED: bookForMember used to ALSO
 * recompute a runtime count from the raw log and ADD it to
 * session.bookedCount — which already included a runtime count of its
 * own. Every real reservation was counted twice. Measured live: a member
 * who canceled and rebooked one capacity-3 class read as bookedCount 1
 * (correct — resolveSessions() dedupes by member now), but the OLD
 * bookForMember added its own recount of 1 on top, made the total 2, and
 * a second real booker was refused as "full" with two empty seats still
 * open. Proven end to end here, through the real resolveSessions() path
 * rather than a hand-built Session, because the bug lived exactly in how
 * the two functions' counts combined. */
check("resolveSessions + bookForMember together count a cancel-and-rebook as ONE seat", () => {
  const sessionId = "class-session:900004c";
  const miniStudio = {
    classTypes: [{ id: "ct-mini", name: "Mini", level: "all levels", durationMinutes: 60, capacity: 3 }],
    classSessions: [{
      id: sessionId, classTypeId: "ct-mini", instructorId: "i-mini",
      startsAt: `${ASSISTANT_TODAY}T09:00:00`, durationMinutes: 60, capacity: 3, status: "scheduled" as const,
    }],
    bookings: [],
  } as unknown as SyntheticDataset;
  const rows: Reservation[] = [
    { reservation_id: "r1", member_id: "member:A", session_id: sessionId, reservation_status: "reserved", reserved_at: `${ASSISTANT_TODAY}T09:00:00`, canceled_at: null },
    { reservation_id: "r2", member_id: "member:A", session_id: sessionId, reservation_status: "canceled", reserved_at: `${ASSISTANT_TODAY}T09:00:00`, canceled_at: `${ASSISTANT_TODAY}T09:05:00` },
    { reservation_id: "r3", member_id: "member:A", session_id: sessionId, reservation_status: "reserved", reserved_at: `${ASSISTANT_TODAY}T09:10:00`, canceled_at: null },
  ];
  const resolved = resolveSessions(miniStudio, rows)[0];
  if (resolved === undefined) return "the mini studio resolved no sessions";
  const bookedCheck = eq(resolved.bookedCount, 1);
  if (bookedCheck !== true) return `bookedCount: ${bookedCheck}`;
  const key = "pulse-reservations-a";
  localStorage.setItem(key, JSON.stringify(rows));
  localStorage.setItem(BOOKING_SCHEDULE_KEY, ASSISTANT_TODAY);
  const result = bookForMember("member:B", resolved, ASSISTANT_TODAY);
  localStorage.removeItem(key);
  if (!result.ok) return `member B should have gotten one of the two open seats, got: ${result.why}`;
  return true;
});
check("...while the SAME seeded row is invisible once the stamp is for another day", () => {
  /* THE OTHER HALF OF THE PROOF. Booking through the assistant on
   * 2026-08-24, then opening a-booking/ the same day before anything had
   * stamped the log, silently deleted the reservation the assistant had
   * just confirmed to the member as "It is on your classes page." This is
   * that scenario from the writer's side: a log honestly filled for
   * someone else must not block a booking once its stamp no longer
   * matches today. */
  const key = "pulse-reservations-a";
  const target = assistantSession({ id: "class-session:900004b", capacity: 1, bookedCount: 0 });
  localStorage.setItem(key, JSON.stringify([
    { reservation_id: "res_y", member_id: "member:someone-else", session_id: target.raw.id, reservation_status: "reserved", reserved_at: target.startsAt, canceled_at: null },
  ]));
  localStorage.setItem(BOOKING_SCHEDULE_KEY, "2020-01-01");
  const result = bookForMember("member:checks-3b", target, ASSISTANT_TODAY);
  localStorage.removeItem(key);
  return eq(result.ok, true);
});

check("booking the same class twice is refused the second time as already-held", () => {
  const key = "pulse-reservations-a";
  localStorage.removeItem(key);
  const target = assistantSession({ id: "class-session:900005", capacity: 10, bookedCount: 0 });
  const first = bookForMember("member:checks-4", target, ASSISTANT_TODAY);
  const second = bookForMember("member:checks-4", target, ASSISTANT_TODAY);
  localStorage.removeItem(key);
  if (!first.ok) return "the first booking should have succeeded";
  return eq([second.ok, second.ok === false && second.why.includes("already")], [false, true]);
});

check("a cancel makes the spot bookable again — last row wins", () => {
  const key = "pulse-reservations-a";
  const target = assistantSession({ id: "class-session:900006", capacity: 1, bookedCount: 0 });
  const first = bookForMember("member:checks-5", target, ASSISTANT_TODAY);
  if (!first.ok) return "setup failed: first booking did not succeed";
  const rows = JSON.parse(localStorage.getItem(key) ?? "[]");
  rows.push({ ...rows[0], reservation_status: "canceled", canceled_at: target.startsAt });
  localStorage.setItem(key, JSON.stringify(rows));
  const second = bookForMember("member:checks-5", target, ASSISTANT_TODAY);
  localStorage.removeItem(key);
  return eq(second.ok, true);
});

check("a browser that refuses to save reports that, not a false success", () => {
  const throwing = {
    getItem(): string | null { return null; },
    setItem(): void { throw new Error("storage refused"); },
    removeItem(): void { /* nothing was written */ },
  };
  setSharedStorageForChecks(throwing);
  const result = bookForMember("member:checks-6", assistantSession({ id: "class-session:900007" }), ASSISTANT_TODAY);
  setSharedStorageForChecks(null);
  if (result.ok) return "reported success while storage refused the write";
  return eq(result.why.includes("not saving"), true);
});

/* RESOLVESESSIONS ITSELF, against the real generated studio rather than
 * hand-built Session values — the one thing the checks above cannot
 * reach, because they start from an already-resolved Session and never
 * exercise the filter that BUILDS one from the dataset's own bookings.
 *
 * `npm run mutate` found the gap the day this module became reachable:
 * `b.classSessionId === raw.id` in resolveSessions can flip to `!==` and
 * every check above stays green, because none of them ever hand it a
 * dataset with more than one session's worth of bookings to tell the two
 * readings apart. Inverted, every session's count becomes "everyone NOT
 * in this class" — the same shape of bug fixed in a-booking/rules.ts this
 * branch, in a module of its own because shared code may not import a
 * product's. */
check("resolveSessions counts only bookings for that exact session", () => {
  const resolved = resolveSessions(assistantStudio, []);
  const bySession = new Map<string, number>();
  for (const b of assistantStudio.bookings) {
    if (b.status !== "booked") continue;
    bySession.set(b.classSessionId, (bySession.get(b.classSessionId) ?? 0) + 1);
  }
  const mismatch = resolved.find((s) => (bySession.get(s.raw.id) ?? 0) !== s.bookedCount);
  return mismatch === undefined
    ? true
    : `session ${mismatch.raw.id}: expected ${bySession.get(mismatch.raw.id) ?? 0} booked, resolveSessions said ${mismatch.bookedCount}`;
});
check("...and at least two sessions in this studio actually have DIFFERENT booked counts", () => {
  /* A check that passes because every session happens to have the same
   * count would not have caught the inversion either — this is the
   * property that makes the check above meaningful rather than lucky. */
  const resolved = resolveSessions(assistantStudio, []);
  const counts = new Set(resolved.map((s) => s.bookedCount));
  return counts.size > 1 ? true : "every session had the same booked count; this fixture proves nothing";
});

/* THE OUTBOUND GUARD, exercised the way the launcher exercises it — the
 * same policy object, the same function, so a member policy that stopped
 * catching a leak would fail here exactly as it would in the panel. */
check("a member policy still catches a roster leak in an assistant reply", () =>
  eq(answerProblems("Twelve booked, three no-shows this week.", audiencePolicy("member", "member-facing")).length > 0, true));
check("...and still catches another member's name", () =>
  eq(answerProblems("Ask Priya Patel about it.", audiencePolicy("member", "member-facing"), ["Priya Patel"]).length > 0, true));
check("an ordinary member answer still passes", () =>
  eq(answerProblems("Yoga is Thursday at 9, and there is a spot.", audiencePolicy("member", "member-facing")), []));
check("staff on a staff-facing page may hear capacity language", () =>
  eq(answerProblems("Fill rate is 80% with two at-risk members.", audiencePolicy("staff", "staff-facing")), []));

/* ------------------------------------------------------------------ */
/* Alerts                                                               *//* ------------------------------------------------------------------ */
/* Alerts                                                               */
/* ------------------------------------------------------------------ */

check("a problem interrupts and a notice waits its turn", () =>
  eq([ALERT_LEVELS.problem.role, ALERT_LEVELS.problem.live,
      ALERT_LEVELS.notice.role, ALERT_LEVELS.notice.live].join(","),
     "alert,assertive,status,polite"));

check("every level carries a visible word, because colour alone is not a label", () =>
  eq(Object.values(ALERT_LEVELS).every((l) => l.word.trim().length > 0), true));

check("an alert renders its word, its message and its detail", () => {
  const el = alertElement({ id: "x", level: "problem", message: "It is not working.", detail: "5 checked." });
  return eq([el.querySelector(".alert-word")?.textContent,
             el.querySelector(".alert-message")?.textContent,
             el.querySelector(".alert-detail")?.textContent].join("|"),
            "Problem|It is not working.|5 checked.");
});

check("no detail means no empty line", () => {
  const el = alertElement({ id: "x", level: "notice", message: "Only this." });
  return eq(el.querySelector(".alert-detail"), null);
});

check("an alert can be dismissed, and says what it is dismissing", () => {
  const el = alertElement({ id: "x", level: "notice", message: "Say something." });
  const button = el.querySelector(".alert-dismiss");
  return eq(button?.getAttribute("aria-label"), "Dismiss: Say something.");
});

check("...unless dismissing it would hide something still true", () => {
  const el = alertElement({ id: "x", level: "problem", message: "Still broken.", dismissible: false });
  return eq(el.querySelector(".alert-dismiss"), null);
});

check("raising the same condition twice replaces it instead of stacking", () => {
  showAlert({ id: "check-dup", level: "notice", message: "first" });
  showAlert({ id: "check-dup", level: "notice", message: "second" });
  const region = document.getElementById(ALERT_REGION_ID);
  const found = region?.querySelectorAll("[data-alert-id=\"check-dup\"]") ?? [];
  const text = region?.querySelector("[data-alert-id=\"check-dup\"] .alert-message")?.textContent;
  dismissAlert("check-dup");
  return eq([found.length, text].join("|"), "1|second");
});

check("dismissing tells you whether there was anything to dismiss", () => {
  showAlert({ id: "check-gone", level: "notice", message: "here" });
  const first = dismissAlert("check-gone");
  const second = dismissAlert("check-gone");
  return eq([first, second].join(","), "true,false");
});

check("the open alerts are listed in the order they were raised", () => {
  showAlert({ id: "check-a", level: "notice", message: "a" });
  showAlert({ id: "check-b", level: "problem", message: "b" });
  const listed = openAlerts().filter((id) => id.startsWith("check-"));
  dismissAlert("check-a");
  dismissAlert("check-b");
  return eq(listed, ["check-a", "check-b"]);
});

/* This suite's own page has no ".topnav, .page-head, .topbar" anywhere, so
 * every check above exercised only the fallback — prepended at the top of
 * the body. Force the OTHER branch: remove the memoized region so the next
 * call rebuilds it, give the page a header, and check the region lands
 * right after it rather than before. */
check("with a page header present, the alert region is placed right after it", () => {
  document.getElementById(ALERT_REGION_ID)?.remove();
  const header = document.createElement("div");
  header.className = "topnav";
  document.body.append(header);
  const region = ensureAlertRegion();
  const siblings = [...document.body.children];
  header.remove();
  return eq(siblings.indexOf(region), siblings.indexOf(header) + 1);
});

check("the region is made once and reused, not once per alert", () => {
  showAlert({ id: "check-one", level: "notice", message: "one" });
  showAlert({ id: "check-two", level: "notice", message: "two" });
  const regions = document.querySelectorAll(`#${ALERT_REGION_ID}`).length;
  dismissAlert("check-one");
  dismissAlert("check-two");
  return eq(regions, 1);
});

/* Non-vacuous: the checks above raise real alerts on this page, so the last
 * word has to be that they cleaned up after themselves. A suite that leaves
 * its own messages on screen is a suite whose next reader distrusts it. */
check("the checks leave no alert of their own on this page", () =>
  eq(openAlerts().filter((id) => id.startsWith("check-")), []));

const results = checks.map(({ name, run }) => {
  let verdict: string | true;
  try {
    verdict = run();
  } catch (error) {
    verdict = `threw: ${error instanceof Error ? error.message : String(error)}`;
  }
  return { name, verdict };
});
localStorage.removeItem(KEY); // leave no residue behind the checks

const failed = results.filter((r) => r.verdict !== true);
const summary = document.querySelector("#summary");
const list = document.querySelector("#results");
if (summary instanceof HTMLElement && list instanceof HTMLElement) {
  summary.textContent = `${results.length} checks run, ${results.length - failed.length} passed, ${failed.length} failed.`;
  for (const r of results) {
    const line = document.createElement("p");
    line.className = r.verdict === true ? "pass" : "fail";
    line.textContent =
      r.verdict === true ? `PASS — ${r.name}` : `FAIL — ${r.name} — ${r.verdict}`;
    list.appendChild(line);
  }
}
