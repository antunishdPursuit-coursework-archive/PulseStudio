/* Pulse Studio — who the assistant is talking to. TEAM-OWNED.
 *
 * WHY THIS IS SHARED AND NOT IN PRODUCT C. The rule it encodes is the data
 * law, which belongs to all four products: "Members see only their own data;
 * staff-only information (rosters, attendance, cancellation risk) never
 * appears in a member-facing surface." An assistant that answers from studio
 * records is the easiest place in this repo to break that by accident, and
 * the fix should not live inside one product where the other three cannot
 * see it or check it.
 *
 * WHAT IT DOES NOT DO. It does not talk to a model, hold a key, or make a
 * network call. It decides WHO is asking and WHAT MAY BE SAID BACK, and
 * returns that as data. Product C wires it to whatever endpoint the studio
 * provides; this file never learns the endpoint exists.
 *
 * TWO AUDIENCES, DECIDED BY TWO THINGS.
 *
 *  - The signed-in actor, from the shared session: a member or a staff
 *    person. This is CONVENIENCE, not access control — the audience law is
 *    explicit that the browser session never gates a route, and pretending
 *    otherwise would be a lie about what protects this data.
 *  - Where the assistant is embedded. A member-facing page stays
 *    member-facing even when a staff person is signed in on it, because the
 *    screen may be turned toward a member. A staff surface may show staff
 *    answers only when a staff person is actually signed in.
 *
 * THE ASYMMETRY IS DELIBERATE. Placement can only ever NARROW what may be
 * said; it can never widen it. A member on a staff page is still a member.
 * That is why the two inputs are not simply combined — the safe direction is
 * the only direction.
 */

/** Who is signed in, as the shared session reports it. `null` is nobody. */
export type Actor = "member" | "staff" | null;

/** Where the assistant is embedded. Set by the page, never guessed. */
export type Placement = "member-facing" | "staff-facing";

export type Audience = "member" | "staff";

/** What a page may put in front of whoever is reading it. */
export interface AudiencePolicy {
  audience: Audience;
  /** The opening line, in the voice that audience expects. */
  greeting: string;
  /** Plain words for what this assistant will answer, shown to the reader so
   *  the limits are stated rather than discovered by being refused. */
  scope: string;
  /** What it says when a question falls outside that scope. Never a bare
   *  "I cannot help" — the language law asks for stated negatives. */
  refusal: string;
  /** Whether staff-only records may inform an answer at all. */
  mayUseStaffRecords: boolean;
  /** Whether an answer may name a member other than the person asking. */
  mayNameOtherMembers: boolean;
}

/** The audience, from the actor and the placement.
 *
 *  Staff answers require BOTH a staff-facing placement and a signed-in staff
 *  actor. Everything else is a member audience, including a staff person on a
 *  member-facing page — the screen may be turned toward a member, and no
 *  answer should depend on which way it happens to be pointing. */
export function audienceFor(actor: Actor, placement: Placement): Audience {
  return placement === "staff-facing" && actor === "staff" ? "staff" : "member";
}

const MEMBER: Omit<AudiencePolicy, "greeting"> = {
  audience: "member",
  scope:
    "Ask about the class schedule, class levels, or current studio policies. " +
    "I answer from the studio's own records, and I say so when I do not know.",
  refusal:
    "I do not have that in the studio's records. The front desk can help — " +
    "and if it is about your own membership or another member, they are the " +
    "right people to ask rather than me.",
  mayUseStaffRecords: false,
  mayNameOtherMembers: false,
};

const STAFF: Omit<AudiencePolicy, "greeting"> = {
  audience: "staff",
  scope:
    "Ask about the schedule, class capacity, attendance, or current policies. " +
    "I answer from the studio's own records, and I say so when I do not know.",
  refusal:
    "I do not have that in the studio's records. I will not guess at it — " +
    "an answer invented here would look exactly like one that was looked up.",
  mayUseStaffRecords: true,
  /* Staff legitimately see rosters. This is the flag a member-facing surface
   * must never receive, which is why it is a field rather than an assumption
   * made at the point of answering. */
  mayNameOtherMembers: true,
};

/** The whole policy, ready to render.
 *
 *  `firstName` is used only for the greeting, and only when the person asking
 *  is the person named. It is never required — an unsigned reader gets a
 *  greeting that assumes nothing about them. */
export function audiencePolicy(
  actor: Actor,
  placement: Placement,
  firstName: string | null = null,
): AudiencePolicy {
  const audience = audienceFor(actor, placement);
  if (audience === "staff") {
    return {
      ...STAFF,
      greeting: firstName === null || firstName === ""
        ? "Ask about the schedule, capacity, attendance, or policies."
        : `${firstName} — ask about the schedule, capacity, attendance, or policies.`,
    };
  }
  return {
    ...MEMBER,
    greeting: firstName === null || firstName === ""
      ? "Ask about classes or studio policies."
      : `Hi ${firstName} — ask about classes or studio policies.`,
  };
}

/* ---------- the guard that runs on the way out ---------- */

/** Every reason an answer must not be shown, given the audience it is for.
 *  Empty means it may be shown.
 *
 *  THIS IS THE HALF THAT MATTERS. Deciding the audience is easy; the failure
 *  mode is an answer composed for staff reaching a member-facing screen after
 *  the decision was made — a roster read aloud, a name that is not the
 *  reader's, a cancellation risk. Run this on the text itself, last, and the
 *  earlier decision cannot be quietly bypassed by whatever produced it. */
export function answerProblems(
  answer: string,
  policy: AudiencePolicy,
  otherMemberNames: readonly string[] = [],
): string[] {
  const problems: string[] = [];
  if (policy.mayNameOtherMembers) return problems;

  const haystack = answer.toLowerCase();
  for (const name of otherMemberNames) {
    const needle = name.trim().toLowerCase();
    if (needle !== "" && haystack.includes(needle)) {
      problems.push(`names another member (${name})`);
    }
  }
  /* Staff vocabulary in a member's answer is a leak even when no name
   * appears: "twelve booked, three no-shows" is the roster, said differently. */
  for (const [label, pattern] of [
    ["attendance for other members", /\bno[- ]?shows?\b|\battendance rate\b|\broster\b/],
    ["cancellation risk", /\bcancellation risk\b|\bat[- ]risk\b|\bchurn\b|\blikely to cancel\b/],
    ["how full a class is in staff terms", /\bfill rate\b|\butili[sz]ation\b/],
  ] as const) {
    if (pattern.test(haystack)) problems.push(`mentions ${label}`);
  }
  return problems;
}
