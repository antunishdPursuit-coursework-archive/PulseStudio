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
 *   4. app/index.html — the front door's <title>, meta descriptions, and
 *      theme-color hexes (metas cannot read runtime values; this is the
 *      one static remainder, listed so it is never forgotten).
 *
 * Every page header renders the name FROM here at runtime (see
 * components/brand-header.ts, called by theme-boot on every page), so no
 * product file carries the studio's name as anything more than a
 * pre-module placeholder. Product D's drafts and copy flow from here too,
 * through its deps.ts seam into its config.ts.
 */

export const STUDIO_NAME = "Pulse Studio";

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
