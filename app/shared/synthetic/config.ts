/* Generator configuration — deterministic by construction. TEAM-OWNED.
 *
 * Identical configuration produces identical logical output. The pure
 * engine never reads the runtime clock: asOfDate always arrives as data.
 * (The reporting page may prefill today's date — that is the UI layer,
 * not the engine.)
 */

import type { SyntheticMode } from "./contracts.js";
import { makeStream } from "./random.js";
import { isStrictDate } from "./normalize.js";

export const GENERATOR_VERSION = "1.0.0";

export interface SyntheticStudioConfig {
  generatorVersion: string;
  seed: string;
  asOfDate: string; // strict YYYY-MM-DD
  timezone: string;
  memberCount: number; // 1..2000 — total customers across the whole history
  historyDays: number; // 90..1900 — up to five years and change
  facilityCapacity?: number;
  mode: SyntheticMode;
}

/** The studio's own size, derived deterministically from the seed. In the
 *  real world nobody decides "my gym has exactly N people" — the studio is
 *  the size it is. Callers who need exact control (the proof suite, scale
 *  runs) still pass memberCount explicitly; everyone else lets the seed
 *  decide. Same seed, same size, forever. */
export function organicMemberCount(seed: string): number {
  return makeStream(seed, "population").int(35, 220);
}

export const DEFAULT_CONFIG: SyntheticStudioConfig = {
  generatorVersion: GENERATOR_VERSION,
  seed: "pulse-shared-0001",
  asOfDate: "2026-08-19",
  timezone: "America/New_York",
  memberCount: 60,
  historyDays: 180,
  mode: "clean",
};

/** Returns problems; empty means valid. generateStudio throws on any. */
export function validateConfig(config: SyntheticStudioConfig): string[] {
  const problems: string[] = [];
  if (config.seed.trim() === "") problems.push("seed must be non-empty");
  if (!isStrictDate(config.asOfDate)) {
    // Strict means the real calendar, not the regex: 2026-02-30 is not a date.
    problems.push(`asOfDate must be a real calendar date, got "${config.asOfDate}"`);
  }
  if (config.timezone.trim() === "") problems.push("timezone must be non-empty");
  if (
    !Number.isInteger(config.memberCount) ||
    config.memberCount < 1 ||
    config.memberCount > 2000
  ) {
    problems.push(`memberCount must be an integer 1..2000, got ${config.memberCount}`);
  }
  if (
    !Number.isInteger(config.historyDays) ||
    config.historyDays < 90 ||
    config.historyDays > 1900
  ) {
    problems.push(`historyDays must be an integer 90..1900, got ${config.historyDays}`);
  }
  if (
    config.facilityCapacity !== undefined &&
    (!Number.isInteger(config.facilityCapacity) ||
      config.facilityCapacity < 16 ||
      config.facilityCapacity > 500)
  ) {
    // The building holds at most 500 people at once — a hard physical
    // ceiling, regardless of how many customers the history contains.
    problems.push("facilityCapacity must be an integer 16..500 when given");
  }
  if (!["clean", "edge-cases", "scale"].includes(config.mode)) {
    problems.push(`mode must be clean | edge-cases | scale, got "${config.mode}"`);
  }
  return problems;
}
