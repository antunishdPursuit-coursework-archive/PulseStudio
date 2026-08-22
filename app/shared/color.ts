/* Pulse Studio — colour arithmetic. TEAM-OWNED.
 *
 * WHY THIS FILE EXISTS: the WCAG contrast formula was written twice. Once
 * in `theme-boot.ts`, where it decides whether a person's chosen
 * background and text pair is readable enough to accept, and once in
 * `scripts/check-contrast.mjs`, where it decides whether the gate passes.
 * Two implementations of the same standard, and nothing comparing them —
 * so the gate could bless a palette the browser would reject, or the
 * reverse, and the first anybody would know is a person staring at
 * unreadable text the gate said was fine.
 *
 * They could not be merged where they were. `theme-boot.ts` reads
 * `document` at module load, so Node cannot import it; the gate had no
 * choice but its own copy. Moving the arithmetic somewhere with no DOM in
 * it gives both sides the same code.
 *
 * NOTHING HERE TOUCHES THE DOM, reads the clock, or fetches anything. That
 * is the whole point: it has to be loadable by a browser page, a headless
 * check, and a build-time gate alike.
 */

export type Hsl = { hue: number; saturation: number; lightness: number };

/** A six-digit hex colour, the only form this studio stores. */
export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

/** Relative luminance, WCAG 2.x. */
export function luminance(color: string): number {
  const parts = color.slice(1).match(/.{2}/g);
  if (parts === null) return 0;
  const channels = parts.map((part) => {
    const channel = Number.parseInt(part, 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
}

/** Contrast ratio, 1..21. Order does not matter — the formula sorts them. */
export function contrast(background: string, text: string): number {
  const first = luminance(background);
  const second = luminance(text);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

export function hslToHex({ hue, saturation, lightness }: Hsl): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const secondary = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = l - chroma / 2;
  const channels =
    hue < 60 ? [chroma, secondary, 0] : hue < 120 ? [secondary, chroma, 0] :
    hue < 180 ? [0, chroma, secondary] : hue < 240 ? [0, secondary, chroma] :
    hue < 300 ? [secondary, 0, chroma] : [chroma, 0, secondary];
  return `#${channels.map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, "0")).join("")}`;
}

export function hexToHsl(hex: string): Hsl {
  const channels = hex.slice(1).match(/.{2}/g)?.map((part) => Number.parseInt(part, 16) / 255);
  const red = channels?.[0] ?? 1;
  const green = channels?.[1] ?? 1;
  const blue = channels?.[2] ?? 1;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  const lightness = (maximum + minimum) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;
  if (delta !== 0) {
    if (maximum === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (maximum === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }
  return { hue: (hue + 360) % 360, saturation: saturation * 100, lightness: lightness * 100 };
}

/** The nearest colour to `candidate` that reaches AA against `other`,
 *  found by walking lightness outward in both directions. Returns the
 *  candidate unchanged when nothing in range qualifies — a caller must
 *  check the result rather than assume it succeeded. */
export function nearestReadable(candidate: Hsl, other: string): Hsl {
  if (contrast(hslToHex(candidate), other) >= 4.5) return candidate;
  for (let step = 1; step <= 100; step += 1) {
    for (const lightness of [candidate.lightness - step, candidate.lightness + step]) {
      if (lightness < 0 || lightness > 100) continue;
      const adjusted = { ...candidate, lightness };
      if (contrast(hslToHex(adjusted), other) >= 4.5) return adjusted;
    }
  }
  return candidate;
}
