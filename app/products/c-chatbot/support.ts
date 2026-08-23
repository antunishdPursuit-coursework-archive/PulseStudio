/* Product C — the rules, with no page attached. Dennis's lane.
 *
 * WHY THIS IS NOT IN main.ts. main.ts looks up its elements at import
 * time and throws when one is missing, so nothing could import the privacy
 * guard to check it — which is how the guard shipped missing every plural
 * ("my bookings") and every curly apostrophe ("Maria’s account") of the
 * exact nouns it named, while refusing "which classes can I attend?" that
 * it never meant to refuse. Everything here is a pure function of its
 * arguments; tests.ts reaches each one with a known answer.
 */

import type { ClassSession, PublicFixtures, StudioPolicy } from "../../shared/contract.js";
import { counted } from "../../shared/text.js";

/** Curly apostrophes become straight ones BEFORE any pattern runs, so the
 *  patterns only ever spell one apostrophe. A phone keyboard types U+2019
 *  by default; the old ASCII-only class let every such question through. */
export function normalizeQuestion(question: string): string {
  return question.toLowerCase().replace(/[‘’]/g, "'");
}

/* The record nouns, every one optionally plural. One group, so a noun can
 * never again be added to one pattern and forgotten in another — `history`
 * was missing from the my/their/his/her line for exactly that reason. */
const RECORD_NOUNS = "(?:account|attendance|booking|history|membership|reservation|visit)s?";

/** Fail-closed: true when the question is about somebody's records rather
 *  than the studio's schedule or policies. The shapes are deliberately
 *  narrow about the VERB and wide about the NOUN — "attend" alone once
 *  refused "which classes can I attend?", a schedule question, and "did
 *  ... come" matched "did the 7pm class book up?" because the subject was
 *  anything at all. A refusal here is the member's whole answer, so every
 *  false positive is a schedule question the page would not answer. */
export function asksForPrivateMemberData(question: string): boolean {
  const q = normalizeQuestion(question);
  return [
    /\battended\b|\battendance\b/,
    /\bvisit(?:ed|s|ing)?\s+history\b/,
    /\bdid\s+(?:i|he|she|they|[a-z'-]+)\s+(?:come|visit|attend|show\s+up)\b/,
    /\bwhen\s+(?:was|did)\s+.+\s+(?:here|come|visit|book|cancel)\b/,
    new RegExp(`\\b(?:my|their|his|her)\\s+${RECORD_NOUNS}\\b`),
    /\b(?:another|other)\s+member\b/,
    new RegExp(`\\bmember(?:'s|s')?\\s+${RECORD_NOUNS}\\b`),
    new RegExp(`\\b[a-z'-]+'s\\s+${RECORD_NOUNS}\\b`),
    /* Bare "attend" (present tense, no -ed) used to sit in this list beside
     * "attended", and it turned "Am I able to attend the yoga class at
     * 6pm?" — a schedule-fit question, not a records question — into a
     * refusal: "am i" matched the auxiliary half, and "attend" (inside
     * "able to attend") satisfied the verb half regardless of the gap
     * between them. A status check on the asker's own PAST attendance is
     * what this line exists to catch, and "attended" already says that;
     * present-tense "attend" is overwhelmingly a permission or
     * schedule-fit question instead, so it is dropped rather than bounding
     * the gap, which would still catch this exact sentence. */
    /\b(?:am|have|did|was)\s+i\b.*\b(?:book|booked|reserve|reserved|attended|sign(?:ed)?\s+up|come|go)\b/,
    /* TWO SHAPES A REVIEW FOUND STILL GETTING THROUGH, both first-person
     * and both about the asker's own records:
     *   "Do I have a reservation tonight?" — the auxiliary was restricted
     *   to am/have/did/was, so "do" (and does/is/will/can/could) fell
     *   through, and the object noun never checked RECORD_NOUNS at all.
     *   "Was I at the studio last Tuesday?" — a presence question with no
     *   verb from the book/attend/etc. list and no RECORD_NOUNS word
     *   either; narrowed to "studio" as the object so it does not refuse
     *   an ordinary schedule question like "Am I able to attend the yoga
     *   class at 6pm?", which mentions "at" but never "at the studio". */
    new RegExp(`\\b(?:do|does|am|is|have|has|did|was|will|can|could)\\s+i\\b[^.?!]*\\b${RECORD_NOUNS}\\b`),
    /\b(?:was|am|is)\s+i\b[^.?!]*\b(?:in|at)\s+(?:the\s+)?studio\b/,
  ].some((pattern) => pattern.test(q));
}

/** A session still to come: scheduled AND not yet over. The status field
 *  alone says "scheduled" forever after the class has run — the fixture is
 *  hand-rolled, and between rolls every elapsed class kept being counted
 *  as ready to ask about. */
export function upcoming(session: ClassSession, now: number): boolean {
  return session.session_status === "scheduled" && Date.parse(session.ends_at) >= now;
}

export interface SafeStudioContext {
  timezone: string;
  current_date: string;
  class_sessions: Array<Pick<ClassSession,
    "session_id" | "class_type" | "level" | "starts_at" | "ends_at" | "session_status"
  >>;
  studio_policies: StudioPolicy[];
}

export function safeStudioContext(records: PublicFixtures, currentDate: string, now: number): SafeStudioContext {
  return {
    timezone: records.timezone,
    current_date: currentDate,
    class_sessions: records.class_sessions
      .filter((session) => upcoming(session, now))
      /* Parse, never compare the strings: the fixture spans -04:00 and
       * -05:00, and a lexical sort puts those two offsets in the wrong order. */
      .sort((left, right) => Date.parse(left.starts_at) - Date.parse(right.starts_at))
      .map((session) => ({
        session_id: session.session_id,
        class_type: session.class_type,
        level: session.level,
        starts_at: session.starts_at,
        ends_at: session.ends_at,
        session_status: session.session_status,
      })),
    studio_policies: records.studio_policies.filter((policy) => policy.is_current),
  };
}

/** The counted status line, from the same selection the model receives —
 *  the two once disagreed because each filtered on its own. */
export function recordStatus(records: PublicFixtures, now: number, conversationAvailable: boolean): string {
  const sessions = records.class_sessions.filter((session) => upcoming(session, now)).length;
  const policies = records.studio_policies.filter((policy) => policy.is_current).length;
  const what = `${counted(sessions, "upcoming class", "upcoming classes")} and ${counted(policies, "current policy", "current policies")}`;
  return conversationAvailable
    ? `${what} available to conversational support.`
    : `${what} ready, but conversational support is unavailable on this site.`;
}

/** The browser-side limit matches the local server's own (1000 characters,
 *  scripts/start-haiku.mjs); without it a longer question came back as
 *  "unavailable", which is not what happened. */
export const QUESTION_MAX_LENGTH = 1000;
