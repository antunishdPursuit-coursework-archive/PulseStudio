/* Product D — the studio generator. Rensley's lane.
 *
 * Builds a full studio's history so the tool can be seen working at real
 * scale: dozens of members, a believable mix of loyal regulars, quiet
 * faders, newcomers, and people who left. Without this, the page shows one
 * flagged member and nobody can tell whether the ranking works.
 *
 * Two rules make this trustworthy rather than decorative:
 *
 *  1. SEEDED, NOT RANDOM. The same seed always produces the same studio,
 *     so a screenshot is reproducible, a check can pin an exact answer,
 *     and two people looking at the same seed see the same thing.
 *  2. RELATIVE TO A GIVEN DAY. "Today" is a parameter, never the clock, so
 *     generated histories never rot the way fixed dates do — and the unit
 *     checks stay deterministic.
 *
 * Everyone here is fictional. The page states that whenever these records
 * are loaded — a generated studio must never be mistaken for a real one.
 */

import { brand } from "./config.js";
import type {
  Attendance,
  ClassSession,
  FixtureSet,
  Instructor,
  Member,
  MembershipStatus,
  Reservation,
} from "./deps.js";

/* ------------------------------------------------------------------ */
/* Deterministic randomness                                            */
/* ------------------------------------------------------------------ */

/** Small seeded generator (mulberry32). Same seed in, same sequence out. */
function makeRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: () => number, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)] as T;
}

function intBetween(random: () => number, low: number, high: number): number {
  return low + Math.floor(random() * (high - low + 1));
}

/* ------------------------------------------------------------------ */
/* Studio vocabulary — fictional people, ordinary classes              */
/* ------------------------------------------------------------------ */

const FIRST_NAMES = [
  "Maya", "Andre", "Priya", "Diego", "Nina", "Tomas", "Aisha", "Ben",
  "Rosa", "Kwame", "Lena", "Hiro", "Carmen", "Idris", "Sofia", "Noor",
  "Marcus", "Yuki", "Elena", "Rafa", "Zara", "Owen", "Amara", "Luca",
  "Talia", "Jonas", "Mei", "Sam", "Farah", "Iker", "Naomi", "Theo",
  "Ines", "Malik", "Clara", "Ravi", "Bea", "Otto", "Sana", "Gus",
];

const LAST_NAMES = [
  "Alvarez", "Brooks", "Chen", "Diallo", "Esposito", "Ferreira", "Gupta",
  "Haddad", "Ibarra", "Jensen", "Kowalski", "Lindqvist", "Moreau", "Nakamura",
  "Okonkwo", "Petrov", "Quintero", "Rossi", "Sandoval", "Tanaka", "Ueda",
  "Vargas", "Whitfield", "Ximenez", "Yamada", "Zhang", "Amari", "Boateng",
  "Cardoso", "Delgado",
];

const CLASS_TYPES = ["yoga", "cycling", "HIIT", "pilates", "strength"];

const INSTRUCTOR_NAMES = [
  "Ana Torres", "Marco Silva", "Kim Lee", "Dara Okafor", "Ruth Bennett",
];

const PLANS = ["Unlimited Monthly", "8 Classes Monthly", "4 Classes Monthly"];

/* ------------------------------------------------------------------ */
/* The shape of a studio's member base                                 */
/* ------------------------------------------------------------------ */

/** How a generated member behaves. The mix is what makes the tool worth
 *  looking at: only `fading` members should ever be flagged, and every
 *  other kind exists to prove the rule does NOT flag them. */
type Archetype =
  | "loyal"      // still coming — must not be flagged
  | "fading"     // was a regular, went quiet inside the window — FLAGGED
  | "longGone"   // quiet far longer than the window — a different conversation
  | "newcomer"   // joined recently and attending — must not be flagged
  | "neverCame"  // signed up, never attended — onboarding, not re-engagement
  | "paused"     // membership paused — not flagged
  | "left";      // canceled — not flagged

/** The member base of a mid-sized studio, in proportions a real one has. */
const STUDIO_MIX: ReadonlyArray<[Archetype, number]> = [
  ["loyal", 24],
  ["fading", 8],
  ["longGone", 6],
  ["newcomer", 8],
  ["neverCame", 4],
  ["paused", 6],
  ["left", 4],
];

export interface GeneratedStudio {
  records: FixtureSet;
  seed: number;
  memberCount: number;
  /** How many members the rule SHOULD flag — the generator's own claim,
   *  which the unit checks hold it to. */
  expectedFlagged: number;
}

/* ------------------------------------------------------------------ */
/* Date helpers — whole studio-local days, no clock                    */
/* ------------------------------------------------------------------ */

function dayNumber(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1) / 86_400_000;
}

function isoFromDay(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* The generator                                                       */
/* ------------------------------------------------------------------ */

/** Build a studio's records as of `todayIso`, deterministically from
 *  `seed`. Members attend their favourite class with their usual
 *  instructor, which is what makes the drafted notes read like a person
 *  wrote them. */
export function generateStudio(
  seed: number,
  todayIso: string,
  /* Defaulted from the brand seam, not from a literal. It read
   * "America/New_York" until 2026-08-21, which happened to equal
   * brand.timeZone and so looked correct — but main.ts calls this without
   * the argument, so a studio that changed its time zone in config.ts
   * would have kept New York hours in the generated door alone, agreeing
   * with itself everywhere else. */
  timeZone = brand.timeZone,
): GeneratedStudio {
  const random = makeRandom(seed);
  const today = dayNumber(todayIso);

  /* IDS CARRY THE SEED, BECAUSE A DIFFERENT SEED IS DIFFERENT PEOPLE.
   *
   * This door is seeded on the calendar day, so the studio it builds is
   * reproducible for everyone opening the page today and different
   * tomorrow. The ids were not: gen_m_1 was Farah Zhang today and Zara
   * Tanaka tomorrow — all sixty of them, every day. Do-not-contact stores
   * a member id and nothing else, so suppressing Farah today silently
   * suppressed whoever inherited her number tomorrow, and a staff member
   * would meet a person marked do-not-contact they had never seen and had
   * no way to explain.
   *
   * Two different people need two different ids. The seed in the prefix
   * gives them that, and keeps this door's ids distinct from the live
   * trail's (member:000001) and a CSV import's (csv_m_1) as they already
   * were. */
  const ns = `gen${seed}`;

  const instructors: Instructor[] = INSTRUCTOR_NAMES.map((display_name, i) => ({
    instructor_id: `${ns}_i_${i + 1}`,
    display_name,
  }));

  const members: Member[] = [];
  const memberships: FixtureSet["memberships"] = [];
  const sessions: ClassSession[] = [];
  const sessionIdByKey = new Map<string, string>();
  const attendance: Attendance[] = [];
  const reservations: Reservation[] = [];
  const regulars: Array<{ memberId: string; favouriteClass: string }> = [];
  const usedNames = new Set<string>();

  /** One class on a given day, shared by everyone who attended it. */
  const sessionOn = (day: number, classType: string, instructorId: string): string => {
    const key = `${day}|${classType}|${instructorId}`;
    const existing = sessionIdByKey.get(key);
    if (existing !== undefined) return existing;
    const id = `${ns}_s_${sessionIdByKey.size + 1}`;
    sessionIdByKey.set(key, id);
    const date = isoFromDay(day);
    sessions.push({
      session_id: id,
      class_type: classType,
      level: "all levels",
      instructor_id: instructorId,
      starts_at: `${date}T09:00:00`,
      ends_at: `${date}T10:00:00`,
      capacity: 12,
      session_status: day <= today ? "completed" : "scheduled",
    });
    return id;
  };

  let memberNumber = 0;
  for (const [archetype, count] of STUDIO_MIX) {
    for (let n = 0; n < count; n += 1) {
      memberNumber += 1;

      // A distinct fictional name for every member.
      let displayName = "";
      do {
        displayName = `${pick(random, FIRST_NAMES)} ${pick(random, LAST_NAMES)}`;
      } while (usedNames.has(displayName));
      usedNames.add(displayName);

      const memberId = `${ns}_m_${memberNumber}`;
      const favouriteClass = pick(random, CLASS_TYPES);
      const usualInstructor = pick(random, instructors);
      /* Who books ahead. Kept here because the archetype is only in scope
       * inside this loop, and the upcoming schedule is built after it. */
      if (archetype === "loyal" || archetype === "newcomer") {
        regulars.push({ memberId, favouriteClass });
      }

      const status: MembershipStatus =
        archetype === "paused" ? "paused" : archetype === "left" ? "canceled" : "active";
      members.push({
        member_id: memberId,
        display_name: displayName,
        membership_status: status,
      });

      const startedDaysAgo = archetype === "newcomer" ? intBetween(random, 10, 40) : intBetween(random, 90, 700);
      memberships.push({
        membership_id: `${ns}_ms_${memberNumber}`,
        member_id: memberId,
        plan_name: pick(random, PLANS),
        status,
        started_on: isoFromDay(today - startedDaysAgo),
        renews_on: status === "active" ? isoFromDay(today + intBetween(random, 1, 30)) : null,
        canceled_on: status === "canceled" ? isoFromDay(today - intBetween(random, 5, 60)) : null,
      });

      if (archetype === "neverCame") continue;

      // How long ago their last real visit was, per archetype.
      const lastVisitDaysAgo =
        archetype === "loyal" ? intBetween(random, 1, 12)
        : archetype === "fading" ? intBetween(random, 16, 55)
        : archetype === "longGone" ? intBetween(random, 75, 140)
        : archetype === "newcomer" ? intBetween(random, 1, 9)
        : archetype === "paused" ? intBetween(random, 20, 90)
        : /* left */ intBetween(random, 30, 120);

      // Their visits before that, roughly weekly, thinning out further back.
      const visitCount =
        archetype === "newcomer" ? intBetween(random, 2, 5) : intBetween(random, 4, 14);

      for (let v = 0; v < visitCount; v += 1) {
        const day = today - lastVisitDaysAgo - v * intBetween(random, 2, 6);
        const classType = random() < 0.75 ? favouriteClass : pick(random, CLASS_TYPES);
        const instructor = random() < 0.8 ? usualInstructor : pick(random, instructors);
        const sessionId = sessionOn(day, classType, instructor.instructor_id);
        attendance.push({
          attendance_id: `${ns}_a_${attendance.length + 1}`,
          member_id: memberId,
          session_id: sessionId,
          attendance_status: "attended",
          recorded_at: `${isoFromDay(day)}T10:05:00`,
        });
      }

      // A booked class they missed, AFTER their last real visit. This is
      // the trap that matters: a no-show must never reset days-quiet.
      if (random() < 0.35) {
        const missedDay = today - Math.max(1, lastVisitDaysAgo - intBetween(random, 2, 8));
        const sessionId = sessionOn(missedDay, favouriteClass, usualInstructor.instructor_id);
        attendance.push({
          attendance_id: `${ns}_a_${attendance.length + 1}`,
          member_id: memberId,
          session_id: sessionId,
          attendance_status: "no_show",
          recorded_at: `${isoFromDay(missedDay)}T10:05:00`,
        });
      }
    }
  }

  /* NEXT WEEK, AND SOMEBODY ALREADY BOOKED IT.
   *
   * A note either names a real upcoming class — "Kim teaches yoga on
   * Saturday at 5:30, want us to save you a spot?" — or falls back to the
   * open offer. Until 2026-08-21 this door built a session only where
   * somebody had already attended one, so every session it made was in the
   * past, every draft took the fallback, and the half of the job the
   * button offers to show was invisible through it: 8 members flagged, 0
   * with a class to be invited to.
   *
   * Ten days is the window suggestedSession looks in, so that is what gets
   * scheduled and no more. The bookings are here because a studio with a
   * schedule and nobody booked into it is not a studio.
   *
   * WHAT THIS DOOR STILL DOES NOT SHOW, measured rather than assumed: no
   * class fills, so the open-offer fallback never fires here — 32 seats
   * held across 50 classes, 0 full, at all three seeds the checks use.
   * That was tempting to fix by shrinking capacity until one filled, and
   * that would have been a fixture bent until it showed a chosen answer,
   * which is not evidence of anything. The fallback has a door of its own:
   * a studio importing its own attendance export has no upcoming classes
   * at all — an export is history — so EVERY draft from the CSV door takes
   * it. Both halves are on screen; they are just not on the same screen,
   * and both are pinned by checks. */
  for (let ahead = 1; ahead <= 10; ahead += 1) {
    const day = today + ahead;
    for (const classType of CLASS_TYPES) {
      const instructor = instructors[(ahead + CLASS_TYPES.indexOf(classType)) % instructors.length];
      if (instructor === undefined) continue;
      sessionOn(day, classType, instructor.instructor_id);
    }
  }

  /* Booked the evening before, the way the shared engine books its own
   * upcoming classes. Every regular takes the soonest class of the kind
   * they come for; a seat is only taken while one is left, so capacity is
   * never exceeded and a class that fills simply stops accepting. */
  const heldBySession = new Map<string, number>();
  const upcomingByType = new Map<string, ClassSession[]>();
  for (const session of sessions) {
    if (session.session_status !== "scheduled") continue;
    const forType = upcomingByType.get(session.class_type) ?? [];
    forType.push(session);
    upcomingByType.set(session.class_type, forType);
  }
  for (const list of upcomingByType.values()) {
    list.sort((a, b) => (a.starts_at < b.starts_at ? -1 : a.starts_at > b.starts_at ? 1 : 0));
  }
  let reservationNumber = 0;
  for (const regular of regulars) {
    for (const session of upcomingByType.get(regular.favouriteClass) ?? []) {
      const held = heldBySession.get(session.session_id) ?? 0;
      if (held >= session.capacity) continue;
      heldBySession.set(session.session_id, held + 1);
      reservationNumber += 1;
      const eveningBefore = isoFromDay(dayNumber(session.starts_at.slice(0, 10)) - 1);
      reservations.push({
        reservation_id: `${ns}_r_${reservationNumber}`,
        member_id: regular.memberId,
        session_id: session.session_id,
        reservation_status: "reserved",
        reserved_at: `${eveningBefore}T19:00:00`,
        canceled_at: null,
      });
      break;
    }
  }

  const records: FixtureSet = {
    timezone: timeZone,
    note: "A generated studio — every member is fictional.",
    members,
    memberships,
    instructors,
    class_sessions: sessions,
    reservations,
    attendance,
    studio_policies: [],
  };

  return {
    records,
    seed,
    memberCount: members.length,
    expectedFlagged: STUDIO_MIX.find(([kind]) => kind === "fading")?.[1] ?? 0,
  };
}
