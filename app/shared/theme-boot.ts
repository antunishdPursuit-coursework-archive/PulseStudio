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

const root = document.documentElement;
const THEME_KEY = "pulse-theme";
const CUSTOM_KEY = "pulse-theme-custom";
const DEFAULT_CUSTOM = { background: "#ffffff", text: "#0a0a0a" };

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
    const parsed: unknown = JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? "");
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
  localStorage.setItem(THEME_KEY, theme);
}

function initialTheme(): void {
  const saved = localStorage.getItem(THEME_KEY);
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

function colorDial(label: string, value: string): { field: HTMLLabelElement; input: HTMLInputElement } {
  const field = document.createElement("label");
  field.className = "appearance-dial";
  field.append(document.createTextNode(label));
  const input = document.createElement("input");
  input.type = "color";
  input.value = value;
  input.setAttribute("aria-label", label);
  field.appendChild(input);
  return { field, input };
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
  const background = colorDial("Background", colors.background);
  const text = colorDial("Text", colors.text);
  const dials = document.createElement("div");
  dials.className = "appearance-dials";
  dials.append(background.field, text.field);
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
    const ratio = contrast(background.input.value, text.input.value);
    useCustom.disabled = ratio < 4.5;
    status.textContent =
      ratio < 4.5
        ? `Choose a more readable pair (${ratio.toFixed(1)}:1 contrast; 4.5:1 required).`
        : theme === "custom"
          ? `Custom colors active (${ratio.toFixed(1)}:1 contrast).`
          : `Custom colors ready (${ratio.toFixed(1)}:1 contrast).`;
  }

  light.addEventListener("click", () => { applyTheme("light"); refresh(); });
  dark.addEventListener("click", () => { applyTheme("dark"); refresh(); });
  useCustom.addEventListener("click", () => {
    const selected = { background: background.input.value, text: text.input.value };
    if (contrast(selected.background, selected.text) < 4.5) return;
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(selected));
    applyTheme("custom", selected);
    refresh();
  });
  background.input.addEventListener("input", refresh);
  text.input.addEventListener("input", refresh);

  panel.append(heading, modes, dials, useCustom, status);
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
