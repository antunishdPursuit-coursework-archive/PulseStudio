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

import { mountSessionControl } from "./components/topbar.js";
import { renderStudioBrand } from "./components/brand-header.js";

/* Every page's branded home links render their word from shared/brand.ts
 * — the clone seam: rename the studio in ONE file and every header
 * follows. The markup stays each page owner's; this only fills it. */
renderStudioBrand();

const root = document.documentElement;
const THEME_KEY = "pulse-theme";
const CUSTOM_KEY = "pulse-theme-custom";
const DEFAULT_CUSTOM = { background: "#ffffff", text: "#0a0a0a" };

/* STORAGE IS A PRIVILEGE, NOT A GUARANTEE. A browser with site data blocked
 * (private windows, enterprise policy, a sandboxed frame) throws on the very
 * ACCESS to localStorage — not just on write. This module runs on every page
 * in the studio and mounts the sign-in chip and the appearance control, so an
 * unguarded throw here does not degrade one feature: it aborts the module and
 * every page loses its header controls at once. Both directions are therefore
 * guarded, and a refusal to remember is treated as "nothing remembered". */
function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** True when the preference was actually stored. Callers that show the person
 *  a result use it to avoid claiming a choice was remembered when it was not. */
function writeStored(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/* Whether the LAST applyTheme() actually reached storage. The appearance
 * control states the truth rather than implying a choice will survive a
 * reload when this browser refuses to remember it. */
let themeRemembered = true;

type Theme = "light" | "dark" | "custom";
type CustomColors = typeof DEFAULT_CUSTOM;

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function luminance(color: string): number {
  const parts = color.slice(1).match(/.{2}/g);
  if (parts === null) return 0;
  const channels = parts.map((part) => {
    const channel = Number.parseInt(part, 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
}

function contrast(background: string, text: string): number {
  const first = luminance(background);
  const second = luminance(text);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function customColors(): CustomColors {
  try {
    const parsed: unknown = JSON.parse(readStored(CUSTOM_KEY) ?? "");
    if (typeof parsed === "object" && parsed !== null) {
      const record = parsed as Record<string, unknown>;
      const background = record.background;
      const text = record.text;
      if (isHexColor(background) && isHexColor(text)) return { background, text };
    }
  } catch {
    // An invalid saved preference falls back to the readable default pair.
  }
  return DEFAULT_CUSTOM;
}

function applyTheme(theme: Theme, colors = customColors()): void {
  root.dataset.theme = theme;
  if (theme === "custom") {
    root.style.setProperty("--custom-bg", colors.background);
    root.style.setProperty("--custom-fg", colors.text);
  } else {
    root.style.removeProperty("--custom-bg");
    root.style.removeProperty("--custom-fg");
  }
  themeRemembered = writeStored(THEME_KEY, theme);
}

function initialTheme(): void {
  const saved = readStored(THEME_KEY);
  if (saved === "light" || saved === "dark") {
    applyTheme(saved);
    return;
  }
  if (saved === "custom") {
    const colors = customColors();
    if (contrast(colors.background, colors.text) >= 4.5) applyTheme("custom", colors);
  }
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

type Hsl = { hue: number; saturation: number; lightness: number };

type ColorEditor = {
  canvas: HTMLCanvasElement;
  hue: HTMLInputElement;
  value: HTMLElement;
  state: Hsl;
};

function hslToHex({ hue, saturation, lightness }: Hsl): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const secondary = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = l - chroma / 2;
  const channels =
    hue < 60 ? [chroma, secondary, 0] : hue < 120 ? [secondary, chroma, 0] :
    hue < 180 ? [0, chroma, secondary] : hue < 240 ? [0, secondary, chroma] :
    hue < 300 ? [secondary, 0, chroma] : [chroma, 0, secondary];
  return `#${channels.map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, "0")).join("")}`;
}

function hexToHsl(hex: string): Hsl {
  const channels = hex.slice(1).match(/.{2}/g)?.map((part) => Number.parseInt(part, 16) / 255);
  const red = channels?.[0] ?? 1;
  const green = channels?.[1] ?? 1;
  const blue = channels?.[2] ?? 1;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  const lightness = (maximum + minimum) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;
  if (delta !== 0) {
    if (maximum === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (maximum === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }
  return { hue: (hue + 360) % 360, saturation: saturation * 100, lightness: lightness * 100 };
}

function nearestReadable(candidate: Hsl, other: string): Hsl {
  if (contrast(hslToHex(candidate), other) >= 4.5) return candidate;
  for (let step = 1; step <= 100; step += 1) {
    for (const lightness of [candidate.lightness - step, candidate.lightness + step]) {
      if (lightness < 0 || lightness > 100) continue;
      const adjusted = { ...candidate, lightness };
      if (contrast(hslToHex(adjusted), other) >= 4.5) return adjusted;
    }
  }
  return candidate;
}

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

function mountAppearanceControl(): void {
  const host = document.querySelector(".topnav, .page-head, .topbar");
  if (host === null || document.getElementById("appearance-control") !== null) return;

  const details = document.createElement("details");
  details.id = "appearance-control";
  details.className = "appearance-control";
  const summary = document.createElement("summary");
  summary.textContent = "◐";
  summary.setAttribute("aria-label", "Appearance settings");
  summary.setAttribute("title", "Appearance settings");
  details.appendChild(summary);

  const panel = document.createElement("div");
  panel.className = "appearance-panel";
  const heading = document.createElement("p");
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
    status.textContent =
      (theme === "custom"
          ? `Custom colors active (${ratio.toFixed(1)}:1 contrast).`
          : `Bright areas are available (${ratio.toFixed(1)}:1 contrast).`) + unremembered;
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
  details.appendChild(panel);
  host.appendChild(details);
  refresh();
}

initialTheme();
mountAppearanceControl();

const sessionHost = document.querySelector(".topnav, .page-head, .topbar");
if (sessionHost !== null && !document.body.hasAttribute("data-no-session")) {
  mountSessionControl(sessionHost);
}

export {};
