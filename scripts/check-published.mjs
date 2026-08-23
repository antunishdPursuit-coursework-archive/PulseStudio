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

/* WHAT THE ROOT IS ALLOWED TO HOLD.
 *
 * The filing law names it exactly: "Does somebody who just cloned this and
 * knows nothing need it in the first 30 seconds? → the root. The contract:
 * README.md, CLAUDE.md, package.json, tsconfig.json, the product briefs."
 * Everything else answers one of the other three questions and belongs in
 * app/, scripts/ or docs/ — or the law's own conclusion applies: "If the
 * answer to all four is no, delete it — do not file it."
 *
 * The root drifted anyway, which is why this is a rule and not a sentence.
 * It holds a second, older copy of the site — an index.html linking to
 * member-dashboard.html and staff-dashboard.html, with their own CSS and
 * JavaScript. Pages publishes `path: app`, so none of it is served: a
 * person who clones this and opens the root index.html is looking at a
 * site the studio does not run.
 *
 * Deleting it is not this gate's call and not mine — those files have
 * owners, and whether they are history worth keeping is a team question.
 * The gate's job is that nobody has to rediscover them. */
export function belongsAtRoot(file) {
  if (file.includes("/")) return true; // not a root file; someone else's question
  if (/^PRODUCT_[A-Z]_.*\.md$/.test(file)) return true; // a product brief
  return [
    "README.md", "CLAUDE.md", "AGENTS.md", "SHARED_DATA_CONTRACT.md",
    "package.json", "package-lock.json", "tsconfig.json", ".gitignore",
  ].includes(file);
}

/* DOES THIS PAGE SAY WHERE ITS ICON IS?
 *
 * A browser given no `<link rel="icon">` asks the server for /favicon.ico
 * on its own, every load. This site ships `app/favicon.svg` — an SVG, which
 * a browser only finds when a page points at it — so eight of the twelve
 * published pages were requesting a file that does not exist and logging a
 * 404 in every visitor's console. Found by opening the pages, which is what
 * the git law means by "a green gate does not open a browser": the gate was
 * green through all of it.
 *
 * Small, and the reason it is worth a rule anyway is that it is invisible
 * from the code. Nothing fails, nothing renders wrong, and the only signal
 * is a console line nobody reads on a page nobody opened. */
export function declaresIcon(html) {
  return /<link[^>]+rel=["'][^"']*\bicon\b[^"']*["'][^>]*>/i.test(html);
}

/** True when a page loads the shared bootstrap. `theme-boot.js` injects a
 *  favicon link at runtime for any page that declares none — see
 *  `ensureFavicon()` there — so a page reaching it has a favicon PATH even
 *  when `declaresIcon` above reads false against its static markup. */
export function loadsSharedBootstrap(html) {
  /* NOT a \b regex: `\btheme-boot\.js\b` matches inside
   * "not-theme-boot.js", because `-` is a non-word character and a boundary
   * sits right there — the exact mistake check-brand.mjs made against
   * "brand-word-legacy" before its own self-test caught it. This compares
   * the FULL last path segment instead, so only the real file matches. */
  const srcs = [...html.matchAll(/<script[^>]+src=["']([^"']*)["']/gi)].map((m) => m[1]);
  return srcs.some((src) => src.split("/").pop() === "theme-boot.js");
}

/** Every published page needs SOME path to a favicon: its own markup, or the
 *  bootstrap that injects one at runtime. A page with neither is the gap
 *  `staff-dashboard.html` sat in — it declared no icon and loaded no
 *  bootstrap, so it asked every browser for /favicon.ico and got a 404, with
 *  nothing short of opening it in a browser to show that. */
export function hasFaviconPath(html) {
  return declaresIcon(html) || loadsSharedBootstrap(html);
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
  const rootCases = [
    ["the readme belongs at the root", "README.md", true],
    ["so does the brief", "CLAUDE.md", true],
    ["and its mirror", "AGENTS.md", true],
    ["and the manifest", "package.json", true],
    ["and the lockfile beside it", "package-lock.json", true],
    ["and a product brief", "PRODUCT_D_MEMBER_REENGAGEMENT_TOOL.md", true],
    ["and the shared contract the data law names", "SHARED_DATA_CONTRACT.md", true],
    ["a page does not", "index.html", false],
    ["nor a stylesheet", "staff-dashboard.css", false],
    ["nor a script", "staff-dashboard.js", false],
    /* Anything in a folder is another question's business — this rule is
     * about the root only, and must not start judging app/ or scripts/. */
    ["a file in app/ is not this rule's business", "app/index.html", true],
    ["nor one in scripts/", "scripts/check-published.mjs", true],
    ["nor one in docs/", "docs/README.md", true],
  ];
  let failedRoot = 0;
  for (const [label, file, want] of rootCases) {
    const got = belongsAtRoot(file);
    if (got !== want) {
      failedRoot += 1;
      console.error(`  self-test MISS — ${label}: wanted ${want}, got ${got}`);
    }
  }

  const iconCases = [
    ["a plain icon link counts", '<link rel="icon" href="/favicon.svg">', true],
    ["with a type and other attributes too",
      '<link rel="icon" href="../../favicon.svg" type="image/svg+xml">', true],
    ["single quotes count", "<link rel='icon' href='/favicon.svg'>", true],
    ["shortcut icon is still an icon", '<link rel="shortcut icon" href="/f.ico">', true],
    ["a page with no link has none", "<head><title>x</title></head>", false],
    /* A stylesheet is not an icon, and neither is the WORD icon in a title
     * — a rule that cannot tell those apart would pass every page. */
    ["a stylesheet is not an icon", '<link rel="stylesheet" href="/theme.css">', false],
    ["the word icon in prose is not a link", "<title>Our icon story</title>", false],
    ["a preload of the icon is not a declaration",
      '<link rel="preload" href="/favicon.svg" as="image">', false],
  ];
  let failedIcons = failedRoot;
  for (const [label, html, want] of iconCases) {
    const got = declaresIcon(html);
    if (got !== want) {
      failedIcons += 1;
      console.error(`  self-test MISS — ${label}: wanted ${want}, got ${got}`);
    }
  }

  let failedIndexing = failedIcons;
  for (const [label, html, listed, want] of indexingCases) {
    const got = indexingChoice(html, listed);
    if (got !== want) {
      failedIndexing += 1;
      console.error(`  self-test MISS — ${label}: wanted ${want}, got ${got}`);
    }
  }

  const faviconPathCases = [
    ["an icon link alone is a path", '<link rel="icon" href="/favicon.svg">', true],
    ["theme-boot alone is a path", '<script type="module" src="../../shared/theme-boot.js"></script>', true],
    ["both is still a path", '<link rel="icon" href="/f.svg"><script src="../../shared/theme-boot.js"></script>', true],
    /* THE GAP THIS CHECK EXISTS FOR: staff-dashboard.html, exactly. */
    ["neither is the gap this check exists for", "<head><title>x</title></head>", false],
    ["a DIFFERENT script is not the bootstrap",
      '<script type="module" src="staff-dashboard.js"></script>', false],
    ["theme-boot named as a SUBSTRING of another file is not a match",
      '<script src="../../shared/not-theme-boot.js"></script>', false],
  ];
  let failedFaviconPath = failedIndexing;
  for (const [label, html, want] of faviconPathCases) {
    const got = hasFaviconPath(html);
    if (got !== want) {
      failedFaviconPath += 1;
      console.error(`  self-test MISS — ${label}: wanted ${want}, got ${got}`);
    }
  }

  let failed = failedFaviconPath;
  for (const c of planted) {
    const { web, sources, other } = classifyPublished([c.file]);
    const got = web.length ? "web" : sources.length ? "sources" : "other";
    if (got !== c.want) {
      failed += 1;
      console.error(`  self-test MISS — ${c.label}: wanted ${c.want}, got ${got}`);
    }
  }
  console.log(
    `self-test: ${planted.length + indexingCases.length + iconCases.length + rootCases.length + faviconPathCases.length} planted cases, ${planted.length + indexingCases.length + iconCases.length + rootCases.length + faviconPathCases.length - failed} behaved, ${failed} did not.`,
  );
  console.log(
    failed === 0
      ? "self-test PASSED — the gate can still fail. (Says nothing about which files it reads; see the limits above.)"
      : "self-test FAILED — the gate is blind.",
  );
  process.exit(failed === 0 ? 0 : 1);
}

/* ---------- the gate ---------- */

const pagesWithIcons = (files) => files.filter((f) => f.endsWith(".html")).length;

function run() {
  const tracked = execFileSync("git", ["-C", ROOT, "ls-files", "app"], {
    encoding: "utf8",
  })
    .split("\n").map((f) => f.trim()).filter((f) => f !== "");
  /* The root pass needs the WHOLE list; the passes above are scoped to app/. */
  const tracked0 = execFileSync("git", ["-C", ROOT, "ls-files"], { encoding: "utf8" })
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

  /* Fourth pass: the root holds only the contract. */
  const knownRoot = new Map((baseline.root ?? []).map((e) => [e.file, e]));
  const strays = tracked0.filter((f) => !belongsAtRoot(f));
  const freshStrays = strays.filter((f) => !knownRoot.has(f));
  console.log(
    `check-published: ${tracked0.filter((f) => !f.includes("/")).length} tracked files at the repo root — ` +
      `${strays.length} that the filing law does not name (${strays.length - freshStrays.length} known).`,
  );
  for (const file of strays.filter((f) => knownRoot.has(f))) {
    const entry = knownRoot.get(file);
    console.log(`  known · ${file} · ${entry.why} (owner: ${entry.owner})`);
  }
  for (const file of freshStrays) {
    console.error(
      `  ${file} · sits at the repo root, which the filing law reserves for what a new cloner needs in the ` +
        "first 30 seconds: README, CLAUDE.md, package.json, tsconfig.json and the product briefs. Ask the " +
        "law's four questions — a browser at a URL means app/, a human or CI running it means scripts/, a " +
        `teammate reading it before writing code means docs/ — and if all four are no, delete it rather than file it.`,
    );
  }
  if (freshStrays.length > 0) {
    console.error(`check-published: ${freshStrays.length} file(s) at the root that the filing law does not name. FAIL`);
    process.exit(1);
  }

  /* Third pass: every page points at the icon this site ships. */
  const knownIcons = new Map((baseline.icons ?? []).map((e) => [e.file, e]));
  const iconless = [];
  for (const file of tracked) {
    if (!file.endsWith(".html")) continue;
    if (!declaresIcon(readFileSync(join(ROOT, file), "utf8"))) iconless.push(file);
  }
  const freshIconless = iconless.filter((f) => !knownIcons.has(f));
  console.log(
    `check-published: ${pagesWithIcons(tracked)} published pages checked for an icon link — ` +
      `${iconless.length} without one (${iconless.length - freshIconless.length} known).`,
  );
  for (const file of iconless.filter((f) => knownIcons.has(f))) {
    const entry = knownIcons.get(file);
    console.log(`  known · ${file} · ${entry.why} (owner: ${entry.owner})`);
  }
  for (const file of freshIconless) {
    console.error(
      `  ${file} · declares no <link rel="icon">, so every browser that opens it asks for /favicon.ico ` +
        "and gets a 404. This site ships app/favicon.svg, which a browser only finds when a page points " +
        'at it: add <link rel="icon" href="<path>/favicon.svg" type="image/svg+xml">.',
    );
  }
  if (freshIconless.length > 0) {
    console.error(
      `check-published: ${freshIconless.length} page(s) with no icon link. FAIL`,
    );
    process.exit(1);
  }

  /* Fourth pass: every published page has SOME path to a favicon — its own
   * markup, or the shared bootstrap that injects one at runtime. This is
   * the regression check for the gap `staff-dashboard.html` sat in: it
   * declared no icon and loaded no bootstrap, so nothing short of opening
   * it in a browser showed the 404 it asked for on every load. */
  const knownNoPath = new Map((baseline.noFaviconPath ?? []).map((e) => [e.file, e]));
  const noPath = [];
  for (const file of tracked) {
    if (!file.endsWith(".html")) continue;
    if (!hasFaviconPath(readFileSync(join(ROOT, file), "utf8"))) noPath.push(file);
  }
  const freshNoPath = noPath.filter((f) => !knownNoPath.has(f));
  console.log(
    `check-published: ${pagesWithIcons(tracked)} published pages checked for a favicon path — ` +
      `${noPath.length} with neither markup nor the shared bootstrap (${noPath.length - freshNoPath.length} known).`,
  );
  for (const file of noPath.filter((f) => knownNoPath.has(f))) {
    const entry = knownNoPath.get(file);
    console.log(`  known · ${file} · ${entry.why} (owner: ${entry.owner})`);
  }
  for (const file of freshNoPath) {
    console.error(
      `  ${file} · declares no <link rel="icon"> and loads no theme-boot.js, so nothing gives it a ` +
        "favicon path at all — every browser that opens it asks for /favicon.ico and gets a 404. Add " +
        'either <link rel="icon" href="<path>/favicon.svg" type="image/svg+xml"> or load ' +
        "<path>/shared/theme-boot.js, whichever this page's header system already expects.",
    );
  }
  if (freshNoPath.length > 0) {
    console.error(`check-published: ${freshNoPath.length} page(s) with no favicon path at all. FAIL`);
    process.exit(1);
  }

  /* Second pass: every page's indexing decision. */  /* Second pass: every page's indexing decision. */
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
