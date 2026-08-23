/* Pulse Studio — the brand header renderer. TEAM-OWNED.
 *
 * WHAT: fills every branded home link on a page from the one identity
 * file (shared/brand.ts). Three hooks, by name:
 *
 *   .home-brand .brand-word   — the two-tone header word: first word of
 *                               the studio name in the foreground, the
 *                               rest in the product accent (a nested span)
 *   a.home-brand[aria-label]  — refreshed to "Return to <name> home"
 *   [data-studio-name]        — any element that wants the plain name
 *
 * HOW IT REACHES EVERY LANE WITHOUT TOUCHING ONE: all four product pages
 * carry identical .home-brand markup, and every page loads theme-boot,
 * which calls renderStudioBrand(). So the studio's displayed name is
 * config-driven on every header while each page's HTML keeps only a
 * pre-module placeholder — clone the app, edit shared/brand.ts, and every
 * header follows. The static markup in each page is that page owner's;
 * this component only fills it, never creates or moves it.
 *
 * Styling for .home-brand lives ONCE in shared/theme.css (not here — the
 * word is part of each page's header, always visible, so its styles
 * belong in the stylesheet every page already links, not in an injected
 * tag that arrives with the module). */

import { STUDIO_NAME, studioWordParts } from "../brand.js";
import { pulseLogo } from "./logo.js";

export function renderStudioBrand(root: ParentNode = document): void {
  const { lead, accent } = studioWordParts();

  for (const word of root.querySelectorAll(".home-brand .brand-word")) {
    word.textContent = lead;
    if (accent !== "") {
      const rest = document.createElement("span");
      rest.textContent = accent;
      word.append(rest);
    }
  }

  for (const link of root.querySelectorAll("a.home-brand")) {
    link.setAttribute("aria-label", `Return to ${STUDIO_NAME} home`);
    /* The mark, beside the word. Decorative (aria-hidden inside pulseLogo),
     * so the link still announces once — the label above is the whole name,
     * never "Pulse Studio Pulse Studio". Inserted only when the link does
     * not already carry an svg, so the landing page's inline mark and a
     * second pass over the same page both stay single. */
    if (link.querySelector("svg") === null) {
      link.prepend(pulseLogo(20, true));
    }
  }
  /* The landing page's own inline mark joins the same system: the shared
   * classes give it the size token and the guarded animation without the
   * page changing a byte of markup. */
  for (const svg of root.querySelectorAll("a.brand > svg")) {
    if (!svg.classList.contains("pulse-mark")) {
      svg.classList.add("pulse-mark", "pulse-mark-live");
      const runner = svg.querySelector("path")?.cloneNode(true) as SVGPathElement | null;
      if (runner !== null && svg.querySelector(".pulse-mark-runner") === null) {
        runner.setAttribute("class", "pulse-mark-runner");
        svg.append(runner);
      }
    }
  }

  for (const el of root.querySelectorAll("[data-studio-name]")) {
    el.textContent = STUDIO_NAME;
  }
}
