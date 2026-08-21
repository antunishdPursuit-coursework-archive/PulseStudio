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
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const IS_COMMAND =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

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
  let failed = 0;
  for (const c of planted) {
    const { web, sources, other } = classifyPublished([c.file]);
    const got = web.length ? "web" : sources.length ? "sources" : "other";
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
