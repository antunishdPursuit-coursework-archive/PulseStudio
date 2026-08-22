#!/usr/bin/env node
/* Pulse Studio — the publishing gate. TEAM-OWNED.
 *
 * WHY THIS EXISTS: `app/` is not a source folder that happens to contain
 * the site. It IS the site. The Pages workflow publishes it with
 * `path: app`, so every file under it gets a public address, whether or not
 * anything links to it.
 *
 * That has cost us once already. Two of Product D's internal documents sat
 * in a product folder and were served at a public URL until 2026-08-21.
 * They were moved to docs/ and the filing law gained the sentence "Nothing
 * under `app/` is private" — but the sentence was all that stood there, and
 * a rule nobody can check is a wish.
 *
 * WHAT IT DOES: lists every tracked file under `app/` that a browser would
 * never request as part of the website, and fails when a new one appears.
 * Everything already published on the day it landed is in
 * docs/published-baseline.json with the reason it is allowed, so the past
 * is reported rather than punished — the same bargain check-styles.mjs
 * makes. The baseline is meant to shrink.
 *
 * TYPESCRIPT SOURCES ARE COUNTED, NOT LISTED. Every `.ts` under `app/` is
 * published beside the `.js` the browser actually runs, because the browser
 * loads ES modules from the same tree the compiler writes into. That is a
 * consequence of how this repo builds, not a filing decision somebody made,
 * so itemising forty of them would bury the one file that matters. The
 * count is printed every run instead, which is the honest way to keep a
 * known exposure visible without pretending it is news.
 *
 * HONEST LIMITS: it judges by file extension and path, not by reading the
 * contents. A genuinely private document named `index.html` would sail
 * through. It catches the mistake that has actually happened here — an
 * internal note filed next to the code it describes — and claims nothing
 * more. It also cannot see untracked files, which Pages would not publish
 * either.
 *
 * Run: node scripts/check-published.mjs   (also runs inside `npm run check`)
 * Prove it still works: node scripts/check-published.mjs --self-test
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
const BASELINE = "docs/published-baseline.json";

/* What a browser legitimately asks for when it loads this site. `.txt` is
 * here for robots.txt and the font licences; `.xml` for the sitemap;
 * `.json` because loadFixtures() fetches the shared records at runtime. */
const WEB_EXTENSIONS = [
  ".html", ".css", ".js", ".json", ".xml", ".txt", ".svg", ".ico",
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".woff", ".woff2", ".ttf",
];

/* ---------- the rule, as a pure function ---------- */

export function isWebFile(file) {
  const lower = file.toLowerCase();
  return WEB_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function isTypeScriptSource(file) {
  const lower = file.toLowerCase();
  return lower.endsWith(".ts") && !lower.endsWith(".d.ts");
}

/**
 * Split everything `app/` publishes into the three things a reader needs
 * to tell apart: the website, the sources that ride along with it, and
 * anything else — which is the category that has bitten us.
 */
export function classifyPublished(files) {
  const web = [];
  const sources = [];
  const other = [];
  for (const file of files) {
    if (isTypeScriptSource(file)) sources.push(file);
    else if (isWebFile(file)) web.push(file);
    else other.push(file);
  }
  return { web, sources, other };
}

/* HAS THIS PAGE DECIDED WHETHER IT WANTS TO BE FOUND?
 *
 * Every page under app/ is at a public URL. There are exactly two honest
 * positions: it is in sitemap.xml because people should find it, or it
 * carries `<meta name="robots" content="noindex">` because they should not.
 * A page that is NEITHER has not been thought about, and on this site that
 * is how a staff surface ends up quietly indexable.
 *
 * robots.txt cannot help. It says so itself at length: this is a GitHub
 * Pages PROJECT site, so the file a crawler reads is the USER site's
 * robots.txt in another repository entirely, and /PulseStudio/robots.txt is
 * never fetched. `Disallow` would be the wrong tool anyway — it blocks
 * CRAWLING, so a disallowed page can still be listed from links pointing at
 * it, and a crawler that may not fetch the page can never see its noindex.
 * The tag is the only thing that actually works, which is why the
 * re-engagement tool carries one and stays crawlable.
 *
 * BOTH AT ONCE is the other failure, and it is a contradiction rather than
 * an omission: advertising a page in the sitemap while telling crawlers to
 * drop it. Neither is a security control. A staff page holding real member
 * data belongs behind a sign-in. */
export function indexingChoice(html, listedInSitemap) {
  const noindex = /<meta[^>]+name=["']robots["'][^>]*noindex/i.test(html);
  if (noindex && listedInSitemap) return "contradicted";
  if (!noindex && !listedInSitemap) return "undecided";
  return "decided";
}

/* ---------- the self-test ---------- */

function selfTest() {
  const planted = [
    { label: "a page is the website", file: "app/index.html", want: "web" },
    { label: "the shared fixture is fetched at runtime", file: "app/shared/fixtures.json", want: "web" },
    { label: "robots.txt is the website", file: "app/robots.txt", want: "web" },
    { label: "a TypeScript source is counted separately", file: "app/shared/data.ts", want: "sources" },
    { label: "a brief filed beside the code is NOT the website", file: "app/products/d-reengagement/CLAUDE.md", want: "other" },
    { label: "a database design document is NOT the website", file: "app/shared/auth/schema.sql", want: "other" },
    { label: "the incident that started this — an internal note under app/", file: "app/products/d-reengagement/SENIOR-DEV-BRIEF.md", want: "other" },
    { label: "a shell script under app/ is NOT the website", file: "app/products/d-reengagement/bundle.sh", want: "other" },
  ];
  /* THE INDEXING DECISION, at each of its corners. */
  const NOINDEX = '<meta name="robots" content="noindex, nofollow">';
  const indexingCases = [
    ["a page in the sitemap and not noindex has decided", "<head></head>", true, "decided"],
    ["a noindex page absent from the sitemap has decided", NOINDEX, false, "decided"],
    ["a page that is neither has not decided", "<head><title>x</title></head>", false, "undecided"],
    ["a page that is both contradicts itself", NOINDEX, true, "contradicted"],
    /* Single quotes and extra attributes are ordinary HTML, not a reason to
     * miss the tag and call a staff page undecided. */
    ["single quotes are still a noindex", "<meta name='robots' content='noindex'>", false, "decided"],
    /* A different meta tag that merely mentions the word must not count. */
    ["a description mentioning noindex is not a robots tag",
      '<meta name="description" content="how noindex works">', false, "undecided"],
  ];
  let failedIndexing = 0;
  for (const [label, html, listed, want] of indexingCases) {
    const got = indexingChoice(html, listed);
    if (got !== want) {
      failedIndexing += 1;
      console.error(`  self-test MISS — ${label}: wanted ${want}, got ${got}`);
    }
  }

  let failed = failedIndexing;
  for (const c of planted) {
    const { web, sources, other } = classifyPublished([c.file]);
    const got = web.length ? "web" : sources.length ? "sources" : "other";
    if (got !== c.want) {
      failed += 1;
      console.error(`  self-test MISS — ${c.label}: wanted ${c.want}, got ${got}`);
    }
  }
  console.log(
    `self-test: ${planted.length + indexingCases.length} planted cases, ${planted.length + indexingCases.length - failed} behaved, ${failed} did not.`,
  );
  console.log(
    failed === 0
      ? "self-test PASSED — the gate can still fail. (Says nothing about which files it reads; see the limits above.)"
      : "self-test FAILED — the gate is blind.",
  );
  process.exit(failed === 0 ? 0 : 1);
}

/* ---------- the gate ---------- */

function run() {
  const tracked = execFileSync("git", ["-C", ROOT, "ls-files", "app"], {
    encoding: "utf8",
  })
    .split("\n").map((f) => f.trim()).filter((f) => f !== "");

  const { web, sources, other } = classifyPublished(tracked);

  const baselinePath = join(ROOT, BASELINE);
  const baseline = existsSync(baselinePath)
    ? JSON.parse(readFileSync(baselinePath, "utf8"))
    : { allowed: [] };
  const allowed = new Map(baseline.allowed.map((e) => [e.file, e]));

  console.log(
    `check-published: app/ publishes ${tracked.length} tracked files — ` +
      `${web.length} the website asks for, ${sources.length} TypeScript sources beside the modules they compile to, ` +
      `${other.length} neither.`,
  );

  /* Second pass: every page's indexing decision. */
  const sitemapPath = join(ROOT, "app/sitemap.xml");
  const sitemap = existsSync(sitemapPath) ? readFileSync(sitemapPath, "utf8") : "";
  const knownIndexing = new Map((baseline.indexing ?? []).map((e) => [e.file, e]));
  const undecided = [];
  const contradicted = [];
  let pages = 0;
  for (const file of tracked) {
    if (!file.endsWith(".html")) continue;
    pages += 1;
    const urlPath = file.replace(/^app/, "").replace(/index\.html$/, "");
    const listed = sitemap.includes(`PulseStudio${urlPath}`);
    const verdict = indexingChoice(readFileSync(join(ROOT, file), "utf8"), listed);
    if (verdict === "undecided") undecided.push(file);
    if (verdict === "contradicted") contradicted.push(file);
  }
  const freshUndecided = undecided.filter((f) => !knownIndexing.has(f));
  console.log(
    `check-published: ${pages} published pages read for an indexing decision — ` +
      `${undecided.length} neither listed nor noindex (${undecided.length - freshUndecided.length} known), ` +
      `${contradicted.length} both at once.`,
  );
  for (const file of undecided.filter((f) => knownIndexing.has(f))) {
    const e = knownIndexing.get(file);
    console.log(`  known · ${file} · ${e.why} (owner: ${e.owner})`);
  }
  for (const file of contradicted) {
    console.error(
      `  ${file} · is listed in sitemap.xml AND carries a noindex tag. One of those is wrong: ` +
        "the sitemap invites crawlers, the tag turns them away.",
    );
  }
  for (const file of freshUndecided) {
    console.error(
      `  ${file} · is published at a public URL but is neither listed in sitemap.xml nor marked ` +
        '`<meta name="robots" content="noindex">`. Decide which it is. robots.txt cannot do this job — ' +
        "read its own comment: on a Pages project site the crawler never fetches it, and Disallow " +
        "blocks crawling rather than indexing, which stops a noindex tag from ever being seen.",
    );
  }
  if (contradicted.length > 0 || freshUndecided.length > 0) {
    console.error(
      `check-published: ${contradicted.length + freshUndecided.length} page(s) with no honest indexing decision. FAIL`,
    );
    process.exit(1);
  }

  const isNew = other.filter((f) => !allowed.has(f));
  const gone = [...allowed.keys()].filter((f) => !other.includes(f));

  for (const file of other) {
    const entry = allowed.get(file);
    if (entry) console.log(`  known · ${file} · ${entry.why} (owner: ${entry.owner})`);
  }
  for (const file of gone) {
    console.log(
      `  cleared · ${file} is no longer published — drop it from ${BASELINE} so the list keeps shrinking.`,
    );
  }

  if (isNew.length === 0) {
    console.log("check-published: nothing new is being published that is not the website. PASS");
    return;
  }
  for (const file of isNew) {
    console.error(
      `  NEW · ${file} · a browser would never ask for this as part of the site, and everything under app/ has a public address. ` +
        `If a teammate reads it and nobody else should, it belongs in docs/.`,
    );
  }
  console.error(
    `check-published: ${isNew.length} file${isNew.length === 1 ? " that is" : "s that are"} newly published and not the website. FAIL`,
  );
  process.exit(1);
}

if (IS_COMMAND) {
  if (process.argv.includes("--self-test")) selfTest();
  else run();
}
