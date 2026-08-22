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

export function sharedStudioMembers(): SyntheticMember[] {
  return sharedStudio().members;
}
