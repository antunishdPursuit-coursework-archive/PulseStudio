/* Pulse Studio — the studio the shared sign-in lists. TEAM-OWNED.

   Product A books against generateStudio() with DEFAULT_CONFIG and today's
   studio-local date. The sign-in dialog must list those same people, with
   those same member ids, so a top-bar session is a valid booking identity.
   This module is that one directory: one generator call, cached, reused. */

import { DEFAULT_CONFIG } from "../synthetic/config.js";
import type { SyntheticDataset, SyntheticMember } from "../synthetic/contracts.js";
import { generateStudio } from "../synthetic/generate.js";
import { todayIsoInZone } from "../today.js";

/* Was its own hand-assembled formatToParts copy. One of the three modules
 * that wrote this rule got it wrong, so there is one implementation now —
 * see app/shared/today.ts. */
function studioDate(): string {
  return todayIsoInZone(DEFAULT_CONFIG.timezone);
}

let cached: SyntheticDataset | undefined;

export function sharedStudio(): SyntheticDataset {
  cached ??= generateStudio({
    ...DEFAULT_CONFIG,
    asOfDate: studioDate(),
  }).dataset;
  return cached;
}

const filled = new Map<number, SyntheticDataset>();

/** THE SAME STUDIO, WITH UPCOMING CLASSES TOPPED UP — and nothing else
 *  changed. This exists because of the one hand-off on the story map that
 *  was red: the dashboard generated its OWN studio (its own seed, its own
 *  frozen date), so no class id it knew about was a class id Product A had
 *  ever booked, and every real reservation arrived as "outside the current
 *  schedule". Measured 2026-08-20: 0 shared class ids out of 75.
 *
 *  The dashboard was not being careless. It wanted a week that looks like a
 *  studio's real week, and the shared studio's upcoming classes run at 6%
 *  mean occupancy — a page of empty rooms. `upcomingFillTarget` is the knob
 *  for that, and it turned out to cost nothing: generating with and without
 *  it on 2026-08-23 produced 1,900 of 1,900 sessions IDENTICAL in id, start
 *  time, class type and status. It seats members; it does not touch the
 *  schedule. So a product can have the fuller week and the shared ids at
 *  once, which is why this takes ONE argument and not a config object —
 *  seed, date, history and size are the four things that move an id, and
 *  none of them is offered here. */
export function sharedStudioWithFill(upcomingFillTarget: number): SyntheticDataset {
  const existing = filled.get(upcomingFillTarget);
  if (existing !== undefined) return existing;
  const dataset = generateStudio({
    ...DEFAULT_CONFIG,
    asOfDate: studioDate(),
    upcomingFillTarget,
  }).dataset;
  filled.set(upcomingFillTarget, dataset);
  return dataset;
}

export function sharedStudioMembers(): SyntheticMember[] {
  return sharedStudio().members;
}
