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

import { counted } from "./deps.js";
import type { ClassSession, FixtureSet, Member, Reservation } from "./deps.js";
import type { DraftFacts, QuietRules } from "./config.js";
import { NOT_RECORDED, draftMessage } from "./config.js";

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
  /* WHY NOBODY WAS FLAGGED — the three reasons a member can be passed
   * over, counted separately. "0 flagged" is not one fact, it is four
   * different situations wearing the same number, and only one of them is
   * good news. The page used to read all four as "everyone has been in
   * recently", which is exactly wrong for the studio where every member
   * left three months ago. */
  /** Active members whose last visit is older than the rule's window. Not
   *  a re-engagement note any more — a pause-or-cancel conversation. */
  quietLongerThanWindowCount: number;
  /** Active members with no usable attendance at all: onboarding, not
   *  re-engagement. */
  neverAttendedCount: number;
  /** Members who are paused, canceled or expired — different
   *  conversations, deliberately out of this rule. */
  notActiveCount: number;
}

/* ------------------------------------------------------------------ */
/* Date arithmetic on studio-local calendar days                       */
/* ------------------------------------------------------------------ */

/** Whole-day number of a fixture timestamp, or NaN when the text is not a
 *  real calendar date. The date part of every fixture timestamp is already
 *  studio-local (the offset is baked into the string), so taking the text
 *  before "T" needs no timezone conversion at all.
 *
 *  IT MUST ROUND-TRIP, AND HERE IS WHY. Date.UTC rolls over without
 *  complaint: Date.UTC(2026, 1, 30) is the 2nd of March, and a missing day
 *  component used to default to the 1st. So "2026-02-30" became a real
 *  visit two days after the record claimed, and the truncated "2026-08"
 *  became a visit on the 1st of August — both silently, both counted as
 *  evidence a member attended. The CSV door has always round-tripped its
 *  dates (normalizeDate in csv.ts); the shared records, the browser booking
 *  log and the stored ledger did not, and those are the three sources this
 *  product cannot see coming. Returning NaN puts an unreadable date on the
 *  path the callers already handle: skipped, counted, and stated as
 *  unusable evidence rather than guessed at. */
export function dayNumberFromIso(iso: string): number {
  const datePart = iso.split("T")[0] ?? iso;
  const parts = datePart.split("-");
  if (parts.length !== 3) return NaN;
  const [y, m, d] = parts.map(Number);
  if (y === undefined || m === undefined || d === undefined) return NaN;
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return NaN;
  if (m < 1 || m > 12 || d < 1) return NaN;
  if (d > daysInMonth(y, m)) return NaN;
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** THE CALENDAR AS ARITHMETIC, because this is the hottest function here.
 *
 *  The validity check used to build a Date and read three fields back off
 *  it, which is correct and costs an allocation on every single call — and
 *  every attendance row, reservation and class session goes through this
 *  once per render. Measured at 1884ns a call, which is about 940ms of pure
 *  date parsing for a 2000-member studio's half-million records, dominating
 *  everything else on the page.
 *
 *  A month length and the Gregorian leap rule answer the same question with
 *  no allocation at all. The rule is the full one — divisible by four,
 *  except centuries, except every fourth century — not the four-year
 *  shortcut that is right until 2100. */
function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return DAYS_IN_MONTH[month - 1] ?? 0;
}

/* todayIsoInZone MOVED to app/shared/today.ts and is re-exported here, so
 * every caller and every check keeps its import. Three modules had written
 * their own and one of them was UTC — see that file. This product reaches
 * shared ground through deps.ts, which is where the import lives. */
import { todayIsoInZone } from "./deps.js";
export { todayIsoInZone };

export function todayDayNumber(timeZone: string, now: Date = new Date()): number {
  return dayNumberFromIso(todayIsoInZone(timeZone, now));
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-08-19" as "August 19, 2026". Formatted from the DATE TEXT, never
 *  from a Date object read in the viewer's zone: the page's "as of" line
 *  has to name the studio's day, and building a Date to format it was how
 *  a staff member in another timezone got yesterday's date beside today's
 *  numbers. Returns the input unchanged when it is not a real date, so an
 *  unreadable value is visible rather than silently prettified. */
export function longDate(iso: string): string {
  if (!Number.isFinite(dayNumberFromIso(iso))) return iso;
  const [y, m, d] = (iso.split("T")[0] ?? iso).split("-").map(Number);
  return `${MONTH_NAMES[(m ?? 1) - 1] ?? ""} ${d}, ${y}`;
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

/** Plain ascending comparison, for tie-breaks that must not depend on the
 *  order records arrived in. */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
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

  /* ONE PASS FOR THE WHOLE STUDIO, NOT ONE PASS PER MEMBER.
   *
   * Each member used to scan the entire attendance array looking for their
   * own rows, which is O(members x attendance) — fine at sixty members and
   * ruinous past a few hundred. Measured before this index: 60 members 5ms,
   * 250 members 53ms, 1000 members 780ms, 2000 members 4045ms. The page
   * re-runs this on every workflow click, so a studio of two thousand froze
   * for four seconds each time staff pressed "Do not contact" — on a tool
   * whose whole job is to be opened once a week and worked down.
   *
   * Grouping first makes it O(members + attendance). Insertion order is
   * preserved per member, which the dedup below relies on. */
  const attendedSessionsByMember = new Map<string, string[]>();
  for (const a of data.attendance) {
    if (a.attendance_status !== "attended") continue;
    const rows = attendedSessionsByMember.get(a.member_id);
    if (rows === undefined) attendedSessionsByMember.set(a.member_id, [a.session_id]);
    else rows.push(a.session_id);
  }

  const flagged: FlaggedMember[] = [];
  let quietLongerThanWindowCount = 0;
  let neverAttendedCount = 0;
  let notActiveCount = 0;

  for (const member of data.members) {
    if (member.membership_status !== "active") {
      notActiveCount += 1;
      continue;
    }

    // Every class they truly attended, most recent first. Deduplicated by
    // session — a data-entry duplicate must never inflate the evidence or
    // the ranking — and sorted by the full timestamp so two classes on the
    // same day still order by when they actually happened.
    const attendedSessionIds = new Set(
      attendedSessionsByMember.get(member.member_id) ?? [],
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
      /* NEWEST FIRST, AND THEN BY ID SO THE ANSWER IS ALWAYS THE SAME.
       *
       * A sign-in sheet has no clock in it, so this door times every
       * class on a date at midnight — which means two different classes
       * the same day carry the SAME timestamp. Without the second key the
       * one that became "last attended" was whichever row the file
       * listed first, so the identical records in a different order gave
       * "Last attended: yoga with Ana" or "Last attended: HIIT with Kim",
       * and the type and instructor feed the note sent to the member.
       *
       * Which of the two was genuinely later is unknowable from a sheet
       * that never recorded a time. Answering the same way every time is
       * the part that is owed; guessing differently on each import is
       * not. Session ids are unique, so this is a total order — the same
       * rule suggestedSession's comparator already follows.
       *
       * The tie-break is on CONTENT, and that correction cost a round:
       * breaking the tie on session_id looked right and changed nothing,
       * because this door mints ids from row position — csv_s_1, csv_s_2 —
       * so reversing the rows reverses the ids too. A key derived from the
       * order cannot rescue an order-dependent answer. Class type and
       * instructor are properties of the class itself; session_id stays
       * last only to keep the comparator total. */
      .sort(
        (a, b) =>
          Date.parse(b.starts_at) - Date.parse(a.starts_at) ||
          compareText(a.class_type, b.class_type) ||
          compareText(a.instructor_id, b.instructor_id) ||
          compareText(a.session_id, b.session_id),
      );

    const lastSession = attendedSessions[0];
    if (!lastSession) {
      neverAttendedCount += 1; // onboarding, not ours
      continue;
    }

    const lastDay = dayNumberFromIso(lastSession.starts_at);
    const daysSince = today - lastDay;
    if (daysSince > rules.maxDaysQuiet) {
      quietLongerThanWindowCount += 1;
      continue;
    }
    if (daysSince <= rules.minDaysQuiet) continue; // in recently — the good case

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
        instructorById.get(lastSession.instructor_id) ?? NOT_RECORDED,
      daysSince,
      priorCount: priorSessions.length,
      usualClassType,
      usualInstructorName: usualInstructorName || NOT_RECORDED,
    });
  }

  /* MOST EVIDENCE FIRST, THEN LONGEST QUIET, THEN BY ID.
   *
   * The third key is not decoration. Two members with the same prior count
   * and the same days quiet are common — this list is short and both keys
   * are small integers — and without a tie-break their order came from
   * whatever order the records happened to arrive in. Re-importing the
   * same file with its rows shuffled, or the live trail merging Booking's
   * log, then changed who a staff member reads first.
   *
   * member_id is unique, so this is a total order: the same members always
   * rank the same way, whatever produced them. Same reasoning as the
   * shared CSV export's comparator. */
  flagged.sort(
    (a, b) =>
      b.priorCount - a.priorCount ||
      b.daysSince - a.daysSince ||
      (a.member.member_id < b.member.member_id
        ? -1
        : a.member.member_id > b.member.member_id
          ? 1
          : 0),
  );

  return {
    flagged,
    checkedCount: data.members.length,
    unmatchedAttendanceCount,
    unusableEvidenceCount,
    quietLongerThanWindowCount,
    neverAttendedCount,
    notActiveCount,
  };
}

/* ------------------------------------------------------------------ */
/* Does the tool know when the SILENCE IS ITS OWN?                      */
/* ------------------------------------------------------------------ */

export interface AttendanceCoverage {
  /** Day number of the most recent attended class anywhere in the records,
   *  or null when nothing was ever recorded. */
  lastRecordedDay: number | null;
  /** How many days ago that was, or null. */
  daysSinceAnyAttendance: number | null;
  /** True when the records themselves have gone quiet — nothing recorded
   *  recently enough for a flag to mean what it usually means. */
  recordsHaveGoneQuiet: boolean;
}

/** THE FAILURE THIS EXISTS TO CATCH: a studio that stops RECORDING
 *  attendance looks exactly like a studio everybody left. If the front desk
 *  stops scanning people in on the 1st, then by the 16th every single active
 *  member's last attended class is more than fourteen days old and the page
 *  fills with flags — every one of them false, every one of them evidence of
 *  nothing but a broken clipboard. The rule cannot tell the difference from
 *  inside a single member's history, because from there the two are
 *  identical.
 *
 *  From OUTSIDE it is obvious: a working studio records somebody attending
 *  most days. So the whole record set is asked one question — when did
 *  anyone last attend anything? — and if the answer is older than the quiet
 *  threshold itself, the silence is at least as likely to be the recorder's
 *  as the members'. The page says so instead of presenting a page of names
 *  as a finding. */
export function attendanceCoverage(
  data: FixtureSet,
  today: number,
  rules: QuietRules,
): AttendanceCoverage {
  const sessionById = new Map(data.class_sessions.map((s) => [s.session_id, s]));
  let lastRecordedDay: number | null = null;
  for (const a of data.attendance) {
    if (a.attendance_status !== "attended") continue;
    const session = sessionById.get(a.session_id);
    if (!session) continue;
    const day = dayNumberFromIso(session.starts_at);
    if (!Number.isFinite(day) || day > today) continue;
    if (lastRecordedDay === null || day > lastRecordedDay) lastRecordedDay = day;
  }
  const daysSinceAnyAttendance = lastRecordedDay === null ? null : today - lastRecordedDay;
  return {
    lastRecordedDay,
    daysSinceAnyAttendance,
    recordsHaveGoneQuiet:
      daysSinceAnyAttendance !== null && daysSinceAnyAttendance > rules.minDaysQuiet,
  };
}

/** The warning to print above the flags, or null when the records are
 *  current. Named separately so the suite holds the wording to a known
 *  answer and the page cannot quietly soften it. */
export function coverageWarning(
  coverage: AttendanceCoverage,
  result: FlagResult,
  rules: QuietRules,
): string | null {
  if (!coverage.recordsHaveGoneQuiet) return null;
  if (result.flagged.length === 0) return null;
  return (
    `These records show nobody attending anything for ${counted(coverage.daysSinceAnyAttendance ?? 0, "day")} — ` +
    `longer than the ${rules.minDaysQuiet}-day rule itself. That makes every flag below suspect: ` +
    `a studio that stopped RECORDING attendance looks exactly like a studio everybody left. ` +
    `Check that attendance is still being taken before sending any of these.`
  );
}

/** Why nobody was flagged, in the studio's own terms. "0 flagged" is four
 *  different situations wearing one number, and only one of them is good
 *  news: the page must never read the studio where everybody left three
 *  months ago as the studio where everybody came in last week.
 *
 *  Returns null when somebody WAS flagged — there is nothing to explain. */
export function nobodyFlaggedLine(
  result: FlagResult,
  rules: QuietRules,
  /* Members the RULE flagged and the page then set aside because they
   * already hold an upcoming reserved spot. The page removes them from
   * result.flagged after findQuietMembers returns, so this function cannot
   * see them and used to count them under "have been in recently" — a
   * sentence that is flatly false about a member who has been quiet for
   * seventeen days and simply booked their way back. They are quiet AND
   * returning, which is its own good news and says so. */
  alreadyReturningCount = 0,
): string | null {
  if (result.flagged.length > 0) return null;
  const active = result.checkedCount - result.notActiveCount;
  if (result.checkedCount === 0) return "No usable member records loaded — nothing was checked.";
  if (active === 0) {
    return `No active members in these records: all ${result.checkedCount} are paused, canceled or expired — different conversations from this one.`;
  }
  const reasons: string[] = [];
  if (result.quietLongerThanWindowCount > 0) {
    reasons.push(
      `${result.quietLongerThanWindowCount} ${result.quietLongerThanWindowCount === 1 ? "has" : "have"} been quiet longer than ${rules.maxDaysQuiet} days — past a note, and worth a pause-or-cancel conversation instead`,
    );
  }
  if (result.neverAttendedCount > 0) {
    reasons.push(
      `${result.neverAttendedCount} ${result.neverAttendedCount === 1 ? "has" : "have"} never attended a class — that is onboarding, not re-engagement`,
    );
  }
  if (alreadyReturningCount > 0) {
    reasons.push(
      `${alreadyReturningCount} ${alreadyReturningCount === 1 ? "is" : "are"} quiet but already booked back in, and left alone`,
    );
  }
  const inRecently =
    active -
    result.quietLongerThanWindowCount -
    result.neverAttendedCount -
    alreadyReturningCount;
  if (inRecently > 0) {
    reasons.push(`${inRecently} ${inRecently === 1 ? "has" : "have"} been in within the last ${rules.minDaysQuiet} days`);
  }
  const head = `${active} active member${active === 1 ? "" : "s"} checked, 0 flagged.`;
  return reasons.length === 0 ? head : `${head} Of those, ${reasons.join("; ")}.`;
}

/* ------------------------------------------------------------------ */
/* Stated results                                                      */
/* ------------------------------------------------------------------ */

/** The stated-result line. Always names what ran — "5 members checked,
 *  0 flagged" — never leaving a blank where a result should be. */
export function summaryLine(result: FlagResult, asOfLabel: string): string {
  return `${counted(result.checkedCount, "member")} checked, ${result.flagged.length} flagged as of ${asOfLabel}.`;
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

/** Visits per week over the prior window, comparable across members and
 *  honestly rounded — a twice-a-week regular and a once-a-month visitor
 *  should never look alike on the card. */
export function weeklyCadence(
  priorCount: number,
  windowDays: number,
): number | null {
  /* A window of no days has no rate in it. Dividing anyway gives Infinity,
   * and this number is interpolated straight into the line a staff member
   * reads — "2 classes in the prior 0 days (≈Infinity/week)". The window
   * comes from QuietRules, which the team has not ratified and any studio
   * can configure, so "nobody would set that" is not a guarantee.
   *
   * null rather than 0, because 0 a week is a real answer about a real
   * member and this is the absence of an answer. The caller drops the
   * clause, the same way it drops a class type the records never named. */
  if (!Number.isFinite(windowDays) || windowDays <= 0) return null;
  return Math.round((priorCount / (windowDays / 7)) * 10) / 10;
}

const WEEKDAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
] as const;

function weekdayNameOf(date: string): string {
  return WEEKDAY_NAMES[(((dayNumberFromIso(date) + 4) % 7) + 7) % 7] ?? "soon";
}

function timeOf(startsAt: string): string {
  const hh = Number(startsAt.slice(11, 13));
  const mm = startsAt.slice(14, 16);
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${mm} ${hh < 12 ? "AM" : "PM"}`;
}

/** The next scheduled class matching the member's own pattern, within ten
 *  days: their usual class WITH their usual instructor first, then their
 *  usual class with anyone. Null when the records hold no such session —
 *  a generic draft beats a made-up invitation. Deterministic: earliest
 *  date, then session id. */
/* SEATS COUNTED ONCE PER RECORD SET, NOT ONCE PER QUESTION.
 *
 * remainingSpots first walked the whole reservation list per session. That
 * is fine for one lookup and ruinous inside suggestedSession, which asks it
 * about every candidate class for every flagged member: at two thousand
 * members the card loop took 137 SECONDS — a regression I introduced with
 * the capacity fix itself, trading a wrong answer for one nobody would wait
 * for. Both were mine.
 *
 * The counts are derived from the reservations and nothing else, so they are
 * memoised against THAT ARRAY rather than against the record set holding it.
 * Keying on the record set was the obvious move and it was wrong: a caller
 * that swaps in a different reservation list on the same object — which the
 * suite does, and which is the natural way to write such a check — kept
 * getting the first answer forever. Four checks caught it immediately.
 * Keying on the array means any new list misses and recomputes.
 *
 * THE REMAINING CONSTRAINT, stated because it is invisible: mutating the
 * SAME array in place after a lookup would still read stale. Nothing here
 * does — fixtureSetFrom, the CSV door and the generator each build a fresh
 * array, and the page never appends to one — but a future caller that
 * pushes onto data.reservations has to know this exists. */
const seatsTakenCache = new WeakMap<readonly Reservation[], Map<string, number>>();

function seatsTakenBySession(data: FixtureSet): Map<string, number> {
  const cached = seatsTakenCache.get(data.reservations);
  if (cached !== undefined) return cached;
  /* Last row wins per (member, session) — the same reading Booking uses for
   * its own log — so a cancellation frees the seat and a member listed
   * twice holds one. Built in one pass over the reservations.
   *
   * NESTED, NOT A JOINED STRING KEY. The first version keyed one flat Map
   * on `${session_id}|${member_id}` and recovered the session by slicing at
   * the last pipe. That is correct exactly as long as no member id ever
   * contains a pipe — true of all three doors today (member:000001,
   * csv_m_1_maria, gen20260821_m_1) and true only by luck. An id format is
   * not this function's to depend on, and a Map of Maps needs no parsing
   * back at all. */
  const latestBySession = new Map<string, Map<string, string>>();
  for (const r of data.reservations) {
    let forSession = latestBySession.get(r.session_id);
    if (forSession === undefined) {
      forSession = new Map<string, string>();
      latestBySession.set(r.session_id, forSession);
    }
    forSession.set(r.member_id, r.reservation_status);
  }
  const taken = new Map<string, number>();
  for (const [sessionId, byMember] of latestBySession) {
    let held = 0;
    for (const status of byMember.values()) if (status === "reserved") held += 1;
    if (held > 0) taken.set(sessionId, held);
  }
  seatsTakenCache.set(data.reservations, taken);
  return taken;
}

/** Seats left in a session, by the same last-row-wins reading Booking uses
 *  for its own log: a member who booked and then cancelled has freed their
 *  seat, and a member who appears twice holds one seat, not two. */
export function remainingSpots(session: ClassSession, data: FixtureSet): number {
  return session.capacity - (seatsTakenBySession(data).get(session.session_id) ?? 0);
}

export function suggestedSession(
  flagged: FlaggedMember,
  data: FixtureSet,
  today: number,
): ClassSession | null {
  const instructorByName = new Map(
    data.instructors.map((i) => [i.display_name, i.instructor_id]),
  );
  const usualInstructorId = instructorByName.get(flagged.usualInstructorName) ?? null;
  const candidates = data.class_sessions
    .filter((s) => {
      if (s.session_status !== "scheduled") return false;
      if (s.class_type !== flagged.usualClassType) return false;
      /* NEVER OFFER A SEAT THAT IS NOT THERE. The draft says "want us to
       * save you a spot?" — an invitation, in a personal note, from a
       * studio that has just noticed this member stopped coming. Sending
       * that about a full class means the member either cannot book or has
       * to be told no, which is a worse second impression than the silence
       * this tool exists to break. An open offer is honest; a specific
       * invitation to a class with no room is not. */
      if (remainingSpots(s, data) < 1) return false;
      const day = dayNumberFromIso(s.starts_at);
      return Number.isFinite(day) && day > today && day <= today + 10;
    })
    .sort((a, b) =>
      a.starts_at === b.starts_at
        ? a.session_id < b.session_id ? -1 : 1
        : a.starts_at < b.starts_at ? -1 : 1,
    );
  return (
    candidates.find((s) => s.instructor_id === usualInstructorId) ??
    candidates[0] ??
    null
  );
}

/** "on Thursday at 9:00 AM" — the words the draft weaves in. */
export function inviteWording(session: ClassSession): string {
  const date = session.starts_at.split("T")[0] ?? session.starts_at;
  return `on ${weekdayNameOf(date)} at ${timeOf(session.starts_at)}`;
}

/** First word of a display name, for the draft's greeting. */
export function firstNameOf(displayName: string): string {
  /* ANY whitespace, not just a space. This split on " " alone until
   * 2026-08-21, which is correct for every name typed on one line and
   * wrong for one that arrived from a wrapped cell in a spreadsheet: CSV
   * allows a line break inside a quoted field, so "Ada\nRowe" is a real
   * export shape. The draft then opened "Hi Ada\nRowe —", greeting a
   * member by their full name with a line break through the middle of the
   * sentence. Trimmed first, so a leading break does not return "". */
  const first = displayName.trim().split(/\s+/)[0] ?? "";
  return first === "" ? displayName : first;
}

/* WHAT THE RECORDS DO NOT SAY, TURNED INTO WHAT THE VOICE CAN SAY.
 *
 * Two placeholders exist because the contract's fields are not nullable:
 * NOT_RECORDED when no instructor record matched, NOT_RECORDED
 * when the import never had a class column at all — which is every
 * sign-in sheet, the plainest supported file there is.
 *
 * This is the ONE place they turn back into null. It matters that it is a
 * function and not four lines inside a click handler: the voice's own
 * checks pass nulls in by hand, so they prove draftMessage COPES with a
 * missing class, and would all still pass if this mapping were deleted and
 * "your last class class" went back into a note addressed to a member. The
 * checks that cover this function start from a flagged member instead, so
 * they fail if the placeholder ever reaches the sentence again. */
export function draftFactsFor(
  f: FlaggedMember,
  data: FixtureSet,
  today: number,
  studioName: string,
): DraftFacts {
  const session = suggestedSession(f, data, today);
  /* firstNameOf must not run on the instructor placeholder: "the" is not a
   * name, and "The still teaches yoga" is how that reads once printed. */
  const known = (value: string, placeholder: string): boolean =>
    value !== placeholder && value.trim() !== "";
  return {
    firstName: firstNameOf(f.member.display_name),
    daysSince: f.daysSince,
    usualClassType: known(f.usualClassType, NOT_RECORDED) ? f.usualClassType : null,
    usualInstructorFirstName: known(f.usualInstructorName, NOT_RECORDED)
      ? firstNameOf(f.usualInstructorName)
      : null,
    studioName,
    suggestedInvite: session === null ? null : inviteWording(session),
  };
}

/* THE PAGE DESCRIBING ITS OWN RULE, TO THE PEOPLE ACTING ON IT.
 *
 * Staff decide whether to trust a list by reading what produced it, so
 * this sentence has to stay true to findQuietMembers and not merely near
 * it. The NUMBERS interpolate, so those cannot drift. The WORDS can:
 * "more than X and at most Y" describes two boundary conditions, and
 * changing one comparison in the rule from > to >= would turn this line
 * into a confident, unremarkable lie that no compiler would notice.
 *
 * Which is why the checks on this function do not stop at the string.
 * They run the real rule against members sitting exactly on each
 * boundary and confirm the sentence still describes what happened. */
export function ruleStatement(rules: QuietRules): string {
  return (
    `Proposed thresholds (not yet ratified by the team): flag active members ` +
    `whose last attended class is more than ${rules.minDaysQuiet} and ` +
    `at most ${rules.maxDaysQuiet} days ago. Only attended classes ` +
    `count — a no-show is never a visit.`
  );
}

/* JOINING SENTENCE PARTS, IN ONE PLACE THAT IS CHECKED.
 *
 * Every status line on this page is several optional clauses stitched
 * together, and the stitching kept being written inline where nothing
 * could reach it. That cost a real defect on 2026-08-21: one of the
 * parts was typed `string | null`, the inline filter tested `!== ""`,
 * which does not narrow a null away, and the surviving null joined as an
 * empty segment and put a double space in the middle of a sentence a
 * staff member reads. It compiled, because `filter` with an ordinary
 * predicate does not narrow and `join` accepts anything.
 *
 * So the rule lives here instead: nulls and blank-or-whitespace parts are
 * dropped, each surviving part is trimmed, and what is left is joined
 * once. Adding a fifth clause cannot reintroduce the bug. */
export function joinSentence(
  parts: readonly (string | null | undefined)[],
  separator = " ",
): string {
  return parts
    .filter((part): part is string => typeof part === "string" && part.trim() !== "")
    .map((part) => part.trim())
    .join(separator);
}

/* THE EVIDENCE A STAFF MEMBER JUDGES THE FLAG BY.
 *
 * Same placeholders, opposite handling from the draft. The draft drops
 * what the records do not say, because a member should never read around
 * a gap. Staff need the gap NAMED — the truth law asks a screen to say
 * what it checked, and "Last attended: class with the team" says the
 * opposite of that. It reads like a class called "class", taught by
 * somebody called "the team", which is a fact the records never carried.
 *
 * So the unknown parts are left out of the sentence and stated once at
 * the end, where a staff member can see the flag rests on a date and a
 * count and nothing else. */
export function evidenceLine(f: FlaggedMember, priorWindowDays: number): string {
  const classKnown =
    f.lastSession.class_type !== NOT_RECORDED && f.lastSession.class_type.trim() !== "";
  const instructorKnown =
    f.lastInstructorName !== NOT_RECORDED && f.lastInstructorName.trim() !== "";

  const attended = classKnown && instructorKnown
    ? `${f.lastSession.class_type} with ${f.lastInstructorName}`
    : classKnown
      ? f.lastSession.class_type
      : instructorKnown
        ? `a class with ${f.lastInstructorName}`
        : "";

  const perWeek = weeklyCadence(f.priorCount, priorWindowDays);
  const cadence =
    `${counted(f.priorCount, "class", "classes")} in the prior ${counted(priorWindowDays, "day")}` +
    (perWeek === null ? "" : ` (≈${perWeek}/week)`);

  const usualClassKnown =
    f.usualClassType !== NOT_RECORDED && f.usualClassType.trim() !== "";
  const usualInstructorKnown =
    f.usualInstructorName !== NOT_RECORDED && f.usualInstructorName.trim() !== "";
  const usual = usualClassKnown && usualInstructorKnown
    ? `usually ${f.usualClassType} with ${f.usualInstructorName}`
    : usualClassKnown
      ? `usually ${f.usualClassType}`
      : usualInstructorKnown
        ? `usually with ${f.usualInstructorName}`
        : "";

  /* Named once, at the end, rather than twice inside the sentence. */
  const missing =
    !classKnown && !instructorKnown
      ? "the import recorded no class type and no instructor"
      : !classKnown
        ? "the import recorded no class type"
        : !instructorKnown
          ? "the import recorded no instructor"
          : "";

  const head = attended === ""
    ? `Last attended: ${longDate(f.lastSession.starts_at)}`
    : `Last attended: ${attended} on ${longDate(f.lastSession.starts_at)}`;

  return [head, cadence, usual, missing].filter((part) => part !== "").join(" · ");
}

/** The note a staff member reads before deciding to send it. */
export function draftTextFor(
  f: FlaggedMember,
  data: FixtureSet,
  today: number,
  studioName: string,
): string {
  return draftMessage(draftFactsFor(f, data, today, studioName));
}

/** Member ids holding an ACTIVE reserved spot for a class dated after
 *  "today". Read append-only: the LAST row per (member, session) wins —
 *  the same reading Booking itself uses — so a cancel recorded after a
 *  booking releases the spot here too. Waitlisted is hope, not a held
 *  spot, and never counts. A quiet member in this set is already coming
 *  back on their own: they are stated and left alone, never nagged. */
export function upcomingReservedMemberIds(data: FixtureSet, today: number): Set<string> {
  // Derived from the dated map below so the two views can never drift:
  // same reading of the trail, one implementation.
  return new Set(upcomingReservedNextClassDates(data, today).keys());
}

/** Per coming-back member, the DATE of their earliest upcoming reserved
 *  class — so the page can say not just that they are coming back, but
 *  when. Same reservation reading as above: last row wins, waitlisted is
 *  hope not a hold, only classes dated after "today" count. */
export function upcomingReservedNextClassDates(
  data: FixtureSet,
  today: number,
): Map<string, string> {
  const latest = new Map<string, Reservation>();
  for (const r of data.reservations) {
    latest.set(`${r.member_id}|${r.session_id}`, r);
  }
  const sessionStart = new Map(
    data.class_sessions.map((s) => [s.session_id, s.starts_at]),
  );
  const nextDate = new Map<string, string>();
  for (const r of latest.values()) {
    if (r.reservation_status !== "reserved") continue;
    const startsAt = sessionStart.get(r.session_id);
    if (startsAt === undefined) continue;
    const day = dayNumberFromIso(startsAt);
    if (!Number.isFinite(day) || day <= today) continue;
    const date = startsAt.split("T")[0] ?? startsAt;
    const prior = nextDate.get(r.member_id);
    if (prior === undefined || date < prior) nextDate.set(r.member_id, date);
  }
  return nextDate;
}

/* Reservations grouped by member, memoised against the reservation ARRAY —
 * the same key and the same stated constraint as the seat counts: a caller
 * that mutates that array in place after a lookup would read stale, and
 * nothing does. */
const reservationsByMemberCache = new WeakMap<
  readonly Reservation[],
  Map<string, Reservation[]>
>();

function reservationsByMember(data: FixtureSet): Map<string, Reservation[]> {
  const cached = reservationsByMemberCache.get(data.reservations);
  if (cached !== undefined) return cached;
  const grouped = new Map<string, Reservation[]>();
  for (const r of data.reservations) {
    const rows = grouped.get(r.member_id);
    if (rows === undefined) grouped.set(r.member_id, [r]);
    else rows.push(r);
  }
  reservationsByMemberCache.set(data.reservations, grouped);
  return grouped;
}

/** Most recent booking ACTION since the member's last visit — booked,
 *  maybe canceled, never attended — or null. Booking without attending is
 *  a different story from silence, and staff should see the difference:
 *  disclosed on the card, never silently merged into "activity", and it
 *  NEVER shrinks the quiet-days count (only attendance is a visit). */
export function recentBookingActivity(
  memberId: string,
  data: FixtureSet,
  lastDay: number,
  today: number,
): string | null {
  let disclosed: string | null = null;
  let recentActionDay = -Infinity;
  /* Per member, not per studio: this is asked once per card, and walking
   * every reservation each time cost 489ms across 275 cards on a
   * 2000-member studio. Same index, same memo, same array key as the seat
   * counts above. */
  for (const r of reservationsByMember(data).get(memberId) ?? []) {
    /* DATE THE ACTION THAT ACTUALLY HAPPENED. A cancellation's date is
     * canceled_at, not the date of the booking it cancels — and Booking
     * writes a cancellation as a NEW row that PRESERVES the original
     * reserved_at (a-booking/main.ts, cancelReservation). Reading
     * reserved_at for both rows therefore gave them the same day, and a
     * strict > kept whichever came first, so the "(canceled)" qualifier
     * this product deliberately added never once rendered for a real
     * cancellation from the live trail. Staff read "booked but did not
     * attend" about a member who had cancelled properly days earlier —
     * the evidence line inverting the member's own story. */
    const isCanceled = r.reservation_status === "canceled";
    const rawAction = isCanceled ? r.canceled_at ?? r.reserved_at : r.reserved_at;
    const actionDate = rawAction.split("T")[0] ?? rawAction;
    const actionDay = dayNumberFromIso(actionDate);
    if (!Number.isFinite(actionDay) || actionDay <= lastDay || actionDay > today) continue;
    /* LAST ROW WINS ON A TIE, the same reading Booking uses for its own log
     * and the same rule upcomingReservedNextClassDates already follows. A
     * cancel row is appended after the booking it cancels, so on the day
     * both happened the cancel is the later word. */
    if (actionDay >= recentActionDay) {
      recentActionDay = actionDay;
      disclosed = isCanceled ? `${actionDate} (canceled)` : actionDate;
    }
  }
  return disclosed;
}

/* ------------------------------------------------------------------ */
/* Speaking to whoever is actually reading                              */
/* ------------------------------------------------------------------ */

/** What this staff page should say to the person signed in, or null when
 *  there is nothing worth saying.
 *
 *  THIS IS NOT A GATE, and it must never become one. The audience law says
 *  a surface may ADAPT to the signed-in actor and may never hide or block a
 *  route, because the browser session is convenience and not access
 *  control. Pretending otherwise would be a lie about what protects this
 *  data — the honest answer is that a staff page holding member risk
 *  information belongs behind a real sign-in, which this studio does not
 *  have yet.
 *
 *  What it CAN do is stop a member wondering why the studio is showing them
 *  a list of other people. A member who lands here by link or by URL is
 *  told plainly what this page is and where their own pages are. Staff are
 *  told nothing, because a page that explains itself to the people it was
 *  built for is a page they stop reading. */
export function actorNote(
  actorType: "member" | "staff" | null,
  studioUrl: string,
): string | null {
  if (actorType !== "member") return null;
  return (
    "You're signed in as a member, and this is the studio's staff view — it lists members " +
    "who have gone quiet so the team can reach out. Nothing here is about your account. " +
    `Your classes and bookings are at ${studioUrl}products/a-booking/, and questions go to ` +
    `${studioUrl}products/c-chatbot/.`
  );
}
