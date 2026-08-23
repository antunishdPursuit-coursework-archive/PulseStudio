#!/usr/bin/env node
/* Pulse Studio — the clone-seam gate. TEAM-OWNED.
 *
 * WHY THIS EXISTS: `app/shared/brand.ts` is described in its own folder's
 * README as the first step of the clone story — "the studio's NAME. Every
 * header follows at runtime." That promise is kept by exactly one wire:
 * `theme-boot.js` imports `components/brand-header.js` and calls
 * `renderStudioBrand()`, which fills `.home-brand .brand-word` and every
 * `[data-studio-name]`.
 *
 * NOTHING PROVED THE WIRE WAS CONNECTED, and the reason is worth stating
 * because it is why the eye cannot help here. Every product page ships
 * static fallback markup reading `PULSE<span>STUDIO</span>`, and the
 * renderer writes back exactly those bytes. So a page that is NOT wired
 * looks identical to a page that is. Rename the selector, drop the script
 * tag, throw before line 32 of theme-boot — the header still says PULSE
 * STUDIO, and the only symptom appears on the day somebody rebrands and
 * four headers keep the old name.
 *
 * A suite cannot cover this. `run-suites.mjs` gives each suite a stub DOM
 * with no `querySelectorAll` and no `setAttribute`, deliberately: "these
 * checks exercise LOGIC. Anything about layout, focus, or real rendering
 * belongs in a browser." Widening that stub until it could host
 * `renderStudioBrand` would prove the stub works, not the page. So the wire
 * is checked statically here, and the RENDERING was watched in a browser —
 * see the note in components/README.md.
 *
 * WHAT IT CHECKS, per page under app/ that shows the studio's name:
 *
 *  1. IT IS WIRED. A page carrying `.brand-word` or `[data-studio-name]`
 *     must load `theme-boot.js`. Without it the markup is never filled and
 *     the clone seam is dead for that page.
 *  2. THE SELECTOR CAN MATCH. `.brand-word` is only ever found inside
 *     `.home-brand`, so a page with one and not the other has markup the
 *     renderer will walk straight past.
 *  3. THE FALLBACK IS NOT STALE. The static words a no-JS visitor sees are
 *     compared against what `studioWordParts()` produces from the CURRENT
 *     `STUDIO_NAME`. components/README.md lists two honest remainders a
 *     rebrand leaves in an owner's lane — the `<title>` and hardcoded
 *     prose. This is a third one it does not list, and unlike the prose
 *     grep, a gate can see it.
 *
 * It imports the COMPILED `app/shared/brand.js` rather than restating the
 * word-splitting rule, for the reason check-contrast.mjs imports color.js:
 * a gate carrying its own copy of the rule can bless output the browser
 * would never produce.
 *
 * HONEST LIMITS. Rule 2 tests that both classes are present on the page,
 * NOT that one nests inside the other — that needs a parser, and this reads
 * text. A page could satisfy it with the two classes in unrelated corners.
 * Rule 1 sees a script tag, not whether the module threw at load. And none
 * of the three would notice `renderStudioBrand` being changed to fill the
 * wrong text, which is what the browser check covers.
 *
 * Run: node scripts/check-brand.mjs   (also runs inside `npm run check`)
 * Prove it still works: node scripts/check-brand.mjs --self-test
 */

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { isCommand } from "./is-command.mjs";
import { nodeTooOldNote } from "./node-floor.mjs";

const IS_COMMAND = isCommand(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ---------- the rules, as pure functions ---------- */

/** What a page claims about the studio's name. */
/* A CLASS ATTRIBUTE IS A LIST, and `\bname\b` is not how you read one.
 * The first draft matched `brand-word` inside `brand-word-legacy`, because
 * `-` is a non-word character and so there is a word boundary sitting right
 * in the middle of the name. This requires the token to be bounded by the
 * quote or by whitespace, which is what "has this class" actually means.
 * The self-test plants that exact near-miss, and it is the case that
 * failed the first time this gate ran. */
/* BOTH QUOTE STYLES, and the alternation is deliberately non-capturing so
 * that the group numbers in the span match below stay where they are. No
 * page under app/ uses single quotes today — but a gate that goes blind on
 * a quoting style would not report a problem, it would report NOTHING, and
 * a page that shows the studio's name would silently stop being counted as
 * one. That is the shape this repo refuses everywhere else. */
function classToken(name) {
  return `class=(?:"(?:[^"]*\\s)?${name}(?:\\s[^"]*)?"|'(?:[^']*\\s)?${name}(?:\\s[^']*)?')`;
}

export function brandMarkup(html) {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, " ");
  const brandWord = new RegExp(classToken("brand-word")).test(withoutComments);
  const homeBrand = new RegExp(classToken("home-brand")).test(withoutComments);
  /* Same trap on the attribute side: `data-studio-name-legacy` is a
   * different attribute and must not read as this one. */
  const studioName = /data-studio-name(?=[\s=>])/.test(withoutComments);
  /* The renderer is reached only through theme-boot, whatever relative path
   * a page spells it with. */
  const wired = /<script[^>]+src=["'][^"']*theme-boot\.js["']/.test(withoutComments);
  /* The static words: the brand-word span's own text, then the nested
   * span's. Absent when the page has no such markup. */
  const spanMatch = new RegExp(
    `<span[^>]*${classToken("brand-word")}[^>]*>([^<]*)(?:<span[^>]*>([^<]*)</span>)?`,
  ).exec(withoutComments);
  return {
    brandWord,
    homeBrand,
    studioName,
    wired,
    lead: spanMatch === null ? null : (spanMatch[1] ?? "").trim(),
    accent: spanMatch === null ? null : (spanMatch[2] ?? "").trim(),
  };
}

/** Every problem with one page, given the brand words it should show. */
export function pageProblems(html, expected) {
  const m = brandMarkup(html);
  const shows = m.brandWord || m.studioName;
  const problems = [];
  if (shows && !m.wired) {
    problems.push(
      "shows the studio's name but never loads theme-boot.js, so nothing fills it — " +
        "the clone seam is dead on this page and it looks identical to one that works",
    );
  }
  if (m.brandWord && !m.homeBrand) {
    problems.push(
      "has a .brand-word with no .home-brand — renderStudioBrand only looks inside " +
        ".home-brand, so this markup is never reached",
    );
  }
  if (m.lead !== null && (m.lead !== expected.lead || m.accent !== expected.accent)) {
    problems.push(
      `static fallback reads ${JSON.stringify(`${m.lead} ${m.accent}`.trim())} but brand.ts now says ` +
        `${JSON.stringify(`${expected.lead} ${expected.accent}`.trim())} — a visitor without JavaScript ` +
        "sees the old studio name",
    );
  }
  return problems;
}

/* ---------- the self-test ---------- */

const WIRED = '<script type="module" src="../../shared/theme-boot.js"></script>';
const HEADER = '<a class="home-brand" href="/"><span class="brand-word">PULSE<span>STUDIO</span></span></a>';
const GOOD = `<html><body>${HEADER}${WIRED}</body></html>`;
const EXPECTED = { lead: "PULSE", accent: "STUDIO" };

async function selfTest() {
  const planted = [
    ["a wired, correct page passes", GOOD, EXPECTED, 0],
    /* THE FAULT THIS GATE EXISTS FOR: the markup is perfect and the page
     * looks right in every browser, because the fallback says what the
     * renderer would have written. */
    ["a page that never loads theme-boot is caught", GOOD.replace(WIRED, ""), EXPECTED, 1],
    ["a brand-word outside any home-brand is caught",
      GOOD.replace('class="home-brand"', 'class="masthead"'), EXPECTED, 1],
    ["a stale fallback after a rebrand is caught", GOOD, { lead: "VERO", accent: "STUDIO" }, 1],
    ["a stale accent alone is caught", GOOD, { lead: "PULSE", accent: "GYM" }, 1],
    /* A one-word studio: the renderer writes no nested span, so a page
     * whose fallback still carries one is stale. */
    ["a one-word rebrand catches the leftover second word", GOOD, { lead: "VERO", accent: "" }, 1],
    ["a page with only data-studio-name still needs the wire",
      '<html><body><p data-studio-name></p></body></html>', EXPECTED, 1],
    ["...and passes once it is wired",
      `<html><body><p data-studio-name></p>${WIRED}</body></html>`, EXPECTED, 0],
    /* A page that shows the name nowhere is not this gate's business. */
    ["a page with no brand markup is left alone", "<html><body><p>Classes</p></body></html>", EXPECTED, 0],
    /* Two faults on one page are both reported, not just the first. */
    ["an unwired page with a stale fallback reports both",
      GOOD.replace(WIRED, ""), { lead: "VERO", accent: "STUDIO" }, 2],
    /* Commented-out markup is not markup. A page that has the brand block
     * commented out should not be told to wire it up. */
    ["brand markup inside an HTML comment is ignored",
      `<html><body><!-- ${HEADER} --><p>Classes</p></body></html>`, EXPECTED, 0],
    /* The class test matches whole words: "brand-word-legacy" is a
     * different class and must not read as this one. */
    /* A class attribute is a LIST, and this is the near-miss that made the
     * first draft of this gate wrong: `\bbrand-word\b` matches inside
     * `brand-word-legacy`, because `-` is a non-word character. */
    ["a class that merely starts the same is not a match",
      '<html><body><span class="brand-word-legacy">X</span></body></html>', EXPECTED, 0],
    ["...nor one that merely ends the same",
      '<html><body><span class="legacy-brand-word">X</span></body></html>', EXPECTED, 0],
    ["...but a real second class alongside it still matches",
      GOOD.replace('class="brand-word"', 'class="wordmark brand-word"'), EXPECTED, 0],
    ["a lookalike data attribute is not the real one",
      '<html><body><p data-studio-name-legacy></p></body></html>', EXPECTED, 0],
    /* Whitespace in the markup is not a difference in the name. */
    /* A quoting style must not be able to blind this gate. */
    ["single-quoted attributes are read the same way",
      GOOD.replace(/class="([^"]*)"/g, "class='$1'").replace(/src="([^"]*)"/g, "src='$1'"),
      EXPECTED, 0],
    ["...and a single-quoted page that is unwired is still caught",
      GOOD.replace(WIRED, "").replace(/class="([^"]*)"/g, "class='$1'"), EXPECTED, 1],
    ["indented fallback markup still matches",
      GOOD.replace(">PULSE<", ">\n      PULSE\n      <"), EXPECTED, 0],
  ];

  let failed = 0;
  for (const [label, html, expected, want] of planted) {
    const got = pageProblems(html, expected).length;
    if (got !== want) {
      failed += 1;
      console.error(`  self-test MISS — ${label}: wanted ${want} problem(s), got ${got}`);
    }
  }

  /* The real brand module has to produce the words the pages actually
   * ship, or every verdict above is measured against the wrong name. */
  let liveCases = 0;
  try {
    const brand = await import(pathToFileURL(join(ROOT, "app/shared/brand.js")).href);
    liveCases = 2;
    const parts = brand.studioWordParts();
    if (parts.lead !== "PULSE" || parts.accent !== "STUDIO") {
      failed += 1;
      console.error(`  self-test MISS — brand.js gives ${JSON.stringify(parts)}, not PULSE / STUDIO`);
    }
    /* A one-word name must give an empty accent, not undefined: the
     * renderer tests `accent !== ""` before appending a span. */
    const single = brand.studioWordParts("Vero");
    if (single.lead !== "VERO" || single.accent !== "") {
      failed += 1;
      console.error(`  self-test MISS — a one-word name gives ${JSON.stringify(single)}`);
    }
  } catch (error) {
    failed += 1;
    console.error(`  self-test MISS — could not read app/shared/brand.js: ${error.message}`);
    const note = nodeTooOldNote();
    if (note !== null) console.error(`  ${note}`);
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
  const compiled = join(ROOT, "app/shared/brand.js");
  if (!existsSync(compiled)) {
    console.error(
      "check-brand: app/shared/brand.js is missing. This gate imports the compiled module rather than " +
        "restating how a studio name splits into words, so that it cannot bless markup the browser would " +
        "never produce. Run `npm run build` first.",
    );
    process.exit(1);
  }
  let studioWordParts;
  let studioName;
  try {
    const brand = await import(pathToFileURL(compiled).href);
    ({ studioWordParts, STUDIO_NAME: studioName } = brand);
  } catch (error) {
    console.error(`check-brand: could not import app/shared/brand.js — ${error.message}`);
    const note = nodeTooOldNote();
    if (note !== null) console.error(note);
    process.exit(1);
  }
  const expected = studioWordParts();

  const pages = execFileSync("git", ["-C", ROOT, "ls-files", "app/*.html", "app/**/*.html"], {
    encoding: "utf8",
  }).split("\n").map((f) => f.trim()).filter((f) => f !== "");

  const problems = [];
  let showing = 0;
  for (const page of pages) {
    const html = readFileSync(join(ROOT, page), "utf8");
    const m = brandMarkup(html);
    if (m.brandWord || m.studioName) showing += 1;
    for (const problem of pageProblems(html, expected)) problems.push({ page, problem });
  }

  console.log(
    `check-brand: ${pages.length} pages read, ${showing} show the studio's name — ` +
      `all checked against brand.ts, which currently says ${JSON.stringify(studioName)}.`,
  );
  if (problems.length === 0) {
    console.log("check-brand: every page that shows the studio's name is wired to receive it. PASS");
    return;
  }
  for (const { page, problem } of problems) console.error(`  ${page} · ${problem}`);
  console.error(
    `check-brand: ${problems.length} problem${problems.length === 1 ? "" : "s"} with the clone seam. FAIL`,
  );
  process.exit(1);
}

if (IS_COMMAND) {
  if (process.argv.includes("--self-test")) await selfTest();
  else await run();
}
