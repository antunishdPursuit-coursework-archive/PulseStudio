/* Pulse Studio — the site footer. TEAM-OWNED.
 *
 * WHY THIS EXISTS. The header became one system: every page carries the
 * same mark, the same studio word, the same Settings door and the same
 * session chip, and not one product file was edited to get them — the
 * markup hook is shared and theme-boot fills it. The bottom of the page
 * never got that treatment. On 2026-08-23 exactly ONE of the fourteen
 * published pages had a <footer> at all (the front door); the other
 * thirteen ended at </main>, so a person who scrolled to the end of the
 * booking page, the dashboard or the assistant had no way back to
 * anything and no statement of what the studio does with them.
 *
 * WHAT IT DOES. Builds one footer from one list of links and appends it to
 * the page. Every page that loads theme-boot gets it, which is how it
 * reaches all four lanes without a byte changing inside any of them —
 * the same mechanism as components/brand-header.ts, and for the same
 * reason: a footer pasted into four product folders is four footers that
 * drift, and scripts/check-styles.mjs exists because that already happened
 * to the header twice in one day.
 *
 * TWO WAYS OUT, both deliberate:
 *   - a page that writes its OWN <footer> keeps it — this never fights an
 *     owner's markup, it only fills a gap;
 *   - <body data-no-footer> turns it off outright.
 * Neither is used by any page today, and that is a fact to re-read rather
 * than assume: `git grep -l data-no-footer -- app`.
 *
 * WHERE THE STYLES ARE. shared/theme.css, not here. The footer is on every
 * page from first paint onward, so it belongs in the stylesheet every page
 * already links rather than in a tag that arrives with the module and
 * repaints the bottom of the page after it has been read.
 *
 * WHAT IT NEVER DOES. No storage, no clock, no network, no HTML written as
 * a string. It reads the studio's name from shared/brand.ts (the clone
 * seam) and resolves every href against ITS OWN location, so the same
 * links work from the site root, from a product folder and from
 * shared/synthetic/ — three different depths, one list.
 */

import { pulseLogo } from "./logo.js";
import { studioWordParts } from "../brand.js";

export interface FooterLink {
  label: string;
  /** Relative to the SITE ROOT (`app/`), never to the calling page. */
  href: string;
}

export interface FooterGroup {
  heading: string;
  links: readonly FooterLink[];
}

/* THE WHOLE FOOTER, AS DATA. Adding a link is a line here and nothing
 * else — no page edited, no stylesheet touched, and every one of the
 * thirteen pages gains it on the next load.
 *
 * The audience law decides the grouping, not tidiness: members and staff
 * are named separately and out loud, because "staff tools sit behind a
 * clearly named door" and an unlabelled link to a roster is not one. The
 * third group is about the software rather than about the studio's people,
 * and it is the group the front door already carried — storytold and the
 * source — now shown on every page instead of one.
 *
 * The brand book joins that third group by a decision worth stating: it is
 * exempt from check-audience because it names each builder (the colour law
 * ties a colour to a person, so a sheet hiding whose colour is whose would
 * document a different rule than the one this repo enforces). Exempt from
 * being SCANNED is not the same as unlinkable — storytold carries the same
 * exemption and has been linked from the front door all along. What the
 * law forbids is builder names in the copy a member reads, and the copy a
 * member reads here is "Brand and colours". */
export const FOOTER_GROUPS: readonly FooterGroup[] = [
  {
    heading: "For members",
    links: [
      { label: "Book a class", href: "products/a-booking/" },
      { label: "Ask a question", href: "products/c-chatbot/" },
    ],
  },
  {
    heading: "For staff",
    links: [
      { label: "The Dashboard", href: "products/b-dashboard/" },
      { label: "Re-engagement", href: "products/d-reengagement/" },
    ],
  },
  {
    heading: "About this software",
    links: [
      { label: "How the records flow", href: "shared/storytold.html" },
      { label: "Brand and colours", href: "shared/brand-sheet.html" },
    ],
  },
];

/** The repository. Absolute because it is not on this origin. */
export const SOURCE_URL = "https://github.com/antunishdPursuit/PulseStudio";

/* The studio's one promise about outreach, in the words a member would use
 * for it. It is here rather than in a product because it is true of the
 * whole site: the data law says Product D drafts for staff review only and
 * "nothing in this repo ever sends a message automatically".
 *
 * WHAT IT DELIBERATELY DOES NOT SAY: that nothing leaves the browser. That
 * was the first draft of this line and it is false — the support assistant
 * posts each question to a studio endpoint. A footer is the last thing a
 * careful reader checks, so a comfortable sentence that is not quite true
 * is worse here than nowhere. */
export const FOOTER_PROMISE =
  "Nothing here messages you on its own. A person at the studio reads and decides every note.";

/** Whether a footer link points at the page already open.
 *
 *  Normalised on both sides, because the same page is reachable as
 *  `/products/a-booking/` and `/products/a-booking/index.html`, with or
 *  without a fragment — and a footer that quietly fails to notice would
 *  hand a person a link back to where they already are. Pure and exported
 *  so the suite can check it without a browser. */
export function isCurrentPage(linkHref: string, pageHref: string): boolean {
  const normalise = (url: string): string =>
    (url.split("#")[0] ?? "").split("?")[0]?.replace(/index\.html$/, "") ?? "";
  return normalise(linkHref) === normalise(pageHref);
}

function link(item: FooterLink, root: string, pageHref: string): HTMLLIElement {
  const li = document.createElement("li");
  const a = document.createElement("a");
  a.href = new URL(item.href, root).href;
  a.textContent = item.label;
  if (isCurrentPage(a.href, pageHref)) a.setAttribute("aria-current", "page");
  li.append(a);
  return li;
}

/** Build the footer. `root` is the site root as an absolute URL; `pageHref`
 *  is the page being rendered. Both are parameters rather than reads of
 *  `location` so the suite can build this footer for a page it is not on. */
export function siteFooter(root: string, pageHref: string): HTMLElement {
  const footer = document.createElement("footer");
  footer.className = "site-footer";
  footer.dataset["pulseFooter"] = "";

  const inner = document.createElement("div");
  inner.className = "site-footer-inner";

  /* The brand column. The mark and the two-tone word are the SAME
   * components the header uses — pulseLogo for the mark, studioWordParts
   * for the split — so renaming the studio in shared/brand.ts moves the
   * top and the bottom of every page together. The word is filled here
   * rather than left for renderStudioBrand() because that already ran, at
   * the top of theme-boot, before this element existed. */
  const home = document.createElement("a");
  home.className = "home-brand";
  home.href = new URL("./", root).href;
  home.setAttribute("aria-label", "Return to the studio home page");
  if (isCurrentPage(home.href, pageHref)) home.setAttribute("aria-current", "page");
  home.append(pulseLogo(20, true));
  const word = document.createElement("span");
  word.className = "brand-word";
  const parts = studioWordParts();
  word.textContent = parts.lead;
  if (parts.accent !== "") {
    const rest = document.createElement("span");
    rest.textContent = parts.accent;
    word.append(rest);
  }
  home.append(word);

  const promise = document.createElement("p");
  promise.className = "site-footer-promise";
  promise.textContent = FOOTER_PROMISE;

  const brand = document.createElement("div");
  brand.className = "site-footer-brand";
  brand.append(home, promise);
  inner.append(brand);

  for (const group of FOOTER_GROUPS) {
    /* A labelled nav per group: the heading a person sees and the name a
     * screen reader announces are the same string, so the two cannot
     * disagree later. */
    const nav = document.createElement("nav");
    nav.className = "site-footer-group";
    nav.setAttribute("aria-label", group.heading);
    const heading = document.createElement("h2");
    heading.className = "site-footer-heading";
    heading.textContent = group.heading;
    const list = document.createElement("ul");
    for (const item of group.links) list.append(link(item, root, pageHref));
    nav.append(heading, list);
    inner.append(nav);
  }

  const base = document.createElement("div");
  base.className = "site-footer-base";
  const name = document.createElement("span");
  name.className = "site-footer-name";
  name.textContent = `${parts.lead}${parts.accent === "" ? "" : ` ${parts.accent}`}`;
  const source = document.createElement("a");
  source.className = "site-footer-source";
  source.href = SOURCE_URL;
  source.rel = "noopener";
  source.textContent = "Source";
  base.append(name, source);

  footer.append(inner, base);
  return footer;
}

/** Put the footer on this page, unless the page has one or refuses one. */
export function mountSiteFooter(): void {
  if (document.body.hasAttribute("data-no-footer")) return;
  if (document.querySelector("footer") !== null) return;
  /* Resolve against THIS MODULE, which sits at shared/components/ — two
   * levels below the site root. Resolving against the page instead would
   * give a different answer on every one of the three depths this runs at,
   * which is the bug this line exists to not have. */
  const root = new URL("../../", import.meta.url).href;
  document.body.append(siteFooter(root, location.href));
}
