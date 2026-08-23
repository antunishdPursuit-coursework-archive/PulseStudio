#!/usr/bin/env node
/* Pulse Studio — the settings gate. TEAM-OWNED.
 *
 * WHY THIS EXISTS. Appearance was a <details> drawer in the top bar of
 * every page: mode buttons, two canvas colour fields, a custom-colour
 * button and a status line, hanging off a header that also has to hold a
 * brand, a sign-in chip and a product's own navigation. It was the whole
 * settings surface, in the one place with the least room for it, and a
 * person had to find the drawer before they could use any of it.
 *
 * Settings is a PLACE now — app/shared/settings.html, linked from the
 * footer of all thirteen pages — and the header keeps light and dark. The
 * failure mode that follows is obvious and worth a gate rather than a
 * paragraph: a product decides its own page needs a theme switch, or a
 * colour picker, or its own remembered preference, and now the studio has
 * two settings that disagree about what the person chose. That is the same
 * shape as the four pasted headers scripts/check-styles.mjs exists for.
 *
 * WHAT IT HOLDS (root CLAUDE.md, "The settings law"):
 *   1. ONE page carries the settings mount point, and it is the shared one.
 *   2. No product folder builds appearance or settings UI of its own.
 *   3. No product reads or writes the theme keys. Shared code owns them.
 *   4. The header carries light/dark ONLY — the full panel goes to the
 *      mount point, never to a header.
 *   5. Light is the built-in default. The dark palette exists only inside
 *      a prefers-color-scheme query or an explicit [data-theme="dark"];
 *      the bare :root is light, so a device that asks for nothing gets it.
 *
 * HONEST LIMITS, because a checker that oversells itself is worse than
 * none:
 *   - It reads SOURCE TEXT. It never opens a browser, so it cannot tell
 *     you the settings page renders, only that it is wired to.
 *   - Rule 2 matches the shared appearance class names and the theme keys.
 *     A product that wrote its own theme switch under entirely different
 *     names, storing nothing, would pass. What it catches is the thing
 *     that actually happens: somebody copying the shared markup.
 *   - Rule 5 checks WHERE the dark palette is declared, not what any page
 *     finally renders. A rule elsewhere painting a dark background on a
 *     light theme is invisible to it.
 *
 * There is no baseline file, and that is a statement rather than an
 * omission: on the day this landed, nothing in any product folder violated
 * any of the five. The list starts empty and must stay that way.
 *
 * Run: node scripts/check-settings.mjs   (also runs inside `npm run check`)
 * Prove it still works: node scripts/check-settings.mjs --self-test
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { isCommand } from "./is-command.mjs";

/* Ten gates carried their own copy of this test and all ten were wrong the
 * same way: reached through a symlink the guard went false and the gate
 * exited 0 having checked nothing. See scripts/is-command.mjs. */
const IS_COMMAND = isCommand(import.meta.url);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const SETTINGS_PAGE = "app/shared/settings.html";
const MOUNT_ID = "appearance-settings";
const BOOT = "app/shared/theme-boot.ts";
const THEME = "app/shared/theme.css";

/* The shared appearance vocabulary. A product folder containing any of
 * these is a product building its own settings — which is the whole thing
 * this gate is here to stop. */
export const APPEARANCE_MARKERS = [
  "appearance-panel",
  "appearance-mode",
  "appearance-custom",
  "appearance-editor",
  "appearance-color",
  "appearance-hue",
  "appearance-status",
  "appearance-heading",
  MOUNT_ID,
];

/** The two keys only shared code may touch. */
export const THEME_KEYS = ["pulse-theme", "pulse-theme-custom"];

/** Everything wrong with one product file. Exported so the self-test can
 *  plant a file and see it caught, rather than trusting the gate's word. */
export function productFileProblems(path, text) {
  const problems = [];
  for (const marker of APPEARANCE_MARKERS) {
    if (text.includes(marker)) {
      problems.push(
        `uses the shared appearance name "${marker}". Settings lives once, at ` +
          `${SETTINGS_PAGE} — a second one is two settings that disagree.`,
      );
    }
  }
  for (const key of THEME_KEYS) {
    if (text.includes(key)) {
      problems.push(
        `names the storage key "${key}". The theme keys belong to ` +
          `app/shared/theme-boot.ts; a product that writes one changes what the ` +
          `whole studio looks like from inside one lane.`,
      );
    }
  }
  return problems.map((problem) => ({ path, problem }));
}

/** Whether the light palette is the built-in one.
 *
 *  The rule is "light first unless the device asks otherwise", and in CSS
 *  that means the bare :root carries the light background and every dark
 *  value sits behind a query or an explicit [data-theme]. This looks for a
 *  dark --bg declared somewhere unconditional, which is how that rule
 *  actually gets broken. */
export function lightFirstProblems(css) {
  const problems = [];
  /* The first :root block, up to its closing brace: the unconditional one. */
  const start = css.indexOf(":root {");
  if (start < 0) return ["theme.css declares no bare :root block, so nothing sets the built-in palette"];
  const block = css.slice(start, css.indexOf("}", start));
  const bg = /--bg:\s*(#[0-9a-fA-F]{3,8})/.exec(block);
  if (bg === null) {
    problems.push("the bare :root block sets no --bg, so the built-in appearance is whatever a browser decides");
    return problems;
  }
  const hex = bg[1].toLowerCase();
  /* Rough luminance is enough to tell a light ground from a dark one, and
   * it is deliberately rough: the exact WCAG arithmetic lives in
   * app/shared/color.ts and this gate is asking "which end", not "how
   * far". */
  const full = hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex.slice(0, 7);
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(full.slice(i, i + 2), 16));
  const rough = (r * 299 + g * 587 + b * 114) / 1000;
  if (rough < 128) {
    problems.push(
      `the built-in --bg is ${bg[1]}, which is a dark ground. Light is the ` +
        `default here; dark belongs inside prefers-color-scheme or [data-theme="dark"], ` +
        `so a device that asks for nothing gets light.`,
    );
  }
  return problems;
}

/** Everything wrong with the wiring in theme-boot. */
export function bootProblems(boot) {
  const problems = [];
  if (!boot.includes(`getElementById("${MOUNT_ID}")`)) {
    problems.push(
      `theme-boot never looks for #${MOUNT_ID}, so the settings page has ` +
        `nothing to render into`,
    );
  }
  if (!boot.includes("headerModes()")) {
    problems.push("theme-boot builds no light/dark switch for the header");
  }
  /* The regression to fear: the full panel finding its way back into a
   * header. appearanceSection() must be reachable only from the mount. */
  const mountAt = boot.indexOf("function mountAppearance");
  const tail = mountAt < 0 ? "" : boot.slice(mountAt);
  if (mountAt < 0) {
    problems.push("theme-boot has no mountAppearance(), so nothing decides which control a page gets");
  } else if (/host\.appendChild\(appearanceSection\(\)\)|host\.append\(appearanceSection\(\)\)/.test(tail)) {
    problems.push(
      "the full appearance section is being appended to a page header. The header " +
        "carries light and dark; everything else belongs on the settings page.",
    );
  }
  return problems;
}

/* ONE git call, however many pathspecs — never one call per pattern with
 * the results concatenated. git's ls-files globbing lets a star match a
 * slash, so a pathspec of app-slash-star-dot-html already returns every
 * page at every depth; adding the deeper pathspec in a SECOND call returns
 * most of them a second time. (Written out in words on purpose: the
 * deeper pattern contains a star followed by a slash, which ends a block
 * comment. That mistake has been made in this repository before.)
 *
 * It is not hypothetical here either. The first version of this gate
 * counted 29 pages where the repository has 15, found the settings mount
 * point twice, and failed on "2 pages declare the settings mount point" —
 * a gate reporting a defect it had invented. What caught it was the count
 * line this file prints on every run, which is the argument for printing
 * one.
 */
function trackedFiles(...patterns) {
  return execFileSync("git", ["-C", ROOT, "ls-files", ...patterns], { encoding: "utf8" })
    .split("\n")
    .map((f) => f.trim())
    .filter((f) => f !== "");
}

/* ---------- the gate ---------- */

function run() {
  const problems = [];

  if (!existsSync(join(ROOT, SETTINGS_PAGE))) {
    problems.push({ path: SETTINGS_PAGE, problem: "the one settings page is missing" });
  } else {
    const page = readFileSync(join(ROOT, SETTINGS_PAGE), "utf8");
    if (!page.includes(`id="${MOUNT_ID}"`)) {
      problems.push({ path: SETTINGS_PAGE, problem: `declares no id="${MOUNT_ID}" for the shared control to render into` });
    }
    if (!page.includes("theme-boot.js")) {
      problems.push({ path: SETTINGS_PAGE, problem: "does not load theme-boot, so nothing renders the control" });
    }
  }

  /* Exactly one page owns the mount point. Two would race, and the loser
   * would be a settings page that silently shows nothing. */
  const pages = trackedFiles("app/*.html", "app/**/*.html");
  const mounts = pages.filter((p) => readFileSync(join(ROOT, p), "utf8").includes(`id="${MOUNT_ID}"`));
  if (mounts.length > 1) {
    problems.push({ path: mounts.join(", "), problem: `${mounts.length} pages declare the settings mount point; exactly one may` });
  }
  /* THE COUNT IS OVER TRACKED PAGES, and a brand-new settings page is not
   * tracked until it is committed — so a bare "0 mount points" here would
   * mean "not committed yet" while the page sat on disk working perfectly.
   * Said out loud rather than printed as a zero somebody has to interpret. */
  const untracked = mounts.length === 0 && existsSync(join(ROOT, SETTINGS_PAGE))
    && readFileSync(join(ROOT, SETTINGS_PAGE), "utf8").includes(`id="${MOUNT_ID}"`);

  const productFiles = trackedFiles("app/products/**");
  let scanned = 0;
  for (const file of productFiles) {
    if (!/\.(ts|js|css|html|md)$/.test(file)) continue;
    scanned += 1;
    problems.push(...productFileProblems(file, readFileSync(join(ROOT, file), "utf8")));
  }

  const boot = existsSync(join(ROOT, BOOT)) ? readFileSync(join(ROOT, BOOT), "utf8") : "";
  for (const problem of bootProblems(boot)) problems.push({ path: BOOT, problem });

  const css = existsSync(join(ROOT, THEME)) ? readFileSync(join(ROOT, THEME), "utf8") : "";
  for (const problem of lightFirstProblems(css)) problems.push({ path: THEME, problem });

  // Never a silent pass: state the counts that were actually reached.
  console.log(
    `check-settings: 1 settings page, ${mounts.length} mount point${mounts.length === 1 ? "" : "s"} across ${pages.length} tracked pages` +
      `${untracked ? " (the settings page is on disk but not committed yet, so git does not list it)" : ""}, ` +
      `${scanned} product files read for a second settings surface.`,
  );
  console.log(
    `check-settings: the built-in appearance is light and the header carries light/dark only — ` +
      `${problems.length} problem${problems.length === 1 ? "" : "s"}.`,
  );

  if (problems.length === 0) {
    console.log("check-settings: settings lives in exactly one place. PASS");
    return;
  }
  for (const { path, problem } of problems) console.error(`  ${path} · ${problem}`);
  console.error("check-settings: settings has escaped its one place. FAIL");
  process.exit(1);
}

/* ---------- prove it can fail ---------- */

function selfTest() {
  const cases = [
    { label: "a product stylesheet copying the appearance panel",
      run: () => productFileProblems("app/products/x/styles.css", ".appearance-panel { color: red; }").length, want: 1 },
    { label: "a product module writing the theme key",
      run: () => productFileProblems("app/products/x/main.ts", 'localStorage.setItem("pulse-theme", t)').length, want: 1 },
    { label: "a product module writing the custom pair", 
      run: () => productFileProblems("app/products/x/main.ts", 'readStored("pulse-theme-custom")').length, want: 2 },
    { label: "ordinary product code passes",
      run: () => productFileProblems("app/products/x/main.ts", 'const rows = loadFixtures();').length, want: 0 },
    { label: "a dark built-in palette fails",
      run: () => lightFirstProblems(":root {\n  --bg: #000000;\n  --fg: #ffffff;\n}").length, want: 1 },
    { label: "a light built-in palette passes",
      run: () => lightFirstProblems(":root {\n  --bg: #ffffff;\n  --fg: #0a0a0a;\n}").length, want: 0 },
    { label: "...and a short hex is read the same way",
      run: () => lightFirstProblems(":root {\n  --bg: #111;\n}").length, want: 1 },
    { label: "a :root with no --bg at all fails",
      run: () => lightFirstProblems(":root {\n  --line: #ccc;\n}").length, want: 1 },
    { label: "the full panel appended to a header fails",
      run: () => bootProblems('getElementById("appearance-settings")\nheaderModes()\nfunction mountAppearance() { host.appendChild(appearanceSection()); }').length, want: 1 },
    { label: "the real wiring passes",
      run: () => bootProblems('getElementById("appearance-settings")\nheaderModes()\nfunction mountAppearance() { host.appendChild(headerModes()); }').length, want: 0 },
    { label: "a theme-boot with no header switch fails",
      run: () => bootProblems('getElementById("appearance-settings")\nfunction mountAppearance() {}').length, want: 1 },
  ];
  let failed = 0;
  for (const c of cases) {
    const got = c.run();
    const ok = got === c.want;
    if (!ok) failed += 1;
    console.log(`  ${ok ? "PASS" : "FAIL"} — ${c.label} (wanted ${c.want}, got ${got})`);
  }
  console.log(
    failed === 0
      ? `check-settings --self-test: ${cases.length} planted cases, all caught as expected.`
      : `check-settings --self-test: BROKEN — ${failed} of ${cases.length} planted cases were not caught.`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

if (IS_COMMAND) {
  if (process.argv.includes("--self-test")) selfTest();
  else run();
}
