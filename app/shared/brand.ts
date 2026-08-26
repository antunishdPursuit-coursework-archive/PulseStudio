/* Pulse Studio — THE studio identity. TEAM-OWNED.
 *
 * THE CLONE SEAM: this file is where the studio's name lives — the whole
 * point is that cloning this app for another studio touches the LEAST
 * possible number of files. The complete clone checklist:
 *
 *   1. THIS file — the studio's name.
 *   2. app/shared/theme.css — the accent tokens, if the new studio wants
 *      different colors.
 *   3. app/favicon.svg — the mark.
 *   4. app/index.html — the front door's <title>, meta descriptions,
 *      theme-color hexes, AND the address, telephone and email inside its
 *      JSON-LD block. Markup a crawler reads cannot ask a module anything,
 *      so these are the static remainders, listed so they are never
 *      forgotten. Everything else about the studio's identity — its name
 *      and its contact details — is rendered from THIS file at run time,
 *      into every page's footer.
 *
 * Every page header renders the name FROM here at runtime (see
 * components/brand-header.ts, called by theme-boot on every page), so no
 * product file carries the studio's name as anything more than a
 * pre-module placeholder. Product D's drafts and copy flow from here too,
 * through its deps.ts seam into its config.ts.
 */

export const STUDIO_NAME = "HeartBeat Studio";

/** Where the studio is and how to reach it.
 *
 *  HERE FOR THE SAME REASON THE NAME IS: it is identity, and identity lives
 *  in one file so a clone edits one file. The footer renders all of it at
 *  run time on every page; nothing types an address or a number a second
 *  time.
 *
 *  ONE STATIC REMAINDER, and it is listed in the clone checklist above:
 *  `app/index.html` repeats the address and phone inside its JSON-LD block,
 *  because a search engine reads that markup before any module runs. A
 *  `<meta>` or a `<script type="application/ld+json">` cannot ask a
 *  TypeScript file anything. */
export const STUDIO_CONTACT = {
  streetAddress: "50 Upper Montclair Plaza",
  addressLocality: "Montclair",
  addressRegion: "NJ",
  postalCode: "07043",
  email: "hello@pulse-house.com",
  /** Spoken to, and texted, on two different lines — a studio's front desk
   *  and its class-reminder line are rarely the same number. */
  callPhone: "(973) 337-8259",
  textPhone: "(973) 576-5370",
} as const;

/** A phone number as `tel:` / `sms:` wants it: digits and a country code,
 *  no punctuation. Derived rather than stored twice, so the readable form
 *  above stays the only place a number is typed. */
export function dialable(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 ? `+1${digits}` : `+${digits}`;
}

/** The postal address on one line, in the order an envelope wants it. */
export function addressLine(contact = STUDIO_CONTACT): string {
  return `${contact.streetAddress}, ${contact.addressLocality}, ${contact.addressRegion} ${contact.postalCode}`;
}

/** The two-tone header word, derived from the name: the first word takes
 *  the page's foreground, the rest takes the product accent — PULSE +
 *  STUDIO for this studio, IRON + TEMPLE FITNESS for a clone named
 *  "Iron Temple Fitness". A single-word studio simply has no accent half. */
export function studioWordParts(name: string = STUDIO_NAME): { lead: string; accent: string } {
  const words = name.trim().split(/\s+/);
  return {
    lead: (words[0] ?? "").toUpperCase(),
    accent: words.slice(1).join(" ").toUpperCase(),
  };
}
