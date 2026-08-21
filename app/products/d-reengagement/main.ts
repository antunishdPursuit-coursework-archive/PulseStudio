/* Product D — Member Re-engagement Tool. Rensley's lane.
 *
 * Staff-only, read-only, DRAFT-only. This page flags active members who
 * went quiet, shows the evidence for every flag, and prepares a message
 * staff copy (or open in their own email app) and send themselves.
 * There is no send action here and never will be — that law comes from
 * SHARED_DATA_CONTRACT.md and is not negotiable.
 */

import { sharedStudio, type FixtureSet } from "./deps.js";
import { fixtureSetFrom, readRuntimeReservations } from "./live-studio.js";
import { adaptAttendanceCsv } from "./csv.js";
import { generateStudio } from "./generate.js";
import { brand, draftMessage, outreachPolicy, proposedRules } from "./config.js";
import {
  dataQualityLine,
  dayNumberFromIso,
  findQuietMembers,
  firstNameOf,
  inviteWording,
  recentBookingActivity,
  suggestedSession,
  summaryLine,
  nobodyFlaggedLine,
  todayDayNumber,
  todayIsoInZone,
  longDate,
  upcomingReservedNextClassDates,
  weeklyCadence,
  type FlaggedMember,
} from "./logic.js";
import {
  keepOutreachRecords,
  keepSuppressionRecords,
  outreachResults,
  outreachStateFor,
  recordOutreach,
  suppress,
  unsuppress,
  type KeptRows,
  type OutreachRecord,
  type SuppressionRecord,
} from "./outreach.js";

/** Find a required element up front, loudly — a missing mount point is a
 *  broken page, and broken should never look like "nothing to report". */
function requiredElement<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Re-engagement page is missing ${selector}.`);
  return el;
}

/* The outreach ledger and the do-not-contact list live in THIS browser,
 * like every other record here — nothing leaves it. Unreadable storage is
 * stated and reset, never silently trusted. */
let storageWarning = "";

/* STORAGE CAN REFUSE, AND THE REFUSAL MUST BE SAID OUT LOUD.
 *
 * A browser with site data blocked (a private window, an enterprise policy,
 * a sandboxed frame) throws on the ACCESS to localStorage, not merely on the
 * write. Two consequences were live here and are now closed:
 *   - the old catch block called localStorage.removeItem(), so a throwing
 *     store threw a SECOND time out of loadList, out of module top-level,
 *     and the page rendered nothing at all — a blank screen, which the
 *     truth law forbids more strongly than any wrong number.
 *   - persist() was unguarded, so "Do not contact" could appear to work and
 *     be forgotten on reload. A suppression that silently fails is the one
 *     failure this product must never have: it is a member's "no". */
function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function clearStored(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to reset: a store that will not be read cannot hold a value.
  }
}

/** True when this browser will remember anything at all. Checked once so the
 *  page can state the limit beside the result instead of pretending. */
function storageWorks(): boolean {
  try {
    const probe = "pulse-storage-probe";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function loadList<T>(key: string, keep: (rows: unknown) => KeptRows<T>): T[] {
  const label = key.replace("pulse-", "");
  const raw = readStored(key);
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    storageWarning += ` The stored ${label} was unreadable and was reset.`;
    clearStored(key);
    return [];
  }
  if (!Array.isArray(parsed)) {
    storageWarning += ` The stored ${label} was unreadable and was reset.`;
    clearStored(key);
    return [];
  }
  /* PER-ROW, NOT PER-FILE. One corrupt row used to be indistinguishable from
   * a corrupt file, and an unchecked cast let a row with a missing takenAt
   * reach the median arithmetic and produce NaN. The rule itself lives in
   * outreach.ts so the unit checks hold it; this only states the count. */
  const { kept, dropped } = keep(parsed);
  if (dropped > 0) {
    storageWarning += ` ${dropped} unreadable ${dropped === 1 ? "entry" : "entries"} in the stored ${label} ${dropped === 1 ? "was" : "were"} discarded.`;
  }
  return kept;
}

let ledger = loadList("pulse-outreach-ledger", keepOutreachRecords);
let suppressions = loadList("pulse-suppressions", keepSuppressionRecords);

if (!storageWorks()) {
  storageWarning +=
    " This browser is not saving site data, so notes taken and do-not-contact choices last only until this page is closed.";
}

function persist(): void {
  try {
    localStorage.setItem("pulse-outreach-ledger", JSON.stringify(ledger));
    localStorage.setItem("pulse-suppressions", JSON.stringify(suppressions));
  } catch {
    /* Said once, and it stays said: a silent failure here would let a
     * member's "do not contact" be forgotten without anyone knowing. */
    if (!storageWarning.includes("not saving site data")) {
      storageWarning +=
        " This browser is not saving site data, so notes taken and do-not-contact choices last only until this page is closed.";
    }
  }
}
/* THE STUDIO'S DAY, NOT THE VIEWER'S AND NOT UTC.
 *
 * This used to be new Date().toISOString().slice(0, 10), which is UTC. The
 * studio runs in America/New_York, so a note taken at 8pm on a Wednesday
 * was stamped Thursday — and outreachResults() only counts a visit AFTER
 * the note, so a member who came back Thursday morning was reported as
 * still quiet. The thresholds were already computed in the studio's zone
 * (todayDayNumber); the stamps were not, and one page cannot have two
 * different todays. */
let recordsTimezone = brand.timeZone;
const studioToday = (): string => todayIsoInZone(recordsTimezone);

const statusEl = requiredElement<HTMLParagraphElement>("#status");
const ruleEl = requiredElement<HTMLParagraphElement>("#rule");
const flaggedEl = requiredElement<HTMLElement>("#flagged");
const footerEl = requiredElement<HTMLParagraphElement>("#footer-note");
const backEl = requiredElement<HTMLAnchorElement>("#back-link");
const sourceEl = requiredElement<HTMLParagraphElement>("#source");
const csvInput = requiredElement<HTMLInputElement>("#csv-input");
const csvReset = requiredElement<HTMLButtonElement>("#csv-reset");
const generateBtn = requiredElement<HTMLButtonElement>("#generate");

/* Apply the configurable studio identity to document and accessible copy.
 * The header's brand word and aria-label render from the SHARED clone
 * seam now: theme-boot calls components/brand-header.js on every page,
 * and config.ts sources studioName from the same file through deps.ts —
 * one rename in app/shared/brand.ts reaches headers, titles, and drafts
 * alike. This file keeps only what is D's own: the document title and
 * the footer copy. */
document.title = `Member Re-engagement — ${brand.studioName}`;
footerEl.textContent =
  `Drafts only — staff review and send every message themselves; nothing on ` +
  `this page can send. ` +
  (brand.studioEmail === null ? "" : `Studio record copy: ${brand.studioEmail} · `);
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

function buildDraftText(f: FlaggedMember, data: FixtureSet, today: number): string {
  // The concrete invitation: a real upcoming class matching their pattern,
  // or null — the voice falls back to the open offer, never an invented one.
  const session = suggestedSession(f, data, today);
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
    suggestedInvite: session === null ? null : inviteWording(session),
  });
}

/** A mailto: link opens the STAFF member's own mail client with the draft
 *  prefilled — the human chooses the recipient and presses send. The
 *  studio mailbox rides along as BCC so the studio keeps its own record. */
function mailtoHref(f: FlaggedMember, draft: string): string {
  const subject = `We miss you at ${brand.studioName}, ${firstNameOf(f.member.display_name)}!`;
  // RFC 6068 wants CRLF line breaks in a mailto body; some clients collapse
  // bare %0A. Only the URL gets CRLF — screen and clipboard stay LF.
  const bcc =
    brand.studioEmail === null ? "" : `bcc=${encodeURIComponent(brand.studioEmail)}&`;
  return (
    "mailto:?" +
    bcc +
    `subject=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(draft.replace(/\n/g, "\r\n"))}`
  );
}

function renderFlagged(
  f: FlaggedMember,
  rank: number,
  data: FixtureSet,
  today: number,
): HTMLElement {
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
    `${f.priorCount} classes in the prior ${proposedRules.priorWindowDays} days ` +
    `(≈${weeklyCadence(f.priorCount, proposedRules.priorWindowDays)}/week) · ` +
    `usually ${f.usualClassType} with ${f.usualInstructorName}`;
  card.append(head, evidence);

  // Booking without attending since the last visit is a DIFFERENT story
  // from pure silence — the member reached for the studio and something
  // got in the way. Disclosed so the note can meet them there; never
  // counted as a visit, never shrinking the quiet-days count.
  const activity = recentBookingActivity(
    f.member.member_id,
    data,
    dayNumberFromIso(f.lastSession.starts_at),
    today,
  );
  if (activity !== null) {
    const line = document.createElement("p");
    line.className = "evidence activity";
    line.textContent = `Booked since their last visit — ${activity} — but did not attend.`;
    card.append(line);
  }

  /* THE DISCIPLINE. Evidence always renders — the flag and its why are
   * never withheld — but a draft is only offered when the policy allows:
   * opted-in studio, not suppressed, inside the consent window, and this
   * lapse not already acted on. The card says WHICH rule spoke. */
  const state = outreachStateFor(f, outreachPolicy, ledger, suppressions);
  if (state.kind !== "ready") {
    const line = document.createElement("p");
    line.className = "workflow-state";
    line.textContent =
      state.kind === "disabled"
        ? "Outreach workflow is off — this studio has not opted in."
        : state.kind === "suppressed"
          ? `Do not contact — suppressed ${state.since}.`
          : state.kind === "outsideConsent"
            ? `Outside the ${outreachPolicy.consentWindowDays}-day consent window (${state.days} days quiet) — no draft offered.`
            : `Already reached for this lapse (${state.channel}, ${state.takenAt}). A new lapse re-arms.`;
    card.append(line);
    if (state.kind === "suppressed") {
      const un = document.createElement("button");
      un.className = "btn-ghost";
      un.type = "button";
      un.textContent = "Allow contact again";
      un.addEventListener("click", () => {
        suppressions = unsuppress(suppressions, f.member.member_id);
        persist();
        rerender();
      });
      card.append(un);
    }
    return card;
  }

  const draft = buildDraftText(f, data, today);
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
    // ONLY a successful copy claims the lapse: a failed copy leaves the
    // draft offered, because nothing was actually taken.
    if (!navigator.clipboard) {
      copyBtn.textContent = "Copy failed — select the text above";
      return;
    }
    navigator.clipboard.writeText(draft).then(
      () => {
        copyBtn.textContent = "Copied ✓";
        ledger = recordOutreach(ledger, f, "copy", studioToday());
        persist();
        setTimeout(rerender, 900);
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
  mailLink.addEventListener("click", () => {
    // Opening the mail client IS taking the draft — the note is in the
    // staff member's hands from here.
    ledger = recordOutreach(ledger, f, "email", studioToday());
    persist();
    setTimeout(rerender, 900);
  });

  const suppressBtn = document.createElement("button");
  suppressBtn.className = "btn-ghost";
  suppressBtn.type = "button";
  suppressBtn.textContent = "Do not contact";
  suppressBtn.addEventListener("click", () => {
    suppressions = suppress(suppressions, f.member.member_id, studioToday());
    persist();
    rerender();
  });

  actions.append(copyBtn, mailLink, suppressBtn);
  card.append(draftBlock, actions);
  return card;
}

/** The closed loop, rendered: what happened after every taken draft. A
 *  reference win-back engine sends and never learns; this one states it —
 *  who came back, how fast, who stayed quiet, and which ledger entries
 *  these records cannot judge. */
function renderOutcomes(data: FixtureSet, today: number): void {
  const outcomesEl = requiredElement<HTMLElement>("#outcomes");
  outcomesEl.replaceChildren();
  if (ledger.length === 0) return;
  const results = outreachResults(ledger, data, today);
  const line = document.createElement("p");
  line.className = "status outcomes-line";
  const total = results.outcomes.length + results.notEvaluable;
  const parts = [`Outreach so far: ${total} ${total === 1 ? "note" : "notes"} taken`];
  parts.push(
    `${results.returned} came back` +
      (results.medianDaysToReturn === null
        ? ""
        : ` (median ${results.medianDaysToReturn} days after the note)`),
  );
  parts.push(`${results.stillQuiet} still quiet`);
  if (results.notEvaluable > 0) {
    parts.push(`${results.notEvaluable} not evaluable in these records`);
  }
  line.textContent = parts.join(" · ") + ".";
  outcomesEl.append(line);

  const memberName = new Map(data.members.map((m) => [m.member_id, m.display_name]));
  const returned = results.outcomes.filter((o) => o.result === "returned");
  if (returned.length > 0) {
    // The welcome-back cue: these members answered a note with a visit.
    // The save is only finished when someone at the studio says so.
    const list = document.createElement("p");
    list.className = "evidence";
    list.textContent =
      "Came back after a note — worth a hello at the front desk: " +
      returned
        .map(
          (o) =>
            `${memberName.get(o.record.memberId) ?? o.record.memberId} (${o.daysToReturn} days)`,
        )
        .join(" · ");
    outcomesEl.append(list);
  }
  const logBtn = document.createElement("button");
  logBtn.className = "btn-ghost";
  logBtn.type = "button";
  logBtn.textContent = "Download the outreach log (stays on this device)";
  logBtn.addEventListener("click", () => {
    const lines = ["member,member id,channel,note taken,result,days to return"];
    for (const o of results.outcomes) {
      const nameText = memberName.get(o.record.memberId) ?? "";
      lines.push(
        [
          /[",\n]/.test(nameText) ? `"${nameText.replaceAll('"', '""')}"` : nameText,
          o.record.memberId,
          o.record.channel,
          o.record.takenAt,
          o.result === "returned" ? "came back" : "still quiet",
          o.daysToReturn === null ? "" : String(o.daysToReturn),
        ].join(","),
      );
    }
    const blob = new Blob([lines.join("\n") + "\n"], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "outreach-log.csv";
    a.click();
    URL.revokeObjectURL(url);
  });
  outcomesEl.append(logBtn);
}

/** Re-render with the CURRENT data source — workflow actions change ledger
 *  state, and the cards must say so immediately. */
let rerender: () => void = () => {};

/** Paint the page from ANY contract-shaped record set — the shared studio
 *  records or an imported attendance file. One render path, two doors. */
function renderRecords(data: FixtureSet, sourceNote: string): void {
  rerender = () => renderRecords(data, sourceNote);
  // "Today" is the record set's declared timezone — the shared fixture
  // states the studio's; an import uses the staff member's, since they are
  // at the studio. Either way thresholds never shift with a viewer's zone.
  recordsTimezone = data.timezone;
  const today = todayDayNumber(data.timezone);
  const result = findQuietMembers(data, today, proposedRules);

  // A quiet member who already holds a reserved spot for a class after
  // today is coming back on their own — stated by name AND date, and left
  // alone, never nagged. Read from the same reservation trail Booking
  // writes. Saying when they return turns the line from bookkeeping into
  // a cue: staff know which day to say "good to see you back".
  const nextClassDates = upcomingReservedNextClassDates(data, today);
  const alreadyReturning = result.flagged.filter((f) =>
    nextClassDates.has(f.member.member_id),
  );
  result.flagged = result.flagged.filter((f) => !nextClassDates.has(f.member.member_id));

  const asOf = longDate(todayIsoInZone(data.timezone));

  // The result line states what was found; the data-quality line states
  // what could not be judged. Reporting only the first would let unusable
  // evidence pass as a clean answer.
  const quality = dataQualityLine(result);
  const comingLine =
    alreadyReturning.length === 0
      ? ""
      : ` ${alreadyReturning.length} left alone — already booked back in: ` +
        `${alreadyReturning
          .map((f) => {
            const date = nextClassDates.get(f.member.member_id);
            return date === undefined
              ? f.member.display_name
              : `${f.member.display_name} (returns ${evidenceDate(`${date}T00:00:00`)})`;
          })
          .join(", ")}.`;
  statusEl.textContent =
    (quality
      ? `${summaryLine(result, asOf)} ${quality}${comingLine}`
      : `${summaryLine(result, asOf)}${comingLine}`) + storageWarning;
  sourceEl.textContent = sourceNote;
  ruleEl.textContent =
    `Proposed thresholds (not yet ratified by the team): flag active members ` +
    `whose last attended class is more than ${proposedRules.minDaysQuiet} and ` +
    `at most ${proposedRules.maxDaysQuiet} days ago. Only attended classes ` +
    `count — a no-show is never a visit.`;

  renderOutcomes(data, today);

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
    /* NOT AN ALL-CLEAR BY DEFAULT. This used to read "every member in these
     * records has been in recently", which is true for one of the four ways
     * a studio reaches zero flagged and flatly false for the studio where
     * everybody left three months ago — the case staff would most want to
     * know about. The line now states which of them happened. */
    const calm = document.createElement("p");
    calm.className = "status";
    calm.textContent = nobodyFlaggedLine(result, proposedRules) ?? "";
    flaggedEl.append(calm);
    return;
  }
  result.flagged.forEach((f, i) => flaggedEl.append(renderFlagged(f, i + 1, data, today)));
}

function loadSharedRecords(): void {
  /* THE LIVE TRAIL: the default records are the running studio — the same
   * cached dataset Booking books against and sign-in lists — with
   * Booking's own reservation log merged in (last row wins). The CSV door
   * and the generated studio remain the other two doors. */
  try {
    const data = fixtureSetFrom(sharedStudio(), readRuntimeReservations());
    renderRecords(
      data,
      "Data: the running studio — the same records Booking writes to, " +
        "including its live reservation log from this browser.",
    );
    csvReset.hidden = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    statusEl.textContent = `Could not build the studio records: ${message}`;
  }
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
  const anchor = todayIsoInZone(recordsTimezone);
  const seed = Number(anchor.replace(/-/g, ""));
  const studio = generateStudio(seed, anchor);
  renderRecords(
    studio.records,
    `Data: a generated studio (seed ${studio.seed}) — ${studio.memberCount} members, ` +
      `every one of them fictional. This is not a real studio's records.`,
  );
  csvReset.hidden = false;
});

csvReset.addEventListener("click", loadSharedRecords);

loadSharedRecords();
