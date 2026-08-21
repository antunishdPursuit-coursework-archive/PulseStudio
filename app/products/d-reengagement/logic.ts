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

import type { ClassSession, FixtureSet, Member, Reservation } from "./deps.js";
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
  if (m < 1 || m > 12 || d < 1 || d > 31) return NaN;
  const utc = Date.UTC(y, m - 1, d);
  const roundTrip = new Date(utc);
  if (
    roundTrip.getUTCFullYear() !== y ||
    roundTrip.getUTCMonth() !== m - 1 ||
    roundTrip.getUTCDate() !== d
  ) {
    return NaN;
  }
  return utc / 86_400_000;
}

/** Whole-day number of the CURRENT date in the studio's timezone — not the
 *  viewer's. A staff member checking from another timezone at 11:30pm studio
 *  time must get the studio's answer, or every threshold boundary shifts by
 *  a day. en-CA formatting yields YYYY-MM-DD, the same shape the fixture
 *  dates use. */
export function todayIsoInZone(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

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
    `These records show nobody attending anything for ${coverage.daysSinceAnyAttendance} days — ` +
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
export function nobodyFlaggedLine(result: FlagResult, rules: QuietRules): string | null {
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
  const inRecently =
    active - result.quietLongerThanWindowCount - result.neverAttendedCount;
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

/** Visits per week over the prior window, comparable across members and
 *  honestly rounded — a twice-a-week regular and a once-a-month visitor
 *  should never look alike on the card. */
export function weeklyCadence(priorCount: number, windowDays: number): number {
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
/** Seats left in a session, by the same last-row-wins reading Booking uses
 *  for its own log: a member who booked and then cancelled has freed their
 *  seat, and a member who appears twice holds one seat, not two. */
export function remainingSpots(session: ClassSession, data: FixtureSet): number {
  const statusByMember = new Map<string, string>();
  for (const r of data.reservations) {
    if (r.session_id !== session.session_id) continue;
    statusByMember.set(r.member_id, r.reservation_status);
  }
  let taken = 0;
  for (const status of statusByMember.values()) {
    if (status === "reserved") taken += 1;
  }
  return session.capacity - taken;
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
  return displayName.split(" ")[0] ?? displayName;
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
  for (const r of data.reservations) {
    if (r.member_id !== memberId) continue;
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
