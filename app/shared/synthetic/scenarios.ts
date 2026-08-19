/* Cohorts and scenario planning — behavior by intent, not uniform noise. TEAM-OWNED.
 *
 * Every member is assigned one cohort with explicit behavioral intent:
 * how often they used to come, when they last attended (the anchor), how
 * their membership evolved, their no-show tendency. The anchor is the
 * heart of the design — it is placed FIRST during generation and later
 * fills happen strictly earlier, so a member's realized last-attended date
 * always equals the plan. Truth metadata is then intent, and validation
 * can hold the generated records to it.
 *
 * Product D boundary members are guaranteed at exactly 14, 15, 60 and 61
 * quiet days whenever the population allows.
 */

import type { SyntheticStudioConfig } from "./config.js";
import { makeStream, type Stream } from "./random.js";

export type MembershipKind =
  | "steady"
  | "newcomer"
  | "paused"
  | "resumed"
  | "canceled";

export interface CohortPlan {
  cohortKey: string;
  membershipKind: MembershipKind;
  /** Days before asOfDate of the last ATTENDED class; null = never attended. */
  anchorDaysAgo: number | null;
  /** Historical attendance density while active. */
  cadencePerWeek: number;
  noShowRate: number;
  walkInRate: number;
  /** Preference flips for the older half of their history. */
  switchesPreference: boolean;
  nameKind: "pool" | "unicode" | "shared";
  sharedNameGroup: number | null;
  futureBookings: number;
  /** membershipKind parameters, in days before asOfDate. */
  pauseStartDaysAgo: number | null;
  pauseLengthDays: number | null;
  cancelDaysAgo: number | null;
  joinDaysAgo: number;
  /** Attendance gap band [from, to] days ago — the returning cohort. */
  gapBand: [number, number] | null;
}

/** Priority-ordered guaranteed scenarios; weighted fill afterward. */
const SINGLETONS: readonly string[] = [
  "quiet-boundary-14",
  "quiet-boundary-15",
  "quiet-boundary-60",
  "quiet-boundary-61",
  "shared-name",
  "shared-name",
  "unicode-name",
  "unicode-name",
  "newcomer",
  "paused",
  "resumed",
  "canceled",
  "long-lapsed",
  "recently-quiet",
  "no-show-prone",
  "class-switcher",
  "returning",
  "regular",
  "ordinary",
];

const WEIGHTED: ReadonlyArray<[string, number]> = [
  ["regular", 0.32],
  ["ordinary", 0.2],
  ["recently-quiet", 0.12],
  ["newcomer", 0.05],
  ["long-lapsed", 0.06],
  ["paused", 0.05],
  ["resumed", 0.04],
  ["canceled", 0.05],
  ["no-show-prone", 0.05],
  ["class-switcher", 0.04],
  ["returning", 0.02],
];

export function planCohorts(config: SyntheticStudioConfig): CohortPlan[] {
  const assignStream = makeStream(config.seed, "cohorts");
  const keys: string[] = [];
  for (let i = 0; i < config.memberCount; i += 1) {
    const singleton = SINGLETONS[i];
    if (singleton !== undefined) keys.push(singleton);
    else keys.push(weightedPick(assignStream));
  }

  let sharedGroupCounter = 0;
  const plans: CohortPlan[] = [];
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i] ?? "ordinary";
    const stream = makeStream(config.seed, `cohort:${i}`);
    // The two shared-name members form one group and get contrasting
    // behavior — one healthy, one quiet — the pair Product D must tell apart.
    let sharedNameGroup: number | null = null;
    if (key === "shared-name") {
      sharedNameGroup = Math.floor(sharedGroupCounter / 2);
      sharedGroupCounter += 1;
    }
    plans.push(planFor(key, stream, config, sharedGroupCounter, sharedNameGroup, i));
  }
  return plans;
}

function weightedPick(stream: Stream): string {
  const roll = stream.next();
  let acc = 0;
  for (const [key, w] of WEIGHTED) {
    acc += w;
    if (roll < acc) return key;
  }
  return "ordinary";
}

function planFor(
  key: string,
  stream: Stream,
  config: SyntheticStudioConfig,
  sharedCount: number,
  sharedNameGroup: number | null,
  index: number,
): CohortPlan {
  const base: CohortPlan = {
    cohortKey: key,
    membershipKind: "steady",
    anchorDaysAgo: null,
    cadencePerWeek: 1.5,
    noShowRate: 0.05,
    walkInRate: 0.07,
    switchesPreference: false,
    nameKind: "pool",
    sharedNameGroup: null,
    futureBookings: 0,
    pauseStartDaysAgo: null,
    pauseLengthDays: null,
    cancelDaysAgo: null,
    joinDaysAgo: 0,
    gapBand: null,
  };

  const boundary = key.match(/^quiet-boundary-(\d+)$/);
  if (boundary) {
    base.anchorDaysAgo = Number(boundary[1]);
    base.cadencePerWeek = 1.5 + stream.next();
  } else if (key === "regular") {
    base.anchorDaysAgo = stream.int(1, 12);
    base.cadencePerWeek = 2 + stream.next();
    base.futureBookings = stream.int(0, 2);
  } else if (key === "ordinary") {
    base.anchorDaysAgo = stream.int(2, 13);
    base.cadencePerWeek = 0.8 + stream.next() * 0.6;
    base.futureBookings = stream.int(0, 1);
  } else if (key === "recently-quiet") {
    base.anchorDaysAgo = stream.int(16, 55);
    base.cadencePerWeek = 1.5 + stream.next();
  } else if (key === "long-lapsed") {
    base.anchorDaysAgo = stream.int(75, Math.min(140, config.historyDays - 40));
    base.cadencePerWeek = 1 + stream.next();
  } else if (key === "newcomer") {
    base.membershipKind = "newcomer";
    base.joinDaysAgo = stream.int(5, 21);
    base.futureBookings = stream.int(0, 1);
  } else if (key === "paused") {
    base.membershipKind = "paused";
    base.pauseStartDaysAgo = stream.int(10, 45);
    base.anchorDaysAgo = base.pauseStartDaysAgo + stream.int(1, 10);
  } else if (key === "resumed") {
    base.membershipKind = "resumed";
    base.pauseStartDaysAgo = stream.int(60, 90);
    base.pauseLengthDays = stream.int(20, 40);
    base.anchorDaysAgo = stream.int(1, 9);
    base.cadencePerWeek = 1.5 + stream.next();
  } else if (key === "canceled") {
    base.membershipKind = "canceled";
    base.cancelDaysAgo = stream.int(20, 70);
    base.anchorDaysAgo = base.cancelDaysAgo + stream.int(1, 15);
  } else if (key === "returning") {
    base.anchorDaysAgo = stream.int(1, 6);
    base.gapBand = [25, 75];
  } else if (key === "no-show-prone") {
    base.anchorDaysAgo = stream.int(5, 20);
    base.noShowRate = 0.3;
    base.cadencePerWeek = 1 + stream.next();
  } else if (key === "class-switcher") {
    base.anchorDaysAgo = stream.int(2, 10);
    base.switchesPreference = true;
    base.cadencePerWeek = 1.5 + stream.next();
  } else if (key === "shared-name") {
    base.nameKind = "shared";
    base.sharedNameGroup = sharedNameGroup;
    // First of the pair healthy, second quiet — deterministic by parity.
    if (sharedCount % 2 === 1) {
      base.anchorDaysAgo = stream.int(2, 8);
      base.cadencePerWeek = 2 + stream.next();
    } else {
      base.anchorDaysAgo = stream.int(20, 40);
    }
  } else if (key === "unicode-name") {
    base.nameKind = "unicode";
    // First unicode member quiet (17), second healthy (3) — deterministic.
    base.anchorDaysAgo = index % 2 === 0 ? 17 : 3;
    base.cadencePerWeek = 1.5 + stream.next();
  }

  // Join long enough before the anchor that the prior-60-day window has
  // real history inside the membership.
  if (base.membershipKind !== "newcomer") {
    const anchor = base.anchorDaysAgo ?? 0;
    base.joinDaysAgo = anchor + 70 + stream.int(30, 300);
  }
  return base;
}
