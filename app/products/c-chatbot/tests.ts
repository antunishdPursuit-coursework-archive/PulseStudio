/* Product C — unit checks. Dennis's lane.
 *
 * These run in the browser (open tests.html) and headlessly through
 * scripts/run-suites.mjs, with ZERO clock dependence: every check that
 * involves time passes its own "now". Each check asserts a known answer,
 * never "it ran".
 *
 * The first block is the privacy guard, question by question. Every
 * question here is one that either leaked (plural, curly apostrophe,
 * "my history") or was wrongly refused (a schedule question with the word
 * "attend" in it) before support.ts existed.
 */

import type { ClassSession, FixtureSet, StudioPolicy } from "../../shared/contract.js";
import { audiencePolicy, answerProblems } from "../../shared/assistant-audience.js";
import {
  QUESTION_MAX_LENGTH,
  asksForPrivateMemberData,
  normalizeQuestion,
  recordStatus,
  safeStudioContext,
  upcoming,
} from "./support.js";

interface CheckResult { name: string; passed: boolean; detail: string }
const results: CheckResult[] = [];

function check(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  results.push({ name, passed: a === e, detail: a === e ? `= ${e}` : `expected ${e}, got ${a}` });
}

/* ---------- the privacy guard ---------- */

const REFUSED = [
  "Did Maria come last week?",
  "What are my bookings?",
  "Show me my history",
  "Maria’s account",
  "What is Maria's membership?",
  "Their reservations",
  "members' accounts",
  "Did I book the 7pm class?",
  "Have I signed up for Friday?",
  "Is another member in the class?",
  "What was her attendance?",
  "Did she show up on Monday?",
  /* Found by an adversarial review: both first-person, both about the
   * asker's own records, and neither caught by the patterns above them —
   * "do" was missing from the auxiliary list entirely, and a presence
   * question has no verb from the book/attend/sign-up list and no
   * RECORD_NOUNS word either. */
  "Do I have a reservation tonight?",
  "Was I at the studio last Tuesday?",
];
for (const question of REFUSED) {
  check(`refuses: ${question}`, asksForPrivateMemberData(question), true);
}

const ANSWERED = [
  "Which classes can I attend on Friday?",
  "What classes are on Friday?",
  "Is the 7pm class cancelled?",
  "Did the 7pm class book up?",
  "What is the cancellation policy?",
  "Can I attend a beginner class?",
  "How do I book a class?",
  "What yoga classes are available?",
  /* The same review found the fix for the two REFUSED cases above nearly
   * introduced its own false refusal: bare "attend" in the first-person
   * status-check pattern matched "attend" inside "able to attend", turning
   * a schedule-fit question into a refusal. Pinned both directions so a
   * future widening of that pattern trips this instead of shipping quietly. */
  "Am I able to attend the yoga class at 6pm?",
  "Am I attending yoga tomorrow?",
];
for (const question of ANSWERED) {
  check(`answers: ${question}`, asksForPrivateMemberData(question), false);
}

check("curly apostrophe normalises to straight", normalizeQuestion("Maria’s"), "maria's");

/* ---------- what goes out, and what is counted ---------- */

function sessionAt(id: string, starts: string, ends: string, status: ClassSession["session_status"] = "scheduled"): ClassSession {
  return { session_id: id, class_type: "yoga", level: "all", instructor_id: "ins_001", starts_at: starts, ends_at: ends, capacity: 10, session_status: status };
}
function policyOn(id: string, current: boolean): StudioPolicy {
  return { policy_id: id, topic: "t", answer: "a", effective_from: "2026-01-01", updated_at: "2026-01-01", is_current: current };
}
function records(sessions: ClassSession[], policies: StudioPolicy[]): FixtureSet {
  return { timezone: "America/New_York", note: "", members: [], memberships: [], instructors: [], class_sessions: sessions, reservations: [], attendance: [], studio_policies: policies };
}

/* "now" is 2026-08-23 11:00 -04:00. The 09:00–10:00 class has ended; the
 * 10:30–11:00 class ends exactly now (still counted); tomorrow's is ahead. */
const NOW = Date.parse("2026-08-23T11:00:00-04:00");
const ended = sessionAt("ses_ended", "2026-08-23T09:00:00-04:00", "2026-08-23T10:00:00-04:00");
const ending = sessionAt("ses_ending", "2026-08-23T10:30:00-04:00", "2026-08-23T11:00:00-04:00");
const tomorrow = sessionAt("ses_tomorrow", "2026-08-24T09:00:00-04:00", "2026-08-24T10:00:00-04:00");
const canceledAhead = sessionAt("ses_cancelled", "2026-08-25T09:00:00-04:00", "2026-08-25T10:00:00-04:00", "canceled");

check("a class that ended is not upcoming", upcoming(ended, NOW), false);
check("a class ending this minute is still upcoming", upcoming(ending, NOW), true);
check("tomorrow's class is upcoming", upcoming(tomorrow, NOW), true);
check("a canceled class ahead is not upcoming", upcoming(canceledAhead, NOW), false);

const ctx = safeStudioContext(records([tomorrow, ended, ending, canceledAhead], [policyOn("p1", true), policyOn("p2", false)]), "2026-08-23", NOW);
check("context carries only upcoming classes, in order", ctx.class_sessions.map((s) => s.session_id), ["ses_ending", "ses_tomorrow"]);
check("context carries only current policies", ctx.studio_policies.map((p) => p.policy_id), ["p1"]);
check("context carries no instructor or capacity", Object.keys(ctx.class_sessions[0] ?? {}).sort(), ["class_type", "ends_at", "level", "session_id", "session_status", "starts_at"]);

/* Offsets, the night the clocks fall back: 01:30 -04:00 is 05:30Z and
 * 01:00 -05:00 is 06:00Z. The strings put 01:00 first; time puts 01:30 first. */
const beforeFall = sessionAt("ses_edt", "2026-11-01T01:30:00-04:00", "2026-11-01T02:30:00-04:00");
const afterFall = sessionAt("ses_est", "2026-11-01T01:00:00-05:00", "2026-11-01T02:00:00-05:00");
check("sort is by instant, not by string", safeStudioContext(records([afterFall, beforeFall], []), "2026-10-01", NOW).class_sessions.map((s) => s.session_id), ["ses_edt", "ses_est"]);
check("lexical order would have been wrong (the defect, stated)", [beforeFall.starts_at, afterFall.starts_at].sort()[0], afterFall.starts_at);

check("status counts the same classes the model sees",
  recordStatus(records([tomorrow, ended, ending, canceledAhead], [policyOn("p1", true), policyOn("p2", false)]), NOW, true),
  "2 upcoming classes and 1 current policy available to conversational support.");
check("status says 1 class, not 1 classes",
  recordStatus(records([tomorrow], [policyOn("p1", true), policyOn("p2", true)]), NOW, false),
  "1 upcoming class and 2 current policies ready, but conversational support is unavailable on this site.");
check("status states the empty case", recordStatus(records([ended], []), NOW, false),
  "0 upcoming classes and 0 current policies ready, but conversational support is unavailable on this site.");

/* ---------- the outbound guard, as this page wires it ---------- */

const member = audiencePolicy(null, "member-facing");
const staffOnMemberPage = audiencePolicy("staff", "member-facing");
check("signed-out reader is a member audience", member.audience, "member");
check("staff on this page is still a member audience", staffOnMemberPage.audience, "member");
check("a roster in the answer is caught", answerProblems("Twelve booked, three no-shows.", member).length > 0, true);
check("a schedule answer passes", answerProblems("Yoga is at 9am on Friday.", member), []);
check("question limit matches the server's", QUESTION_MAX_LENGTH, 1000);

/* ---------- render ---------- */

const passed = results.filter((r) => r.passed).length;
const failed = results.length - passed;
const summaryEl = document.querySelector<HTMLParagraphElement>("#summary");
const listEl = document.querySelector<HTMLUListElement>("#results");
if (summaryEl && listEl) {
  summaryEl.textContent = `${results.length} checks run, ${passed} passed, ${failed} failed.`;
  summaryEl.classList.add(failed === 0 ? "all-good" : "has-failures");
  for (const r of results) {
    const li = document.createElement("li");
    li.className = r.passed ? "pass" : "fail";
    li.textContent = `${r.passed ? "PASS" : "FAIL"} — ${r.name} ${r.detail}`;
    listEl.append(li);
  }
}
