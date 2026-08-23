# What each of us has to do, and the exact line to do it with

**TEAM-OWNED.** One file, four short lists. Everything here is already built
in `app/shared/` — nobody has to design anything, and nobody has to touch
anybody else's folder. Each item is a line to add or a function to call.

It lives in `docs/` and not in `app/shared/` for one reason: everything under
`app/` gets a public URL. This file names four people and the work each of
them has not finished, and `check-published` refused it the moment it was
staged there. That gate exists because two of Product D's internal documents
were served at a public address until 2026-08-21. The CODE all of this calls
is in `app/shared/`, where it belongs.

Nothing here adds a gate. These are not new rules; they are the work the
existing gates and audits already named, gathered in one place with the code
already written so the job is a paste rather than a project.

**Every one of these is inside your own folder.** If an item seems to need a
change in `app/shared/`, it does not — say so and it gets built here instead.

---

## Everyone — nothing outstanding

The four pages that asked a browser for an icon they never declared now
declare it. The two staff pages that showed rosters and attendance with no
`robots` tag now carry `noindex, nofollow`. Both were one line each and both
are done on this branch.

---

## Kerrian — Product A

**Nothing outstanding.** Your accent has a readable companion
(`--kerrian-strong`), your lines are gone from `docs/contrast-baseline.json`
— which is now empty — and `PRODUCT_A_MEMBER_BOOKING_APP.md` no longer says
"Evidence level: Planned" or lists waitlists as a non-goal. Waitlists ship,
with the guard chain in `rules.ts` and 47 checks behind them.

One thing measured and deliberately NOT changed: your day chips are 43.59px
tall on a phone, 0.41px under the 44px touch minimum. That is sub-pixel and a
finger cannot tell. Left alone rather than churning your stylesheet for it.

---

## Manny — Product B

**Nothing outstanding.** In order:

- The icon line and the `robots` tag are on both pages.
- `--manny-strong` clears AA; amber as text on white was 2.15:1.
- Your header stopped restyling the shared `.topbar` and now uses the shared
  `.page-head` the other three already used.
- **`staff-dashboard.js` is TypeScript.** It shipped for months as
  hand-written JavaScript no compiler opened, and `docs/sources-baseline.json`
  said so. That file is now empty. Behaviour was held identical through the
  conversion by snapshotting the rendered page first: 35 session cards, 4 week
  buttons, 5 class-type options, 4,423 characters of text — then filter,
  roster drill-in, week navigation and the publish dialog exercised after.
  Zero differences.
- `main.ts` is deleted. It rendered the whole dashboard, no page loaded it,
  and the record split had quietly broken it while it still type-checked.
  `docs/reachable-baseline.json` is empty as a result.

---

## Dennis — Product C

**Nothing outstanding.** The icon line is in, the audience guard is wired,
and your brief describes the boundary that exists.

One change came from outside your folder and you should know why. The
assistant's outbound guard is now in **two halves in two places**. The
staff-vocabulary half still runs on your page, on the finished text. The NAME
half moved to the server. Your page used to fetch every member's display name
so it could check answers against them — a member-facing page holding the
whole roster, which is a larger leak than the one it prevented and against
the data law outright. The server holds the roster and returns a verdict:
never the roster, never the name it matched.

---

## Rensley — Product D

**1. Get a qualified person to approve routine content.** All three routines
ship as `draft`, so the panel reads "0 approved routines. Nothing to include
yet." That is correct and it is not finished. **This one cannot be closed by
whoever is writing the code** — it needs somebody qualified to sign off on
exercise content going to members. Naming that here rather than quietly
flipping a flag.

**2. Enter and Space on the routine controls: still unverified, honestly.**
Measured this round: they are native `<details>`/`<summary>`, they toggle on
click, nothing intercepts keys, and the summary takes focus with `tabIndex 0`
— which is every precondition for native keyboard activation. What could not
be produced is a TRUSTED key event; automation delivers a synthetic one, and
a synthetic keypress does not drive native `<details>` behaviour. So the
preconditions are verified and the activation is not. It stays on this list
until somebody presses the key with a finger.

---

## What changed underneath all four, this branch

Read this before you touch anything, because two of them change what your
code is allowed to assume.

- **Records that name a person left `app/`.** Everything under `app/` is
  served at a URL, so members, memberships, reservations and attendance moved
  to `data/staff-records.json`, outside it, behind `/api/staff/records`.
  `loadFixtures()` returns `PublicFixtures` now — the timetable, who teaches,
  the policies. It has no `members` field, so reading one is a compile error
  rather than an `undefined` on a member's screen.
- **Staff surfaces are gated, and the gate is real.** The dashboard and the
  re-engagement tool draw nothing until the studio's server confirms a
  session it signed itself. Where there is no server the door stays shut and
  says so; it never fails open. The audience law in `CLAUDE.md` was amended
  to say this, with the reasoning for why the old rule was right kept intact.
- **`npm start` runs the studio's server**, not a static file server. Staff
  sign-in needs `STAFF_PASSPHRASE` in the environment — see `.env.example`
  and `docs/the-server.md`.
- **Touch targets have a 44px minimum** behind `@media (pointer: coarse)`.
  Seventeen controls were under it, eleven of them footer links at fifteen
  pixels tall.
- **`run-suites` finds its suites instead of listing them.** Three product
  suites existed and ran nowhere; the count went from 1,425 to over 1,500 the
  moment they were discovered. A suite with no label is now a hard error.

## Already done for you, in shared

Nothing below needs a call. It is here so nobody rebuilds it.

- **Settings is a named door now.** The appearance control was a bare `◐`
  with its words only in a `title` attribute — undiscoverable on a phone,
  which cannot hover. It reads **Settings** on every page, with Appearance as
  a section inside it, and every page got that without changing a line.
- **The studio's name reaches every header** from `app/shared/brand.ts`, and
  a gate fails the build if a page shows the name but is not wired to receive
  it.
- **Sign-in, the session, and the actor** are shared and already on your
  pages. Read the actor with `readPulseSession()`; never gate a route on it.
- **`counted(n, singular)`** turns a number into a phrase. Use it rather than
  writing `n === 1 ? "class" : "classes"` — that rule lives in one place so it
  is right in one place.
