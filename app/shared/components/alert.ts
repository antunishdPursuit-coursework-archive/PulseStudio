/* Pulse Studio — alerts. TEAM-OWNED.
 *
 * WHY THIS EXISTS. The language law asks for a stated negative: "a screen
 * with nothing to show says what it checked, never a blank panel." Every
 * product obeys it in its own way and in its own words, which means four
 * ways to tell a person that something is not working — and, in the places
 * nobody thought about, a fifth way that is silence. The appearance choice
 * is the clearest case: a browser that refuses site data cannot remember
 * it, theme-boot has always KNOWN that, and it said so only inside a panel
 * a person has to open first. Anyone who never opened Settings watched
 * their choice vanish on reload with no explanation on screen.
 *
 * WHAT AN ALERT IS HERE. One sentence saying what is true, in the words the
 * reader would use, with an optional second line saying what was checked or
 * what to do. It is not a toast: nothing here disappears on a timer,
 * because a message that vanishes before it is read is the silence this
 * module exists to end. A reader dismisses it, or it stays.
 *
 * THREE LEVELS AND NO MORE. notice · problem · done. A fourth would need a
 * fourth colour, and the colour law spends colour on people rather than on
 * severity — see the status-token note in theme.css. The level a reader
 * actually perceives is the WORD, which is why every alert carries one:
 * the same lesson the Settings door taught when it was a bare "◐" glyph
 * that no phone could hover to discover.
 *
 * THE REGION IS CREATED EMPTY AND EARLY, on purpose. A screen reader
 * announces changes to a live region that was already in the document; a
 * region inserted WITH its first message is usually not announced at all.
 * So theme-boot calls ensureAlertRegion() at boot and alerts land in
 * something that has been listening since first paint.
 *
 * WHAT IT NEVER DOES. No storage, no clock, no network, no HTML written as
 * a string, and no global error handler — a page here will never turn an
 * extension's console noise into a message blamed on the studio.
 */

export type AlertLevel = "notice" | "problem" | "done";

/** The visible word for each level, and the politeness a screen reader
 *  gets. A problem interrupts; a notice and a completion wait their turn.
 *  Exported as data so a check can pin the mapping without a browser. */
export const ALERT_LEVELS: Readonly<
  Record<AlertLevel, { word: string; role: "alert" | "status"; live: "assertive" | "polite" }>
> = {
  notice: { word: "Notice", role: "status", live: "polite" },
  problem: { word: "Problem", role: "alert", live: "assertive" },
  done: { word: "Done", role: "status", live: "polite" },
};

export interface AlertSpec {
  /** Stable name for the CONDITION, not for this showing of it. Raising the
   *  same id twice replaces the message instead of stacking a second copy —
   *  which is what turns a re-render into an update rather than a pile. */
  id: string;
  level: AlertLevel;
  /** One sentence, addressed to the reader, saying what is true. */
  message: string;
  /** What was checked, or what to do about it. */
  detail?: string;
  /** Default true. Set false only where dismissing would hide something the
   *  reader still needs — a problem that is still happening. */
  dismissible?: boolean;
}

export const ALERT_REGION_ID = "pulse-alerts";

/** The empty region, created once, high enough on the page to be seen
 *  without scrolling and low enough not to displace the header.
 *
 *  Placed AFTER the page header when there is one, because every page here
 *  has its header first and a message above it would push the studio's own
 *  name off the top of a phone screen. */
export function ensureAlertRegion(): HTMLElement {
  const existing = document.getElementById(ALERT_REGION_ID);
  if (existing !== null) return existing;
  const region = document.createElement("div");
  region.id = ALERT_REGION_ID;
  region.className = "alert-region";
  const header = document.querySelector(".topnav, .page-head, .topbar");
  if (header !== null && header.parentNode !== null) header.after(region);
  else document.body.prepend(region);
  return region;
}

/** One alert as a detached element. Pure enough to check: give it a spec,
 *  read back the element, without a region or a page. */
export function alertElement(spec: AlertSpec): HTMLElement {
  const level = ALERT_LEVELS[spec.level];
  const box = document.createElement("div");
  box.className = `alert alert-${spec.level}`;
  box.dataset["alertId"] = spec.id;
  box.setAttribute("role", level.role);
  box.setAttribute("aria-live", level.live);

  const word = document.createElement("strong");
  word.className = "alert-word";
  word.textContent = level.word;

  const body = document.createElement("div");
  body.className = "alert-body";
  const message = document.createElement("p");
  message.className = "alert-message";
  message.textContent = spec.message;
  body.append(message);
  if (spec.detail !== undefined && spec.detail !== "") {
    const detail = document.createElement("p");
    detail.className = "alert-detail";
    detail.textContent = spec.detail;
    body.append(detail);
  }

  box.append(word, body);

  if (spec.dismissible !== false) {
    const close = document.createElement("button");
    close.type = "button";
    close.className = "alert-dismiss";
    /* The glyph is decorative and the LABEL is the whole meaning — a bare
     * × announces as nothing useful and cannot be hovered on a phone. */
    close.textContent = "×";
    close.setAttribute("aria-label", `Dismiss: ${spec.message}`);
    close.addEventListener("click", () => { box.remove(); });
    box.append(close);
  }
  return box;
}

/** Show it. Returns the element, so a caller that wants to say more can. */
export function showAlert(spec: AlertSpec): HTMLElement {
  const region = ensureAlertRegion();
  const box = alertElement(spec);
  const previous = region.querySelector(`[data-alert-id="${CSS.escape(spec.id)}"]`);
  if (previous !== null) previous.replaceWith(box);
  else region.append(box);
  return box;
}

/** Take it down. Returns whether one was actually there — a stated result
 *  rather than a silent no-op, so a caller can tell "cleared" from
 *  "never raised". */
export function dismissAlert(id: string): boolean {
  const region = document.getElementById(ALERT_REGION_ID);
  const box = region?.querySelector(`[data-alert-id="${CSS.escape(id)}"]`) ?? null;
  if (box === null) return false;
  box.remove();
  return true;
}

/** Which conditions are on screen right now, in the order they were
 *  raised. For a page that wants to say "3 checked, 0 flagged" about its
 *  own alerts, and for the suite. */
export function openAlerts(): string[] {
  const region = document.getElementById(ALERT_REGION_ID);
  if (region === null) return [];
  return [...region.querySelectorAll<HTMLElement>("[data-alert-id]")]
    .map((el) => el.dataset["alertId"] ?? "")
    .filter((id) => id !== "");
}
