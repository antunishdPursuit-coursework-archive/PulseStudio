#!/usr/bin/env node
/* Pulse Studio — the audience gate. TEAM-OWNED.
 *
 * WHY THIS EXISTS: the audience law says every consumer-facing surface
 * speaks TO its user — a member or a staff person — never ABOUT the
 * project. Builder names, product letters and build-process talk stay off
 * customer-visible copy, because authorship here is carried by the
 * builder's COLOUR and by app/shared/storytold.html, the one page whose
 * job is to tell the builders' story.
 *
 * The law was stated and never checked, and on the day this landed a
 * member opening the booking page read "BOOK A CLASS · Kerrian" — a
 * visible badge in the page header, 74 by 26 pixels, right under the
 * title. Not a typo and not hidden: a deliberate component in the shared
 * theme, `.owner-badge`, which the colour law had already made redundant
 * by carrying authorship in the accent instead.
 *
 * IT DOES NOT PUNISH THE PAST, and it especially does not punish other
 * people's lanes. Everything already visible on the day this landed is in
 * docs/audience-baseline.json with the owner who can remove it. Only new
 * copy fails. That is the same bargain check-styles.mjs and
 * check-contrast.mjs make, and it exists for a hard practical reason: a
 * gate that fails on a file its author cannot edit blocks the whole team's
 * merges over someone else's decision.
 *
 * WHAT COUNTS AS A SURFACE: served .html under app/, except two kinds.
 * `storytold.html` is exempt because the law names it as the page that
 * carries authorship. A page named tests.html is exempt because a unit-check
 * page is a developer surface, not a consumer one — they are published,
 * which is a separate question that check-published.mjs raises, but nobody
 * books a class on them.
 *
 * HONEST LIMITS: it reads STATIC text only. Script and style blocks are
 * stripped, then tags, leaving roughly what a reader sees — so a CSS
 * variable named `--kerrian` in a gradient is correctly ignored, and so is
 * a name in an attribute. It cannot see text a script writes at runtime,
 * and it cannot tell a builder's name from a member who happens to share
 * it. It catches copy somebody typed into a page, which is how every
 * instance here got there.
 *
 * Run: node scripts/check-audience.mjs   (also runs inside `npm run check`)
 * Prove it still works: node scripts/check-audience.mjs --self-test
 */

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const IS_COMMAND =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = "docs/audience-baseline.json";

/* Pages that are published but are not consumer surfaces, each with the
 * reason, because "skipped: 4" tells a reader nothing about whether the
 * skipping was right. Anything not named here is treated as copy a member
 * or a staff person reads. */
const NOT_CONSUMER_FACING = {
  "app/shared/storytold.html":
    "the one page the audience law names as carrying the builders' story",
  "app/shared/ready.html":
    "the team's own readiness board — owners, open defects, round-two notes. It is linked from the root README on purpose so anybody can check it, which also means it sits on the studio's public domain; that placement is a team question, not an audience-law failure",
};
/* A unit-check page states its own count to a developer. Nobody books a
 * class on one. */
const isDeveloperSurface = (file) => file.endsWith("/tests.html");

/* What must not appear in copy a member or a staff person reads. The
 * builders by name, and the product letters — "Product A" and the rest are
 * how the team talks about the work, never how the work introduces itself. */
const BUILDERS = ["Kerrian", "Manny", "Dennis", "Rensley", "Emmanuel"];
const PRODUCT_LETTERS = /\bProduct\s+[ABCD]\b/g;

/* ---------- the rule, as a pure function ---------- */

/**
 * Roughly what a reader sees: script and style blocks removed first (a
 * CSS variable named after a developer is not copy), then tags, which
 * takes attributes with them.
 */
export function visibleText(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;/gi, " ");
}

/** Every builder name and product letter in copy, with the line it is on. */
export function audienceHits(html) {
  const hits = [];
  const lines = html.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const text = visibleText(lines[i] ?? "");
    for (const name of BUILDERS) {
      const re = new RegExp(`\\b${name}\\b`, "g");
      if (re.test(text)) hits.push({ line: i + 1, found: name });
    }
    let m;
    PRODUCT_LETTERS.lastIndex = 0;
    while ((m = PRODUCT_LETTERS.exec(text)) !== null) {
      hits.push({ line: i + 1, found: m[0] });
    }
  }
  return hits;
}

/* ---------- the self-test ---------- */

function selfTest() {
  const planted = [
    { label: "a visible builder badge fails", html: '<span class="owner-badge">Kerrian</span>', want: 1 },
    { label: "a CSS variable named after a builder is not copy", html: '<stop stop-color="var(--kerrian, #3b82f6)"/>', want: 0 },
    { label: "...even inside a style block", html: "<style>.chip.a { background: var(--manny); }</style>", want: 0 },
    { label: "...and a comment is not copy either", html: "<!-- Rensley owns this page -->", want: 0 },
    { label: "a product letter in copy fails", html: "<p>Welcome to Product D</p>", want: 1 },
    { label: "a class attribute naming a product does not", html: '<body class="product-d">', want: 0 },
    { label: "ordinary member copy passes", html: "<h1>Book a class</h1><p>There is a spot with your name on it.</p>", want: 0 },
    { label: "a builder name in a heading fails", html: "<h2>Built by Rensley</h2>", want: 1 },
  ];
  let failed = 0;
  for (const c of planted) {
    const got = audienceHits(c.html).length;
    if (got !== c.want) {
      failed += 1;
      console.error(`  self-test MISS — ${c.label}: wanted ${c.want}, got ${got}`);
    }
  }
  console.log(
    `self-test: ${planted.length} planted cases, ${planted.length - failed} behaved, ${failed} did not.`,
  );
  console.log(
    failed === 0
      ? "self-test PASSED — the gate can still fail. (Says nothing about runtime copy; see the limits above.)"
      : "self-test FAILED — the gate is blind.",
  );
  process.exit(failed === 0 ? 0 : 1);
}

/* ---------- the gate ---------- */

function run() {
  const pages = execFileSync("git", ["-C", ROOT, "ls-files", "app"], {
    encoding: "utf8",
  })
    .split("\n").map((f) => f.trim())
    .filter((f) => f.endsWith(".html"));

  const surfaces = pages.filter(
    (f) => NOT_CONSUMER_FACING[f] === undefined && !isDeveloperSurface(f),
  );
  const namedSkips = pages.filter((f) => NOT_CONSUMER_FACING[f] !== undefined);
  const testPages = pages.filter(
    (f) => isDeveloperSurface(f) && NOT_CONSUMER_FACING[f] === undefined,
  );

  const baselinePath = join(ROOT, BASELINE);
  const baseline = existsSync(baselinePath)
    ? JSON.parse(readFileSync(baselinePath, "utf8"))
    : { allowed: [] };
  const allowed = new Map(
    baseline.allowed.map((e) => [`${e.file}|${e.found}`, e]),
  );

  const known = [];
  const fresh = [];
  for (const file of surfaces) {
    const html = readFileSync(join(ROOT, file), "utf8");
    for (const hit of audienceHits(html)) {
      const key = `${file}|${hit.found}`;
      const entry = allowed.get(key);
      if (entry) known.push({ ...hit, file, ...entry });
      else fresh.push({ ...hit, file });
    }
  }

  console.log(
    `check-audience: ${surfaces.length} consumer-facing page${surfaces.length === 1 ? "" : "s"} read for builder names and product letters — ` +
      `${known.length} known, ${fresh.length} new.`,
  );
  console.log(
    `check-audience: ${testPages.length} unit-check page${testPages.length === 1 ? "" : "s"} skipped — a developer surface, not a consumer one.`,
  );
  for (const file of namedSkips) {
    console.log(`  skipped · ${file} · ${NOT_CONSUMER_FACING[file]}.`);
  }
  for (const k of known) {
    console.log(`  known · ${k.file}:${k.line} · "${k.found}" is read by ${k.audience}. ${k.why} (owner: ${k.owner})`);
  }

  if (fresh.length === 0) {
    console.log("check-audience: no new copy talks about the project instead of to its user. PASS");
    return;
  }
  for (const f of fresh) {
    console.error(
      `  NEW · ${f.file}:${f.line} · "${f.found}" appears in copy a member or staff person reads. ` +
        "Authorship is carried by the builder's colour and by app/shared/storytold.html, never by a name on a customer screen.",
    );
  }
  console.error(
    `check-audience: ${fresh.length} new mention${fresh.length === 1 ? "" : "s"} of the project in copy meant for its user. FAIL`,
  );
  process.exit(1);
}

if (IS_COMMAND) {
  if (process.argv.includes("--self-test")) selfTest();
  else run();
}
