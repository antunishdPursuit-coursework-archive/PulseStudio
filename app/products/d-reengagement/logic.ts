/* Product D — the quiet-member logic. Rensley's lane.
 *
 * Pure functions only: no DOM, no clock, no fetch. "Today" is always a
 * parameter, so every function here is deterministic and the unit checks
 * in tests.ts can pin exact answers without depending on the real clock.
 *
 * The one law this file enforces (from PRODUCT_D_MEMBER_REENGAGEMENT_TOOL.md):
 * only attendance_status "attended" counts as a visit. A no_show or an
 * unknown record is never a visit — counting one would hide exactly the
 * members this product exists to catch.
 */

import type { ClassSession, FixtureSet, Member } from "./deps.js";
import type { QuietRules } from "./config.js";

/** One flagged member with the evidence for why — no flag without evidence. */
export interface FlaggedMember {
  member: Member;
  /** The last class they actually attended. */
  lastSession: ClassSession;
  lastInstructorName: string;
  /** Whole days since that class, in studio-local dates. */
  daysSince: number;
  /** Attended classes in the window before they went quiet. */
  priorCount: number;
  /** Their most-attended class type in that window (recent wins ties). */
  usualClassType: string;
  usualInstructorName: string;
}

export interface FlagResult {
  flagged: FlaggedMember[];
  /** Every member examined, so screens can state "N checked" honestly. */
  checkedCount: number;
  /** Attendance rows whose member matches nobody in the records. These
   *  never create a member and never touch another member's history — but
   *  they are counted, because evidence that vanished without a word is
   *  how a quiet member goes unnoticed. */
  unmatchedAttendanceCount: number;
  /** Attended rows for a KNOWN member that could not be used as evidence:
   *  the class is missing from the records, or its date is unreadable or
   *  in the future. Stating how many members were checked is not the same
   *  as stating what the evidence supported. */
  unusableEvidenceCount: number;
}

/* ------------------------------------------------------------------ */
/* Date arithmetic on studio-local calendar days                       */
/* ------------------------------------------------------------------ */

/** Whole-day number of a fixture timestamp. The date part of every fixture
 *  timestamp is already studio-local (the offset is baked into the string),
 *  so taking the text before "T" needs no timezone conversion at all. */
export function dayNumberFromIso(iso: string): number {
  const datePart = iso.split("T")[0] ?? iso;
  const [y, m, d] = datePart.split("-").map(Number);
  return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1) / 86_400_000;
}

/** Whole-day number of the CURRENT date in the studio's timezone — not the
 *  viewer's. A staff member checking from another timezone at 11:30pm studio
 *  time must get the studio's answer, or every threshold boundary shifts by
 *  a day. en-CA formatting yields YYYY-MM-DD, the same shape the fixture
 *  dates use. */
export function todayDayNumber(timeZone: string, now: Date = new Date()): number {
  const studioDate = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return dayNumberFromIso(studioDate);
}

/* ------------------------------------------------------------------ */
/* The rule                                                            */
/* ------------------------------------------------------------------ */

/** Most common value in a list ordered most-recent-first; on a tie the
 *  more recent value wins, so "usual" tracks what they did lately. */
function mostCommon(valuesMostRecentFirst: string[]): string {
  const counts = new Map<string, number>();
  for (const value of valuesMostRecentFirst) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best = valuesMostRecentFirst[0] ?? "";
  let bestCount = 0;
  for (const value of valuesMostRecentFirst) {
    const count = counts.get(value) ?? 0;
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

/** Apply the quiet-member rule to the shared records.
 *
 *  Flags a member when ALL of these hold:
 *    - membership_status is "active" (paused, canceled, expired are other
 *      conversations, not re-engagement)
 *    - they have at least one attended class (never-attended is an
 *      onboarding problem, out of scope by the brief)
 *    - their last attended class is more than rules.minDaysQuiet and at
 *      most rules.maxDaysQuiet days before `today`
 *
 *  Results are ranked most-valuable-save first: highest prior attendance,
 *  then longest quiet. */
export function findQuietMembers(
  data: FixtureSet,
  today: number,
  rules: QuietRules,
): FlagResult {
  const sessionById = new Map(data.class_sessions.map((s) => [s.session_id, s]));
  const instructorById = new Map(
    data.instructors.map((i) => [i.instructor_id, i.display_name]),
  );

  // Evidence accounting, before any flagging: every attendance row is
  // either usable, unmatched to a member, or unusable as evidence. Nothing
  // disappears without being counted.
  const memberIds = new Set(data.members.map((m) => m.member_id));
  let unmatchedAttendanceCount = 0;
  let unusableEvidenceCount = 0;
  for (const a of data.attendance) {
    if (!memberIds.has(a.member_id)) {
      unmatchedAttendanceCount += 1;
      continue;
    }
    if (a.attendance_status !== "attended") continue;
    const session = sessionById.get(a.session_id);
    if (!session) {
      unusableEvidenceCount += 1;
      continue;
    }
    const day = dayNumberFromIso(session.starts_at);
    if (!Number.isFinite(day) || day > today) unusableEvidenceCount += 1;
  }

  const flagged: FlaggedMember[] = [];

  for (const member of data.members) {
    if (member.membership_status !== "active") continue;

    // Every class they truly attended, most recent first. Deduplicated by
    // session — a data-entry duplicate must never inflate the evidence or
    // the ranking — and sorted by the full timestamp so two classes on the
    // same day still order by when they actually happened.
    const attendedSessionIds = new Set(
      data.attendance
        .filter(
          (a) =>
            a.member_id === member.member_id &&
            a.attendance_status === "attended",
        )
        .map((a) => a.session_id),
    );
    const attendedSessions = [...attendedSessionIds]
      .map((id) => sessionById.get(id))
      .filter((s): s is ClassSession => s !== undefined)
      // A class that has not happened yet, or whose date cannot be read, is
      // not a visit. Without this guard a single future-dated or malformed
      // row becomes the member's "last attended", drives days-quiet negative
      // or NaN, and silently drops a genuinely quiet member off the list —
      // the exact disappearance this product exists to prevent.
      .filter((s) => {
        const day = dayNumberFromIso(s.starts_at);
        return Number.isFinite(day) && day <= today;
      })
      .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));

    const lastSession = attendedSessions[0];
    if (!lastSession) continue; // never attended — onboarding, not ours

    const lastDay = dayNumberFromIso(lastSession.starts_at);
    const daysSince = today - lastDay;
    if (daysSince <= rules.minDaysQuiet || daysSince > rules.maxDaysQuiet) {
      continue;
    }

    // How they used to show up, in the window before they went quiet.
    const priorSessions = attendedSessions.filter(
      (s) => dayNumberFromIso(s.starts_at) >= lastDay - rules.priorWindowDays,
    );
    const usualClassType = mostCommon(priorSessions.map((s) => s.class_type));
    const usualInstructorName = mostCommon(
      priorSessions
        .map((s) => instructorById.get(s.instructor_id) ?? "")
        .filter((name) => name !== ""),
    );

    flagged.push({
      member,
      lastSession,
      lastInstructorName:
        instructorById.get(lastSession.instructor_id) ?? "the team",
      daysSince,
      priorCount: priorSessions.length,
      usualClassType,
      usualInstructorName: usualInstructorName || "the team",
    });
  }

  flagged.sort(
    (a, b) => b.priorCount - a.priorCount || b.daysSince - a.daysSince,
  );

  return {
    flagged,
    checkedCount: data.members.length,
    unmatchedAttendanceCount,
    unusableEvidenceCount,
  };
}

/* ------------------------------------------------------------------ */
/* Stated results                                                      */
/* ------------------------------------------------------------------ */

/** The stated-result line. Always names what ran — "5 members checked,
 *  0 flagged" — never leaving a blank where a result should be. */
export function summaryLine(result: FlagResult, asOfLabel: string): string {
  return `${result.checkedCount} members checked, ${result.flagged.length} flagged as of ${asOfLabel}.`;
}

/** The data-quality line, or null when every record was usable. Staff can
 *  only repair an export they are told about, so each problem is counted
 *  and named separately — a row matching no member needs a different fix
 *  from a row with an unreadable date. */
export function dataQualityLine(result: FlagResult): string | null {
  const parts: string[] = [];
  if (result.unmatchedAttendanceCount > 0) {
    parts.push(
      `${result.unmatchedAttendanceCount} attendance ${result.unmatchedAttendanceCount === 1 ? "row" : "rows"} could not be matched to a member`,
    );
  }
  if (result.unusableEvidenceCount > 0) {
    parts.push(
      `${result.unusableEvidenceCount} could not be used as evidence (the class is missing, or its date is unreadable or in the future)`,
    );
  }
  return parts.length === 0 ? null : `${parts.join("; ")}.`;
}

/** First word of a display name, for the draft's greeting. */
export function firstNameOf(displayName: string): string {
  return displayName.split(" ")[0] ?? displayName;
}
