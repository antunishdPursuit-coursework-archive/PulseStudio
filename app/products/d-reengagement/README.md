# Member Re-engagement Tool (Product D)

**Owner:** Rensley · **Lane:** this folder only · **Color:** violet
**License:** [LICENSE.md](LICENSE.md) — publicly viewable during the Pursuit
program with attribution required on any copy; private after the program.

Staff open one page and see which active members used to come and have gone
quiet, why each one was flagged, and a ready personal message to copy or open
in their own email app. Nothing here sends — staff send every message
themselves, and the studio mailbox rides along as BCC for the record.

## The rule (proposed, awaiting team ratification)

Flag a member when all of these hold, measured in studio-local calendar days:

- `membership_status` is `active` — paused, canceled, and expired are
  different conversations, and never-attended members are onboarding, not
  re-engagement
- their most recent `attendance_status = "attended"` record is **more than
  14 and at most 60 days old** — a `no_show` or `unknown` is never a visit
- flagged members rank by attendance in the 60 days before they went quiet,
  most frequent first — the most valuable save on top

## Files

| File | What it is |
| --- | --- |
| `config.ts` | Every brand-specific value: studio name, mailbox, thresholds, the outreach voice |
| `deps.ts` | The ONE file that imports from outside this folder — the portability seam |
| `csv.ts` | The CSV door: a studio's own attendance export, adapted in-browser |
| `generate.ts` | Seeded studio generator — see the tool at real scale, reproducibly |
| `logic.ts` | Pure rule functions — no DOM, no clock, no fetch; "today" is a parameter |
| `main.ts` | The page: loads shared records, renders flags, evidence, drafts |
| `styles.css` | Violet-on-black/white styling over the shared theme tokens |
| `tests.ts` / `tests.html` | Browser-run unit checks with a pinned reference date |

## Live

<https://antunishdpursuit.github.io/PulseStudio/products/d-reengagement/> — published from
`main` by `.github/workflows/pages.yml`, which runs the gate before it
publishes, so a red gate never reaches the URL. The unit checks are live too:
<https://antunishdpursuit.github.io/PulseStudio/products/d-reengagement/tests.html>

## Run it

From the repo root: `npm install && npm run build && npm run start`, then open
http://localhost:4173/products/d-reengagement/ — the unit checks live at
`/products/d-reengagement/tests.html` and state their verdict as
"N checks run, N passed, 0 failed".

## Reproduce this for another studio

This product is built to be rebranded without touching its logic. The
complete checklist — nothing else needs an edit:

1. `config.ts` — new studio name, mailbox, voice, and (if ratified
   differently) thresholds. The page title, back link, and footer all read
   from this file at runtime.
2. The shared theme's accent token for this product — one color change
   recolors every control, glow, and pill on the page.
3. The `theme-color` meta tag in `index.html` — the one hex a meta tag
   cannot read from a CSS token; set it to the new accent.

The rule, the evidence, and the checks carry over as-is: the unit checks
assert facts (name, days, class, the configured studio name), not the voice,
so rewriting the voice in `config.ts` keeps them green.

## Plug this into any booking system

This folder is a standalone re-engagement engine that happens to live inside
one app. Every outside dependency flows through `deps.ts` — so plugging it
into a different host is two moves:

1. **Re-point `deps.ts`** at your host's types and record source. That is the
   only code file that changes.
2. **Feed the engine records in the contract shape.** If your system can
   produce these, you get flags, evidence, ranked saves, drafts, and the
   full proof suite for free:

| This engine needs | In a booking platform (e.g. a reservation product) |
| --- | --- |
| `member` + `membership_status` | customer + active-vs-lapsed |
| `attendance` `attended` | completed booking — the person showed up |
| `attendance` `no_show` (never a visit) | the platform's no-show state (never a visit) |
| `class_session` / `class_type` | booking / service type |
| `instructor` | the staff member who served them |

The engine itself (`logic.ts`) is framework-free and clock-free — a server
route can call `findQuietMembers(records, todayDayNumber(tz), rules)` and
render the result in any UI. The HTML/CSS here is a reference skin, not a
requirement; its only tethers are the shared theme tokens, swapped when
porting.

## Use real attendance today (the CSV door)

The page has a "Use your studio's attendance (CSV)" button. A staff member
drops in their own export and the same engine runs on it — **entirely in the
browser: the file is never uploaded anywhere**, which the page states.

**Identity:** if the export carries a stable identifier — `member id`,
`customer id`, `client id`, `id`, or `email` — that is used to tell members
apart, so two different people who share a name stay two people. Without one,
members are matched by name, which can merge two people or split one; the page
states which method was used rather than hiding the limitation. A blank
identifier cell falls back to that row's name so blanks never collapse several
people into one.

Accepted columns (case-insensitive, any order): a member column
(`member`/`name`/`member name`/`customer`/`client`) and a date column
(`date`/`class date`/`visit date`/`day` — earlier synonyms win, so a real
`Date` column beats a weekday `Day` column) are required. Optional:
`status` (also `attendance`/`attended`/`showed`), `class` (also
`class type`/`service`/`type`), and `instructor` (also
`staff`/`teacher`/`coach`). Status values: attended-like words count as
attended, no-show-like words as no-show, an absent or empty status means
attended (a sign-in sheet records presence), and anything unrecognized maps
to `unknown` — which is never counted as a visit. Dates read as
`YYYY-MM-DD` (padded or not) or `M/D/YYYY` and are checked against the real
calendar; unreadable or impossible dates are skipped with the physical file
line stated, never silently. A bare attendance export says nothing about
memberships, so everyone in the file is treated as an active member — the
page states that too.

## See it at studio scale

The page's "See it at studio scale" button builds a whole studio — 60
fictional members: loyal regulars, quiet faders, newcomers, people who
paused or left, and no-shows sprinkled through — then runs the same rule
over it. Eight members flag, ranked most-valuable-save first, so the
ranking is visible instead of theoretical.

It is **seeded, not random**: the seed is the calendar day, so everyone who
opens the page on the same day sees the same studio, and a screenshot can
be reproduced exactly. Because the history is generated relative to today,
it never goes stale. The page states plainly that these members are
fictional — a generated studio must never be mistaken for a real one.

## Evidence accounting

Stating what the tool processed is not the same as stating what the evidence
supported, so every attendance row is accounted for. Rows matching no member
are counted — they never invent a member and never touch a real member's
history. Attended rows whose class is missing, or whose date is unreadable or
in the future, are counted as unusable evidence rather than silently dropped.
When either count is non-zero the page says so beside the result:

> 3 members checked, 1 flagged as of August 19, 2026. 1 could not be used as
> evidence (the class is missing, or its date is unreadable or in the future).

Clean records produce no such line — a disclosure that always appears teaches
staff to ignore it.

## Laws this product lives by

Read-only over shared records (fixtures are byte-identical after any use).
Draft-only forever — no send action exists. Staff-only surface
(`noindex, nofollow`). Stated results everywhere: the page says
"5 members checked, 1 flagged", never a blank panel — and never a clean
answer built on evidence it could not read.
