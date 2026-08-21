#!/usr/bin/env node
/* Pulse Studio — the contrast gate. TEAM-OWNED.
 *
 * WHY THIS EXISTS: the colour law says every feature carries its
 * developer's colour, and nothing said those colours had to be readable.
 * Measured against the white theme, all four accents fail WCAG AA as text
 * — blue 3.68:1, amber 2.15:1, green 2.54:1, violet 4.23:1, where a person
 * reading body-size text needs 4.5:1 — and two of them fail again as a
 * button label on their own fill. Four developers had shipped four
 * inaccessible palettes without one of them being told, because nothing
 * measured.
 *
 * IT DOES NOT PUNISH THE PAST, and it especially does not reach into
 * another developer's colour. A developer's accent is theirs; this gate
 * measures it, records the failures in docs/contrast-baseline.json against
 * the owner who can clear them, and fails only on something NEW. That is
 * the same shape as docs/styles-baseline.json, for the same reason: the
 * list is meant to shrink and never grow, and when an owner fixes theirs
 * the gate tells them to drop the line.
 *
 * THE THRESHOLDS ARE WCAG 2.1 AA, and the distinction matters more than
 * the number. Body-size TEXT needs 4.5:1. A UI BOUNDARY — a border, a
 * rule, an outline — needs 3:1, because you only have to see where it is,
 * not read it. That is why an identity colour can stay exactly as it is
 * for every decorative job while a companion token carries the text.
 *
 * HONEST LIMITS, because a checker that oversells itself is worse than
 * none:
 *   - It reads the TOKENS, not the rendered page. It knows what
 *     --accent-strong resolves to on each theme; it does not know that
 *     some rule somewhere put grey text on a grey panel.
 *   - It cannot check the custom theme, because those colours are chosen by
 *     the person using the page at run time. That hole is now covered at
 *     RUN TIME instead: theme-boot enforces 4.5:1 between their background
 *     and text, measures both accent tones against the background they
 *     picked and keeps the readable one, and says so plainly when neither
 *     clears 4.5:1 — which a two-tone palette cannot do for a mid-tone
 *     background. This gate still measures only the two built-in themes.
 *   - Opacity, gradients, images behind text, and anything computed by
 *     filter() are invisible to it.
 *   - It assumes body-size text. A pairing that fails here may be legal
 *     for large display type at 3:1; the gate does not model type size.
 *
 * Run: node scripts/check-contrast.mjs   (also runs inside `npm run check`)
 * Prove it still works: node scripts/check-contrast.mjs --self-test
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const IS_COMMAND =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const THEME = "app/shared/theme.css";
const BASELINE = "docs/contrast-baseline.json";

const AA_TEXT = 4.5;

const DEVELOPERS = [
  { key: "kerrian", product: "A", owner: "Kerrian" },
  { key: "manny", product: "B", owner: "Manny" },
  { key: "dennis", product: "C", owner: "Dennis" },
  { key: "rensley", product: "D", owner: "Rensley" },
];

export function relativeLuminance(hex) {
  const channels = [0, 2, 4]
    .map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrast(a, b) {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** Read `--name: #rrggbb;` declarations out of a CSS block. */
function tokensIn(block) {
  const found = {};
  for (const m of block.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    found[m[1]] = m[2].toLowerCase();
  }
  return found;
}

/** The token values that apply in each theme. Later blocks override earlier
 *  ones, which is exactly how the cascade resolves them in a browser. */
export function themePalettes(css) {
  const rootBlock = css.match(/:root\s*\{([\s\S]*?)\n\}/);
  const light = rootBlock === null ? {} : tokensIn(rootBlock[1]);
  const darkBlock = css.match(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/);
  const dark = { ...light, ...(darkBlock === null ? {} : tokensIn(darkBlock[1])) };
  return { light, dark };
}

/** Every pairing a person actually has to READ, per developer per theme. */
export function readablePairs(palettes) {
  const pairs = [];
  for (const theme of ["light", "dark"]) {
    const t = palettes[theme];
    const bg = theme === "light" ? (t["bg"] ?? "#ffffff") : (t["bg"] ?? "#000000");
    for (const dev of DEVELOPERS) {
      const identity = t[dev.key];
      if (identity === undefined) continue;
      // The companion carries text where one is defined; otherwise the
      // identity colour is doing that job itself.
      const text = t[`${dev.key}-strong`] ?? identity;
      const ink = t[`${dev.key}-ink`];
      pairs.push({
        id: `${dev.key}/${theme}/accent-as-text`,
        owner: dev.owner,
        product: dev.product,
        theme,
        detail: `${dev.owner}'s accent as text on the ${theme} background`,
        ratio: contrast(text, bg),
        colors: `${text} on ${bg}`,
      });
      if (ink !== undefined) {
        pairs.push({
          id: `${dev.key}/${theme}/ink-on-accent`,
          owner: dev.owner,
          product: dev.product,
          theme,
          detail: `${dev.owner}'s button label on their own fill (${theme} theme)`,
          ratio: contrast(ink, text),
          colors: `${ink} on ${text}`,
        });
      }
    }
  }
  return pairs;
}

/* ---------- the self-test ---------- */

function selfTest() {
  const cases = [
    ["pure black on pure white is the maximum", contrast("#000000", "#ffffff"), 21],
    ["a colour against itself is the minimum", contrast("#8b5cf6", "#8b5cf6"), 1],
    ["the measured violet failure is reproduced", Number(contrast("#8b5cf6", "#ffffff").toFixed(2)), 4.23],
    ["the measured amber failure is reproduced", Number(contrast("#f59e0b", "#ffffff").toFixed(2)), 2.15],
    ["the readable violet clears AA on white", contrast("#743df5", "#ffffff") >= AA_TEXT, true],
    ["the dark-theme violet clears AA on black", contrast("#9e77f8", "#000000") >= AA_TEXT, true],
    ["the brand violet does NOT clear AA on white", contrast("#8b5cf6", "#ffffff") >= AA_TEXT, false],
  ];
  let failed = 0;
  for (const [label, got, want] of cases) {
    const ok = typeof want === "number" ? Math.abs(got - want) < 0.011 : got === want;
    if (!ok) {
      failed += 1;
      console.error(`  self-test MISS — ${label}: wanted ${want}, got ${got}`);
    }
  }
  // The parser has to survive the real file, not just arithmetic.
  const palettes = themePalettes(readFileSync(join(ROOT, THEME), "utf8"));
  const parsed = DEVELOPERS.filter((d) => palettes.light[d.key] !== undefined).length;
  if (parsed !== DEVELOPERS.length) {
    failed += 1;
    console.error(`  self-test MISS — token parsing: found ${parsed} of ${DEVELOPERS.length} developer colours in ${THEME}`);
  }
  const themesDiffer = palettes.light["bg"] !== palettes.dark["bg"];
  if (!themesDiffer) {
    failed += 1;
    console.error("  self-test MISS — the light and dark palettes parsed identically, so theme overrides are not being read");
  }
  console.log(`self-test: ${cases.length + 2} planted cases, ${cases.length + 2 - failed} behaved, ${failed} did not.`);
  console.log(
    failed === 0
      ? "self-test PASSED — the gate can still fail. (Says nothing about the rendered page; see the limits above.)"
      : "self-test FAILED — the gate is blind.",
  );
  process.exit(failed === 0 ? 0 : 1);
}

/* ---------- the run ---------- */

if (!IS_COMMAND) {
  // imported for its functions; nothing to do
} else if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  let css;
  try {
    css = readFileSync(join(ROOT, THEME), "utf8");
  } catch {
    console.error(`check-contrast: cannot read ${THEME}. The gate refuses to report a pass on a theme it never read.`);
    process.exit(1);
  }
  const palettes = themePalettes(css);
  const missing = DEVELOPERS.filter((d) => palettes.light[d.key] === undefined);
  if (missing.length > 0) {
    console.error(`check-contrast: ${THEME} no longer declares ${missing.map((d) => `--${d.key}`).join(", ")}.`);
    console.error("check-contrast: if a token was renamed, update DEVELOPERS in this file in the same commit.");
    process.exit(1);
  }

  const baselinePath = join(ROOT, BASELINE);
  const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : { known: [] };
  const knownById = new Map(baseline.known.map((k) => [k.id, k]));

  const pairs = readablePairs(palettes);
  const failures = pairs.filter((p) => p.ratio < AA_TEXT);
  const fresh = failures.filter((p) => !knownById.has(p.id));
  const cleared = [...knownById.keys()].filter((id) => !failures.some((f) => f.id === id));

  console.log(
    `check-contrast: ${pairs.length} readable pairings across ${DEVELOPERS.length} developers and 2 themes, ` +
      `measured against WCAG AA ${AA_TEXT}:1 — ${failures.length} below it, ${knownById.size} known and allowed, ${fresh.length} new.`,
  );
  for (const f of failures) {
    const known = knownById.get(f.id);
    console.log(
      `  ${known ? "known" : "NEW"} · ${f.detail} · ${f.ratio.toFixed(2)}:1 (${f.colors}) (owner: ${f.owner})`,
    );
  }
  for (const id of cleared) {
    console.log(`  cleared · ${id} now passes — delete its line from ${BASELINE} (owner: ${knownById.get(id).owner})`);
  }

  if (fresh.length > 0) {
    console.error(`check-contrast: ${fresh.length} NEW pairing${fresh.length === 1 ? "" : "s"} below AA. FAIL`);
    console.error("check-contrast: an identity colour can stay exactly as it is — define a --<name>-strong companion for the text instead.");
    process.exit(1);
  }
  console.log(
    failures.length === 0
      ? "check-contrast: every readable pairing clears AA. PASS"
      : "check-contrast: no new contrast failures. PASS",
  );
}
