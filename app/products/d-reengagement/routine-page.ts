/* Pulse Studio — Product D — the public routine page. RENSLEY'S LANE.
 *
 * THE ONE PAGE IN THIS PRODUCT A MEMBER MAY OPEN, and the reason it is safe
 * for them to open is that it knows nothing about them. It reads a routine
 * id from the address and renders that routine. There is no member id, no
 * attendance, no membership state and no outreach record here or in the
 * address that reached it — so two people sent the same routine see exactly
 * the same page, and the page cannot tell them apart.
 *
 * WHAT RESOLVES. Approved routines render. Retired ones render with a notice,
 * because somebody may be holding a link from months ago and an empty frame
 * would be worse than the truth. Drafts do NOT resolve: unapproved content is
 * not published, and a draft id is answered exactly like an unknown one so
 * that the address cannot be used to discover what has not been approved yet.
 *
 * Every value is written with textContent. Routine text is authored by a
 * person, and this page may be opened by anyone.
 */

import { ROUTINE_LIBRARY } from "./routine-library.js";
import {
  SAFETY_HEADING, SAFETY_INTRO, SAFETY_POINTS, findRoutine, loadLibrary,
} from "./routines.js";
import type { HomeRoutine } from "./routines.js";

const titleEl = document.querySelector<HTMLHeadingElement>("#routineTitle");
const stateEl = document.querySelector<HTMLParagraphElement>("#routineState");
const bodyEl = document.querySelector<HTMLDivElement>("#routineBody");

function say(text: string): void {
  if (stateEl !== null) stateEl.textContent = text;
}

function para(text: string, className = "evidence"): HTMLParagraphElement {
  const p = document.createElement("p");
  p.className = className;
  p.textContent = text;
  return p;
}

/** The safety guidance, on every routine view without exception. */
function safetyBlock(notice: string): HTMLElement {
  const box = document.createElement("section");
  box.className = "safety";
  const h = document.createElement("h2");
  h.textContent = SAFETY_HEADING;
  box.append(h, para(SAFETY_INTRO), para(notice));
  const list = document.createElement("ul");
  for (const point of SAFETY_POINTS) {
    const li = document.createElement("li");
    li.textContent = point;
    list.append(li);
  }
  box.append(list);
  return box;
}

function renderRoutine(routine: HomeRoutine): void {
  if (titleEl !== null) titleEl.textContent = routine.title;
  say(
    routine.status === "retired"
      ? "This routine has been retired by the studio. It is kept here because you may have an older link to it."
      : `${routine.durationMinutes} minutes · ${routine.difficulty}`,
  );
  if (bodyEl === null) return;

  bodyEl.append(para(routine.summary));
  bodyEl.append(para(routine.purpose));
  bodyEl.append(para(
    routine.equipment.length === 0
      ? "No equipment needed."
      : `Equipment: ${routine.equipment.join(", ")}`,
  ));

  const steps = document.createElement("ol");
  steps.className = "steps";
  for (const step of routine.steps) {
    const li = document.createElement("li");
    const h = document.createElement("p");
    h.className = "routine-title";
    /* A step is timed or counted — the contract refuses anything else, so
     * exactly one of these is present and no placeholder is ever printed. */
    const measure = step.durationSeconds !== undefined
      ? `${step.durationSeconds} seconds`
      : `${step.repetitions} times`;
    h.textContent = `${step.title} · ${measure}`;
    li.append(h, para(step.instruction));
    if (step.restSeconds !== undefined) li.append(para(`Rest ${step.restSeconds} seconds.`));
    /* An easier option and a caution belong WITH the step, not collected at
     * the bottom where somebody reading one step would never see them. */
    if (step.easierOption !== undefined) li.append(para(`Easier: ${step.easierOption}`));
    if (step.caution !== undefined) li.append(para(`Take care: ${step.caution}`));
    steps.append(li);
  }
  bodyEl.append(steps);
  bodyEl.append(safetyBlock(routine.safetyNotice));
}

/* ---------- what the address asked for ---------- */

const library = loadLibrary(ROUTINE_LIBRARY);
const asked = new URLSearchParams(window.location.search).get("r");

if (asked === null || asked.trim() === "") {
  say("No routine was named in this link. Ask the studio for the link again.");
} else {
  const routine = findRoutine(library, asked);
  if (routine === null) {
    /* A draft and an unknown id are answered identically on purpose: the
     * address must not become a way to find out what is not approved yet. */
    say("No routine with that link. It may have been withdrawn — ask the studio.");
  } else {
    renderRoutine(routine);
  }
}
