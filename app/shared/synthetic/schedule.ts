/* The class schedule — sessions every day, no overlaps in clean data. TEAM-OWNED.
 *
 * Sessions run from (asOfDate - historyDays) through (asOfDate + 14) so
 * booking surfaces have a future and history surfaces have a past. Slots
 * are non-overlapping within a day, so facility capacity holds by
 * construction in clean mode; the edge-cases mode injects an overlapping
 * session deliberately.
 */

import { makeId } from "./contracts.js";
import type {
  SyntheticClassSession,
  SyntheticClassType,
  SyntheticInstructor,
} from "./contracts.js";
import type { SyntheticStudioConfig } from "./config.js";
import { makeStream } from "./random.js";
import { dateOfDayNumber, dayNumberOf } from "./normalize.js";

const CLASS_TYPES: ReadonlyArray<{
  name: string;
  level: string;
  durationMinutes: number;
  capacity: number;
}> = [
  { name: "yoga", level: "all levels", durationMinutes: 60, capacity: 15 },
  { name: "cycling", level: "beginner", durationMinutes: 45, capacity: 12 },
  { name: "HIIT", level: "advanced", durationMinutes: 45, capacity: 10 },
  { name: "pilates", level: "all levels", durationMinutes: 55, capacity: 12 },
  { name: "strength", level: "intermediate", durationMinutes: 50, capacity: 12 },
];

const INSTRUCTOR_NAMES: readonly string[] = [
  "Ana Torres",
  "Marco Silva",
  "Kim Lee",
  "Dara Okafor",
  "Ruth Bennett",
];

/** Slot start times, chosen so consecutive slots never overlap even at
 *  the longest class duration (60 minutes < 90-minute spacing). */
const SLOT_TIMES: readonly string[] = [
  "06:30", "08:00", "09:30", "12:00", "16:00", "17:30", "19:00", "20:30",
];

/** WHICH slots a studio opens first, when it does not open all of them.
 *
 *  This order is CALIBRATED — see app/shared/synthetic/CALIBRATION.md. Real
 *  gym check-in times are bimodal: a morning peak and a bigger evening
 *  peak, with the middle of the afternoon the quietest hour of the working
 *  day. Opening slots in clock order instead gave a small studio a
 *  schedule that started at 06:30 and DIED AT 16:00 — no evening classes
 *  at all, which is the opposite of how a real studio fills.
 *
 *  Chronological order is restored before the day is written, so the
 *  schedule still reads top-to-bottom by time; only WHICH times exist
 *  changes with the studio's size. */
const SLOT_PRIORITY: readonly string[] = [
  "17:30", // the evening peak — the busiest hour in a real studio
  "08:00", // the morning peak — before work
  "19:00", // second evening class
  "09:30", // mid-morning
  "12:00", // lunch
  "06:30", // early birds
  "20:30", // late evening
  "16:00", // the afternoon lull, opened last
];

/** Parallel rooms per time slot. One room for a boutique studio; up to six
 *  for a big-box gym, so seat supply grows with the customer base while
 *  concurrent occupancy stays far below the facility ceiling. */
export function roomsPerSlot(memberCount: number): number {
  return Math.min(6, Math.max(1, Math.ceil(memberCount / 150)));
}

export interface StudioSchedule {
  instructors: SyntheticInstructor[];
  classTypes: SyntheticClassType[];
  sessions: SyntheticClassSession[];
  sessionsByDate: Map<string, SyntheticClassSession[]>;
}

export function buildSchedule(config: SyntheticStudioConfig): StudioSchedule {
  const stream = makeStream(config.seed, "schedule");
  const instructors: SyntheticInstructor[] = INSTRUCTOR_NAMES.map(
    (displayName, i) => ({ id: makeId("instructor", i + 1), displayName }),
  );
  const classTypes: SyntheticClassType[] = CLASS_TYPES.map((t, i) => ({
    id: makeId("class-type", i + 1),
    ...t,
  }));

  // Bigger studios run more of the daily slots; derived from config, not
  // from draws, so slot count is stable per configuration.
  const slotsPerDay = Math.min(
    SLOT_TIMES.length,
    Math.max(4, 4 + Math.floor(config.memberCount / 60)),
  );
  /* Take the most-used times first, then put them back in clock order.
   *
   * PLAIN COMPARISON, NOT localeCompare. These are "HH:MM" strings and
   * every locale agrees about digits, so this changes no byte of any
   * bundle — verified across four configurations before and after. It is
   * changed anyway because localeCompare reads the RUNTIME'S LOCALE, and
   * this engine's whole promise is that a seed produces the same studio
   * everywhere. It already refuses to read a clock or an unseeded random
   * source for that reason; the machine's language settings are the same
   * kind of outside state, and the suite audits for it now. */
  const openSlots: readonly string[] = SLOT_PRIORITY.slice(0, slotsPerDay)
    .slice()
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const rooms = roomsPerSlot(config.memberCount);
  const asOfDay = dayNumberOf(config.asOfDate);
  const firstDay = asOfDay - config.historyDays;
  const lastDay = asOfDay + 14;

  const sessions: SyntheticClassSession[] = [];
  const sessionsByDate = new Map<string, SyntheticClassSession[]>();
  let n = 0;
  for (let day = firstDay; day <= lastDay; day += 1) {
    const date = dateOfDayNumber(day);
    const todays: SyntheticClassSession[] = [];
    for (let slot = 0; slot < openSlots.length; slot += 1) {
      for (let room = 0; room < rooms; room += 1) {
        const type = classTypes[(day + slot + room * 2) % classTypes.length];
        const instructor = instructors[(day * 2 + slot + room) % instructors.length];
        if (!type || !instructor) continue;
        n += 1;
        // A small share of past sessions were canceled — they carry no
        // bookings or attendance.
        const canceled = day < asOfDay && stream.chance(0.02);
        todays.push({
          id: makeId("class-session", n),
          classTypeId: type.id,
          instructorId: instructor.id,
          startsAt: `${date}T${openSlots[slot] ?? "12:00"}:00`,
          durationMinutes: type.durationMinutes,
          capacity: type.capacity,
          status: canceled ? "canceled" : day < asOfDay ? "completed" : "scheduled",
        });
      }
    }
    sessions.push(...todays);
    sessionsByDate.set(date, todays);
  }
  return { instructors, classTypes, sessions, sessionsByDate };
}
