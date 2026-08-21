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
  /** The studio's own outreach mailbox, or null when it has none.
   *
   *  When set, a draft opened in a staff member's email app BCCs it, so
   *  the studio keeps its own record of what went out — the tool still
   *  never sends anything itself.
   *
   *  NULL IS A REAL ANSWER, not a placeholder to fill in: a studio without
   *  a shared mailbox gets a page that simply does not mention one. Naming
   *  an address nobody reads would be worse than naming none. */
  studioEmail: string | null;
  /** The studio's public web address, used in draft links so a member can
   *  book, ask, or browse straight from the note. Ends with a slash. */
  studioUrl: string;
}

import { STUDIO_NAME } from "./deps.js";

export const brand: StudioBrand = {
  /* Sourced from the shared clone seam (app/shared/brand.ts) through
   * deps.ts — the studio renames in ONE file and drafts, titles, and
   * headers all follow. Override with a literal here only when this
   * product ships standalone under its own name. */
  studioName: STUDIO_NAME,
  /* Unset for this studio: it keeps no shared record mailbox, so the page
     claims none. A studio that has one puts it here and the footer and the
     draft BCC follow — the only edit needed. */
  studioEmail: null,
  studioUrl: "https://antunishdpursuit.github.io/PulseStudio/",
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
  /* The note always hands the member their three ways back — book a spot,
   * ask a question, or just look at what's new — so replying is never the
   * only door. The links come from config (the reseller seam). */
  return [
    `Hi ${f.firstName} — it's been ${f.daysSince} days since your last ${f.usualClassType} class, and we've missed seeing you.`,
    `${f.usualInstructorFirstName} still teaches ${f.usualClassType} every week, and there's a spot with your name on it. Want us to hold one for you? Just reply and it's done.`,
    `Or come back your own way:\n· Book a class: ${brand.studioUrl}products/a-booking/\n· Ask us anything: ${brand.studioUrl}products/c-chatbot/\n· See what's new this week: ${brand.studioUrl}`,
    `— ${f.studioName}`,
  ].join("\n\n");
}
