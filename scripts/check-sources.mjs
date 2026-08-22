#!/usr/bin/env node
/* Pulse Studio — the sources gate. TEAM-OWNED.
 *
 * WHY THIS EXISTS: `.gitignore` line 9 is `app/**\/*.js`, and the git law
 * says "Never commit compiled `.js` (it is gitignored). Build artifacts
 * create conflicts the source never had." Both are true and neither is
 * enforced: `git add -f` walks straight past an ignore rule, and nothing
 * looks afterwards. A rule nobody can check is a wish — the same sentence
 * that put check-published.mjs here.
 *
 * A tracked `.js` under `app/` is one of two things, and both are worth
 * hearing about:
 *
 *  - COMPILED OUTPUT that got committed. Two branches then edit the same
 *    generated file and conflict over bytes neither person wrote, which is
 *    exactly the collision the lane law exists to make impossible.
 *  - HAND-WRITTEN JavaScript with no `.ts` beside it. `tsconfig.json`
 *    includes only `app/**\/*.ts`, so the compiler never opens it. It
 *    ships, a browser runs it, and not one gate reads it — no types, no
 *    style pass, nothing. That is the more dangerous of the two, because
 *    it looks like ordinary working code.
 *
 * The second is not hypothetical. `app/products/b-dashboard/staff-dashboard.js`
 * is the module the staff dashboard actually loads — `index.html` names it
 * directly — and it has no TypeScript source at all.
 *
 * Everything tracked on the day this landed sits in
 * docs/sources-baseline.json with its owner and which of the two it is, so
 * the past is reported rather than punished. Only a NEW one fails. The
 * baseline is meant to shrink, and shrinking it is the owner's call: this
 * gate reports across lanes and edits nothing.
 *
 * HONEST LIMITS. It reads the tracked file LIST, not file contents, so it
 * cannot tell compiled output from hand-written source by looking — the
 * baseline records which is which because a person decided, not because
 * this script worked it out. It says nothing about untracked files, which
 * Pages would not publish either, and nothing about `.mjs` under
 * `scripts/`, which is tooling that never ships and is not compiled by
 * anything.
 *
 * Run: node scripts/check-sources.mjs   (also runs inside `npm run check`)
 * Prove it still works: node scripts/check-sources.mjs --self-test
 */

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isCommand } from "./is-command.mjs";

/* Ten gates carried their own copy of this test and all ten were wrong the
 * same way: reached through a symlink the guard went false and the gate
 * exited 0 having checked nothing. See scripts/is-command.mjs. */
const IS_COMMAND = isCommand(import.meta.url);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = "docs/sources-baseline.json";

/* ---------- the rule, as a pure function ---------- */

/** True for a tracked path that the compiler will never read but a browser
 *  will happily run. Source maps count: they are build output too. */
export function isUncheckedModule(file) {
  if (!file.startsWith("app/")) return false;
  return file.endsWith(".js") || file.endsWith(".js.map");
}

export function uncheckedModules(files) {
  return files.filter(isUncheckedModule).sort();
}

/* ---------- the self-test ---------- */

function selfTest() {
  const planted = [
    { label: "a tracked .js under app/ is caught", file: "app/products/b-dashboard/staff-dashboard.js", want: true },
    { label: "a source map is caught too", file: "app/shared/theme-boot.js.map", want: true },
    { label: "a TypeScript source passes", file: "app/shared/theme-boot.ts", want: false },
    { label: "the website's own files pass", file: "app/index.html", want: false },
    { label: "shared data passes", file: "app/shared/fixtures.json", want: false },
    { label: "tooling outside app/ passes", file: "scripts/check-sources.mjs", want: false },
    { label: "a root config file passes", file: "package.json", want: false },
    /* ".js" INSIDE a name is not a suffix. Matching on inclusion rather
     * than on the ending would fail a document about JavaScript. */
    { label: "a document whose name contains .js passes", file: "app/shared/why-.js-is-ignored.md", want: false },
    { label: "a .js outside app/ is not this gate's business", file: "docs/snippet.js", want: false },
  ];

  let failed = 0;
  for (const c of planted) {
    const got = isUncheckedModule(c.file);
    if (got !== c.want) {
      failed += 1;
      console.error(
        `  self-test MISS — ${c.label}: wanted ${c.want ? "a hit" : "no hit"}, got ${got ? "a hit" : "no hit"}`,
      );
    }
  }
  /* The list form has to be exercised too, and sorted: the gate prints it. */
  const listed = uncheckedModules(["app/z.js", "app/a.ts", "app/b.js"]);
  if (listed.join(",") !== "app/b.js,app/z.js") {
    failed += 1;
    console.error(`  self-test MISS — the list is filtered and sorted: got ${listed.join(",")}`);
  }

  console.log(
    `self-test: ${planted.length + 1} planted cases, ${planted.length + 1 - failed} behaved, ${failed} did not.`,
  );
  console.log(
    failed === 0
      ? "self-test PASSED — the gate can still fail."
      : "self-test FAILED — the gate is blind.",
  );
  process.exit(failed === 0 ? 0 : 1);
}

/* ---------- the gate ---------- */

function run() {
  const tracked = execFileSync("git", ["-C", ROOT, "ls-files"], { encoding: "utf8" })
    .split("\n").map((f) => f.trim()).filter((f) => f !== "");

  const found = uncheckedModules(tracked);
  const baselinePath = join(ROOT, BASELINE);
  const baseline = existsSync(baselinePath)
    ? JSON.parse(readFileSync(baselinePath, "utf8"))
    : { allowed: [] };
  const allowed = new Map(baseline.allowed.map((e) => [e.file, e]));

  const known = found.filter((f) => allowed.has(f));
  const fresh = found.filter((f) => !allowed.has(f));

  console.log(
    `check-sources: ${tracked.length} tracked files read — ${found.length} JavaScript under app/ that no compiler opens, ` +
      `${known.length} known, ${fresh.length} new.`,
  );
  for (const file of known) {
    const entry = allowed.get(file);
    console.log(`  known · ${file} · ${entry.why} (owner: ${entry.owner})`);
  }

  if (fresh.length === 0) {
    console.log("check-sources: every module the site runs has a TypeScript source. PASS");
    return;
  }
  for (const file of fresh) {
    console.error(
      `  ${file} · tracked JavaScript under app/. If it is compiled output, it is gitignored and must not be ` +
        "committed — build artifacts create conflicts the source never had. If it is hand-written, tsconfig " +
        "includes only app/**/*.ts, so nothing type-checks a module a browser runs. Write it in TypeScript, " +
        `or add it to ${BASELINE} with an owner and a reason.`,
    );
  }
  console.error(
    `check-sources: ${fresh.length} module${fresh.length === 1 ? "" : "s"} under app/ that no compiler reads. FAIL`,
  );
  process.exit(1);
}

if (IS_COMMAND) {
  if (process.argv.includes("--self-test")) selfTest();
  else run();
}
