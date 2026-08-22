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
  /** The IANA zone the studio's calendar runs in. Every day boundary this
   *  product computes — the 14/60 thresholds, the date a note was taken,
   *  the "as of" line — resolves here, so a staff member reading from
   *  another timezone sees the STUDIO's day. It is the fallback used when
   *  a record set does not declare its own; a set that does always wins. */
  timeZone: string;
}

import { counted } from "./text.js";
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
  timeZone: "America/New_York",
};

/* WHAT A CLASS IS CALLED WHEN THE RECORDS NEVER SAID.
 *
 * A sign-in sheet is a name and a date; it does not know what the person
 * came to. The value has to be SOMETHING, because the contract's class_type
 * is a string and not nullable — so it is this, and the draft assembly maps
 * it back to "unknown" rather than letting it reach a sentence. Left in a
 * sentence it reads "your last class class", which is what it did on the
 * supported sign-in-sheet path until this branch.
 *
 * It lives here rather than in csv.ts because it is vocabulary, and because
 * both the door that writes it and the voice that must never print it need
 * to agree on one spelling. */
export const GENERIC_CLASS_TYPE = "class";

/* The placeholder for an instructor the records do not name. Same rule:
 * the draft maps it to unknown rather than writing "The team teaches". */
export const GENERIC_INSTRUCTOR = "the team";

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

/** The outreach discipline's policy — the studio's recorded consent
 *  posture, not the tool's opinion. `enabled` is the studio's opt-in:
 *  false means flags and evidence still render but no draft is ever
 *  offered. The consent window caps how old a silence may be before the
 *  tool refuses to draft at all. Once-per-lapse is the never-nag rule:
 *  one note per lapse, re-armed only when the member returns and lapses
 *  again. */
export interface OutreachPolicy {
  enabled: boolean;
  consentWindowDays: number;
  oncePerLapse: boolean;
}

export const outreachPolicy: OutreachPolicy = {
  /* This studio's recorded yes. A clone that has not asked its members
     ships with false and the workflow stays off. */
  enabled: true,
  /* A BACKSTOP THAT IS DORMANT TODAY, AND SAYING SO IS THE POINT.
   *
   * outreachStateFor refuses to draft when a member's silence is older than
   * this. With the proposed thresholds it can never speak: findQuietMembers
   * only flags members between 14 and 60 days quiet, so the largest
   * daysSince that ever reaches this branch is 60, against a 730-day
   * trigger. Measured over the running studio, every flagged member comes
   * back "ready" and not one is ever "outsideConsent".
   *
   * It stays because it is a real safeguard the day the team ratifies
   * different numbers — the brief says both thresholds are still open — and
   * because maxDaysQuiet doing the same job today is a coincidence of
   * configuration, not a guarantee. What it must not do is be DESCRIBED as
   * something that happens. The suite pins the relationship, so raising
   * maxDaysQuiet past this number turns the backstop live and says so
   * instead of changing behaviour quietly. */
  consentWindowDays: 730,
  oncePerLapse: true,
};

/** Everything the draft voice needs — facts in, message out. */
export interface DraftFacts {
  firstName: string;
  daysSince: number;
  /* NULL IS A REAL ANSWER HERE, and it is the common one on the CSV door.
   * A sign-in sheet is a name and a date: it says a person came in, not
   * what they came to or who taught it. Those used to arrive as the
   * placeholder strings "class" and "the team", which the voice dropped
   * straight into its sentences — so the supported sign-in-sheet import
   * produced "your last class class" and "The team still teaches class
   * every week" in a note a staff member was about to send to a real
   * member. Unknown is now unknown, and the voice has words for it. */
  usualClassType: string | null;
  usualInstructorFirstName: string | null;
  studioName: string;
  /** A concrete upcoming class matching their pattern ("on Thursday at
   *  9:00 AM"), or null when the records hold no upcoming schedule. A
   *  specific invitation beats "sometime" — but only when it is real. */
  suggestedInvite: string | null;
}

/** The outreach voice. Warm and personal, no marketing tone — a note one
 *  person sends another. A reseller rewrites ONLY this function to change
 *  the voice. Every value is filled from real records before render;
 *  the unit checks prove no unfilled placeholder can reach a screen. */
export function draftMessage(f: DraftFacts): string {
  /* The invitation names a REAL class when the schedule holds one — a
   * specific "yes" is easier to say than a vague one — and falls back to
   * the open offer rather than inventing a session that does not exist. */
  const named = f.usualClassType !== null;
  const taught = f.usualInstructorFirstName !== null;
  let invite: string;
  if (f.suggestedInvite !== null) {
    invite = named && taught
      ? `${f.usualInstructorFirstName} teaches ${f.usualClassType} ${f.suggestedInvite} — want us to save you a spot? Just reply and it's done.`
      : named
        ? `There's a ${f.usualClassType} class ${f.suggestedInvite} — want us to save you a spot? Just reply and it's done.`
        : `There's a class ${f.suggestedInvite} — want us to save you a spot? Just reply and it's done.`;
  } else if (named && taught) {
    invite = `${f.usualInstructorFirstName} still teaches ${f.usualClassType} every week, and there's a spot with your name on it. Want us to hold one for you? Just reply and it's done.`;
  } else if (named) {
    invite = `We still run ${f.usualClassType} every week, and there's a spot with your name on it. Want us to hold one for you? Just reply and it's done.`;
  } else {
    invite = `There's still a spot with your name on it whenever you're ready. Want us to hold one for you? Just reply and it's done.`;
  }
  /* The note always hands the member their three ways back — book a spot,
   * ask a question, or just look at what's new — so replying is never the
   * only door. The links come from config (the reseller seam). */
  return [
    named
      ? `Hi ${f.firstName} — it's been ${counted(f.daysSince, "day")} since your last ${f.usualClassType} class, and we've missed seeing you.`
      : `Hi ${f.firstName} — it's been ${counted(f.daysSince, "day")} since your last class, and we've missed seeing you.`,
    invite,
    `Or come back your own way:\n· Book a class: ${brand.studioUrl}products/a-booking/\n· Ask us anything: ${brand.studioUrl}products/c-chatbot/\n· See what's new this week: ${brand.studioUrl}`,
    `— ${f.studioName}`,
  ].join("\n\n");
}
