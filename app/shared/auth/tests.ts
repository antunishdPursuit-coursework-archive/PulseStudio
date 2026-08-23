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
import { sharedStudioMembers } from "./studio.js";
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
import {
  ALERT_LEVELS,
  ALERT_REGION_ID,
  alertElement,
  dismissAlert,
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
