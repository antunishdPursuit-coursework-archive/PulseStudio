/* Pulse Studio — theme boot. TEAM-OWNED.
   Every app page loads this once so an appearance choice follows the person
   across the front door and all four products. Built-in light and dark stay
   black and white. The appearance picker also supports an accessible custom
   background and text pairing; product header accents remain untouched.

   The shared sign-in control rides the same ride (added 2026-08-20): any
   page that loads theme-boot and has a recognizable header grows the session
   chip — which is how sign-in reaches every application without a single
   edit inside a product folder. A page that should
   stay chip-free (a proof page) opts out with <body data-no-session>. */

import {
  contrast,
  hexToHsl,
  hslToHex,
  isHexColor,
  parseCustomColors,
  themeToApply,
  DEFAULT_CUSTOM,
  type CustomColors,
  type Theme,
  nearestReadable,
  type Hsl,
} from "./color.js";
import { mountSessionControl } from "./components/topbar.js";
import { renderStudioBrand } from "./components/brand-header.js";
import { readStored, writeStored, storageWorks } from "./storage.js";
import { mountSiteFooter } from "./components/site-footer.js";
import { mountAssistant } from "./components/assistant.js";
import { ensureAlertRegion, showAlert } from "./components/alert.js";

/* Every page's branded home links render their word from shared/brand.ts
 * — the clone seam: rename the studio in ONE file and every header
 * follows. The markup stays each page owner's; this only fills it. */
renderStudioBrand();

const root = document.documentElement;
const THEME_KEY = "pulse-theme";
const CUSTOM_KEY = "pulse-theme-custom";

/* THE GUARDED DOORS MOVED to shared/storage.ts, where Product D's identical
 * copy of them now points too. They were written twice and had already
 * drifted: D's storageWorks split the write from the cleanup after finding
 * that a store which ACCEPTED the write and refused the delete reported
 * "this browser is not saving site data", and this module's copy still had
 * them in one try block. One implementation, and the better one.
 *
 * Why this module cannot simply BE that file: it reads `document` at load,
 * so nothing can import it — the same reason color.ts exists apart from
 * here. */

/* Whether the LAST applyTheme() actually reached storage. The appearance
 * control states the truth rather than implying a choice will survive a
 * reload when this browser refuses to remember it. */
let themeRemembered = true;





function customColors(): CustomColors {
  /* The parsing rule lives in color.ts so a check can reach it; this
   * module cannot be imported by anything, because it reads `document` at
   * load. */
  return parseCustomColors(readStored(CUSTOM_KEY));
}

/* WHICH ACCENT SURVIVES THIS BACKGROUND.
 *
 * The custom theme redefines --bg, --fg, --line and --muted and left the
 * developer accents exactly where the LIGHT theme put them. Every accent
 * companion is tuned to one background: pick a dark custom background and
 * the light-tuned accent lands at about 3.7:1 against it, under the 4.5:1
 * a person needs, so the control colour a product is identified by fades
 * into the page the moment somebody chooses their own colours.
 *
 * Built-in light and dark solve this by redefining the companions per
 * theme. Custom cannot, because the background is chosen at run time and
 * CSS cannot measure it. So the tone is measured HERE and stamped on the
 * root, and theme.css carries one block per tone — the same mechanism,
 * driven by a number instead of a media query. */
/* MEASURE BOTH, KEEP THE WINNER — do not guess from the background alone.
 *
 * The first version bucketed by comparing the background against white,
 * which is right at the ends and wrong in the middle: a mid-slate #4a5568
 * reads as "dark", takes the dark-tuned accent and lands at 2.31:1, while
 * the light-tuned one is no better. A bucket cannot know that; a
 * measurement can.
 *
 * So both tones are tried on the real element and the resulting accent is
 * read back out of the cascade, which keeps this generic: it never names a
 * developer's colour, so a companion added later is measured the same way
 * with no edit here. */
function bestToneFor(background: string): { tone: "light" | "dark"; ratio: number } {
  const previous = root.dataset["customTone"];
  let best: { tone: "light" | "dark"; ratio: number } = { tone: "light", ratio: -1 };
  /* THE PROBE MUTATES THE LIVE PAGE, so it puts it back no matter what.
   * Measuring means setting the tone, reading the accent the cascade
   * resolves, and setting the other — with the page in a half-measured
   * state in between. Anything throwing in the middle would leave the whole
   * studio rendering the wrong tone, which is a worse bug than the one this
   * function exists to fix, and would be invisible in the source. */
  try {
  for (const tone of ["light", "dark"] as const) {
    root.dataset["customTone"] = tone;
    /* READ IT OFF THE BODY, NOT THE ROOT. The accent tokens are scoped by
     * `body.product-a|b|c|d` — the colour law in one class — so :root
     * resolves --accent-strong to nothing and every measurement came back
     * empty. Caught by measuring in a browser rather than reasoning about
     * the cascade. */
    const accent = getComputedStyle(document.body).getPropertyValue("--accent-strong").trim();
    // A page with no product accent (shared infrastructure carries none by
    // law) has nothing to measure, and nothing to get wrong either.
    if (!isHexColor(accent)) continue;
    const ratio = contrast(accent, background);
    if (ratio > best.ratio) best = { tone, ratio };
  }
  } finally {
    if (previous === undefined) delete root.dataset["customTone"];
    else root.dataset["customTone"] = previous;
  }
  /* No product accent on this page: fall back to matching the background's
   * own tone, which is right for the built-in tokens and harmless here. */
  if (best.ratio < 0) {
    return { tone: contrast(background, "#ffffff") >= 4.5 ? "dark" : "light", ratio: -1 };
  }
  return best;
}

/* Set when the chosen background leaves NO accent variant readable — said
 * out loud rather than shipped as a colour nobody can see. */
let accentUnreadableRatio: number | null = null;

function applyTheme(theme: Theme, colors = customColors()): void {
  root.dataset.theme = theme;
  if (theme === "custom") {
    root.style.setProperty("--custom-bg", colors.background);
    root.style.setProperty("--custom-fg", colors.text);
    const best = bestToneFor(colors.background);
    root.dataset["customTone"] = best.tone;
    accentUnreadableRatio = best.ratio >= 0 && best.ratio < 4.5 ? best.ratio : null;
  } else {
    root.style.removeProperty("--custom-bg");
    root.style.removeProperty("--custom-fg");
    delete root.dataset["customTone"];
    accentUnreadableRatio = null;
  }
  themeRemembered = writeStored(THEME_KEY, theme);
}

function initialTheme(): void {
  /* The decision lives in color.ts so a check can reach it — including
   * the part that refuses a saved custom pair which is no longer
   * readable. This module cannot be imported by anything. */
  const colors = customColors();
  const theme = themeToApply(readStored(THEME_KEY), colors);
  if (theme === null) return;
  applyTheme(theme, colors);
}

function modeButton(theme: "light" | "dark", icon: string, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "appearance-mode";
  button.dataset.theme = theme;
  button.textContent = icon;
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
  return button;
}


type ColorEditor = {
  canvas: HTMLCanvasElement;
  hue: HTMLInputElement;
  value: HTMLElement;
  state: Hsl;
};




function makeEditor(label: string, state: Hsl): { field: HTMLElement; editor: ColorEditor } {
  const field = document.createElement("section");
  field.className = "appearance-editor";
  const heading = document.createElement("div");
  heading.className = "appearance-editor-heading";
  const title = document.createElement("strong");
  title.textContent = label;
  const value = document.createElement("span");
  value.className = "appearance-color-value";
  heading.append(title, value);
  const canvas = document.createElement("canvas");
  canvas.className = "appearance-color-field";
  canvas.width = 220;
  canvas.height = 104;
  canvas.setAttribute("role", "application");
  canvas.setAttribute("aria-label", `${label} saturation and brightness field`);
  const hue = document.createElement("input");
  hue.className = "appearance-hue";
  hue.type = "range";
  hue.min = "0";
  hue.max = "359";
  hue.value = String(Math.round(state.hue));
  hue.setAttribute("aria-label", `${label} hue`);
  const note = document.createElement("p");
  note.className = "appearance-editor-note";
  note.textContent = `${label}: solid-color areas are acceptable.`;
  field.append(heading, canvas, hue, note);
  return { field, editor: { canvas, hue, value, state } };
}

function drawEditor(editor: ColorEditor, other: string): void {
  const context = editor.canvas.getContext("2d");
  if (context === null) return;
  const pixels = context.createImageData(editor.canvas.width, editor.canvas.height);
  for (let y = 0; y < editor.canvas.height; y += 1) {
    for (let x = 0; x < editor.canvas.width; x += 1) {
      const candidate = {
        hue: editor.state.hue,
        saturation: (x / (editor.canvas.width - 1)) * 100,
        lightness: 100 - (y / (editor.canvas.height - 1)) * 100,
      };
      const value = hslToHex(candidate).slice(1).match(/.{2}/g);
      const index = (y * editor.canvas.width + x) * 4;
      const readable = contrast(hslToHex(candidate), other) >= 4.5;
      const stripe = (x + y) % 12 < 4;
      const dim = readable ? 1 : stripe ? 0.38 : 0.56;
      pixels.data[index] = Math.round(Number.parseInt(value?.[0] ?? "00", 16) * dim);
      pixels.data[index + 1] = Math.round(Number.parseInt(value?.[1] ?? "00", 16) * dim);
      pixels.data[index + 2] = Math.round(Number.parseInt(value?.[2] ?? "00", 16) * dim);
      pixels.data[index + 3] = 255;
    }
  }
  context.putImageData(pixels, 0, 0);
  const x = (editor.state.saturation / 100) * editor.canvas.width;
  const y = (1 - editor.state.lightness / 100) * editor.canvas.height;
  context.beginPath();
  context.arc(x, y, 7, 0, Math.PI * 2);
  context.lineWidth = 3;
  context.strokeStyle = "#ffffff";
  context.shadowColor = "#000000";
  context.shadowBlur = 2;
  context.stroke();
  context.shadowBlur = 0;
}

/** Which appearance is ACTUALLY in force right now.
 *
 *  A stored choice wins. With nothing stored the page is on its built-in
 *  default, and the built-in default is LIGHT unless the operating system
 *  asks for dark — `:root` in theme.css carries the light palette and only
 *  a `prefers-color-scheme: dark` query moves it. The toggle has to read
 *  the same way, or on a first visit it would report a state the page is
 *  not in. */
function themeInForce(): Theme {
  const chosen = root.dataset.theme as Theme | undefined;
  if (chosen !== undefined) return chosen;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** The header's whole appearance control: light, dark, and nothing else.
 *
 *  IT USED TO BE THE LOT. A <details> in the top bar of every page held the
 *  mode buttons, two canvas colour fields and a status line — the entire
 *  settings surface, hanging off a header that also has to hold a brand, a
 *  sign-in chip and a product's own navigation. Everything past light and
 *  dark now lives at shared/settings.html, which the footer links from
 *  every page; the header keeps the one switch people reach for daily.
 *
 *  The buttons state the current appearance by disabling the one already in
 *  force, which is why themeInForce() has to be honest about the untouched
 *  first visit rather than assuming light. */
function headerModes(): HTMLElement {
  const modes = document.createElement("div");
  modes.id = "appearance-modes";
  modes.className = "appearance-modes header-modes";
  modes.setAttribute("role", "group");
  modes.setAttribute("aria-label", "Appearance");
  const light = modeButton("light", "☀", "Light mode");
  const dark = modeButton("dark", "☾", "Dark mode");
  function refresh(): void {
    const now = themeInForce();
    light.disabled = now === "light";
    dark.disabled = now === "dark";
  }
  light.addEventListener("click", () => { applyTheme("light"); refresh(); });
  dark.addEventListener("click", () => { applyTheme("dark"); refresh(); });
  modes.append(light, dark);
  refresh();
  return modes;
}

/** The full appearance section, expanded, for the settings page.
 *
 *  This is the old header panel with the <details> taken off it. Nothing
 *  about the colour arithmetic changed; what changed is that it is a place
 *  a person can go to rather than a drawer they have to find. */
function appearanceSection(): HTMLElement {
  const panel = document.createElement("section");
  panel.className = "appearance-panel";
  /* Appearance is a SECTION inside settings, not the whole of it. Naming it
   * leaves an obvious place for the next setting, instead of the panel
   * quietly becoming a colour picker wearing a general name. */
  const heading = document.createElement("h2");
  heading.className = "appearance-heading";
  heading.textContent = "Appearance";
  const modes = document.createElement("div");
  modes.className = "appearance-modes";
  const light = modeButton("light", "☀", "Light mode");
  const dark = modeButton("dark", "☾", "Dark mode");
  modes.append(light, dark);

  const colors = customColors();
  const background = makeEditor("Background", hexToHsl(colors.background));
  const text = makeEditor("Text", hexToHsl(colors.text));
  const useCustom = document.createElement("button");
  useCustom.type = "button";
  useCustom.className = "appearance-custom";
  useCustom.textContent = "Use custom colors";
  const status = document.createElement("p");
  status.className = "appearance-status";
  status.setAttribute("aria-live", "polite");

  function refresh(): void {
    const theme = root.dataset.theme as Theme | undefined;
    light.disabled = theme === "light";
    dark.disabled = theme === "dark";
    const backgroundValue = hslToHex(background.editor.state);
    const textValue = hslToHex(text.editor.state);
    const ratio = contrast(backgroundValue, textValue);
    background.editor.value.textContent = backgroundValue;
    text.editor.value.textContent = textValue;
    background.editor.hue.value = String(Math.round(background.editor.state.hue));
    text.editor.hue.value = String(Math.round(text.editor.state.hue));
    drawEditor(background.editor, textValue);
    drawEditor(text.editor, backgroundValue);
    useCustom.disabled = false;
    const unremembered = themeRemembered
      ? ""
      : " This browser is not saving site data, so this choice lasts until you leave the page.";
    const accentWarning =
      accentUnreadableRatio === null
        ? ""
        : ` Note: this background leaves the page's own accent colour at ${accentUnreadableRatio.toFixed(1)}:1, below the 4.5:1 needed to read it — buttons and links will be hard to see.`;
    status.textContent =
      (theme === "custom"
          ? `Custom colors active (${ratio.toFixed(1)}:1 contrast).`
          : `Bright areas are available (${ratio.toFixed(1)}:1 contrast).`) + accentWarning + unremembered;
  }

  light.addEventListener("click", () => { applyTheme("light"); refresh(); });
  dark.addEventListener("click", () => { applyTheme("dark"); refresh(); });
  useCustom.addEventListener("click", () => {
    const selected = { background: hslToHex(background.editor.state), text: hslToHex(text.editor.state) };
    if (contrast(selected.background, selected.text) < 4.5) return;
    const stored = writeStored(CUSTOM_KEY, JSON.stringify(selected));
    applyTheme("custom", selected);
    refresh();
    if (!stored) {
      status.textContent =
        "Custom colors are active for this page. This browser is not saving site data, so they will not be remembered.";
    }
  });
  function bindEditor(editor: ColorEditor, other: () => string): void {
    editor.canvas.addEventListener("pointerdown", (event) => {
      const box = editor.canvas.getBoundingClientRect();
      const candidate = {
        hue: editor.state.hue,
        saturation: Math.max(0, Math.min(100, ((event.clientX - box.left) / box.width) * 100)),
        lightness: Math.max(0, Math.min(100, 100 - ((event.clientY - box.top) / box.height) * 100)),
      };
      if (contrast(hslToHex(candidate), other()) < 4.5) {
        status.textContent = "That area is unavailable because it would reduce readability below 4.5:1.";
        return;
      }
      editor.state = candidate;
      refresh();
    });
    editor.hue.addEventListener("input", () => {
      editor.state = nearestReadable({ ...editor.state, hue: Number(editor.hue.value) }, other());
      refresh();
    });
  }
  bindEditor(background.editor, () => hslToHex(text.editor.state));
  bindEditor(text.editor, () => hslToHex(background.editor.state));

  panel.append(heading, modes, background.field, text.field, useCustom, status);
  refresh();
  return panel;
}

/** ONE appearance control per page, and which one depends on the page.
 *
 *  The settings page declares `<div id="appearance-settings">` and gets the
 *  whole section there; its header gets nothing, because the page IS the
 *  control and two of them would disagree the moment one was used. Every
 *  other page gets light/dark in the header and reaches the rest through
 *  the Settings link the shared footer carries. */
function mountAppearance(): void {
  const settingsHost = document.getElementById("appearance-settings");
  if (settingsHost !== null) {
    if (settingsHost.querySelector(".appearance-panel") === null) {
      settingsHost.append(appearanceSection());
    }
    return;
  }
  const host = document.querySelector(".topnav, .page-head, .topbar");
  if (host === null || document.getElementById("appearance-modes") !== null) return;
  host.appendChild(headerModes());
}

/* EVERY PAGE GETS AN ICON, whether or not its markup declares one. Four
 * product pages ship no <link rel="icon">, so every browser that opens them
 * asks for /favicon.ico and logs a 404 against an icon the site actually
 * has. The durable fix is the one-line link in each owner's head — named in
 * docs/TASKS.md — but the 404 is fleet-wide TODAY, and this module already
 * runs on every page WIRED TO IT, so it closes the gap for those: resolve the shared
 * icon relative to THIS file (which lives beside it), and only when no icon
 * link exists, so an owner's own line always wins.
 *
 * WHICH PAGES THIS REACHES: every page that loads theme-boot, which is now
 * all thirteen. This comment has been wrong twice in one day, in opposite
 * directions — it said "every page" when staff-dashboard.html loaded no
 * theme-boot, and then went on naming that page as the exception after the
 * page was wired up. A sentence about which files load a module is exactly
 * the sentence that rots when a file changes, so read it off the pages:
 *
 *   git grep -l "theme-boot.js" -- app  (the .html files it lists)
 *
 * check-published holds the property that matters — every published page has
 * SOME favicon path, its own markup or this function. */
function ensureFavicon(): void {
  if (document.querySelector('link[rel~="icon"]') !== null) return;
  const link = document.createElement("link");
  link.rel = "icon";
  link.type = "image/svg+xml";
  link.href = new URL("../favicon.svg", import.meta.url).href;
  document.head.append(link);
}

ensureFavicon();
initialTheme();
mountAppearance();

const sessionHost = document.querySelector(".topnav, .page-head, .topbar");
if (sessionHost !== null && !document.body.hasAttribute("data-no-session")) {
  mountSessionControl(sessionHost);
}

/* The alert region goes in EMPTY and stays that way unless something is
 * actually wrong — it collapses to nothing while it holds nothing, so it
 * costs no space and shifts no layout. It exists this early because a live
 * region has to be in the document BEFORE its first message for a screen
 * reader to announce that message; see components/alert.ts. */
ensureAlertRegion();

/* The first thing worth saying out loud on every page: a browser that will
 * not keep site data cannot keep an appearance choice or a sign-in either,
 * and until now it said so only to somebody who opened Settings. */
if (!storageWorks()) {
  showAlert({
    id: "storage-blocked",
    level: "notice",
    message:
      "This browser is not saving site data, so an appearance choice or a sign-in will not be remembered after you leave this page.",
    detail: "Everything else on this page works normally.",
  });
}

/* Last, so the footer lands under whatever the page has already drawn. */
mountSiteFooter();

/* One chatbox, on any page that asked for one — see components/assistant.ts
 * for the whole design. Opt-in by attribute, not automatic: a proof page or
 * a page mid-review should not gain a chat window nobody asked it to carry.
 * `<body data-assistant="member-facing">` or `"staff-facing"` is the whole
 * ask. */
mountAssistant();

export {};
