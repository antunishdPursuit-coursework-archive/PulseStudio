/* Product D — brand configuration. Rensley's lane.
 *
 * THE RESELL SEAM: everything that names this studio lives here, in one
 * file. To ship this product for a different studio, change these values
 * (and the studio's accent token in the shared theme) — no logic changes.
 * Nothing below is hardcoded anywhere else in this product.
 */

/** Names and addresses that brand every screen and draft. */
export interface StudioBrand {
  /** The studio's public name, used in drafts and page copy. */
  studioName: string;
  /** The studio's outreach mailbox. Drafts BCC it so the studio keeps a
   *  record of what staff sent — the tool itself never sends anything. */
  studioEmail: string;
}

export const brand: StudioBrand = {
  studioName: "Pulse Studio",
  studioEmail: "pulse@githat.io",
};

/** The quiet-member rule, PROPOSED — the team has not ratified these
 *  numbers yet (see PRODUCT_D_MEMBER_REENGAGEMENT_TOOL.md). They live in
 *  config so ratifying different numbers is a one-line change. */
export interface QuietRules {
  /** Flag only when the last attended class is MORE than this many days ago. */
  minDaysQuiet: number;
  /** ...and NO more than this many days ago (older is a different conversation). */
  maxDaysQuiet: number;
  /** How far back before the last visit to count "how often they used to come". */
  priorWindowDays: number;
}

export const proposedRules: QuietRules = {
  minDaysQuiet: 14,
  maxDaysQuiet: 60,
  priorWindowDays: 60,
};

/** Everything the draft voice needs — facts in, message out. */
export interface DraftFacts {
  firstName: string;
  daysSince: number;
  usualClassType: string;
  usualInstructorFirstName: string;
  studioName: string;
}

/** The outreach voice. Warm and personal, no marketing tone — a note one
 *  person sends another. A reseller rewrites ONLY this function to change
 *  the voice. Every value is filled from real records before render;
 *  the unit checks prove no unfilled placeholder can reach a screen. */
export function draftMessage(f: DraftFacts): string {
  return [
    `Hi ${f.firstName} — it's been ${f.daysSince} days since your last ${f.usualClassType} class, and we've missed seeing you.`,
    `${f.usualInstructorFirstName} still teaches ${f.usualClassType} every week, and there's a spot with your name on it. Want us to hold one for you? Just reply and it's done.`,
    `— ${f.studioName}`,
  ].join("\n\n");
}
