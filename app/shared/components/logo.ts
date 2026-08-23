/* Pulse Studio — the mark. TEAM-OWNED.
 *
 * One pulse line, one source: this is the same path app/favicon.svg
 * draws, exported as a callable component so any page that wants the
 * logo builds it from HERE instead of pasting SVG markup. The stroke is
 * currentColor, so the mark inherits whatever text color surrounds it —
 * foreground in a header, accent inside a product control — with no
 * configuration.
 *
 * (favicon.svg itself must stay a static file — browsers fetch it
 * outside the page — so the path is duplicated there BY DESIGN and both
 * places say so. Changing the mark = this constant + favicon.svg.)
 */

export const PULSE_MARK_PATH = "M2 16h5.5l3-8.5 5 17 3.5-10 2.5 1.5H30";

const SVG_NS = "http://www.w3.org/2000/svg";

/** The logo as a ready DOM node. Decorative by default (aria-hidden) —
 *  pair it with visible text, the way every header here does.
 *
 *  `live` adds a second copy of the same path that a guarded CSS animation
 *  sends a short spark along — energy moving through the mark, once per
 *  studio beat. THE STATIC MARK IS THE WHOLE MARK: the runner path is
 *  invisible until the animation makes it otherwise, so with motion
 *  unavailable or reduced the logo is simply the solid line, complete and
 *  needing nothing. The animation itself lives in theme.css behind
 *  prefers-reduced-motion: no-preference; nothing here moves anything. */
export function pulseLogo(size = 26, live = false): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("viewBox", "0 0 32 32");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", live ? "pulse-mark pulse-mark-live" : "pulse-mark");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", PULSE_MARK_PATH);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2.6");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
  if (live) {
    const runner = document.createElementNS(SVG_NS, "path");
    runner.setAttribute("d", PULSE_MARK_PATH);
    runner.setAttribute("fill", "none");
    runner.setAttribute("stroke", "currentColor");
    runner.setAttribute("stroke-width", "2.6");
    runner.setAttribute("stroke-linecap", "round");
    runner.setAttribute("stroke-linejoin", "round");
    runner.setAttribute("class", "pulse-mark-runner");
    svg.append(runner);
  }
  return svg;
}
