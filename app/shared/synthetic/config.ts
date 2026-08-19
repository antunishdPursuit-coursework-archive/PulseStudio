/* Generator configuration — deterministic by construction. TEAM-OWNED.
 *
 * Identical configuration produces identical logical output. The pure
 * engine never reads the runtime clock: asOfDate always arrives as data.
 * (The reporting page may prefill today's date — that is the UI layer,
 * not the engine.)
 */

import type { SyntheticMode } from "./contracts.js";
import { makeStream } from "./random.js";

export const GENERATOR_VERSION = "1.0.0";

export interface SyntheticStudioConfig {
  generatorVersion: string;
  seed: string;
  asOfDate: string; // strict YYYY-MM-DD
  timezone: string;
  memberCount: number; // 1..500
  historyDays: number; // 90..730 — boundary cohorts need >= 61 + prior window
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
  facilityCapacity: 30,
  mode: "clean",
};

/** Returns problems; empty means valid. generateStudio throws on any. */
export function validateConfig(config: SyntheticStudioConfig): string[] {
  const problems: string[] = [];
  if (config.seed.trim() === "") problems.push("seed must be non-empty");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(config.asOfDate)) {
    problems.push(`asOfDate must be strict YYYY-MM-DD, got "${config.asOfDate}"`);
  }
  if (config.timezone.trim() === "") problems.push("timezone must be non-empty");
  if (
    !Number.isInteger(config.memberCount) ||
    config.memberCount < 1 ||
    config.memberCount > 500
  ) {
    problems.push(`memberCount must be an integer 1..500, got ${config.memberCount}`);
  }
  if (
    !Number.isInteger(config.historyDays) ||
    config.historyDays < 90 ||
    config.historyDays > 730
  ) {
    problems.push(`historyDays must be an integer 90..730, got ${config.historyDays}`);
  }
  if (
    config.facilityCapacity !== undefined &&
    (!Number.isInteger(config.facilityCapacity) || config.facilityCapacity < 16)
  ) {
    problems.push("facilityCapacity must be an integer >= 16 when given");
  }
  if (!["clean", "edge-cases", "scale"].includes(config.mode)) {
    problems.push(`mode must be clean | edge-cases | scale, got "${config.mode}"`);
  }
  return problems;
}
