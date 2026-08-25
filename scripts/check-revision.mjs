#!/usr/bin/env node
/* Pulse Studio — the revision gate. TEAM-OWNED.
 *
 * WHY THIS EXISTS: a deployed instance now claims to know exactly which
 * commit it is running — `scripts/stamp-revision.mjs` burns `git rev-parse
 * HEAD` into `app/shared/revision.ts` at build time, and `scripts/
 * start-haiku.mjs` serves it from `GET /api/chat`. A claim like that is
 * only as good as what happens when it is WRONG: a build run outside a git
 * checkout, a hand-edited stamp, a proxy handing back an error page instead
 * of the value something expected — any of those must be treated as
 * ABSENT, never reported as if it were a real commit. This gate is what
 * proves the validator both sides import (`scripts/revision.mjs`) actually
 * draws that line, and that the value this build actually stamped is one
 * of the good cases rather than one of the bad ones.
 *
 * NEEDS A BUILD, the same way check-contrast.mjs and check-brand.mjs do: it
 * imports the COMPILED `app/shared/revision.js` — the exact module the
 * server reads — rather than re-deriving what the build step should have
 * produced. `npm run build` (and `npm run check`, which runs `tsc` for the
 * same reason the git law names) runs `scripts/stamp-revision.mjs` first,
 * so the file exists by the time this gate runs inside `npm run check`.
 *
 * HONEST LIMITS: it reads the CURRENT compiled value, once. It cannot tell
 * you whether the value matches the commit you think you are on — only
 * that whatever was stamped is shaped like a real commit SHA. Whether it
 * is the RIGHT one is what `git log` is for.
 *
 * Run: node scripts/check-revision.mjs   (also runs inside `npm run check`)
 * Prove it still works: node scripts/check-revision.mjs --self-test
 */

import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { isCommand } from "./is-command.mjs";
import { isValidRevision } from "./revision.mjs";

/* Ten gates carried their own copy of this test and all ten were wrong the
 * same way: reached through a symlink the guard went false and the gate
 * exited 0 having checked nothing. See scripts/is-command.mjs. */
const IS_COMMAND = isCommand(import.meta.url);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ---------- the self-test ---------- */

async function selfTest() {
  const planted = [
    { label: "a well-formed 40-hex commit SHA passes", value: "a".repeat(40), want: true },
    { label: "a real-looking mixed-digit SHA passes", value: "4f9c613bd2e1a08f7c56091234abcd5678ef9012", want: true },
    { label: "a short SHA fails", value: "a".repeat(7), want: false },
    { label: "a 39-character string fails, one short of the mark", value: "a".repeat(39), want: false },
    { label: "a 41-character string fails, one over the mark", value: "a".repeat(41), want: false },
    { label: '"unknown" fails', value: "unknown", want: false },
    { label: '"dev" fails', value: "dev", want: false },
    { label: "a blank string fails", value: "", want: false },
    { label: "whitespace alone fails", value: "   ", want: false },
    {
      label: "an HTML fragment — a proxy or error-page fallback — fails",
      value: "<html><body>502 Bad Gateway</body></html>",
      want: false,
    },
    { label: "upper-case hex fails — git itself only ever prints lowercase", value: "A".repeat(40), want: false },
    { label: "a non-hex character among otherwise valid hex fails", value: `${"a".repeat(39)}g`, want: false },
    { label: "null is not a revision", value: null, want: false },
    { label: "undefined is not a revision", value: undefined, want: false },
    { label: "a number is not a revision", value: 123, want: false },
  ];

  let failed = 0;
  for (const c of planted) {
    const got = isValidRevision(c.value);
    if (got !== c.want) {
      failed += 1;
      console.error(`  self-test MISS — ${c.label}: wanted ${c.want}, got ${got}`);
    }
  }

  /* The real compiled module has to give a value THIS validator accepts,
   * or the gate below is measuring nothing. */
  let liveCases = 0;
  const compiled = join(ROOT, "app/shared/revision.js");
  if (existsSync(compiled)) {
    liveCases = 1;
    try {
      const mod = await import(pathToFileURL(compiled).href);
      if (!isValidRevision(mod.REVISION)) {
        failed += 1;
        console.error(
          `  self-test MISS — app/shared/revision.js currently exports ${JSON.stringify(mod.REVISION)}, ` +
            "which this validator does not accept as a real commit SHA",
        );
      }
    } catch (error) {
      failed += 1;
      console.error(`  self-test MISS — could not read app/shared/revision.js: ${error.message}`);
    }
  }

  const total = planted.length + liveCases;
  console.log(`self-test: ${total} planted cases, ${total - failed} behaved, ${failed} did not.`);
  console.log(
    failed === 0
      ? "self-test PASSED — the gate can still fail."
      : "self-test FAILED — the gate is blind.",
  );
  process.exit(failed === 0 ? 0 : 1);
}

/* ---------- the gate ---------- */

async function run() {
  const compiled = join(ROOT, "app/shared/revision.js");
  if (!existsSync(compiled)) {
    console.error(
      "check-revision: app/shared/revision.js is missing. This gate reads the compiled module the server " +
        "actually imports, rather than re-deriving what the build should have produced — run `npm run build` " +
        "first, which stamps app/shared/revision.ts from `git rev-parse HEAD` before `tsc` compiles it.",
    );
    process.exit(1);
  }

  let revision;
  try {
    ({ REVISION: revision } = await import(pathToFileURL(compiled).href));
  } catch (error) {
    console.error(`check-revision: could not import app/shared/revision.js — ${error.message}`);
    process.exit(1);
  }

  console.log(`check-revision: app/shared/revision.js currently reports ${JSON.stringify(revision)}.`);

  if (!isValidRevision(revision)) {
    console.error(
      `check-revision: ${JSON.stringify(revision)} is not a full 40-character lowercase hex commit SHA. ` +
        "A deployed instance must never report a value like this as its revision — blank, \"dev\", " +
        '"unknown", a short SHA, or an HTML fragment must all read as absent, never as a real commit. ' +
        "Run `npm run build` inside a git checkout with at least one commit.",
    );
    process.exit(1);
  }

  console.log("check-revision: the stamped build revision is a well-formed 40-hex commit SHA. PASS");
}

if (IS_COMMAND) {
  if (process.argv.includes("--self-test")) await selfTest();
  else await run();
}
