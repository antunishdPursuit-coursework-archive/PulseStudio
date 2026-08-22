#!/usr/bin/env node
/* Pulse Studio — the mutation survey. TEAM-OWNED. NOT part of `npm run check`.
 *
 * WHY THIS EXISTS: the repo's standard says "prove the check can fail",
 * and every GATE carries a `--self-test` that plants a known-bad case. The
 * unit suites carry no such proof. They are known to PASS, which says
 * nothing about whether they would notice if the code were wrong — and on
 * 2026-08-21 a check was written here that could not fail at all, which is
 * how this got built.
 *
 * WHAT IT DOES: changes one token in a compiled module — a comparison, a
 * boolean operator, an increment — reruns the suite, and puts the file
 * back. A mutation the suite still passes is a SURVIVOR: a way that module
 * could be wrong that nobody would hear about.
 *
 * It edits the compiled `.js`, which is gitignored and rebuilt by `tsc`,
 * so it never touches a source file. It restores the file after every run,
 * including on a crash.
 *
 * NOT A GATE, on purpose. A full sweep of one module is a few hundred runs,
 * and the number is a survey of the suite rather than a property of the
 * code — it moves when checks are added, not when behaviour breaks.
 * Failing a build on it would make people delete checks to keep a
 * percentage up.
 *
 * HONEST LIMITS. A survivor is not automatically a gap. Some mutations are
 * EQUIVALENT — they cannot change the observable result, so no check could
 * ever catch them. Measured here on 2026-08-21: of 27 survivors in
 * `logic.ts`, the three in `dayNumberFromIso`'s guard chain are masked by
 * the guard after them (an impossible month falls through to
 * `d > daysInMonth(y, m)`, where a missing month length is 0 and any day
 * exceeds it), and one of those guards is unreachable altogether — it
 * exists to satisfy `noUncheckedIndexedAccess`, not to run. Read the
 * survivors; do not chase the number.
 *
 * THE OPERATOR ITSELF MAKES SOME. Swapping `>` for `>=` inside a shift
 * turns `h >>> 0` into `h >>>= 0`, which is valid, assigns, and returns
 * the same value — so every bit-twiddling line reports a survivor that
 * says nothing about the checks. Expect one per shift in code like
 * `random.ts`. A boolean threshold is the other recurring case: `<` and
 * `<=` differ only on exact equality, and for a float drawn from a 32-bit
 * integer that is roughly one draw in four billion.
 *
 * Run:
 *   npm run build
 *   npm run mutate                     # the re-engagement engine
 *   node scripts/mutate-suite.mjs app/products/d-reengagement/csv.js
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULT_TARGETS = ["app/products/d-reengagement/logic.js"];
const targets = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const TARGETS = targets.length > 0 ? targets : DEFAULT_TARGETS;

/* Which suite is asked to notice. Defaults from the target's own folder,
 * because running the re-engagement checks against a mutation in
 * app/shared/auth would report everything as "caught" for the wrong
 * reason — that suite never loads the module, so nothing it says is
 * evidence either way. Override with --suite=<key>. */
const SUITE_BY_PREFIX = [
  ["app/shared/synthetic/", "synthetic"],
  ["app/shared/auth/", "auth"],
  ["app/products/d-reengagement/", "reengagement"],
];
/* A sample, for a module too large to sweep whole. --stride=4 tries every
 * fourth site (1 in 4). It is deterministic — every Nth, never random — so the same
 * command surveys the same mutations and two runs are comparable. A
 * sampled run says so in its output, because "82% caught" from a quarter
 * of the sites is a different claim from the same number over all of
 * them. */
const strideArg = process.argv.find((a) => a.startsWith("--stride="));
const STRIDE = strideArg === undefined ? 1 : Math.max(1, Number(strideArg.slice("--stride=".length)) || 1);

const explicit = process.argv.find((a) => a.startsWith("--suite="));
const suiteFor = (rel) => {
  if (explicit) return explicit.slice("--suite=".length);
  const hit = SUITE_BY_PREFIX.find(([prefix]) => rel.startsWith(prefix));
  return hit === undefined ? null : hit[1];
};

/* Token swaps that change behaviour without usually breaking syntax. */
const SWAPS = [
  [">=", ">"], [">", ">="], ["<=", "<"], ["<", "<="],
  ["===", "!=="], ["!==", "==="],
  ["&&", "||"], ["||", "&&"],
  ["+ 1", "- 1"], ["- 1", "+ 1"],
];

/* Milliseconds to allow one suite run. Derived from a clean run rather
 * than fixed, because a fixed one silently turns into a lie: this was
 * 20_000 while the synthetic suite took 16-18s, so a mutation that merely
 * slowed things a little was killed and counted as CAUGHT. Scores read
 * higher than the checks deserved until 2026-08-21, when two survivors
 * that had been reported caught turned out to run in 16.1s and 18.5s. */
let budgetMs = 30_000;

function runSuite(suite) {
  try {
    const out = execFileSync(
      "node",
      [join(ROOT, "scripts/run-suites.mjs"), "--suite", suite],
      { encoding: "utf8", timeout: budgetMs, cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] },
    );
    const m = out.match(/___RUN_SUITES_RESULT___(\{.*\})/);
    if (m === null) return { failed: -1, timedOut: false };
    return { ...JSON.parse(m[1]), timedOut: false };
  } catch (err) {
    /* A crash or a non-zero exit means the suite NOTICED. A TIMEOUT does
     * not: it may only mean the mutation made things slow, or that the
     * suite grew. Those are counted apart and reported, never folded into
     * "caught". */
    const timedOut = err !== null && typeof err === "object" && err.code === "ETIMEDOUT";
    return { failed: 1, timedOut };
  }
}

/** Offsets of `tok` that are not inside a string or a line comment.
 *  Approximate on purpose: a mis-sited swap becomes a syntax error, which
 *  counts as caught and is discarded. */
function sites(src, tok) {
  const out = [];
  let offset = 0;
  for (const line of src.split("\n")) {
    const code = line
      .replace(/\/\/.*$/, "")
      .replace(/(['"`]).*?\1/g, (m) => " ".repeat(m.length));
    let i = code.indexOf(tok);
    while (i >= 0) {
      out.push(offset + i);
      i = code.indexOf(tok, i + 1);
    }
    offset += line.length + 1;
  }
  return out;
}

let anyMissing = false;
for (const rel of TARGETS) {
  const path = join(ROOT, rel);
  const suite = suiteFor(rel);
  if (suite === null) {
    console.error(
      `mutate-suite: no suite covers ${rel}. Pass --suite=<synthetic|auth|reengagement>, ` +
        "or accept that nothing checks this module — which is itself the finding.",
    );
    anyMissing = true;
    continue;
  }
  if (!existsSync(path)) {
    console.error(
      `mutate-suite: ${rel} is not built. Run \`npm run build\` first — this reads compiled output, never source.`,
    );
    anyMissing = true;
    continue;
  }
  const original = readFileSync(path, "utf8");
  const survivors = [];
  let applied = 0;
  let timedOut = 0;

  /* Time one clean run and give each mutation five times that, with a
   * floor. A mutation is allowed to be slower than the original; it is
   * not allowed to be counted as caught for being slower. */
  {
    const started = Date.now();
    runSuite(suite);
    budgetMs = Math.max(30_000, (Date.now() - started) * 5);
  }

  /* Collect every site first, then walk them with the stride, so the
   * sample spreads across the whole file rather than exhausting the first
   * operator and stopping. */
  const allSites = [];
  for (const [from, to] of SWAPS) {
    for (const at of sites(original, from)) {
      if (original.startsWith(to, at) && to.length >= from.length) continue;
      allSites.push([from, to, at]);
    }
  }
  allSites.sort((a, b) => a[2] - b[2]);
  const chosen = allSites.filter((_, i) => i % STRIDE === 0);

  try {
    {
      for (const [from, to, at] of chosen) {
        const mutated = original.slice(0, at) + to + original.slice(at + from.length);
        if (mutated === original) continue;
        writeFileSync(path, mutated);
        applied += 1;
        const result = runSuite(suite);
        if (result.timedOut) timedOut += 1;
        if (result.failed === 0) {
          const lineNo = original.slice(0, at).split("\n").length;
          survivors.push({
            lineNo,
            from,
            to,
            line: (original.split("\n")[lineNo - 1] ?? "").trim().slice(0, 110),
          });
        }
      }
    }
  } finally {
    /* Always put it back, including on Ctrl-C or a throw. Leaving a
     * mutated build behind would make the next `npm run check` lie. */
    writeFileSync(path, original);
  }

  const caught = applied - survivors.length;
  const pct = applied === 0 ? 0 : Math.round((caught / applied) * 100);
  console.log(`\nmutate-suite: ${rel} — judged by the "${suite}" suite`);
  console.log(
    `mutate-suite: ${applied} single-token mutations — ${caught} caught, ${survivors.length} survived (${pct}% caught).`,
  );
  if (timedOut > 0) {
    console.log(
      `mutate-suite: ${timedOut} run${timedOut === 1 ? "" : "s"} hit the ${Math.round(budgetMs / 1000)}s budget and are counted as caught — treat that many of the caught as unproven.`,
    );
  }
  if (STRIDE > 1) {
    console.log(
      `mutate-suite: SAMPLED — 1 site in ${STRIDE} of ${allSites.length}. The percentage covers what was tried, not the module.`,
    );
  }
  console.log(
    "mutate-suite: a survivor is a way this module could be wrong that no check would notice. Some are equivalent and uncatchable — read them, do not chase the number.",
  );
  for (const s of survivors) {
    console.log(`  survived · line ${s.lineNo} · ${s.from} -> ${s.to}`);
    console.log(`    ${s.line}`);
  }
}

process.exit(anyMissing ? 1 : 0);
