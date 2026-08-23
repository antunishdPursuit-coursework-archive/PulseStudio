/* Pulse Studio — Product D — the at-home routine vocabulary. RENSLEY'S LANE.
 *
 * WHAT THIS IS. A small, closed vocabulary for routines a member can do at
 * home, offered beside an outreach draft so a staff member may include one.
 * It is D-OWNED on purpose: nothing outside this product imports it, no
 * shared contract changed, and no class-type id was invented.
 *
 * THE RULE THIS FILE EXISTS TO PROTECT. Product D asserts only facts its
 * records support, and treats missing information as unknown. A routine is
 * NOT a fact about a member — no field in this data says what physical
 * activity suits anybody. So the whole module is built so that D can never
 * make that claim:
 *
 *  - It FILTERS, it never RANKS. `routinesForInterest` returns the canonical
 *    list with entries removed, in canonical order. A filtered list that
 *    came back reordered would be a recommendation wearing a filter's coat,
 *    and the suite asserts the subsequence property so it cannot drift.
 *  - It never SELECTS. Nothing here picks a routine; a person does.
 *  - Its only link to a member is OBSERVED CLASS INTEREST — that they went
 *    to yoga, which the attendance records do say. Never age, membership
 *    tier, booking behaviour, instructor, or how far attendance has fallen.
 *  - Matching is EXACT. `normalizeClassInterest` folds case and whitespace
 *    and then looks the name up. It does not guess. "Vinyasa Flow" is
 *    unknown until somebody writes the alias down, because a near-match is
 *    a judgement about a class nobody made.
 *
 * APPROVAL IS AN ASSERTION, NOT DECORATION. `approvedAt` claims a human read
 * this text on that date. It must never be generated, and changing a step,
 * an instruction, a difficulty or the safety notice invalidates it — set the
 * status back to "draft". Be clear-eyed about the limit: `approvedBy` is a
 * label typed by whoever edited the file. There is no staff identity system
 * in this repo (sign-in is a persona chooser, not authentication), so this
 * is provenance by convention, not by mechanism.
 */

import { identityKey } from "./csv.js";
import { counted, todayIsoInZone } from "./deps.js";

/** The studio's own zone — the same one every threshold in D is measured in. */
const STUDIO_TIMEZONE = "America/New_York";

export type RoutineInterest =
  | "yoga" | "pilates" | "strength" | "mobility" | "cardio" | "hiit" | "general";

export type RoutineDifficulty = "gentle" | "standard" | "challenging";

/** `draft` is never browsable and never resolvable by URL — unapproved
 *  content is not published. `retired` is never listed but STAYS resolvable,
 *  because somebody may be holding the link. */
export type RoutineStatus = "draft" | "approved" | "retired";

export interface RoutineStep {
  id: string;
  title: string;
  instruction: string;
  /** A step is TIMED or COUNTED — exactly one. Both, or neither, is refused. */
  durationSeconds?: number;
  repetitions?: number;
  restSeconds?: number;
  easierOption?: string;
  caution?: string;
}

export interface HomeRoutine {
  id: string;
  title: string;
  summary: string;
  purpose: string;
  durationMinutes: number;
  difficulty: RoutineDifficulty;
  /** `[]` means NONE NEEDED. It never means unknown. */
  equipment: string[];
  /** A browsing relationship, not evidence about a person. */
  interestKeys: RoutineInterest[];
  steps: RoutineStep[];
  approvedBy: string;
  approvedAt: string;
  safetyNotice: string;
  status: RoutineStatus;
}

export const UNKNOWN_INTEREST = "unknown";
export type ClassInterest = RoutineInterest | typeof UNKNOWN_INTEREST;

const INTEREST_KEYS: readonly RoutineInterest[] = [
  "yoga", "pilates", "strength", "mobility", "cardio", "hiit", "general",
];

/* EXACT MATCH ONLY, and the keys are already folded the way identityKey
 * folds them: lower case, single spaces. Adding a studio's own class name
 * means adding a line here — deliberately, so that the mapping is a decision
 * somebody made rather than a similarity score. */
export const CLASS_INTEREST_ALIASES: Record<string, RoutineInterest> = {
  "yoga": "yoga",
  "vinyasa": "yoga",
  "hatha": "yoga",
  "pilates": "pilates",
  "reformer": "pilates",
  "strength": "strength",
  "strength training": "strength",
  "weights": "strength",
  "lifting": "strength",
  "mobility": "mobility",
  "stretch": "mobility",
  "flexibility": "mobility",
  "cardio": "cardio",
  "cycling": "cardio",
  "spin": "cardio",
  "running": "cardio",
  "hiit": "hiit",
  "circuit": "hiit",
};

/** The member's observed class type, folded and looked up. Unknown stays
 *  unknown — a name that merely CONTAINS an alias does not match. */
export function normalizeClassInterest(raw: string | null): ClassInterest {
  if (raw === null) return UNKNOWN_INTEREST;
  const key = identityKey(raw);
  if (key === "") return UNKNOWN_INTEREST;
  return CLASS_INTEREST_ALIASES[key] ?? UNKNOWN_INTEREST;
}

/* ---------- validation: refuse, never truncate ---------- */

const ROUTINE_ID = /^routine-[a-z0-9]+(-[a-z0-9]+)*$/;
const STEP_ID = /^step-[a-z0-9-]{1,24}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(iso: string): boolean {
  if (!ISO_DATE.test(iso)) return false;
  /* Round-tripping is what catches 2026-02-31: Date accepts it and reports
   * a different day back. This is arithmetic on a calendar date, not a
   * clock read. */
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

function textProblem(label: string, value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return `${label} must be text`;
  const t = value.trim();
  if (t.length < min) return `${label} is empty`;
  if (t.length > max) return `${label} is longer than ${max} characters`;
  return null;
}

function intProblem(label: string, value: unknown, min: number, max: number): string | null {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return `${label} must be a whole number`;
  }
  if (value < min || value > max) return `${label} must be between ${min} and ${max}`;
  return null;
}

function stepProblems(step: unknown, index: number): string[] {
  const out: string[] = [];
  const where = `step ${index + 1}`;
  if (typeof step !== "object" || step === null) return [`${where} is not a step`];
  const s = step as Record<string, unknown>;

  if (typeof s["id"] !== "string" || !STEP_ID.test(s["id"])) {
    out.push(`${where} needs an id like "step-warmup"`);
  }
  for (const [key, min, max] of [["title", 1, 60], ["instruction", 1, 400]] as const) {
    const p = textProblem(`${where} ${key}`, s[key], min, max);
    if (p !== null) out.push(p);
  }

  /* TIMED OR COUNTED, EXACTLY ONE. A step that is both is ambiguous to
   * whoever reads it out; a step that is neither cannot be followed. */
  /* NOT named `counted`: that is the shared phrase helper imported above,
   * and a local of the same name shadows it inside this function. Harmless
   * today because nothing here formats a count — which is exactly how that
   * kind of trap survives to bite the next edit. */
  const isTimed = s["durationSeconds"] !== undefined;
  const isCounted = s["repetitions"] !== undefined;
  if (isTimed === isCounted) {
    out.push(`${where} must give either a duration or a repetition count, not both and not neither`);
  }
  if (isTimed) {
    const p = intProblem(`${where} duration`, s["durationSeconds"], 5, 600);
    if (p !== null) out.push(p);
  }
  if (isCounted) {
    const p = intProblem(`${where} repetitions`, s["repetitions"], 1, 100);
    if (p !== null) out.push(p);
  }
  if (s["restSeconds"] !== undefined) {
    const p = intProblem(`${where} rest`, s["restSeconds"], 0, 300);
    if (p !== null) out.push(p);
  }
  for (const key of ["easierOption", "caution"] as const) {
    if (s[key] === undefined) continue;
    const p = textProblem(`${where} ${key}`, s[key], 1, 200);
    if (p !== null) out.push(p);
  }
  /* NULL IS NOT A VALUE HERE. D already uses null to mean "we know there is
   * nothing" — reusing it for "not applicable" would collapse two different
   * answers, which is the mistake that once printed "your last class class".
   * An optional field is OMITTED. */
  for (const key of ["durationSeconds", "repetitions", "restSeconds", "easierOption", "caution"] as const) {
    if (s[key] === null) out.push(`${where} ${key} is null — omit it instead`);
  }
  return out;
}

/** Everything wrong with one routine, in the words a person would fix it by.
 *  An empty array means it is well-formed. */
export function routineProblems(
  routine: unknown,
  todayIso: string = todayIsoInZone(STUDIO_TIMEZONE),
): string[] {
  const out: string[] = [];
  if (typeof routine !== "object" || routine === null) return ["not a routine"];
  const r = routine as Record<string, unknown>;

  if (typeof r["id"] !== "string" || !ROUTINE_ID.test(r["id"]) ||
      r["id"].length < 8 || r["id"].length > 40) {
    out.push('id must look like "routine-gentle-morning" (8-40 characters)');
  }
  for (const [key, min, max] of [
    ["title", 1, 80], ["summary", 1, 200], ["purpose", 1, 200],
    ["approvedBy", 1, 80], ["safetyNotice", 1, 400],
  ] as const) {
    const p = textProblem(key, r[key], min, max);
    if (p !== null) out.push(p);
  }
  const dur = intProblem("durationMinutes", r["durationMinutes"], 3, 90);
  if (dur !== null) out.push(dur);

  if (!["gentle", "standard", "challenging"].includes(String(r["difficulty"]))) {
    out.push("difficulty must be gentle, standard or challenging");
  }
  if (!["draft", "approved", "retired"].includes(String(r["status"]))) {
    out.push("status must be draft, approved or retired");
  }

  const equipment = r["equipment"];
  if (!Array.isArray(equipment) || equipment.length > 8) {
    out.push("equipment must be a list of at most 8 items ([] means none needed)");
  } else {
    for (const item of equipment) {
      const p = textProblem("an equipment item", item, 1, 40);
      if (p !== null) out.push(p);
    }
  }

  const keys = r["interestKeys"];
  if (!Array.isArray(keys) || keys.length < 1 || keys.length > 7) {
    out.push('interestKeys needs 1 to 7 entries — use "general" when nothing narrower fits');
  } else {
    for (const k of keys) {
      if (!INTEREST_KEYS.includes(k as RoutineInterest)) out.push(`${String(k)} is not an interest key`);
    }
    if (new Set(keys).size !== keys.length) out.push("interestKeys repeats an entry");
  }

  const steps = r["steps"];
  if (!Array.isArray(steps) || steps.length < 1 || steps.length > 30) {
    out.push("a routine needs between 1 and 30 steps");
  } else {
    steps.forEach((step, i) => out.push(...stepProblems(step, i)));
    const ids = steps.map((s) => (s as Record<string, unknown>)?.["id"]).filter((x) => typeof x === "string");
    if (new Set(ids).size !== ids.length) out.push("two steps share an id");
  }

  /* An approval date is an ASSERTION that a person read this on that day.
   * A date that has not happened yet cannot be one. */
  const approvedAt = r["approvedAt"];
  if (typeof approvedAt !== "string" || !isRealDate(approvedAt)) {
    out.push("approvedAt must be a real date written YYYY-MM-DD");
  } else if (approvedAt > todayIso) {
    out.push(`approvedAt is ${approvedAt}, which has not happened yet`);
  }
  return out;
}

/* ---------- ordering ---------- */

/** ONE canonical order, everywhere: shortest first, then title, then id.
 *
 *  PLAIN COMPARISON, NOT localeCompare. The shared engine forbids
 *  locale-dependent ordering outright, because localeCompare reads the
 *  runtime's language and two people can then see two different orders from
 *  the same data. The same reasoning applies here, where a different order
 *  could read as a different recommendation. */
export function compareRoutines(a: HomeRoutine, b: HomeRoutine): number {
  if (a.durationMinutes !== b.durationMinutes) return a.durationMinutes - b.durationMinutes;
  if (a.title !== b.title) return a.title < b.title ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

/* ---------- the library ---------- */

export interface LoadedLibrary {
  routines: HomeRoutine[];
  problems: string[];
}

/** Validate a whole library. A malformed or repeated entry is REPORTED and
 *  withheld, never quietly resolved.
 *
 *  DUPLICATE IDS DROP BOTH COPIES. Keeping the last one is how a pipe in a
 *  CSV class name once merged two sessions and produced a draft naming a
 *  class the member never took. If two entries claim one id, neither can be
 *  trusted to be the one a URL or a ledger entry meant. */
export function loadLibrary(
  entries: readonly unknown[],
  todayIso: string = todayIsoInZone(STUDIO_TIMEZONE),
): LoadedLibrary {
  const problems: string[] = [];
  const wellFormed: HomeRoutine[] = [];

  entries.forEach((entry, i) => {
    const found = routineProblems(entry, todayIso);
    if (found.length > 0) {
      const id = (entry as Record<string, unknown> | null)?.["id"];
      const where = typeof id === "string" ? id : `entry ${i + 1}`;
      for (const p of found) problems.push(`${where}: ${p}`);
      return;
    }
    wellFormed.push(entry as HomeRoutine);
  });

  const seen = new Map<string, number>();
  for (const r of wellFormed) seen.set(r.id, (seen.get(r.id) ?? 0) + 1);
  const duplicated = new Set([...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id));
  for (const id of [...duplicated].sort()) {
    problems.push(`${id}: two routines claim this id, so neither is offered`);
  }

  return {
    routines: wellFormed.filter((r) => !duplicated.has(r.id)).sort(compareRoutines),
    problems,
  };
}

/** Everything a staff member may browse: approved only, canonical order. */
export function approvedRoutines(lib: LoadedLibrary): HomeRoutine[] {
  return lib.routines.filter((r) => r.status === "approved");
}

/** The approved list with entries REMOVED — never reordered, never scored.
 *  An unknown interest shows everything rather than guessing, which is the
 *  same rule D follows when a record is silent: say so, do not invent. */
export function routinesForInterest(
  lib: LoadedLibrary,
  interest: ClassInterest,
): HomeRoutine[] {
  const all = approvedRoutines(lib);
  if (interest === UNKNOWN_INTEREST) return all;
  return all.filter((r) => r.interestKeys.includes(interest));
}

/** Resolve one routine by id, for the public routine page.
 *
 *  Approved and retired resolve; a DRAFT does not, because unapproved
 *  content is not published, and an unknown id does not. The page states
 *  which case it is rather than showing an empty frame. */
export function findRoutine(lib: LoadedLibrary, id: string): HomeRoutine | null {
  const found = lib.routines.find((r) => r.id === id) ?? null;
  if (found === null || found.status === "draft") return null;
  return found;
}

/* ---------- what the panel shows ---------- */

/** Everything the routine panel needs, decided here rather than in main.ts.
 *
 *  This is a RULE, not markup, and D's own brief says rules move somewhere a
 *  check can load — the remedy that found two bugs in two extractions when
 *  it was applied to main.ts before. main.ts builds elements from this; it
 *  decides nothing. */
export interface RoutinePanelView {
  /** The count line. Says what it checked even when the answer is nothing. */
  heading: string;
  /** Why a filter is on, in words, or null when it is not. */
  filterLabel: string | null;
  /** Whether a filter COULD be offered — false when nothing is recorded. */
  filterAvailable: boolean;
  routines: HomeRoutine[];
}

export function routinePanelView(
  lib: LoadedLibrary,
  interest: ClassInterest,
  filterOn: boolean,
): RoutinePanelView {
  const approved = approvedRoutines(lib);
  /* NOTHING APPROVED IS A RESULT, NOT A BLANK. The language law asks a
   * screen with nothing to show to say what it checked. */
  if (approved.length === 0) {
    return {
      heading: "0 approved routines. Nothing to include yet.",
      filterLabel: null,
      filterAvailable: false,
      routines: [],
    };
  }
  const filterAvailable = interest !== UNKNOWN_INTEREST;
  const active = filterOn && filterAvailable;
  const shown = active ? routinesForInterest(lib, interest) : approved;
  return {
    heading: counted(shown.length, "approved routine"),
    /* The filter names the RECORD it came from — that this member attended
     * these classes — and never suggests the routines suit them. */
    filterLabel: active
      ? `Related to classes this member has attended (${interest})`
      : filterAvailable
        ? null
        : "No class interest recorded — showing all approved routines",
    filterAvailable,
    routines: shown,
  };
}
