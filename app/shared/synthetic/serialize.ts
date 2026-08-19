/* Serialization — bytes out, the same meaning back in. TEAM-OWNED.
 *
 * Stable, human-readable JSON. parseBundle checks the top-level shape —
 * every required collection present — and throws a named reason otherwise.
 * It does NOT retype every row; validateBundle is the deep gate, and a
 * parsed bundle should be validated before anything trusts it.
 */

import type { GeneratedStudioBundle } from "./contracts.js";

export function serializeBundle(bundle: GeneratedStudioBundle): string {
  return JSON.stringify(bundle, null, 2);
}

export function parseBundle(text: string): GeneratedStudioBundle {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `not JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (typeof raw !== "object" || raw === null) {
    throw new Error("not a bundle: top level is not an object");
  }
  const bundle = raw as GeneratedStudioBundle;
  const missing: string[] = [];
  if (typeof bundle.dataset !== "object" || bundle.dataset === null) {
    missing.push("dataset");
  } else {
    for (const key of [
      "meta",
      "studio",
      "members",
      "memberships",
      "instructors",
      "classTypes",
      "classSessions",
      "bookings",
      "attendance",
      "studioPolicies",
    ] as const) {
      if (bundle.dataset[key] === undefined) missing.push(`dataset.${key}`);
    }
  }
  if (typeof bundle.truth !== "object" || bundle.truth === null) {
    missing.push("truth");
  }
  if (missing.length > 0) {
    throw new Error(`not a bundle: missing ${missing.join(", ")}`);
  }
  return bundle;
}
