/* Product D — Member Re-engagement Tool. Rensley's lane.
 *
 * Staff-only, read-only, DRAFT-only. This page flags active members who
 * went quiet, shows the evidence for every flag, and prepares a message
 * staff copy (or open in their own email app) and send themselves.
 * There is no send action here and never will be — that law comes from
 * SHARED_DATA_CONTRACT.md and is not negotiable.
 */

import { loadFixtures, type FixtureSet } from "./deps.js";
import { adaptAttendanceCsv } from "./csv.js";
import { generateStudio } from "./generate.js";
import { brand, draftMessage, proposedRules } from "./config.js";
import {
  findQuietMembers,
  firstNameOf,
  summaryLine,
  todayDayNumber,
  type FlaggedMember,
} from "./logic.js";

/** Find a required element up front, loudly — a missing mount point is a
 *  broken page, and broken should never look like "nothing to report". */
function requiredElement<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Re-engagement page is missing ${selector}.`);
  return el;
}

const statusEl = requiredElement<HTMLParagraphElement>("#status");
const ruleEl = requiredElement<HTMLParagraphElement>("#rule");
const flaggedEl = requiredElement<HTMLElement>("#flagged");
const footerEl = requiredElement<HTMLParagraphElement>("#footer-note");
const backEl = requiredElement<HTMLAnchorElement>("#back-link");
const sourceEl = requiredElement<HTMLParagraphElement>("#source");
const csvInput = requiredElement<HTMLInputElement>("#csv-input");
const csvReset = requiredElement<HTMLButtonElement>("#csv-reset");
const generateBtn = requiredElement<HTMLButtonElement>("#generate");

/* Apply the brand from config so a reseller edits config.ts and one theme
 * token — never this file, never the page copy. */
document.title = `Member Re-engagement — ${brand.studioName}`;
backEl.textContent = `← ${brand.studioName}`;
footerEl.textContent =
  `Drafts only — staff review and send every message themselves; nothing on ` +
  `this page can send. Studio record copy: ${brand.studioEmail} · `;
{
  const testsLink = document.createElement("a");
  testsLink.href = "./tests.html";
  testsLink.textContent = "Run the unit checks";
  footerEl.append(testsLink);
}

/** Studio-local calendar date of a fixture timestamp, for evidence lines. */
function evidenceDate(iso: string): string {
  const datePart = iso.split("T")[0] ?? iso;
  const [y, m, d] = datePart.split("-").map(Number);
  return new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1)).toLocaleDateString(
    "en-US",
    { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" },
  );
}

function buildDraftText(f: FlaggedMember): string {
  // The "the team" fallback (used when an instructor record is missing) must
  // not go through firstNameOf — "the" is not a name.
  const instructorFirst =
    f.usualInstructorName === "the team"
      ? "The team"
      : firstNameOf(f.usualInstructorName);
  return draftMessage({
    firstName: firstNameOf(f.member.display_name),
    daysSince: f.daysSince,
    usualClassType: f.usualClassType,
    usualInstructorFirstName: instructorFirst,
    studioName: brand.studioName,
  });
}

/** A mailto: link opens the STAFF member's own mail client with the draft
 *  prefilled — the human chooses the recipient and presses send. The
 *  studio mailbox rides along as BCC so the studio keeps its own record. */
function mailtoHref(f: FlaggedMember, draft: string): string {
  const subject = `We miss you at ${brand.studioName}, ${firstNameOf(f.member.display_name)}!`;
  // RFC 6068 wants CRLF line breaks in a mailto body; some clients collapse
  // bare %0A. Only the URL gets CRLF — screen and clipboard stay LF.
  return (
    "mailto:?" +
    `bcc=${encodeURIComponent(brand.studioEmail)}` +
    `&subject=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(draft.replace(/\n/g, "\r\n"))}`
  );
}

function renderFlagged(f: FlaggedMember, rank: number): HTMLElement {
  const card = document.createElement("article");
  card.className = "card member-card";

  const head = document.createElement("div");
  head.className = "member-head";
  const name = document.createElement("h2");
  name.textContent = `${rank}. ${f.member.display_name}`;
  const quiet = document.createElement("span");
  quiet.className = "quiet-pill";
  quiet.textContent = `${f.daysSince} days quiet`;
  head.append(name, quiet);

  const evidence = document.createElement("p");
  evidence.className = "evidence";
  evidence.textContent =
    `Last attended: ${f.lastSession.class_type} with ${f.lastInstructorName} ` +
    `on ${evidenceDate(f.lastSession.starts_at)} · ` +
    `${f.priorCount} classes in the prior ${proposedRules.priorWindowDays} days · ` +
    `usually ${f.usualClassType} with ${f.usualInstructorName}`;

  const draft = buildDraftText(f);
  const draftBlock = document.createElement("pre");
  draftBlock.className = "draft";
  draftBlock.textContent = draft;

  const actions = document.createElement("div");
  actions.className = "actions";

  const copyBtn = document.createElement("button");
  copyBtn.className = "btn";
  copyBtn.type = "button";
  copyBtn.textContent = "Copy message";
  copyBtn.addEventListener("click", () => {
    // A failed copy must be loud, never a silent shrug — including on
    // non-secure origins where navigator.clipboard does not exist at all
    // (e.g. the page opened over plain http from another device).
    if (!navigator.clipboard) {
      copyBtn.textContent = "Copy failed — select the text above";
      return;
    }
    navigator.clipboard.writeText(draft).then(
      () => {
        copyBtn.textContent = "Copied ✓";
        setTimeout(() => (copyBtn.textContent = "Copy message"), 2000);
      },
      () => {
        copyBtn.textContent = "Copy failed — select the text above";
      },
    );
  });

  const mailLink = document.createElement("a");
  mailLink.className = "btn btn-outline";
  mailLink.href = mailtoHref(f, draft);
  mailLink.textContent = "Open in your email app";

  actions.append(copyBtn, mailLink);
  card.append(head, evidence, draftBlock, actions);
  return card;
}

/** Paint the page from ANY contract-shaped record set — the shared studio
 *  records or an imported attendance file. One render path, two doors. */
function renderRecords(data: FixtureSet, sourceNote: string): void {
  // "Today" is the record set's declared timezone — the shared fixture
  // states the studio's; an import uses the staff member's, since they are
  // at the studio. Either way thresholds never shift with a viewer's zone.
  const today = todayDayNumber(data.timezone);
  const result = findQuietMembers(data, today, proposedRules);

  const asOf = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  statusEl.textContent = summaryLine(result, asOf);
  sourceEl.textContent = sourceNote;
  ruleEl.textContent =
    `Proposed thresholds (not yet ratified by the team): flag active members ` +
    `whose last attended class is more than ${proposedRules.minDaysQuiet} and ` +
    `at most ${proposedRules.maxDaysQuiet} days ago. Only attended classes ` +
    `count — a no-show is never a visit.`;

  flaggedEl.replaceChildren();
  if (data.members.length === 0) {
    // Zero members is NOT an all-clear — it means the records held nothing
    // usable, and saying otherwise would paint an empty file as a healthy
    // studio.
    const none = document.createElement("p");
    none.className = "status";
    none.textContent =
      "No usable member records loaded — nothing was checked.";
    flaggedEl.append(none);
    return;
  }
  if (result.flagged.length === 0) {
    const calm = document.createElement("p");
    calm.className = "status";
    calm.textContent =
      "No one needs outreach right now — every member in these records has been in recently.";
    flaggedEl.append(calm);
    return;
  }
  result.flagged.forEach((f, i) => flaggedEl.append(renderFlagged(f, i + 1)));
}

function loadSharedRecords(): void {
  loadFixtures()
    .then((data) => {
      renderRecords(data, "Data: the shared studio records.");
      csvReset.hidden = true;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      statusEl.textContent = `Could not load the shared records: ${message}`;
    });
}

/* The CSV door: a staff member's own attendance export, adapted to the
 * contract shape and run through the same engine — entirely in this
 * browser. The file is never uploaded anywhere. */
csvInput.addEventListener("change", () => {
  const file = csvInput.files?.[0];
  if (!file) return;
  file
    .text()
    .then((text) => {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const imported = adaptAttendanceCsv(text, timeZone);
      const skippedNote =
        imported.skipped.length === 0
          ? "0 rows skipped"
          : `${imported.skipped.length} rows skipped: ${imported.skipped.join("; ")}`;
      renderRecords(
        imported.records,
        `Data: ${file.name} — ${imported.rowCount} rows, ${imported.memberCount} members, ${skippedNote}. ` +
          `Members matched by ${imported.identityMethod}. ` +
          `Everyone in the file is treated as an active member. ` +
          `This data never left your browser.`,
      );
      csvReset.hidden = false;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      sourceEl.textContent = `Could not read that file: ${message}`;
    })
    .finally(() => {
      // Allow re-selecting the same file after edits.
      csvInput.value = "";
    });
});

/* A generated studio at real scale, so the ranking and the drafts can be
 * seen doing their job. Seeded from the calendar day, so everyone opening
 * the page on the same day sees the same studio — and it never goes stale,
 * because the history is generated relative to today. */
generateBtn.addEventListener("click", () => {
  const todayIso = new Date().toISOString().slice(0, 10);
  const seed = Number(todayIso.replace(/-/g, ""));
  const studio = generateStudio(seed, todayIso);
  renderRecords(
    studio.records,
    `Data: a generated studio (seed ${studio.seed}) — ${studio.memberCount} members, ` +
      `every one of them fictional. This is not a real studio's records.`,
  );
  csvReset.hidden = false;
});

csvReset.addEventListener("click", loadSharedRecords);

loadSharedRecords();
