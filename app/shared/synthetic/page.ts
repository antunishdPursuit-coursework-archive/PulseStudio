/* The reporting page — the UI layer over the pure engine. TEAM-OWNED.
 *
 * This file may read the clock (to prefill the as-of date) and hand the
 * visitor a LOCAL download. The engine it drives never does either; the
 * proof suite audits the engine sources for exactly that.
 */

import { counted } from "../text.js";
import {
  DEFAULT_CONFIG,
  GENERATOR_VERSION,
  organicMemberCount,
  type SyntheticStudioConfig,
} from "./config.js";
import { generateStudio } from "./generate.js";
import { validateBundle } from "./validate.js";
import { serializeBundle } from "./serialize.js";
import { attendanceCsv } from "./csv-export.js";

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
const historyEl = requiredElement<HTMLSelectElement>("#history");
const generateBtn = requiredElement<HTMLButtonElement>("#generate");
const downloadBtn = requiredElement<HTMLButtonElement>("#download");
const downloadCsvBtn = requiredElement<HTMLButtonElement>("#download-csv");

// UI-layer clock read: prefill today's date. The engine itself only ever
// sees the date as data.
dateEl.value = new Date().toISOString().slice(0, 10);

let lastSerialized: string | null = null;
let lastCsv: string | null = null;
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
  // A blank member count is the honest default: the studio is the size it
  // is, decided by the seed — nobody fills their own gym by declaration.
  const seed = seedEl.value.trim();
  const memberCount =
    countEl.value.trim() === "" ? organicMemberCount(seed) : Number(countEl.value);
  const config: SyntheticStudioConfig = {
    ...DEFAULT_CONFIG,
    generatorVersion: GENERATOR_VERSION,
    seed,
    asOfDate: dateEl.value,
    memberCount,
    historyDays: Number(historyEl.value),
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
    /* BOTH doors close, not one. This hid the JSON download and left the CSV
     * download standing, still holding the PREVIOUS studio's attendance — so
     * a page saying "Generation refused" would hand a visitor a file from a
     * run that is not the one in front of them, named after a seed they
     * never asked for. The stale bytes go too, so nothing can be handed out
     * by a later click either. */
    downloadBtn.hidden = true;
    downloadCsvBtn.hidden = true;
    lastSerialized = null;
    lastCsv = null;
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
    metric("Validation", report.ok ? "PASSED" : "FAILED", `${counted(report.problems.length, "finding")}, ${bundle.truth.declaredViolations.length} declared`),
  );
  violationsEl.textContent =
    bundle.truth.declaredViolations.length === 0
      ? ""
      : "Declared defects (edge-cases mode):\n" +
        bundle.truth.declaredViolations.map((v) => `· ${v.code} — ${v.detail}`).join("\n");

  lastSerialized = serializeBundle(bundle);
  lastCsv = attendanceCsv(bundle.dataset);
  lastSeed = meta.seed;
  downloadBtn.hidden = false;
  downloadCsvBtn.hidden = false;
});

// LOCAL saves only — the page never transmits anything anywhere.
function saveLocally(text: string, name: string, type: string): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
downloadBtn.addEventListener("click", () => {
  if (lastSerialized !== null) {
    saveLocally(lastSerialized, `synthetic-studio-${lastSeed}.json`, "application/json");
  }
});
downloadCsvBtn.addEventListener("click", () => {
  if (lastCsv !== null) {
    saveLocally(lastCsv, `synthetic-attendance-${lastSeed}.csv`, "text/csv");
  }
});
