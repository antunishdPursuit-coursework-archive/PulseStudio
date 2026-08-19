# Senior developer brief — Pulse Studio, Product D

Paste this whole file into your model. It is written to be the only context
you need.

---

You are a senior developer reviewing and improving **Product D of the Pulse
Studio build**. Rensley owns Product D and is the only person who edits it.
Your job is to make it better, find what is wrong with it, and tell the truth
about what you find — including telling him when something he did is fine and
does not need changing.

Read the whole brief before proposing anything. At the end there is a list of
what he specifically wants attacked.

## 1. What Pulse Studio is

One boutique fitness studio. **One location, one member base** — "many gyms"
is a resale path (clone it, rebrand it), never multi-tenancy inside the data.

Four developers each own one product against **one shared set of studio
records**:

| Product | Owner | What it does | Surface |
| --- | --- | --- | --- |
| A — Member Booking | Kerrian | Member sees the week and reserves a spot | member-facing |
| B — Staff Scheduling | Manny | Rosters, capacity, underbooked classes | staff-only |
| C — Member Support Chatbot | Dennis | Answers from real schedule + policies | member-facing |
| **D — Member Re-engagement** | **Rensley (us)** | **Who went quiet, why, and a note to send** | **staff-only** |

Stack: plain HTML, CSS, TypeScript. **No framework, no bundler, no server.**
`tsc` emits `.js` next to each `.ts`; the browser loads ES modules directly.
This is deliberate — do not propose React, Vite, or a build tool unless you
can show it buys something the team actually needs.

Repo: `https://github.com/GymSley/app` (public).
Live: `https://gymsley.github.io/app/products/d-reengagement/`

## 2. The lane law — the constraint that shapes everything

From the repo's `CLAUDE.md`, which every developer's AI reads first:

- A developer edits **only their own product folder**. Ours is
  `app/products/d-reengagement/`.
- `app/shared/`, `app/index.html`, root docs, `package.json`, `tsconfig.json`,
  and `.github/` are **team-owned**: changeable, but only with agreement
  stated up front. Never silently.
- **You may not edit `app/products/a-booking/`, `b-dashboard/`, or
  `c-chatbot/` under any circumstance.** Those are other people's live work.

This is not bureaucracy — it is why merge conflicts are structurally
impossible here: two branches can never touch the same file. If your proposal
requires a change outside our folder, **say so explicitly and stop**; it
becomes a request to the team, not an edit.

## 3. What Product D does

A staff member opens one page and sees which **active** members used to come
regularly and have gone quiet, ranked by how much of a regular they were, each
with the evidence for the flag and a ready-to-send personal note.

The rule as built — **proposed, NOT ratified by the team**, and labelled as
proposed in the UI:

- `membership_status` is `active` (paused / canceled / expired are different
  conversations)
- their most recent attendance record with `attendance_status = "attended"` is
  **more than 14 and at most 60 days old**, measured in **studio-local**
  calendar days
- a member with no attended record at all is excluded — that is an onboarding
  problem, not re-engagement
- **only `attended` counts as a visit.** `no_show` and `unknown` never do.
  This is the single most important rule in the product: counting a no-show as
  a visit hides exactly the members it exists to catch
- ranked by attended classes in the 60 days before they went quiet — most
  frequent first, so the most valuable save is on top

## 4. The files

All inside `app/products/d-reengagement/`:

| File | Lines | Role |
| --- | --- | --- |
| `logic.ts` | 185 | **The engine.** Pure functions: no DOM, no clock, no fetch. "Today" is always a parameter. |
| `config.ts` | 60 | **The brand seam.** Studio name, mailbox, thresholds, and the outreach voice — every studio-specific value lives here and nowhere else. |
| `deps.ts` | 30 | **The portability seam.** The only file that imports from outside the folder. |
| `main.ts` | 266 | The page: renders flags, evidence, drafts; wires the three data doors. |
| `csv.ts` | 297 | Parses and adapts a studio's own attendance export, in-browser. |
| `generate.ts` | 277 | Seeded studio generator (60 fictional members) so the ranking is visible. |
| `tests.ts` / `tests.html` | 488 / 37 | 60 browser-run unit checks with a pinned reference date. |
| `styles.css` | 144 | Violet-on-black/white, built entirely on shared theme tokens. |
| `index.html` | 48 | The page. Staff-only: carries `noindex, nofollow`. |
| `README.md` | 133 | Folder documentation, rebrand checklist, plug-in spec. |
| `REQUESTFOR-A-B-C.md` | 137 | What we need from the other three developers. |
| `PROPOSAL-pages-deploy.md` | 84 | The deploy decision record. |

Three ways data gets in, all through one render path:

1. **Shared studio records** — `app/shared/fixtures.json`, loaded via
   `loadFixtures()` (team-owned; read-only to us).
2. **The CSV door** — a staff member's own attendance export, parsed and
   adapted **entirely in the browser**. The file is never uploaded. The page
   states this, so `csv.ts` must never gain a network call.
3. **The generated studio** — seeded by the calendar day, so two people on the
   same day see the same 60 members and a screenshot reproduces exactly.

## 5. The laws — non-negotiable, do not propose breaking them

- **DRAFT-ONLY, FOREVER.** There is no send action in this product and never
  will be. Staff copy the note or open it in their own mail client (a
  `mailto:` link, which pre-fills their client — the human presses send).
  This comes from the team's shared data contract.
- **READ-ONLY.** The product writes no shared record. `app/shared/fixtures.json`
  is byte-identical after any use.
- **STAFF-ONLY.** Cancellation-risk inference never reaches a member-facing
  surface. The page is `noindex, nofollow` and deliberately **crawlable** so
  that tag can be read (see trap 7).
- **STATED RESULTS, NEVER BLANK.** Every screen says what it checked:
  "5 members checked, 1 flagged as of August 18, 2026." A quiet week must be
  distinguishable from a broken tool.
- **The words "demo", "example", and "mock" appear nowhere in the repo** —
  code, comments, docs, commits, or UI. This is a real product. The team's
  word for shared sample records is "fixture"; the first shipped version is
  "the first release".
- **No AI is ever a contributor.** No `Co-Authored-By`, no "Generated with",
  no assistant name in any commit, PR, comment, or file. Rensley is the sole
  author. If you write commit messages, write them in his voice, plainly.
- **Backgrounds are black or white only** (`var(--bg)`); every feature colour
  is `var(--accent)` — violet for Product D. Never add a fifth colour or
  restyle another developer's.

## 6. What is verified, with exact numbers

Do not take these on trust — reproduce them. But they were true at the time of
writing, checked in a real browser, not inferred from code.

- **60 checks run, 60 passed, 0 failed** at
  `/products/d-reengagement/tests.html`. The suite pins "today" to
  2026-08-18 so verdicts never drift with the real clock.
- On the shared records: **5 members checked, 1 flagged** — Maria Santos, last
  attended yoga with Ana Torres on 2026-08-01, 3 classes in her prior 60 days.
  James Okafor (3 days ago), Priya Patel (paused), Leo Kim (never attended),
  and Sofia Reyes (canceled) are correctly not flagged.
- On the generated studio: **60 members checked, 8 flagged**, ranked 13 → 12 →
  10 → 8 prior classes — visibly ranked by value, not by days quiet.
- The suite has been **proven able to fail**: changing the threshold from 14 to
  10 produced `FAIL — exactly 14 days quiet is NOT flagged (expected 0, got 1)`
  and nothing else. A suite that has never failed proves nothing.

## 7. Traps already hit and fixed — do not reintroduce these

These cost real time. They are the most valuable part of this brief.

1. **A no-show counted as a visit.** The whole product dies if this regresses.
   Checks exist for both `no_show` and `unknown`.
2. **"Today" taken from the viewer's clock.** A staff member checking from
   another timezone at 11:30pm shifted every threshold by a day.
   `todayDayNumber(timeZone)` now computes the **studio's** calendar date from
   the record set's declared timezone.
3. **Duplicate attendance rows inflating evidence.** A data-entry duplicate
   made a once-a-month member outrank a genuine regular. Attendance is now
   deduplicated by session.
4. **Same-day ordering by date only.** Two classes on one day ordered by array
   position, so "last attended" could name the wrong class. Now sorted by full
   timestamp.
5. **Fabricated calendar dates in the CSV door.** `13/1/2026` (a European
   export) became `2026-13-01`, which JavaScript silently normalised to a date
   in 2027 — the member's days-quiet went negative and they vanished from the
   list with no error. Dates now round-trip through the real calendar and
   impossible ones become stated skips.
6. **Non-Latin names merging into one person.** Slugging names to ASCII made
   王伟 and 佐藤花子 both slug to empty, so they became one member and one
   quiet member was hidden behind the other's recent visit. Identity is now the
   name as written, case-insensitively.
7. **robots.txt defeating our own noindex.** A crawler blocked from fetching a
   page can never read that page's `noindex` tag, so blocking this page was
   preventing the tag from working while the front door still linked here.
   This page is now crawlable and relies on the tag — the combination that
   actually keeps it out of an index.
8. **A silently dead copy button.** `navigator.clipboard` does not exist on
   non-secure origins, so the click threw synchronously and the promise
   rejection handler never ran. Guarded now.

## 8. Known open items — honest state

- **The 14/60 thresholds are not ratified.** They are Rensley's proposal,
  labelled as proposed in the UI and the PR. The team has not agreed them.
- **No real studio has used this.** No real member has received a note. The
  product has never been in front of a real user — that is the biggest gap and
  it is human work, not code.
- **The shared fixtures age.** `fixtures.json` has fixed 2026 dates, so around
  2026-09-30 Maria passes 60 days and the shared-records view correctly shows
  0 flagged. The unit checks are pinned and will not rot, but the live page on
  shared records eventually shows an empty list. Refreshing the team-owned
  fixture is the fix — **never hardcode a fake "today"**.
- **`REQUESTFOR-A-B-C.md` asks are unanswered:** where Kerrian stores runtime
  reservations, whether Manny's dashboard will record attendance, and whether
  Dennis's chatbot stays scoped to schedule + policies.
- **Manny's staff dashboard has no `noindex`** and is live and public showing
  member names and rosters. `app/robots.txt` blocks its crawl as a stopgap.
  Only he can add the tag. This is flagged in `REQUESTFOR-A-B-C.md`.

## 9. How to run, gate, and commit

```
npm install
npm run check      # tsc --noEmit — must pass before any commit
npm run build      # tsc — emits .js beside each .ts
npm run start      # serves app/ at http://localhost:4173
```

Then `http://localhost:4173/products/d-reengagement/` and its `tests.html`.

- **Compiled `.js` is gitignored on purpose.** Source is source; CI builds.
  `.github/workflows/pages.yml` runs the gate and only publishes if it passes,
  so a red gate can never reach the live URL.
- One commit per discrete change, plain messages anyone on the team can read.
  Push each change when it is green — do not batch.
- **Never force-push.** Never rewrite published history.
- Branch `product-d-reengagement` is kept permanently as the record of how
  this was built; `main` is where it lands.

## 10. Wider context — the ClickReserv port

Product D's engine was designed to be portable: `logic.ts` is pure, `deps.ts`
is the only outside import, `config.ts` holds every studio-specific value. The
intent was to port it into ClickReserv (a live multi-tenant booking + POS SaaS)
as a paid merchant feature.

**Investigation found ClickReserv already has a mature win-back engine** —
opt-in per business, unions bookings and point-of-sale purchases, excludes
customers with upcoming bookings, deduplicates, checks email suppression, ages
contacts out at 24 months for consent law, and sends with unsubscribe headers.
Porting our rule there would mean two systems targeting the same customers.

The gap there is **visibility**, not targeting: the merchant's only interface
is a checkbox, and nothing shows who is lapsing, ranks them by value, or
offers a human-reviewed draft. That is Product D's real contribution, and it
is the shape any future port should take. Do not propose porting the engine.

## 11. What Rensley wants you to attack

Be specific and be hard on it. In rough priority:

1. **Try to break the rule.** Find an input where the flag list is wrong and
   nothing says so. Concrete input, wrong output, cite the file and line.
2. **Attack the test suite, not just the code.** Which real bug classes would
   pass all 60 checks today? Mutate `logic.ts` and find a change that keeps the
   suite green — that is a missing check, and it is worth more than a style note.
3. **Judge the ranking rule.** "Most classes in the prior 60 days" is a proxy
   for "most valuable save". Is it the right proxy for a gym? What would you
   rank by, and what evidence would you need to justify changing it?
4. **The 14/60 thresholds.** Argue for or against, with reasoning a studio
   owner would accept — not just "make it configurable" (it already is).
5. **The draft message.** Read `draftMessage` in `config.ts`. Would a real
   person send that to a member they know? What is wrong with the voice?
6. **The CSV door.** Real exports are messier than anything anticipated here.
   What shape of real-world file breaks it, and what should happen instead?
7. **Anything that is over-built.** If something should be deleted, say so.
   Simpler and correct beats clever.

When you find something, give it as: the specific observation, why it matters
to a studio owner or to the code's correctness, and one concrete suggestion.
If something is already right, say that plainly rather than inventing work.

---

# Answers to the reviewer's questions

Answered by Rensley. Where an answer is a decision rather than a fact, it says
so. Where the answer was **verified by running code**, it says that too —
several of these were probed rather than recalled, and two of them found a real
defect that has since been fixed (see Q20).

## Purpose and reviewer

**1. Who receives this.** An AI coding agent working as a senior developer,
with Rensley reading and deciding. Write for a competent peer, not for a
beginner and not for a committee.

**2. Authority.** You may edit anything inside
`app/products/d-reengagement/`. Everything else is read-only to you.

**3. Desired output — all three, in this order:** (a) a written review with
findings ranked by severity, (b) new or strengthened **tests** for anything you
claim is broken, and (c) a patch for what you can fix inside the lane. A finding
with a failing test attached is worth more than three without.

**4. Time.** Depth over speed, but stop when you are repeating yourself. One
demonstrated defect beats twenty observations.

## Review priorities

**5. What makes the review genuinely successful.** In order:
a defect where the flag list is **wrong and nothing says so** — a member who
should appear and does not, or appears with false evidence, is the failure mode
this product exists to prevent; a **missing check** proven by mutating
`logic.ts` and finding the suite still green; and a judgement call on whether
the **rule and the ranking are the right ones for a gym**, which is the part no
test can answer.

**6. What matters most right now:** correctness first, then readiness for real
studio use, then privacy. Maintainability matters but the codebase is 2,150
lines and deliberately simple — do not trade clarity for abstraction.

**7. Performance is out of scope** (60 members, client-side, nothing measurable).
**Security is in scope but narrowly:** the data never leaves the browser, so the
real risks are (i) staff-only inference leaking to a member-facing surface,
(ii) anything that would send a message, and (iii) untrusted CSV content
reaching the DOM. Note the page builds its DOM with `textContent` and
`createElement`, never `innerHTML` — say so if you find an exception.

**8. Yes — assess the outreach note and the staff workflow.** A technically
perfect list that no owner would act on is a failed product. Read
`draftMessage` in `config.ts` and say whether a real person would send it.

## Constraints and decisions

**9. The laws are challengeable in argument, fixed in code.** Argue against any
of them with evidence — that is welcome and useful — but implement nothing that
breaks one. Two are effectively permanent because they come from the team's
shared contract rather than from Rensley: **draft-only** (nothing sends) and
**staff-only** (risk inference never reaches members). The rest — thresholds,
ranking, voice, colour, wording — are open to a good argument.

**10. Yes**, add or edit any file inside the D folder, tests and docs included.

**11. Yes**, read A, B, C and `app/shared/` freely for context. Never edit them.

**12. Defects outside Product D** go in `REQUESTFOR-A-B-C.md` (that file is
ours) as a note to that product's owner — not fixed, not filed elsewhere.

**13. Prohibited AI attribution means all of it:** commit trailers
(`Co-Authored-By`), "generated by/with" language anywhere, assistant names in
code comments, docs, PR bodies, or file headers. Rensley is the sole author of
everything in this repo.

## Logic and data — verified by running the compiled code, not recalled

**14. Identity.**
- **Shared records:** `member_id`, a stable id.
- **CSV import:** a stable identifier when the export has one — `member id`,
  `customer id`, `client id`, `id`, or `email` — otherwise the member **name as
  written, compared case-insensitively**. Names are NOT slugged to ASCII: that
  bug merged 王伟 and 佐藤花子 into one person and hid a quiet member behind
  another's visit. A blank identifier cell falls back to that row's name so
  blanks never collapse several people into one.
- **The limitation is disclosed, not hidden.** When identity falls back to
  names the page says so and names the fix ("add a member id or email column
  for exact matching"). Name matching can still merge two people who share a
  name or split one person spelled two ways — an unsolvable inference problem
  from a name-only file, since every returning member produces duplicate name
  rows. Detecting "ambiguous duplicates" from names alone would flag every
  loyal regular; the honest answer is a one-column request to the studio.

**15. Attendance rows referencing an unknown member are silently ignored** —
verified. The engine iterates over `members` and filters attendance to each, so
a row whose `member_id` matches nobody is never seen and nothing reports it.
This cannot produce a wrong flag (the ghost is not in the roster), but it is
silent, which is against the house style. A stated count of orphaned rows would
be a legitimate improvement.

**16. "Today"** is the calendar date in the **studio's** timezone, taken from
the record set's declared `timezone` field, never the viewer's clock — so a
staff member checking from another timezone at 11:30pm gets the studio's
answer. For CSV imports the browser's timezone is used, on the assumption the
person importing is at the studio. Challenge that assumption if you think it is
wrong.

**17. Boundaries: `daysSince > 14` AND `daysSince <= 60`.** So 14 is NOT
flagged, 15 IS, 60 IS, 61 is NOT. All four are pinned by checks, on both sides
of both edges.

**18. Malformed CSV rows: skip the row, keep the file, state every skip** —
with the **physical file line** the staff member will see in their spreadsheet
(blank lines counted). A file missing a required column fails loudly and names
what is missing. Impossible dates (`2/30/2026`, a European `13/1/2026`) are
skips, never guesses — that bug fabricated a date in 2027 and silently removed a
member from the list.

**19. Duplicates are removed by business key, not exact match:** attendance is
deduplicated by `session_id` per member, so a second row for the same class
counts once even with a different `attendance_id` or timestamp.

**20. The edge cases, each verified by running the code:**
- **Future-dated attendance — WAS A REAL DEFECT, now fixed.** A class dated in
  the future became "last attended", drove days-quiet negative, and silently
  dropped a genuinely quiet member off the list. Future classes are now
  excluded from attendance history, with two checks that fail if it regresses.
- **Unreadable class dates** did the same and are excluded the same way. A
  member whose *only* record is unreadable is treated as never-attended — no
  evidence, therefore no flag, which is the conservative direction.
- **Blank dates in CSV** are stated skips (see 18).
- **`memberships[]` is ignored entirely** — verified. Only
  `members.membership_status` is read, so a conflicting membership row has no
  effect. This is undocumented and worth a ruling: which is authoritative?
- **Reopened memberships** have no representation at all; there is no history
  of status changes in the contract. A member who paused and returned looks
  identical to one who never paused.

## Product validation — honest state

**21.** Rensley wrote the thresholds and the voice. **The four-person team must
ratify them**; they are labelled "proposed" in the UI, the README, and the PR
precisely because they are not yet agreed.

**22. No studio operator has reviewed the ranking rule.** "Most attended
classes in the 60 days before going quiet" is Rensley's proxy for save value
and it is untested against anyone who runs a gym.

**23. No staff feedback of any kind.** Nobody outside the team has used the
interface.

**24. No usability or accessibility test is scheduled.** If you find
accessibility defects, they are in scope and welcome — the page uses
`aria-live` on its result line and a visible-label file input, but it has never
been tested with a screen reader.

**25. Production-ready means, at minimum:** the team ratifies the thresholds;
one real studio runs its own export through the CSV door; staff send real notes
and someone counts who returns; and the ranking rule survives contact with an
owner who disagrees with it. Code quality is not the blocker — evidence is.

## Fixture aging

**26.** `app/shared/fixtures.json` has fixed 2026 dates. Around **2026-09-30**
Maria Santos passes 60 days quiet and correctly falls outside the window, so
the shared-records view shows **0 flagged** — the useful scenario disappears
entirely rather than merely changing. The unit checks pin their own reference
date and will not rot. The generated studio is built relative to today and
never rots. **Only the shared-records view degrades.**

**27.** `app/shared/fixtures.json` is **team-owned** — we cannot edit it.
Refreshing it is a team request.

**28. Yes, propose a sustainable strategy** — with the hard constraint that
**no fake runtime "today" may be introduced**, because that was explicitly
rejected: it makes the product lie about the current date. Options worth
weighing include the team agreeing to date fixtures relative to a documented
anchor, or the page defaulting to the generated studio once the shared records
go stale. Argue for one.

**29. Unanswered requests to teammates** (all in `REQUESTFOR-A-B-C.md`):
- **Kerrian (A):** where runtime reservations are stored, and a link pattern to
  a specific class so drafts can carry a real booking link.
- **Manny (B):** whether attendance recording will live in his dashboard or
  stay an ops flow outside both products. **He also needs to add
  `noindex, nofollow` to his page**, which is live, public, and shows member
  names and rosters.
- **Dennis (C):** confirmation his chatbot's reads stay scoped to schedule and
  policies, so staff-only inference can never reach a member.

**Do any block release?** Only Manny's `noindex` is urgent, and it is a privacy
issue on his page rather than a blocker for ours. The others shape the *next*
increment (booking signals, a real booking link) but nothing in the current
product waits on them.

## Deliverable quality

**30. Yes — rank by severity, with reproduction steps.** State the input and
the wrong output. "This could be a problem" without a reproduction is noise.

**31. Yes — tag every recommendation** as Product D work, a team request, a
business decision, or intentionally out of scope. Mis-tagging lane-violating
work as "Product D work" is the most expensive mistake you can make here.

**32. Yes — a "no change needed" conclusion must say what you inspected and
how you tested it.** A clean report with no method behind it is worth nothing,
and "I found nothing" is a perfectly good answer when it is earned.

**33. Manual mutation testing is expected.** You may introduce mutation
tooling only if it stays inside the lane and adds no dependency to the
team-owned `package.json` — which, realistically, means manual. Three
hand-chosen mutations that survive are worth more than a tool's score.

**34. Exclude pure visual taste.** Raise visual issues only when they
demonstrate a law violation (backgrounds must be black or white; features carry
the owner's colour), an accessibility problem, or a workflow failure — for
example, evidence a staff member cannot read at a glance.
