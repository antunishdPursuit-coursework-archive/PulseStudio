#!/usr/bin/env node
/* Pulse Studio — the Node version this repo actually needs. TEAM-OWNED.
 *
 * WHY THIS EXISTS: the gate imports compiled application modules —
 * `check-contrast.mjs` loads `app/shared/color.js` so the gate measures the
 * same arithmetic the browser runs, and `run-suites.mjs` loads each suite's
 * `tests.js`. Those are `.js` files containing `import`/`export`, in a
 * package with no `"type": "module"`. Node only reads such a file as ESM
 * from 20.19.0 (and 22.7.0 on that line), where syntax detection stopped
 * being flagged.
 *
 * Below that floor the failure is real and the message is a lie. Measured
 * on 2026-08-22 against node:20.18.3 in a container:
 *
 *   check-contrast  -> SyntaxError: Unexpected token 'export'
 *   run-suites      -> "DID NOT RUN ... Cannot use import statement outside
 *                       a module", and Node helpfully suggests setting
 *                       "type": "module" in package.json
 *
 * Both point a reader at the compiled output or at the package manifest.
 * Neither is broken. The Node is old, and nothing said so — package.json
 * declared no `engines` and the workflow pins only `node-version: 20`,
 * which resolves to the newest 20.x and so has always been fine in CI. This
 * only ever bit somebody running an older Node locally, which is the worst
 * place to spend an afternoon on a build that is not broken.
 *
 * 20.19.6 runs the whole gate green; 20.18.3 does not. That boundary is
 * measured, not read off a changelog.
 */

import { isCommand } from "./is-command.mjs";

/** The oldest Node that can read this repo's compiled `.js` modules. */
export const NODE_FLOOR = "20.19.0";

/** True when `version` (e.g. process.versions.node) is at or above the floor. */
export function meetsFloor(version, floor = NODE_FLOOR) {
  const parts = (text) => text.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const [major, minor, patch] = parts(version);
  const [fMajor, fMinor, fPatch] = parts(floor);
  if (major !== fMajor) return major > fMajor;
  if (minor !== fMinor) return minor > fMinor;
  return patch >= fPatch;
}

/** The sentence to print when an ESM import of a compiled module fails.
 *  Returns null when the running Node is fine, so the caller reports its
 *  own error instead of blaming the version for something else. */
export function nodeTooOldNote(version = process.versions.node) {
  if (meetsFloor(version)) return null;
  return (
    `This is Node ${version}, and this repo needs at least ${NODE_FLOOR}. ` +
    "The gate imports compiled `.js` modules that contain `import`/`export`, and Node only reads " +
    `those as modules from ${NODE_FLOOR}. Nothing is wrong with the build or with package.json — ` +
    'in particular do NOT add `"type": "module"`, which is what Node suggests and is not the fix here. ' +
    "Upgrade Node."
  );
}

/* ---------- the self-test ---------- */

function selfTest() {
  const planted = [
    /* The measured boundary. 20.18.3 fails the gate, 20.19.6 runs it green. */
    ["20.18.3", false], ["20.19.0", true], ["20.19.6", true],
    /* Older majors are below it however high the minor climbs. */
    ["18.20.9", false], ["19.99.99", false],
    /* Newer majors are above it however low. Node 22.0 predates 22.7, where
     * detection landed on that line — but this floor is about the 20.x
     * boundary the repo actually met, and 22.x is treated as above it
     * because that is what "major greater than 20" means here. Written down
     * because it is a real edge somebody will squint at. */
    ["22.0.0", true], ["22.22.2", true], ["24.15.0", true],
    /* Junk must not read as "new enough". */
    ["", false], ["not.a.version", false],
  ];
  let failed = 0;
  for (const [version, want] of planted) {
    const got = meetsFloor(version);
    if (got !== want) {
      failed += 1;
      console.error(`  self-test MISS — ${JSON.stringify(version)}: wanted ${want}, got ${got}`);
    }
  }
  /* The note appears only when it is true, and names the running version. */
  if (nodeTooOldNote("20.18.3") === null) {
    failed += 1;
    console.error("  self-test MISS — an old Node produced no note");
  } else if (!nodeTooOldNote("20.18.3").includes("20.18.3")) {
    failed += 1;
    console.error("  self-test MISS — the note does not name the version it saw");
  }
  if (nodeTooOldNote("22.12.0") !== null) {
    failed += 1;
    console.error("  self-test MISS — a supported Node was told it was too old");
  }
  const total = planted.length + 3;
  console.log(`self-test: ${total} planted cases, ${total - failed} behaved, ${failed} did not.`);
  console.log(
    failed === 0
      ? "self-test PASSED — the floor is measured, not guessed."
      : "self-test FAILED.",
  );
  process.exit(failed === 0 ? 0 : 1);
}

if (isCommand(import.meta.url) && process.argv.includes("--self-test")) selfTest();
