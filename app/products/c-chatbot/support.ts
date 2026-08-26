import type { ClassSession, FixtureSet, StudioPolicy } from "../../shared/contract.js";
import { counted } from "../../shared/text.js";

const RECORD_NOUNS = "(?:account|attendance|booking|history|membership|reservation|visit)s?";

export function normalizeQuestion(question: string): string {
  return question.toLowerCase().replace(/[‘’]/g, "'");
}

export const PRESET_QUESTIONS = [
  "What classes are coming up?",
  "What should I bring?",
  "What is the cancellation policy?",
  "Which class level is right for me?",
] as const;

export function asksForPrivateMemberData(question: string): boolean {
  const normalized = normalizeQuestion(question);
  return [
    /\battended\b|\battendance\b/,
    /\bvisit(?:ed|s|ing)?\s+history\b/,
    /\bdid\s+(?:i|he|she|they|[a-z'-]+)\s+(?:come|visit|attend|show\s+up)\b/,
    /\bwhen\s+(?:was|did)\s+.+\s+(?:here|come|visit|book|cancel)\b/,
    new RegExp(`\\b(?:my|their|his|her)\\s+${RECORD_NOUNS}\\b`),
    /\b(?:another|other)\s+member\b/,
    new RegExp(`\\bmember(?:'s|s')?\\s+${RECORD_NOUNS}\\b`),
    new RegExp(`\\b[a-z'-]+'s\\s+${RECORD_NOUNS}\\b`),
    /\b(?:am|have|did|was)\s+i\b.*\b(?:book|booked|reserve|reserved|attended|sign(?:ed)?\s+up|come|go)\b/,
    new RegExp(`\\b(?:do|does|am|is|have|has|did|was|will|can|could)\\s+i\\b[^.?!]*\\b${RECORD_NOUNS}\\b`),
    /\b(?:was|am|is)\s+i\b[^.?!]*\b(?:in|at)\s+(?:the\s+)?studio\b/,
  ].some((pattern) => pattern.test(normalized));
}

export function isUpcoming(session: ClassSession, now: number): boolean {
  return session.session_status === "scheduled" && Date.parse(session.ends_at) >= now;
}

function currentPolicyAnswer(records: FixtureSet, topic: string): string {
  return records.studio_policies.find((policy) => policy.is_current && policy.topic === topic)?.answer
    ?? `There is no current policy on ${topic}. Please contact Pulse Studio staff for help.`;
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

export interface SafeStudioContext {
  timezone: string;
  current_date: string;
  class_sessions: Array<Pick<ClassSession,
    "session_id" | "class_type" | "level" | "starts_at" | "ends_at" | "session_status"
  >>;
  studio_policies: StudioPolicy[];
}

export function safeStudioContext(records: FixtureSet, currentDate: string, now: number): SafeStudioContext {
  return {
    timezone: records.timezone,
    current_date: currentDate,
    class_sessions: records.class_sessions
      .filter((session) => isUpcoming(session, now))
      .sort((left, right) => Date.parse(left.starts_at) - Date.parse(right.starts_at))
      .map(({ session_id, class_type, level, starts_at, ends_at, session_status }) => ({
        session_id,
        class_type,
        level,
        starts_at,
        ends_at,
        session_status,
      })),
    studio_policies: records.studio_policies.filter((policy) => policy.is_current),
  };
}

export function recordStatus(records: FixtureSet, now: number, available: boolean): string {
  const sessions = records.class_sessions.filter((session) => isUpcoming(session, now)).length;
  const policies = records.studio_policies.filter((policy) => policy.is_current).length;
  const recordsReady = `${counted(sessions, "upcoming class", "upcoming classes")} and ${counted(policies, "current policy", "current policies")}`;
  return available
    ? `${recordsReady} available to conversational support.`
    : `${recordsReady} ready, but conversational support is unavailable on this site.`;
}

export const QUESTION_MAX_LENGTH = 1000;
