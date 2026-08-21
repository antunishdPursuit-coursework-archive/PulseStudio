/* Pulse Studio — the studio the shared sign-in lists. TEAM-OWNED.

   Product A books against generateStudio() with DEFAULT_CONFIG and today's
   studio-local date. The sign-in dialog must list those same people, with
   those same member ids, so a top-bar session is a valid booking identity.
   This module is that one directory: one generator call, cached, reused. */

import { DEFAULT_CONFIG } from "../synthetic/config.js";
import type { SyntheticDataset, SyntheticMember } from "../synthetic/contracts.js";
import { generateStudio } from "../synthetic/generate.js";

function studioDate(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DEFAULT_CONFIG.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
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
