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

/* THE SAME ARITHMETIC THE BROWSER RUNS, not a second copy of it.
 *
 * This gate used to carry its own luminance and contrast functions. So did
 * `app/shared/theme-boot.ts`, where the identical formula decides whether
 * a person's chosen background and text pair is readable enough to accept.
 * Two implementations of one standard with nothing comparing them: the
 * gate could bless a palette the browser would refuse, or the reverse, and
 * the first anybody would know is somebody reading grey text the gate
 * called fine.
 *
 * They could not be merged in place — theme-boot reads `document` at
 * module load, so Node cannot import it. The arithmetic now lives in
 * `app/shared/color.ts`, which touches nothing, and both sides import it.
 * That is why this gate needs a build: it is deliberately reading the
 * compiled artefact the browser will load rather than a paraphrase of it. */
const COLOR_MODULE = join(ROOT, "app/shared/color.js");
if (!existsSync(COLOR_MODULE)) {
  console.error(
    "check-contrast: app/shared/color.js is not built. Run `npm run build` first — " +
      "this gate measures the same compiled arithmetic the browser runs, on purpose.",
  );
  process.exit(1);
}
const {
  contrast,
  luminance: relativeLuminance,
  isHexColor,
  hexToHsl,
  hslToHex,
  nearestReadable,
  parseCustomColors,
  DEFAULT_CUSTOM,
} = await import(pathToFileURL(COLOR_MODULE).href);
export { contrast, relativeLuminance };

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

    /* THE REST OF app/shared/color.ts, which the browser runs and nothing
     * checked until it moved out of theme-boot.ts. These are not extra
     * arithmetic for this gate's own sake: nearestReadable is what accepts
     * or adjusts a person's chosen colours, and it had no checks at all
     * because the module it lived in cannot be imported by anything. */
    ["contrast is symmetric, whichever way round it is asked",
      contrast("#123456", "#fedcba") === contrast("#fedcba", "#123456"), true],
    ["a six-digit hex is a colour", isHexColor("#a1b2c3"), true],
    ["...in either case", isHexColor("#A1B2C3"), true],
    ["a three-digit hex is not the form this studio stores", isHexColor("#abc"), false],
    ["a named colour is not one either", isHexColor("rebeccapurple"), false],
    ["...nor is a non-string", isHexColor(null), false],

    ["hex survives a round trip through HSL",
      hslToHex(hexToHsl("#743df5")), "#743df5"],
    ["...including pure white, where saturation is undefined",
      hslToHex(hexToHsl("#ffffff")), "#ffffff"],
    ["...and pure black", hslToHex(hexToHsl("#000000")), "#000000"],
    ["...and a fully saturated primary", hslToHex(hexToHsl("#00ff00")), "#00ff00"],

    ["a colour already readable is returned untouched",
      hslToHex(nearestReadable(hexToHsl("#000000"), "#ffffff")), "#000000"],
    ["an unreadable colour is moved until it clears AA",
      contrast(hslToHex(nearestReadable(hexToHsl("#8b5cf6"), "#ffffff")), "#ffffff") >= AA_TEXT, true],
    ["...and it is moved, not replaced with something unrelated",
      Math.abs(nearestReadable(hexToHsl("#8b5cf6"), "#ffffff").hue - hexToHsl("#8b5cf6").hue) < 0.001, true],
    ["...the same holds against a black background",
      contrast(hslToHex(nearestReadable(hexToHsl("#3b3b3b"), "#000000")), "#000000") >= AA_TEXT, true],

    /* THE SAVED PAIR, read from a browser key on every page load. Anything
     * can be in that key, and a HALF-valid pair is the dangerous shape: a
     * background with no text colour would paint one and inherit the
     * other, which is how unreadable combinations appear without anybody
     * choosing them. Both or neither. */
    ["a saved pair of two hex colours is used",
      JSON.stringify(parseCustomColors('{"background":"#102030","text":"#f0f0f0"}')),
      JSON.stringify({ background: "#102030", text: "#f0f0f0" })],
    ["nothing saved falls back to the readable default",
      JSON.stringify(parseCustomColors(null)), JSON.stringify(DEFAULT_CUSTOM)],
    ["text without a background is refused whole",
      JSON.stringify(parseCustomColors('{"text":"#f0f0f0"}')), JSON.stringify(DEFAULT_CUSTOM)],
    ["a background without text is refused whole",
      JSON.stringify(parseCustomColors('{"background":"#102030"}')), JSON.stringify(DEFAULT_CUSTOM)],
    ["a non-hex value is refused",
      JSON.stringify(parseCustomColors('{"background":"red","text":"#f0f0f0"}')),
      JSON.stringify(DEFAULT_CUSTOM)],
    ["a stored null is refused, not dereferenced",
      JSON.stringify(parseCustomColors("null")), JSON.stringify(DEFAULT_CUSTOM)],
    ["a stored array is refused",
      JSON.stringify(parseCustomColors('["#102030","#f0f0f0"]')), JSON.stringify(DEFAULT_CUSTOM)],
    ["text that is not JSON is refused",
      JSON.stringify(parseCustomColors("{oops")), JSON.stringify(DEFAULT_CUSTOM)],
    ["an empty string is refused",
      JSON.stringify(parseCustomColors("")), JSON.stringify(DEFAULT_CUSTOM)],
    ["and the default pair is itself readable, or the fallback is the bug",
      contrast(DEFAULT_CUSTOM.background, DEFAULT_CUSTOM.text) >= AA_TEXT, true],
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
