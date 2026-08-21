# Member Re-engagement Tool (Product D)

**Owner:** Rensley · **Lane:** this folder only · **Color:** violet
**License:** [LICENSE.md](LICENSE.md) — publicly viewable during the Pursuit
program with attribution required on any copy; private after the program.

Staff open one page and see which active members used to come and have gone
quiet, why each one was flagged, and a ready personal message to copy or open
in their own email app. Nothing here sends — staff send every message
themselves.

This sentence used to end "and the studio mailbox rides along as BCC for the
record", which is not true of this studio. `config.ts` sets
`studioEmail: null` deliberately — Pulse Studio keeps no shared record
mailbox, so the draft carries no BCC and the page claims none. A studio that
HAS one puts its address there and the BCC appears; that is the whole edit.
The code has always said so in a comment. The first paragraph of the README
said otherwise.

## The rule (proposed, awaiting team ratification)

Flag a member when all of these hold, measured in studio-local calendar days:

- `membership_status` is `active` — paused, canceled, and expired are
  different conversations, and never-attended members are onboarding, not
  re-engagement
- their most recent `attendance_status = "attended"` record is **more than
  14 and at most 60 days old** — a `no_show` or `unknown` is never a visit
- flagged members rank by attendance in the 60 days before they went quiet,
  most frequent first — the most valuable save on top

## Bring them back — and never nag them back out the door

Finding the quiet member is half the job. The other half is discipline, and
it is enforced by `outreach.ts`, not by memory:

- **One note per lapse.** Taking a draft (a successful copy, or opening the
  email) claims that lapse in a browser-local ledger
  (`pulse-outreach-ledger`). The same silence is never nagged twice; a member
  who returns and lapses again re-arms. And a claim made by mistake is
  reversible — a mail client that never opened would otherwise leave the
  lapse claimed over a note that does not exist, and the discipline would
  correctly refuse it forever. *"That note never went out"* forgets the
  claim, that lapse only, and offers the draft again.
- **"No" is remembered.** *Do not contact* puts a member on a suppression
  list (`pulse-suppressions`) that outranks everything except the studio's
  own opt-in. It is reversible, and the card says when it was set.
- **Consent ages — a backstop, dormant at these numbers.** Beyond the
  policy window (730 days) the tool refuses to draft at all, by name. With
  the proposed thresholds that can never happen: the rule only flags members
  between 14 and 60 days quiet, so the oldest silence reaching this check is
  60 days. The rule's own 60-day ceiling is what actually says "silence that
  old is a different conversation" today. The backstop stays for the day the
  team ratifies different numbers, and the suite pins the relationship so
  raising the ceiling past 730 turns it live loudly rather than quietly.
- **Booking without attending is its own story.** A member who booked since
  their last visit — even a canceled booking — reached for the studio and
  something got in the way. The card discloses it (`recentBookingActivity`),
  and it never counts as a visit or shrinks the quiet-days count.
- **Coming back is stated with the date.** A quiet member already holding an
  upcoming reserved spot is left alone and named with the day they return —
  a cue for staff to say "good to see you back" on the right morning.
- **The invitation is concrete, and the seat is really there.** The draft
  names a real upcoming class matching the member's own pattern — their
  usual class with their usual instructor first — and falls back to an open
  offer rather than inventing a session. A full class is never offered: the
  note asks "want us to save you a spot?", and sending that about a class
  with no room means the member cannot book or has to be told no, which is a
  worse second impression than the silence this tool exists to break. Seats
  are counted the way Booking reads its own log — last row wins, so a
  cancellation frees the seat and a member listed twice holds one.

**The closed loop** is what keeps the loop honest: every taken note is
judged against the records. Who came back (and how many days after the
note), who stayed quiet, and which ledger entries these records cannot
judge — stated on the page, with a local CSV export that carries EVERY note
taken, the unjudgeable ones included and labelled as such. A log that
quietly drops rows is worse than no log, because it reads as complete. Every
cell in that file is written so a spreadsheet reads it as TEXT: a member
whose name begins with `=`, `+`, `-` or `@` would otherwise arrive as a
formula and run when the file is opened, and member names can come straight
from a studio's own imported export. The members who came
back are listed as exactly that: *worth a hello at the front desk* — the
save is finished by a person, not a metric.

Nothing here sends, still. The ledger records what a staff member took,
never what a machine did.

## Files

| File | What it is |
| --- | --- |
| `config.ts` | Every brand-specific value: studio name, mailbox, thresholds, the outreach voice |
| `deps.ts` | The ONE file that imports from outside this folder — the portability seam |
| `csv.ts` | The CSV door: a studio's own attendance export, adapted in-browser |
| `generate.ts` | Seeded studio generator — see the tool at real scale, reproducibly |
| `logic.ts` | Pure rule functions — no DOM, no clock, no fetch; "today" is a parameter |
| `outreach.ts` | The outreach discipline, pure: once per lapse, do-not-contact, consent window, opt-in — and the closed loop that judges every note against the records |
| `main.ts` | The page: loads shared records, renders flags, evidence, drafts |
| `styles.css` | Violet-on-black/white styling over the shared theme tokens |
| `tests.ts` / `tests.html` | Browser-run unit checks with a pinned reference date |

The reviewer bundle is built by `sh scripts/bundle-product-d.sh` — tooling, so
it lives in `scripts/`, not here. It used to sit in this folder, which meant
the live site served it: everything under `app/` has a public address.

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

1. **Re-point `deps.ts`** at your host's types and record source — in
   practice `sharedStudio` (what the default door builds its records from,
   through `live-studio.ts`) and the contract type re-exports. That is the
   only code file that changes. The other two doors take a staff member's
   own CSV and this product's own generator, and need nothing.
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
render the result in any UI. It holds up at studio scale by SHAPE rather than by luck: every step is one
pass over the records, so the rule is O(members + attendance) and the
per-card work is bounded by that member's own history, not the studio's.
That matters because the page re-runs everything after each action a staff
member takes.

No timings are quoted here on purpose. This paragraph used to end in three,
and they were already wrong within a day — measured again on a machine whose
load average had reached 92 on eight cores, the same page read two and a
half times slower, which says nothing about this code and everything about
what else was running. A wall-clock number in prose cannot be kept true, and
the repo already learned this once when the synthetic suite's thirty-second
budget went red twice on a busy machine. To measure it on YOUR machine,
generate a studio at the size you care about and time
`findQuietMembers` plus one pass over the flagged cards.

The HTML/CSS here is a reference skin, not a requirement; its only tethers
are the shared theme tokens, swapped when porting.

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
to `unknown` — which is never counted as a visit.

**Dates** read as `YYYY-MM-DD` (padded or not) or a slash date, and every
value is round-tripped through the real calendar, so an impossible date is
skipped with its physical file line stated rather than guessed at.

Which number in a slash date is the month is decided **once, from the whole
file, before any row is read** — because guessing it is the quietest way to
be wrong. Read month-first, a European export dated `05/03/2026` becomes the
3rd of May instead of the 5th of March, and `25/03/2026` is thrown away for
having a 25th month: half the file misdated, half discarded. A value that is
a real date under exactly one reading settles the order for every other row
(`13/1/2026` can only be day-first). Only a file where no value settles it is
read month-first, and then the page says so. A file containing proof of both
orders fits no single reading and says that instead of picking one.

**A sign-in sheet cannot tell two classes from one visit entered twice**, and
the page says so. A row belongs to a session keyed on date, class and
instructor; with no class column every row on one date is the same session,
so a member who trains twice that day is credited with one visit. The same
sixteen visits read as *8 classes (≈0.9/week)* from a sign-in sheet and
*16 (≈1.9/week)* from an export that names the class — and that number is
both the evidence staff judge a member by and the order of the list.
Counting them twice would be inventing attendance, so each counts once and
the ambiguity is stated with the fix: add a class column. With a class
column present, a repeat is simply a duplicate row, and it says that
instead.

**Names are cleaned of what cannot be in a name**, and the count is stated.
A zero-width space makes `Bob` and `Bo<ZWSP>b` render identically and count
as two members — the same history-splitting false flag as a half-filled
identifier column, except nobody could diagnose it from the screen. A
right-to-left override reverses how the rest of a name displays and reaches
the member in a drafted note. Control characters are never a name at all.
Deliberately kept: the zero-width non-joiner and joiner, which are ordinary
letters-in-context in Persian, Devanagari and other scripts. This removes
what cannot be a name, not what is unfamiliar.

**Identity** is stated when it splits. If the identifier column is filled on
some of a member's rows and blank on others, that member is read as two
people, their visits divided between them — and the half holding the older
last visit can be flagged while the whole person has been coming in all
along. The page names anyone this happened to. They are never merged:
merging on a shared name would be inventing identity rather than reading it.

A bare attendance export says nothing about memberships, so everyone in the
file is treated as an active member — the page states that too. And if a
quote opens and never closes, everything after it collapses into one cell:
the page names the line it opened on, because the rows below it were not
read at all.

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
