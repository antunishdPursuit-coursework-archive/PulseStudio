import type { FixtureSet } from "../../shared/contract.js";
import { STUDIO_NAME } from "../../shared/brand.js";
import { isUpcoming, normalizeQuestion } from "./support.js";

export const PRESET_QUESTIONS = [
  "What classes are coming up?",
  "What should I bring?",
  "What is the cancellation policy?",
  "Which class level is right for me?",
] as const;

function currentPolicyAnswer(records: FixtureSet, topic: string): string {
  return records.studio_policies.find((policy) => policy.is_current && policy.topic === topic)?.answer
    ?? `There is no current policy on ${topic}. Please contact ${STUDIO_NAME} staff for help.`;
}

export function presetAnswer(question: string, records: FixtureSet, now: number): string | null {
  const normalized = normalizeQuestion(question).trim();
  if (normalized === normalizeQuestion(PRESET_QUESTIONS[1])) return currentPolicyAnswer(records, "what to bring");
  if (normalized === normalizeQuestion(PRESET_QUESTIONS[2])) return currentPolicyAnswer(records, "cancellation");
  if (normalized === normalizeQuestion(PRESET_QUESTIONS[3])) return currentPolicyAnswer(records, "class levels");
  if (normalized !== normalizeQuestion(PRESET_QUESTIONS[0])) return null;

  const upcoming = records.class_sessions
    .filter((session) => isUpcoming(session, now))
    .sort((left, right) => Date.parse(left.starts_at) - Date.parse(right.starts_at))
    .slice(0, 3);
  if (upcoming.length === 0) return "There are no upcoming classes in the current studio schedule.";
  const formatter = new Intl.DateTimeFormat("en-US", {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    timeZone: records.timezone,
  });
  return upcoming.map((session) =>
    `${session.class_type} (${session.level}) — ${formatter.format(new Date(session.starts_at))}`,
  ).join("\n");
}
