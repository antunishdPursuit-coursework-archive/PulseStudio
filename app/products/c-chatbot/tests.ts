import type { ClassSession, FixtureSet, StudioPolicy } from "../../shared/contract.js";
import { asksForPrivateMemberData, isUpcoming, safeStudioContext } from "./support.js";

const results: Array<{ name: string; passed: boolean }> = [];
function check(name: string, actual: unknown, expected: unknown): void {
  results.push({ name, passed: JSON.stringify(actual) === JSON.stringify(expected) });
}

for (const question of [
  "Did Maria come last week?",
  "What are my bookings?",
  "Maria’s account",
  "Do I have a reservation tonight?",
  "Was I at the studio last Tuesday?",
]) check(`refuses: ${question}`, asksForPrivateMemberData(question), true);

for (const question of [
  "Which classes can I attend on Friday?",
  "What classes are on Friday?",
  "What is the cancellation policy?",
]) check(`allows: ${question}`, asksForPrivateMemberData(question), false);

function session(id: string, starts: string, ends: string, status: ClassSession["session_status"] = "scheduled"): ClassSession {
  return { session_id: id, class_type: "yoga", level: "all", instructor_id: "unused", starts_at: starts, ends_at: ends, capacity: 10, session_status: status };
}

const now = Date.parse("2026-08-23T12:00:00-04:00");
const past = session("past", "2026-08-23T09:00:00-04:00", "2026-08-23T10:00:00-04:00");
const future = session("future", "2026-08-24T09:00:00-04:00", "2026-08-24T10:00:00-04:00");
const canceled = session("canceled", "2026-08-25T09:00:00-04:00", "2026-08-25T10:00:00-04:00", "canceled");
check("past class is excluded", isUpcoming(past, now), false);
check("future class is included", isUpcoming(future, now), true);
check("canceled class is excluded", isUpcoming(canceled, now), false);

const currentPolicy: StudioPolicy = { policy_id: "pol_001", topic: "cancellation", answer: "Cancel at least 12 hours before class.", effective_from: "2026-01-01", updated_at: "2026-01-01", is_current: true };
const oldPolicy: StudioPolicy = { ...currentPolicy, policy_id: "old", is_current: false };
const records: FixtureSet = { timezone: "America/New_York", note: "", members: [], memberships: [], instructors: [], class_sessions: [past, future, canceled], reservations: [], attendance: [], studio_policies: [currentPolicy, oldPolicy] };
const context = safeStudioContext(records, "2026-08-23", now);
check("context includes only the upcoming class", context.class_sessions.map((item) => item.session_id), ["future"]);
check("context includes only pol_001", context.studio_policies.map((item) => item.policy_id), ["pol_001"]);
check("context exposes no instructor or capacity", Object.keys(context.class_sessions[0] ?? {}).sort(), ["class_type", "ends_at", "level", "session_id", "session_status", "starts_at"]);

const passed = results.filter((result) => result.passed).length;
const summary = document.querySelector<HTMLElement>("#summary");
const list = document.querySelector<HTMLUListElement>("#results");
if (summary && list) {
  summary.textContent = `${results.length} checks run, ${passed} passed, ${results.length - passed} failed.`;
  for (const result of results) {
    const item = document.createElement("li");
    item.textContent = `${result.passed ? "PASS" : "FAIL"} — ${result.name}`;
    list.append(item);
  }
}
