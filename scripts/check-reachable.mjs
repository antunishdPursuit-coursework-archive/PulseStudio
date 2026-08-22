#!/usr/bin/env node
/* Pulse Studio — the reachability gate. TEAM-OWNED.
 *
 * WHY THIS EXISTS: the filing law ends with the sentence that keeps a repo
 * clean — "If the answer to all four is no, delete it — do not file it. A
 * file kept 'just in case' is a file the next person has to evaluate." It
 * is the only part of that law nothing could check, and unreferenced code
 * is quieter than a misfiled document: it compiles, it passes every other
 * gate, and it reads exactly like working code to whoever opens it next.
 *
 * It had already happened three times when this landed on 2026-08-22.
 * `b-dashboard/main.ts` renders a whole dashboard from the shared fixture
 * set and no page loads it — `index.html` names `staff-dashboard.js`
 * instead. That module is the only importer of `app/shared/data.ts`, so
 * `loadFixtures()` and `fixtures.json` are reached by nothing the site
 * serves either. And `components/logo.ts` is documented in
 * `components/README.md` as callable, which nothing calls.
 *
 * WHAT IT DOES: starts at every `<script src>` in tracked HTML under
 * `app/`, follows relative imports through the COMPILED modules, and lists
 * the tracked `.ts` whose module never turns up. Known ones sit in
 * docs/reachable-baseline.json with an owner, so the past is reported
 * rather than punished and only a NEW one fails. Deleting a module or
 * wiring it back in is its owner's call; this gate reports across lanes
 * and edits nothing.
 *
 * TYPES ARE NOT CODE, and the gate works that out rather than being told.
 * `app/shared/contract.ts` is twelve type declarations, so `tsc` emits
 * `export {};` and nothing ever imports the module at runtime — every
 * importer writes `import type`, which erases. A module whose compiled
 * output holds no statement but that one cannot be dead code, so it is
 * never reported.
 *
 * NEEDS A BUILD, like check-contrast.mjs, because it follows the imports a
 * browser would follow — the compiled `.js`, with its `.js` specifiers,
 * not the TypeScript. It exits 1 with a clear message when the build is
 * missing rather than reporting a repo full of dead code.
 *
 * HONEST LIMITS, because a checker that oversells itself is worse than
 * none:
 *
 *  - It reads imports with a regular expression, not a parser. A module
 *    loaded through a specifier assembled at runtime looks dead to it.
 *  - It follows RELATIVE specifiers only. Nothing here imports by package
 *    name, and a bare specifier would not resolve inside `app/` anyway.
 *  - Reachable is not the same as used. A module something imports and
 *    never calls passes this gate; that is a different question and this
 *    one does not pretend to answer it.
 *  - Untracked HTML is invisible, which is also true of Pages.
 *
 * Run: node scripts/check-reachable.mjs   (also runs inside `npm run check`)
 * Prove it still works: node scripts/check-reachable.mjs --self-test
 */

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, normalize } from "node:path";

const IS_COMMAND =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = "docs/reachable-baseline.json";

/* ---------- the rules, as pure functions ---------- */

/** Comments stripped, is `export {};` all that is left? That is what `tsc`
 *  writes for a file holding nothing but types, and a module with no
 *  runtime body cannot be dead code. */
export function isTypesOnly(compiled) {
  const code = compiled
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/.*$/gm, " ")
    .trim();
  return code === "export {};" || code === "export {}";
}

/** Relative module specifiers, static and dynamic. Deliberately blind to
 *  bare specifiers: nothing under app/ uses one, and one would not resolve
 *  to a file in this tree. */
export function relativeImports(source) {
  const found = [];
  /* MATCHED ON `from`, NOT ON THE IMPORT KEYWORD. The first version of
   * this bounded the distance between `import` and `from` at 200
   * characters, and Product D's main.js imports eighteen names from
   * outreach.js in one 358-character statement — so the gate reported a
   * module as dead that the page it renders imports directly. A cap on how
   * much a person may import is not a rule anybody agreed to.
   *
   * Erring toward finding MORE imports is the safe direction here: a
   * spurious one makes the gate too lenient, while a missed one accuses a
   * live module of being dead, which is the failure that wastes an
   * afternoon. */
  const patterns = [
    /\bfrom\s*["'](\.[^"']*)["']/g,
    /\bimport\s*\(\s*["'](\.[^"']*)["']\s*\)/g,
    /\bimport\s*["'](\.[^"']*)["']/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(source)) !== null) found.push(m[1]);
  }
  return [...new Set(found)];
}

/** Everything reachable from `entries`, following `importsOf`. The reader
 *  is injected so this can be exercised without a filesystem. */
export function reachableFrom(entries, importsOf) {
  const seen = new Set();
  const stack = [...entries];
  while (stack.length > 0) {
    const next = stack.pop();
    if (seen.has(next)) continue;
    seen.add(next);
    for (const dep of importsOf(next)) stack.push(dep);
  }
  return seen;
}

/* ---------- the self-test ---------- */

function selfTest() {
  let failed = 0;
  const miss = (label, wanted, got) => {
    failed += 1;
    console.error(`  self-test MISS — ${label}: wanted ${wanted}, got ${got}`);
  };

  const typesCases = [
    { label: "a types-only emit is not code", src: "/* a comment */\nexport {};\n", want: true },
    { label: "...even with line comments", src: "// note\nexport {}\n// more\n", want: true },
    { label: "a module with a function is code", src: "export function f() { return 1; }", want: false },
    { label: "a module with a side effect is code", src: "console.log('hi');\nexport {};", want: false },
    { label: "an empty file is not a types module", src: "   \n", want: false },
  ];
  for (const c of typesCases) {
    const got = isTypesOnly(c.src);
    if (got !== c.want) miss(c.label, c.want, got);
  }

  const importCases = [
    { label: "a static import is found", src: 'import { a } from "./a.js";', want: ["./a.js"] },
    { label: "a multi-line import is found", src: 'import {\n  a,\n  b,\n} from "./deps.js";', want: ["./deps.js"] },
    { label: "a re-export is found", src: 'export { a } from "./a.js";', want: ["./a.js"] },
    { label: "a dynamic import is found", src: 'const m = await import("./late.js");', want: ["./late.js"] },
    { label: "a bare import for side effects is found", src: 'import "./boot.js";', want: ["./boot.js"] },
    { label: "a bare package specifier is ignored", src: 'import x from "node:fs";', want: [] },
    { label: "the same module twice is listed once", src: 'import a from "./a.js";\nimport b from "./a.js";', want: ["./a.js"] },
    /* The case that caught the first version of this gate: eighteen names
     * from one module, 358 characters between `import` and `from`. */
    { label: "a long named-import list is still found",
      src: `import { ${Array.from({ length: 18 }, (_, i) => `nameNumber${i}`).join(", ")} } from "./outreach.js";`,
      want: ["./outreach.js"] },
  ];
  for (const c of importCases) {
    const got = relativeImports(c.src);
    if (got.join(",") !== c.want.join(",")) miss(c.label, `[${c.want}]`, `[${got}]`);
  }

  /* The walk itself, over a graph with a CYCLE — which the real one has,
   * and which would hang a version without the seen-set. */
  const graph = { "a.js": ["b.js"], "b.js": ["a.js", "c.js"], "c.js": [], "orphan.js": [] };
  const reached = reachableFrom(["a.js"], (f) => graph[f] ?? []);
  if (!reached.has("c.js")) miss("the walk reaches a module two hops away", "c.js reached", "not reached");
  if (reached.has("orphan.js")) miss("the walk does not invent edges", "orphan.js unreached", "reached");
  if (reached.size !== 3) miss("a cycle does not double-count or hang", "3 modules", `${reached.size}`);

  const total = typesCases.length + importCases.length + 3;
  console.log(`self-test: ${total} planted cases, ${total - failed} behaved, ${failed} did not.`);
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

  const sources = tracked.filter((f) => f.startsWith("app/") && f.endsWith(".ts"));
  const built = sources.filter((f) => existsSync(join(ROOT, `${f.slice(0, -3)}.js`)));
  if (built.length !== sources.length) {
    console.error(
      `check-reachable: ${sources.length - built.length} of ${sources.length} TypeScript sources under app/ have no ` +
        "compiled module beside them. This gate follows the imports a browser follows, which live in the compiled " +
        "output — run `npm run build` first. Refusing to report a repo full of dead code that is only unbuilt.",
    );
    process.exit(1);
  }

  const readImports = (file) => {
    const full = join(ROOT, file);
    if (!existsSync(full)) return [];
    return relativeImports(readFileSync(full, "utf8"))
      .map((spec) => normalize(join(dirname(file), spec)));
  };

  const entries = [];
  for (const html of tracked.filter((f) => f.startsWith("app/") && f.endsWith(".html"))) {
    const source = readFileSync(join(ROOT, html), "utf8");
    for (const m of source.matchAll(/<script[^>]*\ssrc="([^"]+\.js)"/g)) {
      entries.push(normalize(join(dirname(html), m[1])));
    }
  }

  const reached = reachableFrom([...new Set(entries)], readImports);

  const unreachable = [];
  for (const source of sources) {
    const compiled = `${source.slice(0, -3)}.js`;
    if (reached.has(compiled)) continue;
    if (isTypesOnly(readFileSync(join(ROOT, compiled), "utf8"))) continue;
    unreachable.push(source);
  }
  unreachable.sort();

  const baselinePath = join(ROOT, BASELINE);
  const baseline = existsSync(baselinePath)
    ? JSON.parse(readFileSync(baselinePath, "utf8"))
    : { allowed: [] };
  const allowed = new Map(baseline.allowed.map((e) => [e.file, e]));
  const known = unreachable.filter((f) => allowed.has(f));
  const fresh = unreachable.filter((f) => !allowed.has(f));

  console.log(
    `check-reachable: ${entries.length} script tags in tracked pages reach ${reached.size} modules — ` +
      `of ${sources.length} TypeScript sources under app/, ${unreachable.length} are reached by no page ` +
      `(${known.length} known, ${fresh.length} new).`,
  );
  for (const file of known) {
    const entry = allowed.get(file);
    console.log(`  known · ${file} · ${entry.why} (owner: ${entry.owner})`);
  }

  if (fresh.length === 0) {
    console.log("check-reachable: every module under app/ is either reached by a page or is types. PASS");
    return;
  }
  for (const file of fresh) {
    console.error(
      `  ${file} · no page reaches this module. The filing law says a file kept "just in case" is a file the ` +
        "next person has to evaluate — so wire it into a page, delete it, or add it to " +
        `${BASELINE} with an owner and a reason it should stay.`,
    );
  }
  console.error(
    `check-reachable: ${fresh.length} module${fresh.length === 1 ? "" : "s"} under app/ that no page reaches. FAIL`,
  );
  process.exit(1);
}

if (IS_COMMAND) {
  if (process.argv.includes("--self-test")) selfTest();
  else run();
}
