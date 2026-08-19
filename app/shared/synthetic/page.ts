/* The reporting page — the UI layer over the pure engine. TEAM-OWNED.
 *
 * This file may read the clock (to prefill the as-of date) and hand the
 * visitor a LOCAL download. The engine it drives never does either; the
 * proof suite audits the engine sources for exactly that.
 */

import { DEFAULT_CONFIG, GENERATOR_VERSION, type SyntheticStudioConfig } from "./config.js";
import { generateStudio } from "./generate.js";
import { validateBundle } from "./validate.js";
import { serializeBundle } from "./serialize.js";

function requiredElement<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`synthetic page is missing ${selector}`);
  return el;
}

const statusEl = requiredElement<HTMLParagraphElement>("#status");
const reportEl = requiredElement<HTMLElement>("#report");
const violationsEl = requiredElement<HTMLParagraphElement>("#violations");
const seedEl = requiredElement<HTMLInputElement>("#seed");
const dateEl = requiredElement<HTMLInputElement>("#asOfDate");
const countEl = requiredElement<HTMLInputElement>("#memberCount");
const modeEl = requiredElement<HTMLSelectElement>("#mode");
const generateBtn = requiredElement<HTMLButtonElement>("#generate");
const downloadBtn = requiredElement<HTMLButtonElement>("#download");

// UI-layer clock read: prefill today's date. The engine itself only ever
// sees the date as data.
dateEl.value = new Date().toISOString().slice(0, 10);

let lastSerialized: string | null = null;
let lastSeed = "";

function metric(label: string, value: string | number, note: string): HTMLElement {
  const card = document.createElement("article");
  card.className = "metric";
  const strong = document.createElement("strong");
  strong.textContent = String(value);
  const name = document.createElement("span");
  name.textContent = label;
  const detail = document.createElement("span");
  detail.textContent = note;
  card.append(name, strong, detail);
  return card;
}

generateBtn.addEventListener("click", () => {
  const config: SyntheticStudioConfig = {
    ...DEFAULT_CONFIG,
    generatorVersion: GENERATOR_VERSION,
    seed: seedEl.value.trim(),
    asOfDate: dateEl.value,
    memberCount: Number(countEl.value),
    mode: modeEl.value as SyntheticStudioConfig["mode"],
  };
  const t0 = performance.now();
  let bundle;
  try {
    bundle = generateStudio(config);
  } catch (error) {
    statusEl.textContent = `Generation refused: ${error instanceof Error ? error.message : String(error)}`;
    reportEl.replaceChildren();
    violationsEl.textContent = "";
    downloadBtn.hidden = true;
    return;
  }
  const t1 = performance.now();
  const report = validateBundle(bundle);
  const t2 = performance.now();

  const meta = bundle.dataset.meta;
  statusEl.textContent =
    `Seed ${meta.seed} · as of ${meta.asOfDate} (${meta.timezone}) · ` +
    `${meta.mode} mode · generator v${meta.generatorVersion} · ` +
    `validation ${report.ok ? "PASSED" : "FAILED"} — every person fictional, nothing left this browser.`;

  const cohorts = new Map<string, number>();
  for (const key of Object.values(bundle.truth.memberCohorts)) {
    cohorts.set(key, (cohorts.get(key) ?? 0) + 1);
  }
  reportEl.replaceChildren(
    metric("Members", meta.counts["members"] ?? 0, "with membership histories"),
    metric("Class sessions", meta.counts["classSessions"] ?? 0, "past + upcoming"),
    metric("Bookings", meta.counts["bookings"] ?? 0, "capacity-constrained"),
    metric("Attendance records", meta.counts["attendance"] ?? 0, "attended, no-show, unknown"),
    metric("Peak concurrent attendance", report.stats["peakConcurrentAttendance"] ?? 0, `facility capacity ${bundle.dataset.studio.facilityCapacity}`),
    metric("Cohorts", cohorts.size, [...cohorts.entries()].map(([k, v]) => `${k} ${v}`).join(" · ")),
    metric("Generation", `${Math.round(t1 - t0)}ms`, `validation ${Math.round(t2 - t1)}ms`),
    metric("Validation", report.ok ? "PASSED" : "FAILED", `${report.problems.length} findings, ${bundle.truth.declaredViolations.length} declared`),
  );
  violationsEl.textContent =
    bundle.truth.declaredViolations.length === 0
      ? ""
      : "Declared defects (edge-cases mode):\n" +
        bundle.truth.declaredViolations.map((v) => `· ${v.code} — ${v.detail}`).join("\n");

  lastSerialized = serializeBundle(bundle);
  lastSeed = meta.seed;
  downloadBtn.hidden = false;
});

// A LOCAL save only — the page never transmits anything anywhere.
downloadBtn.addEventListener("click", () => {
  if (lastSerialized === null) return;
  const blob = new Blob([lastSerialized], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `synthetic-studio-${lastSeed}.json`;
  a.click();
  URL.revokeObjectURL(url);
});
