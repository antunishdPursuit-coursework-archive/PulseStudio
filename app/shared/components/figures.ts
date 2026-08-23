/* Pulse Studio — the studio floor. TEAM-OWNED.
 *
 * Four figures in the studio's own line, one per builder's colour: one
 * lifts, one rows, one rides, one runs the length of the page. Same stroke
 * language as the mark in logo.ts — round caps, round joins, currentColor —
 * so they read as one hand.
 *
 * HAND-ROLLED, AND THAT IS THE POINT. A Lottie or Rive runtime is tens of
 * kilobytes of JavaScript plus a JSON payload, and either one hosted on a
 * CDN would make the privacy policy's "no third-party host" line false.
 * These are a few hundred bytes of geometry and a handful of CSS
 * keyframes. Nothing new is downloaded, nothing new is trusted.
 *
 * HOW THEY MOVE. Every joint is a nested <g> that ROTATES about its own
 * pivot — hip, then knee inside the hip's frame, exactly the way a real
 * skeleton stacks. That is the whole trick: two nested rotations turn two
 * straight lines into a leg that walks, with no path morphing, no SMIL,
 * and nothing a browser has to interpolate along a curve.
 *
 * WHY THE PIVOTS ARE SET HERE AND THE MOTION IS SET IN theme.css. A pivot
 * is a COORDINATE off this drawing — move the hip in the geometry below
 * and the pivot has to move with it. Keeping the two together is what
 * stops a limb from one day rotating about a point that used to be a hip.
 * The timing, the easing and the reduced-motion guard are a LOOK, and
 * looks live in the stylesheet every page already loads.
 *
 * NOTHING MOVES FOR SOMEBODY WHO ASKED IT NOT TO. Every keyframe in
 * theme.css sits inside prefers-reduced-motion: no-preference, and each
 * figure's resting pose is a complete drawing — a person mid-lift, a rider
 * on a bike, a runner in stride. Reduced motion gets a picture, not a
 * broken one.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

type Attrs = Record<string, string | number>;

function make<K extends keyof SVGElementTagNameMap>(name: K, attrs: Attrs = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** A figure's frame: decorative, so it announces nothing. The visible
 *  meaning is carried by the words around it, never by the drawing. */
function frame(viewBox: string, className: string): SVGSVGElement {
  const svg = make("svg", { viewBox, fill: "none", "aria-hidden": "true", focusable: "false" });
  svg.setAttribute("class", `figure ${className}`);
  return svg;
}

/** One bone: a group that pivots at (x, y), with a line running from there
 *  to (x2, y2). Nest one inside another and the child's pivot travels with
 *  the parent — a knee that follows its hip without either knowing about
 *  the other. */
function bone(
  className: string,
  pivot: readonly [number, number],
  end: readonly [number, number],
): SVGGElement {
  const group = make("g", { class: className });
  /* view-box, not fill-box: the numbers below are viewBox coordinates, the
   * same ones the geometry is written in. fill-box would measure them
   * against each group's own bounding box, which changes as the limb
   * rotates — a pivot that wanders is worse than no pivot at all. */
  group.style.transformBox = "view-box";
  group.style.transformOrigin = `${pivot[0]}px ${pivot[1]}px`;
  group.append(make("line", { x1: pivot[0], y1: pivot[1], x2: end[0], y2: end[1] }));
  return group;
}

/* ---------- one: the lift ---------- */

/** A press, in two synchronised pieces.
 *
 *  The ARMS are a V from the shoulders up to the bar, and they scale on Y
 *  about the shoulder line — so they shorten and lengthen the way arms do,
 *  without either end coming loose. The BAR translates the matching
 *  distance in its own group, because a bar squashed by a scale is a bar
 *  with oval plates. Two transforms, one set of keyframes, and they cannot
 *  drift apart because theme.css drives both from the same timeline. */
export function liftingFigure(): SVGSVGElement {
  /* THE viewBox ENDS AT THE FLOOR. Every figure is bottom-aligned in the
   * band, so if one drawing carries empty space under its feet it stands
   * that far above the ground line while its neighbour stands on it. The
   * three viewBoxes below each stop half a stroke-width past the lowest
   * point of the resting pose, and the band draws the one floor they all
   * share. Motion that dips below it still draws: .figure sets
   * overflow: visible for exactly that. */
  const svg = frame("0 0 100 107", "figure-lift");

  const body = make("g", { class: "figure-body" });
  body.append(make("circle", { cx: 50, cy: 40, r: 8 }));          // head
  body.append(make("line", { x1: 50, y1: 48, x2: 50, y2: 76 }));  // torso
  body.append(make("line", { x1: 50, y1: 76, x2: 38, y2: 104 })); // left leg
  body.append(make("line", { x1: 50, y1: 76, x2: 62, y2: 104 })); // right leg

  const arms = make("g", { class: "lift-arms" });
  arms.style.transformBox = "view-box";
  arms.style.transformOrigin = "50px 56px"; // the shoulder line
  /* The V clears the head on both sides. At 30/70 the arms grazed the
   * skull at eye level and read as though they grew out of it. */
  arms.append(make("line", { x1: 50, y1: 56, x2: 26, y2: 20 }));
  arms.append(make("line", { x1: 50, y1: 56, x2: 74, y2: 20 }));

  const bar = make("g", { class: "lift-bar" });
  bar.append(make("line", { x1: 14, y1: 20, x2: 86, y2: 20 }));   // the bar
  bar.append(make("line", { x1: 20, y1: 9, x2: 20, y2: 31 }));    // plate
  bar.append(make("line", { x1: 80, y1: 9, x2: 80, y2: 31 }));    // plate

  svg.append(body, arms, bar);
  return svg;
}

/* ---------- two: the row ---------- */

/** A rower on a slide machine — the fourth colour, Manny's amber, the one
 *  the colour law was missing here: four builders, and until now three
 *  figures.
 *
 *  SIMPLIFIED ON PURPOSE. A real rowing stroke slides the seat along the
 *  rail; at this size that is a second moving frame of reference for very
 *  little legibility gained, so the hip stays put and the drive lives
 *  entirely in three rotations instead — torso lean, arm pull, leg
 *  drive — timed off the same clock in theme.css so they read as one
 *  stroke rather than three limbs moving on their own schedules.
 *
 *  THE ARM IS ONE BONE, NOT TWO. Every other figure's limbs get an upper
 *  and a lower segment because the joint bending is the thing being shown;
 *  a rowing pull reads from the HAND traveling to the chest, and a second
 *  elbow segment at this scale adds a joint nobody would see move. */
export function rowingFigure(): SVGSVGElement {
  const svg = frame("0 0 120 107", "figure-row");

  const rig = make("g", { class: "figure-body" });
  rig.append(make("line", { x1: 14, y1: 100, x2: 100, y2: 100 })); // the slide rail
  rig.append(make("circle", { cx: 8, cy: 84, r: 7 }));             // the flywheel housing
  rig.append(make("line", { x1: 8, y1: 77, x2: 8, y2: 30 }));      // the mast the cable runs up
  rig.append(make("line", { x1: 8, y1: 30, x2: 22, y2: 32 }));     // the cable, mast to handle rest
  svg.append(rig);

  const torso = make("g", { class: "row-torso" });
  torso.style.transformBox = "view-box";
  torso.style.transformOrigin = "62px 60px"; // the hip — legs pivot here too, independently
  torso.append(make("line", { x1: 62, y1: 60, x2: 62, y2: 30 }));  // hip to shoulder
  torso.append(make("circle", { cx: 62, cy: 22, r: 8 }));          // head

  const arm = make("g", { class: "row-arms" });
  arm.style.transformBox = "view-box";
  arm.style.transformOrigin = "62px 30px"; // the shoulder, inside the torso's own frame
  arm.append(make("line", { x1: 62, y1: 30, x2: 22, y2: 32 }));    // reaching for the handle
  torso.append(arm);
  svg.append(torso);

  const thigh = bone("row-thigh", [62, 60], [62, 84]);
  const shin = bone("row-shin", [62, 84], [62, 100]);
  const foot = bone("row-foot", [62, 100], [80, 100]);
  shin.append(foot);
  thigh.append(shin);
  svg.append(thigh);

  return svg;
}

/* ---------- three: the ride ---------- */

/** Cycling in place.
 *
 *  EVERY LIMB IS DRAWN STRAIGHT DOWN and reaches its pose by rotating. The
 *  first version drew each bone already angled and then rotated it again,
 *  so the two angles compounded and the rider arrived as a knot around its
 *  own hip. Draw the rig in a neutral pose, put the pose in the transform,
 *  and the numbers below say what they mean.
 *
 *  The wheels and the crank are pure rotations about their own centres,
 *  which is the one thing SVG transforms do exactly. The legs are two bones
 *  each, half a cycle apart, so one drives while the other recovers. */
export function cyclingFigure(): SVGSVGElement {
  const svg = frame("0 0 140 111", "figure-cycle");

  const bike = make("g", { class: "figure-body" });
  bike.append(make("line", { x1: 68, y1: 88, x2: 30, y2: 88 }));  // chain stay
  bike.append(make("line", { x1: 68, y1: 88, x2: 56, y2: 56 }));  // seat tube
  bike.append(make("line", { x1: 68, y1: 88, x2: 98, y2: 54 }));  // down tube
  bike.append(make("line", { x1: 56, y1: 56, x2: 98, y2: 54 }));  // top tube
  bike.append(make("line", { x1: 56, y1: 56, x2: 30, y2: 88 }));  // seat stay
  bike.append(make("line", { x1: 98, y1: 54, x2: 110, y2: 88 })); // fork
  bike.append(make("line", { x1: 46, y1: 44, x2: 60, y2: 48 }));  // saddle, up on its post
  bike.append(make("line", { x1: 56, y1: 56, x2: 53, y2: 46 }));  // seat post
  bike.append(make("line", { x1: 92, y1: 48, x2: 106, y2: 53 })); // bars

  for (const cx of [30, 110] as const) {
    const wheel = make("g", { class: "cycle-wheel" });
    wheel.style.transformBox = "view-box";
    wheel.style.transformOrigin = `${cx}px 88px`;
    wheel.append(make("circle", { cx, cy: 88, r: 20 }));
    wheel.append(make("line", { x1: cx - 14, y1: 74, x2: cx + 14, y2: 102 }));
    wheel.append(make("line", { x1: cx + 14, y1: 74, x2: cx - 14, y2: 102 }));
    bike.append(wheel);
  }

  /* The crank, with a pedal at each end. Long enough to be seen turning —
   * a chainring alone reads as a dot and the whole stroke goes unnoticed. */
  const crank = make("g", { class: "cycle-crank" });
  crank.style.transformBox = "view-box";
  crank.style.transformOrigin = "68px 88px";
  crank.append(make("line", { x1: 68, y1: 74, x2: 68, y2: 102 }));
  crank.append(make("line", { x1: 63, y1: 74, x2: 73, y2: 74, class: "cycle-pedal" }));
  crank.append(make("line", { x1: 63, y1: 102, x2: 73, y2: 102, class: "cycle-pedal" }));
  crank.append(make("circle", { cx: 68, cy: 88, r: 4 }));

  const rider = make("g", { class: "figure-body" });
  rider.append(make("circle", { cx: 88, cy: 22, r: 8 }));          // head
  rider.append(make("line", { x1: 52, y1: 46, x2: 82, y2: 27 }));  // back, folded over the bars
  rider.append(make("line", { x1: 80, y1: 29, x2: 102, y2: 50 })); // arm to the bars

  /* HIP ON THE SADDLE, NOT INSIDE THE FRAME. The rider used to sit at the
   * seat-tube junction, so both legs ran down the same line as the tube
   * and the whole middle of the drawing was one green tangle. The saddle
   * went up on a post, the hip went with it, and the legs now have air to
   * be legs in.
   *
   * Hip to bottom bracket is 44 units; thigh 24 plus shin 22 is 46, so the
   * leg is just long enough to reach the pedal with a bend in it at every
   * point of the stroke — which is exactly how a saddle gets set. */
  const legs = make("g", {});
  for (const klass of ["cycle-leg-near", "cycle-leg-far"] as const) {
    const thigh = bone(`cycle-thigh ${klass}`, [52, 46], [52, 70]);
    const shin = bone("cycle-shin", [52, 70], [52, 92]);
    const foot = bone("cycle-foot", [52, 92], [62, 92]);
    shin.append(foot);
    thigh.append(shin);
    legs.append(thigh);
  }

  svg.append(bike, crank, legs, rider);
  return svg;
}

/* ---------- four: the run ---------- */

/** A runner in stride. Four limbs, two bones each, arms and legs in
 *  OPPOSITION — the near arm swings with the far leg, which is the one
 *  thing separating running from flailing.
 *
 *  Same rig discipline as the rider: every bone is drawn hanging straight
 *  down from its pivot, and the pose is entirely in the transform.
 *
 *  This figure runs IN PLACE. Carrying it across the page is the wrapper's
 *  job (runningLane below), so the gait and the journey are timed
 *  independently — a stride rate that changed when the crossing got slower
 *  is the giveaway that something is sliding rather than running. */
export function runningFigure(): SVGSVGElement {
  const svg = frame("0 0 104 117", "figure-run");

  const body = make("g", { class: "figure-body" });
  body.append(make("circle", { cx: 62, cy: 20, r: 8.5 }));
  body.append(make("line", { x1: 59, y1: 28, x2: 46, y2: 64 }));  // torso, leaning into the run
  svg.append(body);

  const shoulder: readonly [number, number] = [56, 36];
  for (const klass of ["run-arm-near", "run-arm-far"] as const) {
    const upper = bone(`run-upper-arm ${klass}`, shoulder, [56, 56]);
    const fore = bone("run-forearm", [56, 56], [56, 73]);
    upper.append(fore);
    svg.append(upper);
  }

  const hip: readonly [number, number] = [46, 64];
  for (const klass of ["run-leg-near", "run-leg-far"] as const) {
    const thigh = bone(`run-thigh ${klass}`, hip, [46, 92]);
    const shin = bone("run-shin", [46, 92], [46, 114]);
    const foot = bone("run-foot", [46, 114], [56, 114]);
    shin.append(foot);
    thigh.append(shin);
    svg.append(thigh);
  }
  return svg;
}

/** The runner, plus the lane it crosses. The lane is what travels; the
 *  runner inside it keeps its own stride. */
export function runningLane(): HTMLElement {
  const lane = document.createElement("div");
  lane.className = "run-lane";
  const traveller = document.createElement("div");
  traveller.className = "run-traveller";
  traveller.append(runningFigure());
  lane.append(traveller);
  return lane;
}

/* ---------- the floor ---------- */

const FIGURES: Readonly<Record<string, () => SVGSVGElement>> = {
  lift: liftingFigure,
  row: rowingFigure,
  cycle: cyclingFigure,
  run: runningFigure,
};

/** Fill any `[data-figure]` on the page with the figure it names, and give
 *  a `[data-figure-lane]` element the runner that crosses it.
 *
 *  Named hooks rather than a fixed layout: the page owner decides where a
 *  figure goes and how big it is, this decides what a figure IS. A name
 *  with no figure behind it is left alone and reported once — a silent
 *  empty box is the thing the language law is against. */
export function mountFigures(root: ParentNode = document): string[] {
  const unknown: string[] = [];
  for (const host of root.querySelectorAll<HTMLElement>("[data-figure]")) {
    if (host.querySelector("svg") !== null) continue;
    const name = host.dataset["figure"] ?? "";
    const build = FIGURES[name];
    if (build === undefined) { unknown.push(name); continue; }
    host.append(build());
  }
  for (const lane of root.querySelectorAll<HTMLElement>("[data-figure-lane]")) {
    if (lane.querySelector(".run-lane") !== null) continue;
    lane.append(runningLane());
  }
  return unknown;
}
