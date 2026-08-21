#!/usr/bin/env node
/* Pulse Studio — run every browser unit suite headlessly, in Node.
 *
 * WHY THIS EXISTS. The three suites (synthetic, auth, re-engagement) are
 * written to run in a browser tab: each has a tests.html that loads its
 * tests.js and paints the results into the page. That is a good way for a
 * human to read them and a useless way for CI to check them — a suite that
 * only runs when somebody remembers to open a tab is a suite that can go red
 * unnoticed. This script gives those same suites a second way to run, so
 * `npm run check` can fail on a broken check instead of shrugging.
 *
 * It replaces eleven throwaway run-*.mjs files that used to sit in the repo
 * root, each hardcoding an absolute path from one developer's Mac. The
 * technique in three of them was worth keeping; the files were not.
 *
 * HOW IT WORKS. Each suite runs in its OWN child process. That is not
 * caution for its own sake: a browser gives every tests.html a fresh page,
 * and these suites write to localStorage. Sharing one Node module registry
 * would let one suite's leftover session decide another suite's result —
 * a false green that looks exactly like a real one.
 *
 * HONEST LIMITS. The DOM here is a stub, not a browser: it records what the
 * suites write and nothing more. These checks exercise LOGIC. Anything about
 * real layout, real styling, or real event dispatch is still only proven by
 * opening the tests.html pages in a browser.
 */
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Repo-relative, like scripts/check-styles.mjs — never an absolute path from
// somebody's home directory. A script a teammate cannot run is not tooling.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// The marker the child prints before its JSON, so ordinary console output
// from a suite can never be mistaken for the result payload.
const RESULT_MARKER = "___RUN_SUITES_RESULT___";

const SUITES = [
  { key: "synthetic", dir: "app/shared/synthetic", label: "synthetic studio engine" },
  { key: "auth", dir: "app/shared/auth", label: "session contract" },
  { key: "reengagement", dir: "app/products/d-reengagement", label: "member re-engagement" },
];

/* The stub DOM. The suites need enough of a page to write their results
 * into; the auth suite writes ONLY to the page (it prints nothing), which is
 * why a null document is not good enough here. */
function installBrowserStubs(baseDir) {
  class StubElement {
    constructor() {
      this.children = [];
      this.textContent = "";
      this.className = "";
      this.classList = {
        add: (name) => {
          this.className = `${this.className} ${name}`.trim();
        },
      };
    }
    appendChild(child) {
      this.children.push(child);
      return child;
    }
    append(child) {
      this.children.push(child);
      return child;
    }
  }
  const summary = new StubElement();
  const results = new StubElement();

  globalThis.HTMLElement = StubElement;
  globalThis.document = {
    querySelector: (sel) =>
      sel === "#summary" ? summary : sel === "#results" ? results : null,
    createElement: () => new StubElement(),
  };

  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };

  // Cross-tab session events: the auth suite dispatches a StorageEvent to
  // prove one tab sees another tab's sign-out. Without these stubs it reports
  // a failure that is the runner's fault, not the code's.
  const listeners = new Map();
  globalThis.addEventListener = (type, fn) => {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(fn);
  };
  globalThis.removeEventListener = (type, fn) => {
    const arr = listeners.get(type) ?? [];
    const index = arr.indexOf(fn);
    if (index >= 0) arr.splice(index, 1);
  };
  globalThis.dispatchEvent = (event) => {
    for (const fn of (listeners.get(event.type) ?? []).slice()) fn(event);
    return true;
  };
  globalThis.StorageEvent = class StorageEvent {
    constructor(type, init = {}) {
      this.type = type;
      Object.assign(this, init);
    }
  };
  globalThis.window = globalThis;

  // Suites fetch their fixture files with page-relative URLs.
  globalThis.fetch = async (url) => {
    const name = String(url).replace(/^\.\//, "");
    const text = await readFile(join(baseDir, name), "utf8");
    return { ok: true, text: async () => text, json: async () => JSON.parse(text) };
  };

  return { summary, results };
}

const SUMMARY_SHAPE = /(\d+)\s+checks run,\s*(\d+)\s+passed,\s*(\d+)\s+failed/;

/** Run ONE suite in this process. Returns {run, passed, failed, failures}. */
async function runSuite(suite) {
  const baseDir = join(ROOT, suite.dir);
  const { summary, results } = installBrowserStubs(baseDir);
  await import(join(baseDir, "tests.js"));

  // Every suite writes "N checks run, P passed, F failed." into #summary.
  const match = SUMMARY_SHAPE.exec(summary.textContent);
  if (!match) {
    throw new Error(
      `the suite ran but wrote no readable summary. Got: ${JSON.stringify(summary.textContent)}`,
    );
  }
  const failures = results.children
    .filter((child) => child.className.includes("fail"))
    .map((child) => child.textContent);
  return { run: +match[1], passed: +match[2], failed: +match[3], failures };
}

/* ---- child mode: run one suite, hand the result back as JSON ---- */
const childSuiteKey = process.argv[2] === "--suite" ? process.argv[3] : null;
if (childSuiteKey) {
  const suite = SUITES.find((entry) => entry.key === childSuiteKey);
  if (!suite) {
    console.error(`run-suites: unknown suite "${childSuiteKey}"`);
    process.exit(2);
  }
  try {
    const result = await runSuite(suite);
    process.stdout.write(RESULT_MARKER + JSON.stringify(result));
    process.exit(0);
  } catch (error) {
    console.error(`${suite.key}: ${error?.message ?? error}`);
    process.exit(2);
  }
}

/* ---- parent mode: run each suite in a child, then report ---- */
let totalRun = 0;
let totalFailed = 0;
let brokenSuites = 0;

for (const suite of SUITES) {
  const child = spawnSync(
    process.execPath,
    [fileURLToPath(import.meta.url), "--suite", suite.key],
    { encoding: "utf8" },
  );
  const marker = child.stdout ? child.stdout.indexOf(RESULT_MARKER) : -1;

  if (child.status !== 0 || marker < 0) {
    // A suite that cannot even run is a failure, never a skip. The most
    // likely cause is that `tsc` has not emitted its tests.js yet.
    brokenSuites += 1;
    const why =
      (child.stderr || "").trim().split("\n").slice(-3).join("\n  ") || "no output";
    console.error(`run-suites: ${suite.key} (${suite.label}) DID NOT RUN\n  ${why}`);
    continue;
  }

  const result = JSON.parse(child.stdout.slice(marker + RESULT_MARKER.length));
  totalRun += result.run;
  totalFailed += result.failed;
  console.log(
    `run-suites: ${suite.label} — ${result.run} checks, ${result.passed} passed, ${result.failed} failed`,
  );
  for (const line of result.failures) console.error(`  ${line}`);
}

if (brokenSuites) {
  console.error(
    `run-suites: ${brokenSuites} suite(s) could not run. These suites import ` +
      "compiled .js, so run `npm run build` before this script.",
  );
  process.exit(1);
}

// Never a silent pass: always state the count that was actually checked.
console.log(
  `run-suites: ${totalRun} checks across ${SUITES.length} suites, ${totalFailed} failed.`,
);

if (process.argv.includes("--self-test")) {
  // Prove the runner can FAIL rather than assuming it — the same standard the
  // styling gate holds itself to (docs/styling.md).
  const { summary, results } = installBrowserStubs(ROOT);
  summary.textContent = "3 checks run, 2 passed, 1 failed.";
  results.children.push({ className: "fail", textContent: "FAIL — planted" });
  const match = SUMMARY_SHAPE.exec(summary.textContent);
  const detected =
    Boolean(match) &&
    Number(match[3]) === 1 &&
    results.children.some((child) => child.className.includes("fail"));
  console.log(
    detected
      ? "run-suites --self-test: PASS — a planted failing check is detected and would exit 1."
      : "run-suites --self-test: BROKEN — a planted failure was NOT detected.",
  );
  if (!detected) process.exit(1);
}

process.exit(totalFailed > 0 ? 1 : 0);
