/* Pulse Studio — unit checks for the shared session contract (v1).
   TEAM-OWNED. Browser-run: open ./tests.html and read the verdict.

   These checks were written BEFORE the contract they test existed — the
   suite failed first (the module had none of these exports), then the
   implementation made it pass. They treat browser storage as hostile
   input: malformed JSON, wrong shapes, wrong versions, blank ids, stale
   ids, throwing storage — none of it may crash a page or invent an
   identity. */

import {
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
