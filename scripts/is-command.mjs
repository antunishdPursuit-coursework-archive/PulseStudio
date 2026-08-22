#!/usr/bin/env node
/* Pulse Studio — "was this file run, or imported?" TEAM-OWNED.
 *
 * WHY THIS FILE EXISTS: every gate ends with
 *
 *   if (IS_COMMAND) { ... run the gate ... }
 *
 * so that a check can also be IMPORTED — the suites and the self-tests read
 * these rules as functions. Ten gates carried their own copy of the test,
 * the same three lines each, and all ten were wrong in the same way:
 *
 *   import.meta.url === pathToFileURL(process.argv[1]).href
 *
 * Node resolves `import.meta.url` to the file's REAL path. `process.argv[1]`
 * keeps whatever the caller typed. Put a symlink anywhere in that path and
 * the two stop matching, the guard goes false, and the gate defines its
 * functions and exits 0 having checked NOTHING — no output, no failure, a
 * clean green. `--self-test`, the thing the briefs tell you to run when you
 * doubt a green, sits inside the same guard and is silenced identically.
 *
 * That is the worst shape a fault can take here, and it is easy to hit:
 * macOS makes /tmp a symlink to /private/tmp, so any checkout, scratch copy
 * or worktree reached through one runs a whole `npm run check` that prints
 * nothing and reports success. GitHub's workspace is not symlinked, which is
 * why CI never showed it — this only ever bit a person.
 *
 * ONE COPY, because ten copies of a rule are ten chances to drift; the same
 * reason app/shared/color.ts exists. Fixing this in ten places would have
 * left ten places to get it wrong again.
 *
 * THE FALLBACK LEANS TOWARD RUNNING. If the realpath cannot be taken, the
 * literal comparison is tried anyway. A false negative silences a gate and
 * reports a green; a false positive makes an imported module run its checks
 * and say so out loud. Between a silent pass and a noisy surprise, this repo
 * picks noisy every time.
 *
 * Prove it still works: node scripts/is-command.mjs --self-test
 */

import { mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function isCommand(moduleUrl, argv1 = process.argv[1]) {
  if (typeof argv1 !== "string" || argv1 === "") return false;
  try {
    if (moduleUrl === pathToFileURL(realpathSync(argv1)).href) return true;
  } catch {
    /* argv[1] is not resolvable on disk. Fall through to the literal test
     * rather than concluding "not a command" — see the note above. */
  }
  return moduleUrl === pathToFileURL(argv1).href;
}

/* ---------- the self-test ---------- */

function selfTest() {
  const here = import.meta.url;
  const realHere = realpathSync(fileURLToPath(here));

  const planted = [
    { label: "run directly, by its real path", argv: realHere, want: true },
    { label: "imported, with argv[1] some other script", argv: `${realHere}.other.mjs`, want: false },
    { label: "an empty argv[1]", argv: "", want: false },
    { label: "a path that does not exist is not this module", argv: "/no/such/file.mjs", want: false },
  ];

  let failed = 0;
  for (const c of planted) {
    const got = isCommand(here, c.argv);
    if (got !== c.want) {
      failed += 1;
      console.error(`  self-test MISS — ${c.label}: wanted ${c.want}, got ${got}`);
    }
  }

  /* NO argv[1] AT ALL — `node -e`, or an embedder. This cannot be planted
   * by passing `undefined`, because that is exactly what makes a DEFAULT
   * PARAMETER fall back to process.argv[1]: the case would quietly test the
   * opposite of what it claims. The first draft of this self-test did
   * precisely that and reported a miss, which is the self-test earning its
   * place. The real argv has to be taken away instead. */
  {
    const realArgv1 = process.argv[1];
    try {
      process.argv[1] = undefined;
      if (isCommand(here) !== false) {
        failed += 1;
        console.error("  self-test MISS — no argv[1] at all: wanted false, got true");
      }
    } finally {
      process.argv[1] = realArgv1;
    }
  }

  /* THE CASE THE OLD GUARD GOT WRONG, planted so it cannot come back:
   * reaching this file through a symlink must still count as running it. */
  const dir = mkdtempSync(join(tmpdir(), "pulse-iscommand-"));
  let ranSymlinkCase = false;
  try {
    const link = join(dir, "linked.mjs");
    symlinkSync(realHere, link);
    ranSymlinkCase = true;
    if (isCommand(here, link) !== true) {
      failed += 1;
      console.error("  self-test MISS — reached through a symlink: wanted true, got false");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  if (!ranSymlinkCase) {
    failed += 1;
    console.error("  self-test MISS — the symlink case never ran, so it proved nothing");
  }

  const total = planted.length + 2;
  console.log(`self-test: ${total} planted cases, ${total - failed} behaved, ${failed} did not.`);
  console.log(
    failed === 0
      ? "self-test PASSED — a gate reached through a symlink still runs."
      : "self-test FAILED — gates can be silenced.",
  );
  process.exit(failed === 0 ? 0 : 1);
}

if (isCommand(import.meta.url) && process.argv.includes("--self-test")) selfTest();
