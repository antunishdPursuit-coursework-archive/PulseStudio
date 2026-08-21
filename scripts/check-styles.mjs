#!/usr/bin/env node
/* Pulse Studio — the styling gate. TEAM-OWNED.
 *
 * WHY THIS EXISTS: the same header styling was pasted by hand into four
 * product stylesheets twice in one day. Prose in a doc did not stop it,
 * because a rule nobody can check is a wish. This script is the rule with
 * teeth: it fails `npm run check` when a product stylesheet repeats
 * something the shared theme already owns, or when two products style the
 * same thing identically in their own folders.
 *
 * IT DOES NOT PUNISH THE PAST. Everything already duplicated on the day
 * this landed is listed in docs/styles-baseline.json with the owner who
 * can delete it. Those are reported and allowed. Anything NEW fails. The
 * baseline is meant to shrink and never grow — when an owner deletes their
 * copy, the script tells them to drop the line from the baseline too, so
 * the file can never quietly become a permanent excuse.
 *
 * HONEST LIMITS (stated, because a checker that oversells itself is worse
 * than none): it reads top-level rules only — rules inside @media blocks
 * are skipped — and it compares NORMALIZED text, so it catches copy-paste
 * and reformatting but not two rules that achieve the same look by
 * different means. It is a drift alarm, not a design critic.
 *
 * Run: node scripts/check-styles.mjs   (also runs inside `npm run check`)
 * Prove it still works: node scripts/check-styles.mjs --self-test
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

/* Importing this file must never RUN the gate — the baseline generator and
 * any future test import findDuplicates() directly. Only running it as a
 * command performs the check. */
const IS_COMMAND =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHARED = "app/shared/theme.css";
const PRODUCT_SHEETS = [
  "app/products/a-booking/styles.css",
  "app/products/b-dashboard/staff-dashboard.css",
  "app/products/c-chatbot/styles.css",
  "app/products/d-reengagement/styles.css",
];
const BASELINE = "docs/styles-baseline.json";

/* Pieces the SHARED components own and draw on every page. A product may
 * never style these in its own folder — not even differently, because two
 * headers that disagree is exactly the drift this gate exists to stop.
 * (Byte-comparison alone missed these once: the shared rule gained a
 * fallback, the pasted copies stopped matching it exactly, and they went
 * invisible. Naming the components closes that hole.) */
const SHARED_COMPONENT_TOKENS = [
  "home-brand",
  "brand-word",
  "home-arrow",
  "owner-badge",
  "pulse-session",
  "appearance-control",
  ".role",
];

const OWNER_OF = {
  "app/products/a-booking": "Kerrian",
  "app/products/b-dashboard": "Manny",
  "app/products/c-chatbot": "Dennis",
  "app/products/d-reengagement": "Rensley",
};
const ownerFor = (file) =>
  Object.entries(OWNER_OF).find(([dir]) => file.startsWith(dir))?.[1] ?? "the team";

/** Strip comments, drop @-blocks, and return top-level rules as
 *  { selector, body } with whitespace normalized so formatting differences
 *  never hide a copy-paste. */
export function topLevelRules(css) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [];
  let buffer = "";
  let depth = 0;
  let atBlockDepth = null;

  for (const char of withoutComments) {
    if (char === "{") {
      depth += 1;
      if (depth === 1 && buffer.trim().startsWith("@")) atBlockDepth = depth;
      buffer += char;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      buffer += char;
      if (depth === 0) {
        if (atBlockDepth === null) {
          const open = buffer.indexOf("{");
          const selector = buffer.slice(0, open).trim().replace(/\s+/g, " ");
          const body = buffer
            .slice(open + 1, buffer.lastIndexOf("}"))
            .trim()
            .replace(/\s+/g, " ")
            .replace(/;\s*$/, "");
          if (selector !== "" && body !== "") rules.push({ selector, body });
        }
        atBlockDepth = null;
        buffer = "";
      }
      continue;
    }
    buffer += char;
  }
  return rules;
}

function read(path) {
  const full = join(ROOT, path);
  return existsSync(full) ? readFileSync(full, "utf8") : null;
}

/** The findings, as data — so the self-test can drive this without files. */
export function findDuplicates(sharedCss, sheets) {
  const findings = [];
  const shared = new Map();
  for (const rule of topLevelRules(sharedCss)) shared.set(rule.selector, rule.body);

  const seenInProducts = new Map(); // selector -> [{ file, body }]
  for (const { file, css } of sheets) {
    for (const rule of topLevelRules(css)) {
      const sharedBody = shared.get(rule.selector);
      if (sharedBody !== undefined && sharedBody === rule.body) {
        findings.push({
          kind: "repeats-shared",
          selector: rule.selector,
          file,
          message: `"${rule.selector}" is already styled identically in ${SHARED}. Delete the copy here.`,
        });
      }
      const touched = SHARED_COMPONENT_TOKENS.find((t) => rule.selector.includes(t));
      if (touched !== undefined) {
        findings.push({
          kind: "touches-shared-component",
          selector: rule.selector,
          file,
          message: `"${rule.selector}" styles a shared component ("${touched}") from inside a product folder. Shared components are styled once in ${SHARED}; a product copy can only drift.`,
        });
      }

      const seen = seenInProducts.get(rule.selector) ?? [];
      seen.push({ file, body: rule.body });
      seenInProducts.set(rule.selector, seen);
    }
  }

  for (const [selector, entries] of seenInProducts) {
    if (entries.length < 2) continue;
    const identical = entries.filter((e) => e.body === entries[0].body);
    if (identical.length < 2) continue;
    if (shared.has(selector)) continue; // already reported above
    findings.push({
      kind: "belongs-in-shared",
      selector,
      file: identical.map((e) => e.file).sort().join(" + "),
      message: `"${selector}" is styled identically in ${identical.length} product folders. A thing every product shows belongs in ${SHARED}, once.`,
    });
  }
  return findings;
}

const key = (f) => `${f.kind}|${f.selector}|${f.file}`;

/* ---------- self-test: break it on purpose and confirm it screams ----------
   The rule this obeys: a check whose only reference is the thing it checks
   reports all-clear forever. So the gate carries a known-bad case it MUST
   fail and a known-good case it must NOT flag.

   ITS LIMIT, STATED: this exercises findDuplicates() against strings held in
   memory. It never opens SHARED, PRODUCT_SHEETS or BASELINE, so it proves
   nothing about whether those paths still resolve — it printed PASSED even
   when all four stylesheets were missing. Path resolution is covered by the
   fail-closed checks above instead, which is where it belongs: the real run
   exits 1 and names any file it could not read. To prove that half by hand,
   rename a product stylesheet and confirm the gate exits 1. */
if (IS_COMMAND && process.argv.includes("--self-test")) {
  const sharedCss = ".page-head .role { color: red; font-weight: 700 }";
  const planted = [
    { file: "app/products/x/styles.css", css: ".page-head .role { color: red; font-weight: 700 }" },
    { file: "app/products/y/styles.css", css: ".only-mine { color: blue }" },
    { file: "app/products/z/styles.css", css: ".only-mine { color: blue }" },
  ];
  const found = findDuplicates(sharedCss, planted);
  const caughtSharedCopy = found.some((f) => f.kind === "repeats-shared");
  const caughtTwinCopy = found.some((f) => f.kind === "belongs-in-shared");
  const componentCase = findDuplicates(sharedCss, [
    { file: "app/products/x/styles.css", css: ".page-head .home-brand { color: hotpink }" },
  ]);
  const caughtComponent = componentCase.some((f) => f.kind === "touches-shared-component");
  const cleanStaysClean =
    findDuplicates(sharedCss, [{ file: "app/products/x/styles.css", css: ".mine-alone { color: green }" }])
      .length === 0;
  const ok = caughtSharedCopy && caughtTwinCopy && caughtComponent && cleanStaysClean;
  console.log(`self-test: repeats-shared caught=${caughtSharedCopy}, ` +
    `belongs-in-shared caught=${caughtTwinCopy}, ` +
    `shared-component-touched caught=${caughtComponent}, ` +
    `clean-file-stays-clean=${cleanStaysClean}`);
  console.log(
    ok
      ? "self-test PASSED — duplicate detection can still fail. (Says nothing about path resolution; see the note above.)"
      : "self-test FAILED — the gate is blind.",
  );
  process.exit(ok ? 0 : 1);
}

/* ---------- the run ---------- */

if (!IS_COMMAND) {
  // imported for its functions; nothing to do
} else {

const sharedCss = read(SHARED);
if (sharedCss === null) {
  console.error(`check-styles: cannot read ${SHARED}`);
  process.exit(1);
}
// A stylesheet we cannot read is a FAILURE, never a skip. Filtering the
// unreadable ones away silently was this gate's worst bug: rename all four
// and it printed "0 product stylesheets checked ... PASS" and exited 0 —
// a green gate that had checked nothing. A renamed file is exactly when
// you most need to be told.
const readSheets = PRODUCT_SHEETS.map((file) => ({ file, css: read(file) }));
const missing = readSheets.filter((s) => s.css === null).map((s) => s.file);
if (missing.length > 0) {
  console.error(
    `check-styles: cannot read ${missing.length} of ${PRODUCT_SHEETS.length} product stylesheets:`,
  );
  for (const file of missing) console.error(`  missing: ${file}`);
  console.error(
    "check-styles: if a stylesheet moved or was renamed, update PRODUCT_SHEETS in this " +
      "file in the same commit. The gate refuses to report a pass on files it never read.",
  );
  process.exit(1);
}
const sheets = readSheets;

const findings = findDuplicates(sharedCss, sheets);
const baselineRaw = read(BASELINE);
const baseline = baselineRaw === null ? { allowed: [] } : JSON.parse(baselineRaw);
const allowed = new Set(baseline.allowed.map((a) => `${a.kind}|${a.selector}|${a.file}`));

const fresh = findings.filter((f) => !allowed.has(key(f)));
const stale = baseline.allowed.filter(
  (a) => !findings.some((f) => key(f) === `${a.kind}|${a.selector}|${a.file}`),
);

/* A stated negative, always — an empty screen and a broken check look the
   same, so this never prints nothing. */
console.log(
  `check-styles: ${sheets.length} product stylesheets checked against ${SHARED}; ` +
    `${findings.length} duplicate rules found, ${allowed.size} known and allowed, ${fresh.length} new.`,
);

for (const f of findings.filter((x) => allowed.has(key(x)))) {
  console.log(`  known · ${f.file} · ${f.message} (owner: ${ownerFor(f.file)})`);
}
for (const s of stale) {
  console.log(
    `  cleared · "${s.selector}" in ${s.file} is gone — delete its line from ${BASELINE} so the list keeps shrinking.`,
  );
}
if (fresh.length === 0) {
  console.log("check-styles: no new style drift. PASS");
  process.exit(0);
}
console.error("\ncheck-styles: NEW style drift — this fails the gate:");
for (const f of fresh) {
  console.error(`  ${f.file}  (owner: ${ownerFor(f.file)})\n    ${f.message}`);
}
console.error(
  `\nFix it in one of two ways, both in your own lane:\n` +
    `  · delete the copy and let ${SHARED} own it (usually right), or\n` +
    `  · if the rule truly is yours alone, rename it so it says so.\n` +
    `See docs/styling.md. Do not add it to ${BASELINE} — that file only shrinks.\n`,
);
process.exit(1);

}
