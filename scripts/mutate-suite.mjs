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
const SUITE = "reengagement";

/* Token swaps that change behaviour without usually breaking syntax. */
const SWAPS = [
  [">=", ">"], [">", ">="], ["<=", "<"], ["<", "<="],
  ["===", "!=="], ["!==", "==="],
  ["&&", "||"], ["||", "&&"],
  ["+ 1", "- 1"], ["- 1", "+ 1"],
];

function runSuite() {
  try {
    const out = execFileSync(
      "node",
      [join(ROOT, "scripts/run-suites.mjs"), "--suite", SUITE],
      { encoding: "utf8", timeout: 20_000, cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] },
    );
    const m = out.match(/___RUN_SUITES_RESULT___(\{.*\})/);
    if (m === null) return { failed: -1 };
    return JSON.parse(m[1]);
  } catch {
    /* A crash, a hang, or a non-zero exit all mean the suite NOTICED.
     * Only a clean pass is a survivor. */
    return { failed: 1 };
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

  try {
    for (const [from, to] of SWAPS) {
      for (const at of sites(original, from)) {
        if (original.startsWith(to, at) && to.length >= from.length) continue;
        const mutated = original.slice(0, at) + to + original.slice(at + from.length);
        if (mutated === original) continue;
        writeFileSync(path, mutated);
        applied += 1;
        if (runSuite().failed === 0) {
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
  console.log(`\nmutate-suite: ${rel}`);
  console.log(
    `mutate-suite: ${applied} single-token mutations — ${caught} caught, ${survivors.length} survived (${pct}% caught).`,
  );
  console.log(
    "mutate-suite: a survivor is a way this module could be wrong that no check would notice. Some are equivalent and uncatchable — read them, do not chase the number.",
  );
  for (const s of survivors) {
    console.log(`  survived · line ${s.lineNo} · ${s.from} -> ${s.to}`);
    console.log(`    ${s.line}`);
  }
}

process.exit(anyMissing ? 1 : 0);
