# Integration requests — from Product D to A, B, and C

**From:** Rensley (Product D — Member Re-engagement) · **Lives in:** `docs/`,
because it is written for you to read before you write code and it must not
ship to the public site · **Format per teammate:** what I give you → what I
need from you → a check with a known answer → ONE ask.

The ground truth for all three sections: Pulse Studio is **one gym, one
location, one shared record set**. Product D reads `member`, `membership`,
`reservation`, and `attendance` through `app/shared/data.ts` only, writes
nothing shared, and drafts outreach that staff send themselves. Verify any
claim I make from this folder rather than taking it from here: open
`/products/d-reengagement/tests.html`, which states its own verdict as
"N checks run, N passed, 0 failed", and the page itself, which states its
own result as "N members checked, M flagged as of <date>" with the source of
those records named underneath.

Those two lines used to be quoted here with real numbers in them. Both went
stale — the suite grew and the default records changed — which is the whole
reason this paragraph now tells you where to look instead of what you will
see.

---

## For Kerrian (Product A — Member Booking)

**What I give you:** every re-engagement draft invites the member back to
class — my tool is a funnel INTO your booking flow. Nothing you need to
consume today.

**What I need from you:**

1. **Where runtime reservations live.** The shared fixtures are read-only, so
   the reservations your app creates at runtime sit somewhere (the proposed
   spot was localStorage key `pulse-reservations-a`). My next increment wants
   booking signals — a member who books-then-cancels or books-then-no-shows is
   an earlier warning than silence. I will read, never write, and only after
   the team ratifies the location.
2. **A link pattern to a specific session.** If your page can open with a
   session preselected — proposal: `/products/a-booking/index.html?session=<session_id>`
   — my drafts can carry a real "save your spot in Tuesday's yoga" link
   instead of "just reply".

**Check with a known answer:** a reservation you create must use exactly
`reserved | waitlisted | canceled` and never touch `app/shared/fixtures.json`
— my checks require fixtures byte-identical, and `ses_006` must show 2
confirmed from the fixture regardless of what runtime adds.

**THE ONE ASK:** reply with the runtime-reservation storage decision so I can
take it to the team as agreed-by-both.

---

## For Manny (Product B — Staff Scheduling Dashboard)

**What I give you:** promotion targets. You flag underbooked classes; I know
which quiet members usually attend which class type (today: Maria Santos →
yoga). "Underbooked yoga Thursday + 1 quiet yoga regular" is one panel the
studio owner would love. My `logic.js` is pure and importable — but
cross-product imports are a TEAM decision, so until ratified, read nothing
from my folder and I'll read nothing from yours.

**What I need from you:** **attendance recording discipline.** Attendance is
my fuel, and your dashboard is the staff surface where recording naturally
lives. Two things matter to me:

1. Every completed session's roster gets attendance rows — `attended`,
   `no_show`, or `unknown` — using exactly those values.
2. A `no_show` is never displayed or stored as attended (your roster view
   already distinguishes them — keep it that way).

**Why it matters, concretely:** James Okafor's `att_007` (attended Aug 15) is
what keeps him un-flagged. If that row were never recorded, his last visit
would read Aug 8 and my tool would wrongly flag him on Aug 23 — a member who
was IN the studio getting a "we miss you" note. Recording gaps become false
alarms staff stop trusting.

**Check with a known answer:** with today's fixtures your dashboard and my
tool must agree: `ses_008` has 0 confirmed reservations, and the only member
whose last attended class is more than 14 days old is Maria Santos.

**One thing to fix when you next touch your page (found 2026-08-18):** your
dashboard is live at a public URL and has no
`<meta name="robots" content="noindex, nofollow">` in its `<head>`, so a
search engine may index a page showing member names, rosters, and attendance.
Mine has that tag; yours is one line away from it.

Until then, nothing covers it. `app/robots.txt` carries
`Disallow: /PulseStudio/products/b-dashboard/`, and on this deploy that line
protects nothing: a GitHub Pages PROJECT site's crawler reads the USER site's
robots.txt in a different repository, so ours is never requested. This
paragraph said the line stopped the crawl until 2026-08-22, and it never did —
the section below, "the staff dashboard has no crawler protection at all", is
the full account, and the reasoning is written into `app/robots.txt` itself.
When you add the meta tag, **delete that Disallow line** anyway: a page that is
blocked from crawling can never be read, so its noindex tag is never seen and
never takes effect. Crawlable + noindex is the combination that actually keeps
a page out of the index.

Neither is a security control — a staff page holding real member data
eventually belongs behind a sign-in.

**THE ONE ASK:** confirm whether attendance recording will live in your
dashboard's next increment or stays an ops flow outside both our products —
either answer unblocks me; silence is the only thing that doesn't.

---

## For Dennis (Product C — Member Support Chatbot)

**What I give you:** a hard boundary that protects us both — and the studio.
My flags, rankings, and drafts are staff-only cancellation-risk inference.
**Members must never learn any of it from the chatbot.** If a member asks
"why did I get an email from the studio?", the bot answers from policy
records, never from attendance or risk data.

**What I need from you:**

1. Keep C's shared-data reads to exactly `class_session` + `studio_policy`
   (the contract's product map already says this — I'm asking you to hold the
   line as you build).
2. Keep policy `topic` values stable (`cancellation`, `what to bring`,
   `class levels`) and the `is_current` flag honest. My future drafts want to
   quote the current cancellation policy from the SAME record your bot
   answers from — one truth, two surfaces.

**Check with a known answer:** asking your bot about another member ("did
Maria come last week?") must refuse; asking about canceling must return
`pol_001`'s actual 12-hour rule, and a question with no current policy gets a
stated miss ("no current policy on that"), never an invented answer.

**THE ONE ASK:** confirm your reads stay `class_session` + `studio_policy`
only, and I'll put the member-facing privacy boundary in front of the team as
jointly held.

---

## Everyone — the shared fixture ages out on a clock (2026-08-21)

Written down so nobody meets it by surprise — and deliberately NOT a deadline
on your build. On a date `npm run check` prints on every run, this fixture
stops demonstrating one thing it was built for, and keeps passing. This
heading carried that date until 2026-08-22, when rolling the file forward
moved it.

The dates in that file are fixed and the calendar is not. Its newest attended
class is `ses_005`. Once that class passes fourteen days, every member in the
fixture reads as long-quiet, and the deliberate near-miss the product briefs
require — a member who attended RECENTLY and must therefore NOT be flagged —
stops existing. The file stays perfectly VALID; it just stops demonstrating
the thing it was built to demonstrate.

Nothing was watching for that, which is the actual problem. The unit suites
pin "today" to a reference date so they cannot rot — correct, and it means
they cannot warn either. `scripts/check-fixtures.mjs` now reads the real
clock in that one place and prints the countdown on every run. Read the
numbers off the run rather than off this page — the shape is:

```
check-fixtures: newest attended class is <date>, <n> days ago — <n> days
before it stops showing a recent attendee (<date>); <n> before it fails
this gate.
```

**The ask — a team decision, not a lane one:** agree how this file gets rolled
forward, or agree a different answer. It has been rolled once already —
`ad5e112` moved every date +4 days on 2026-08-22 to clear a gate failure dated
2026-10-15, and repaired three sessions marked `scheduled` that were already in
the past. That is a team-owned data change I made alone, which is the argument
for settling the rule rather than a precedent for doing it again. Nothing the
site serves reads this file today — see the last section — so the roll moves
records, not a screen. The durable answer is an anchor date resolved at load,
written up in `app/shared/CLAUDE.md` as an open decision because the stored UTC
offsets have to be recomputed along with it.

**What the gate actually does, and what changed my mind.** The first version
failed at fourteen days, which would have stopped the site deploying eight
days after it landed — over shared data I had just decided was not mine to
change. Setting a deadline for three other people and enforcing it with
their build is not a gate, it is a hostage. So I checked what actually
breaks at fourteen days: only the staff dashboard reads this file at run
time and it renders a schedule, which ages fine; Product D's default door
reads the running studio; every unit suite pins its own date. Nothing
breaks. The fixture just stops illustrating one case.

It now REPORTS from fourteen days and FAILS at sixty — the point where every
member is past the far end of the rule and the file cannot demonstrate a
flag in either direction. That is a fixture that has stopped being a
fixture. Roughly eight weeks of notice, and the countdown is on every run.

The one answer to rule out is hardcoding a fake "today" inside a product.
The pinned suites are the thing that must not move; a product that invents
its own present would stop being checkable.

## Dennis — Product C brief and worksheet (resolved 2026-08-23)

Product C now has `PRODUCT_C_MEMBER_SUPPORT_CHATBOT.md`, and Dennis's shared
contract worksheet row records the exact fields it reads. The implementation
loads the shared fixture through `loadFixtures()`, accesses only scheduled
`class_session` records and current read-only `studio_policy` records, and
creates no shared record. `pol_001` is the cancellation source for both
surfaces. Private-member questions are refused without reading member,
attendance, reservation, or risk records.

## The studio mailbox (affects everyone)

The studio's record mailbox is configuration, and for this studio it is
deliberately UNSET (`studioEmail: null` in `config.ts`). A studio that keeps
a shared mailbox puts its own address there; the footer names it and every
draft BCCs it, so the studio keeps a copy of what staff sent. With no
address set, the page simply does not mention one — naming a mailbox nobody
reads would be worse than naming none.

Either way, nothing in this repo sends mail. That stays human.

## The repo root — eight files, three owners (2026-08-21)

Eight files at the repo root are the site we had before Pages switched to
publishing `app/`. They are unreachable now: `app/` is the site root, so root
`index.html` is shadowed by `app/index.html` and the other seven return 404.
Nothing under `app/` references any of them, and the gate cannot see them.

Ownership below is from `git log --diff-filter=A`, not from guessing:

| Files | Owner | State |
| --- | --- | --- |
| `member-dashboard.{html,css,js}` · `staff-dashboard.{html,css,js}` | Manny | 404 · hardcoded `#f4f1eb` and hardcoded records, so they break the color and data laws |
| `member-booking.html` | Kerrian | 404 · clean; a deliberate forwarder that worked when it was written |
| `index.html` | team lead | shadowed · reaches two of four products |

**The asks — one each, none urgent:**

- **Manny** — retire the six. Worth a look first: root `staff-dashboard.js`
  models three rooms with a ranked demand panel; the live dashboard hardcodes
  `"Studio"`. Reviving it needs a `room` field on the shared session, so it is
  a conversation, not a copy-paste. Git keeps the code either way.
- **Kerrian** — retire `member-booking.html` whenever it suits, or keep it.
  Correcting myself: an earlier draft called it broken debris. It is neither.
  `06aa064` cut 547 lines to a 12-line forwarder on purpose, and it worked at
  the time — the root was still being served. Unreachable now, not broken, and
  the only one of the eight with no law violation. Lowest priority here.
- **Team lead** — root `index.html` is yours, not a lane owner's.

**Two things that matter more than the root:**

1. `app/products/b-dashboard/staff-dashboard.html` returns **HTTP 200**. The
   page `b-dashboard/CLAUDE.md` already calls stale is public right now.
   Manny's to retire. Same folder: `staff-dashboard.js` is the only tracked
   `.js` under `app/`, which the repo ignores as build output — it survives
   only because ignore rules skip already-tracked files. Delete and re-add it
   and `git add` refuses silently, with no gate failure.
2. **The boundary is a setting.** GitHub's legacy builder still records
   `source: {branch: main, path: "/"}` under the Actions deploy. Flip
   Settings → Pages → Source back and those eight files are the live site
   again. That is the real argument for retiring them.

None of the above was touched by me — every file is in someone else's lane.

## Manny — the staff dashboard has no crawler protection at all (2026-08-21)

This one is a privacy exposure, not a tidiness note, so it is first.

`app/robots.txt` carried this claim: *"The staff dashboard has no such tag
yet, so blocking the crawl is the only protection its roster content has."*
Both halves turned out to be wrong, and the second one badly.

1. **The Disallow line matched nothing.** It read
   `Disallow: /products/b-dashboard/`, with no `/PulseStudio/` prefix. This
   site is served under `/PulseStudio/`, so that pattern matches no URL
   that exists. Corrected.
2. **No crawler was reading the file anyway.** This is a GitHub Pages
   PROJECT page, so the robots.txt a crawler fetches is
   `https://antunishdpursuit.github.io/robots.txt` — the root of the USER
   site, in a different repository. Ours is served at
   `/PulseStudio/robots.txt` and is never requested.

So the dashboard's roster and attendance content has had no protection of
any kind. Verified just now — neither file carries a robots meta tag:

```
grep -c noindex app/products/b-dashboard/index.html          # 0
grep -c noindex app/products/b-dashboard/staff-dashboard.html # 0
```

The re-engagement tool has carried one from the start, which is why it is
deliberately left crawlable: a crawler that is allowed to fetch the page
reads the tag and honours it, and that is the only guaranteed way to stay
out of an index. Blocking the crawl instead would stop the tag being read.

**The ask — one line, in your lane:**

```html
<meta name="robots" content="noindex, nofollow">
```

in the `<head>` of both `app/products/b-dashboard/index.html` and
`app/products/b-dashboard/staff-dashboard.html`. When it is in, the
`Disallow` line in `app/robots.txt` should be deleted in the same commit so
the tag can do the stronger job — the file explains why.

Neither of these is a security control. A staff page holding real member
data belongs behind a sign-in, not behind a politeness request; the meta tag
is the stopgap, not the answer.

I corrected `app/robots.txt` (team-owned) and touched nothing in your folder.

## Your accent colour is not readable on the light theme (2026-08-21)

Measured, not guessed — `node scripts/check-contrast.mjs` prints these live:

| Owner | Pairing | Measured | WCAG AA needs |
| --- | --- | --- | --- |
| Kerrian | `#3b82f6` as text on white | **3.68:1** | 4.5:1 |
| Kerrian | white label on `#3b82f6` (both themes) | **3.68:1** | 4.5:1 |
| Manny | `#f59e0b` as text on white | **2.15:1** | 4.5:1 |
| Dennis | `#10b981` as text on white | **2.54:1** | 4.5:1 |

Mine was in this table too — violet was 4.23:1, also failing. Nothing had
ever measured, so four of us shipped four palettes nobody could read at
body size and none of us were told.

**Your identity hex does not have to change, and I did not change mine.**
`--rensley` is still exactly `#8b5cf6`. What I added in `app/shared/theme.css`
is a companion token, `--rensley-strong`, used ONLY where a person has to
READ something — link text, a button fill that carries a label, the role
chip. Borders, rules and outlines keep the identity colour, because a UI
boundary only needs 3:1 and all four of ours already clear that.

It has to be theme-aware: no single lightness of a hue clears 4.5:1 against
both white and black. At 64% lightness violet is 4.71 on white and 4.46 on
black. So the dark blocks in `theme.css` move the companion back up and flip
the ink. There is a worked pair there to copy.

**The asks — one each:**

- **Kerrian** — yours is the only one failing in BOTH themes, because white
  on `#3b82f6` is 3.68:1 wherever it renders. A `--kerrian-strong` fixes the
  text and the button label together.
- **Manny** — `#f59e0b` on white is 2.15:1, the furthest from AA of the four.
  Amber is a strong surface colour and a very weak text colour; the fix is
  almost certainly a companion rather than a new amber.
- **Dennis** — `#10b981` on white is 2.54:1. Same shape of fix.

`scripts/check-contrast.mjs` runs inside `npm run check`. Yours are recorded
in `docs/contrast-baseline.json` against your name, reported on every run and
allowed — nothing of yours is red today and nothing of yours is blocked. Only
a NEW failure fails the gate. When you clear yours the gate says `cleared ·
… now passes` and tells you to delete the line; the list only shrinks.

I did not touch any of your colours, and I will not — a developer's colour is
theirs. This is measurement and one worked pairing, nothing more.

## Things the new gates found in your lane (2026-08-22)

Six gates landed on `main` today. Each of them BASELINES what it found
rather than failing you for it — nothing here is breaking a build, and none
of it is mine to edit. The baselines are JSON in `docs/`, which is not
where anybody looks, so the actionable items are repeated here once.

Everything below is verified, and each says how to check it yourself.

**Kerrian (A) — one line.** `a-booking/index.html` declares no
`<link rel="icon">`, so every browser that opens it asks for
`/favicon.ico` and gets a 404. The site ships `app/favicon.svg`, which a
browser only finds when a page points at it. Add:
`<link rel="icon" href="../../favicon.svg" type="image/svg+xml">`.
Check: open the page, look at the console.

**Dennis (C) — the same one line**, in `c-chatbot/index.html`.

**Manny (B) — four, and two are worth a conversation.**

- The same favicon line, in `index.html` and `staff-dashboard.html`.
- **Neither dashboard page has made an indexing decision.** They are not in
  `sitemap.xml` and carry no `noindex`, so they are a staff surface — rosters
  and attendance — that a crawler may index. `app/robots.txt` already says
  this in its own comment and explains why it cannot help: on a Pages
  PROJECT site the crawler reads the USER site's robots.txt in a different
  repository. The meta tag is the only thing that works, which is why
  Product D carries one. Neither a tag nor robots.txt is a security
  control; a page holding real member data belongs behind a sign-in.
- **`staff-dashboard.js` is hand-written JavaScript with no `.ts` beside
  it**, and it is the module `index.html` actually loads. `tsconfig.json`
  includes only `app/**/*.ts`, so `tsc` never opens it: 69 shipped lines
  that no gate type-checks. Check: `node scripts/check-sources.mjs`.
- **`b-dashboard/main.ts` is reached by no page.** It renders a whole
  dashboard from `loadFixtures()`, and `index.html` names
  `staff-dashboard.js` instead. Which of the two is the real dashboard is
  yours to say. Check: `node scripts/check-reachable.mjs`.

**And one for the whole team, found the same day.** The repo root holds a
second, older copy of the site — `index.html` linking to
`member-dashboard.html` and `staff-dashboard.html`, with their own CSS and
JavaScript. GitHub Pages publishes `path: app`, so **none of it is
served**: somebody who clones this and opens the root `index.html` is
looking at a site the studio does not run. The root `staff-dashboard.js`
has also diverged from `app/products/b-dashboard/staff-dashboard.js`,
which is what a duplicate nobody deleted eventually costs.

The filing law's own answer is to delete anything that fails all four of
its questions, and these fail all four. But they have owners and they are
recent, so whether they are history worth keeping is a team call rather
than one lane's. They are baselined, not failing anything. Check:
`node scripts/check-published.mjs`.

**One consequence that is the team's, not yours.** Because `main.ts` is the
only importer of `app/shared/data.ts`, `loadFixtures()` and
`fixtures.json` are read by nothing the site serves. `check-fixtures.mjs`
still validates that file and still prints how long before it ages out —
read that countdown as being about records, not about a screen, because no
screen shows them. Worth knowing before anyone spends a day rolling those
dates forward.

## Everyone — an audit read your briefs against your code (2026-08-22)

A sweep compared every checkable statement in this repository's prose to the
code it describes. It raised 73 claims, an adversarial pass threw out 18, and
55 survived. Thirteen of those are in your lanes.

**I have not touched any of them.** Reading another lane is allowed and
editing it is not, so this is a note, which is what my own brief says to do
with a defect found in somebody else's folder. Every line number below is
from 2026-08-22; each one names the code that contradicts it so you can check
me rather than take my word.

One of these matters more than the rest, and it is not the biggest list.
**A folder brief is what an assistant reads before it edits that folder.** A
brief that describes behaviour the code does not have will send somebody —
or something — to "fix" a bug that is not there.

### All three of you — the colour law in your brief has drifted

`app/products/a-booking/CLAUDE.md:82`, `b-dashboard/CLAUDE.md:75`,
`c-chatbot/CLAUDE.md:70` all summarise the repo-wide laws with "black or
white backgrounds only".

That has not been the colour law since the appearance amendment. Root
`CLAUDE.md:42-44` says the built-in light and dark backgrounds are white and
black, **and** that a person may select an accessible custom background/text
pair through the shared appearance control. The machinery is real:
`app/shared/theme-boot.ts` carries `CUSTOM_KEY` and applies the pair, and
`app/shared/color.ts` has `nearestReadable` to keep a chosen pair legible.

This is the same drift that bit the always-on Cursor rule, which told every
Cursor user "backgrounds are black or white only" long after the law changed
— the story now recorded in `.cursor/rules/team.mdc` instead of the law
itself. Three folder briefs are saying it again.

### Kerrian — Product A

- **`PRODUCT_A_MEMBER_BOOKING_APP.md:5` says "Evidence level: Planned".**
  Product A is built, published and live: `main.ts` runs booking, waitlist,
  cancel, promotion and deep links, and the front door links to it.
- **`PRODUCT_A_MEMBER_BOOKING_APP.md:62` lists waitlists as out of scope.**
  They are shipped. `main.ts` has `joinWaitlist()`, `memberWaitlisted()`,
  `waitlist()` and `promoteWaitlist()`, and the schedule renders "Join
  waitlist" and "Waitlisted" controls.

### Manny — Product B

Seven, and the first three describe the same gap: the brief says the
dashboard keeps nothing, and the shipped page keeps quite a lot.

- **`CLAUDE.md:14` — "no persistence of any kind".** The page writes
  `localStorage['pulse-schedule-b']`.
- **`CLAUDE.md:64` — "reads and writes NO storage keys of its own".** Both
  halves are wrong: it declares `pulse-schedule-b` at `staff-dashboard.js:5`,
  writes it in `savePublishedSchedules` (line 31), reads it back on load
  (line 35), and watches it in a `storage` listener.
- **`CLAUDE.md:47` — "Publish is in-memory only … Nothing here persists".**
  Confirming a draft calls `savePublishedSchedules()`; `readPublishedSchedules()`
  restores those sessions on the next load.
- **`CLAUDE.md:41` — "the dashboard shows the same week forever".** The
  dataset is frozen, but the view is not one week: `renderWeekPicker()` builds
  four week buttons and `#previousWeeks` / `#nextWeeks` page the window.
- **`CLAUDE.md:43` — "every room label is the hardcoded studio name".** The
  generator sessions and the demand panel do hardcode it, but the add-a-session
  dialog has a free-text `room` input — `name="room"`, placeholder "Loft" — in
  both `index.html:22` and `staff-dashboard.html:19`.
- **`CLAUDE.md:23` — "required DOM ids exist in neither HTML file".** One of
  the seven, `#sessions`, exists in both. The other six do not, so the point
  stands; the count does not.
- **`PRODUCT_B_STAFF_SCHEDULING_DASHBOARD.md:5` says "Evidence level:
  Planned".** Product B is built and published.

I checked the first three, the week picker and the room input myself against
`staff-dashboard.js` and your two HTML files before writing this down.

### Manny — a prompt to hand your assistant

Your brief is the problem here, and that makes this awkward to fix: an
assistant working in `b-dashboard/` reads `CLAUDE.md` FIRST and treats it as
the authority on your code. So it opens the folder already believing the
dashboard persists nothing. Told to "add persistence", it may well go and
build a second mechanism beside the one you already have. Told the storage is
a bug, it will delete working behaviour and the gate will stay green, because
no gate checks a brief against its own folder.

That is why this is worth fixing before your next change rather than after.

Paste this. It is written to make your assistant distrust the brief and
check the code, which is the opposite of its normal instinct:

```text
Before anything else: app/products/b-dashboard/CLAUDE.md contains statements
about this code that are FALSE. You will have read it as authoritative. Do not.
For this task the CODE is the authority and the brief is the thing being
corrected.

Work only inside app/products/b-dashboard/. Do not edit any other folder —
this repository assigns one folder per developer and scripts/check-lanes.mjs
enforces it.

Verify each of these against the code yourself before changing a word. If any
is wrong, say so and leave that line alone; the list came from an audit, and
an audit can be wrong too.

1. CLAUDE.md:14 says "no persistence of any kind" and CLAUDE.md:64 says this
   product "reads and writes NO storage keys of its own". Check
   staff-dashboard.js for a localStorage key of its own: how it is declared,
   where it is written, where it is read back, and whether a storage listener
   watches it.
2. CLAUDE.md:47 says "Publish is in-memory only ... Nothing here persists."
   Check what happens when a draft schedule is confirmed, and what happens to
   those sessions on the next page load.
3. CLAUDE.md:41 says the dashboard "shows the same week forever". The dataset
   is frozen, but check whether the VIEW is one week — look for a week picker
   and for controls that page the window forwards and back.
4. CLAUDE.md:43 says every room label is the hardcoded studio name. That holds
   for generator-derived sessions and the demand panel. Check whether the
   add-a-session dialog has its own room input, in both HTML files.
5. CLAUDE.md:23 says the required DOM ids "exist in neither HTML file". Count
   them. If some exist and some do not, say which — the point may stand while
   the count does not.
6. CLAUDE.md:75 summarises the repo-wide colour law as "black or white
   backgrounds only". Read the colour law in the ROOT CLAUDE.md. The built-in
   light and dark backgrounds are white and black, and a person may also
   select an accessible custom background/text pair through the shared
   appearance control. Your brief predates that amendment.

Then correct only the lines that are actually wrong, describing what the code
does now. Where a count drifted, prefer naming the thing that knows the count
over writing a new number — this repository has been bitten repeatedly by
numbers written into prose.

Do not change any behaviour. This is a documentation correction. If you find a
real defect while reading, write it down and leave it.

Finally: `npm run check` must pass before you commit, and the assistant is
never a contributor — no AI name, no Co-Authored-By, no "Generated with"
anywhere in the commit or the code.
```

Two of those six will probably come back as "the brief is right". Number 5 is
the likeliest: I found one of the seven ids present and six absent, so the
warning stands and only the count is wrong. That is the correct outcome, and
it is why the prompt asks for verification instead of handing over a patch.

### Dennis — Product C

- **`CLAUDE.md:32` cites "the comment at `main.ts:69-71`".** Those lines are
  inside `studioDate()` and say nothing about timezones or DST. The comment
  you mean is elsewhere in the file; the reference needs moving.

### What I am asking for

Nothing urgent, and nothing that blocks anybody. When you next open your own
brief, correct the lines that describe your code wrongly — starting with the
colour law, because all three of you carry it, and with Manny's persistence
lines, because they are the ones most likely to send somebody to undo working
behaviour.

If you think any of these is wrong, say so on the PR. Eighteen of the
seventy-three raised in this sweep were thrown out by a second pass whose job
was to refute them, so being wrong about one of these is entirely possible.

## Everyone — which revision is live, and why it is not `healthz` (2026-08-23)

**This needs team agreement before anybody writes it.** `.github/workflows/pages.yml`
is team-owned, and Product D should not own deployment infrastructure. The request
is below with the exact change, so approving it is a read rather than a design
session.

### The question worth answering

Not "is the server alive". There is no server. `npm run start` is
`python3 -m http.server --directory app`, the build is `tsc` with no bundler,
and the deploy is `upload-pages-artifact` with `path: app` followed by
`deploy-pages`. A `/api/healthz` cannot exist, and a STATIC file called
`healthz` would return 200 exactly when the CDN is up — which the page load
already told you. It would be a green light wired to nothing.

The question that does bite: **which revision is actually live?** Today nothing
can answer it. `github.sha` exists in the Actions context and nothing uses it —
grep the workflow and every script and you get no hits. The deployed site has no
way to see it.

### The request

**One step in the gate job**, after the gates pass and before
`upload-pages-artifact`, writing `app/build-info.json`:

```yaml
      - if: steps.publishing.outputs.ok == 'yes' && steps.pagesmode.outputs.mode == 'workflow'
        name: Record which revision this is
        run: |
          cat > app/build-info.json <<JSON
          {
            "sha": "${{ github.sha }}",
            "runNumber": ${{ github.run_number }},
            "builtAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
          }
          JSON
```

The full forty-character SHA, not the short one: a short SHA is a prefix, and
comparing prefixes is how two different revisions come to look identical.

**Why filing it under `app/` is safe.** `check-published.mjs` reads
`git ls-files app` — TRACKED files only. A file written at build time and never
committed is invisible to it, so this adds nothing to the filing baseline.

**Add `app/build-info.json` to `.gitignore`** in the same change. The file
currently ignores `app/**/*.js` and `app/**/*.js.map` and nothing else under
`app/`, so a generated JSON could be committed by accident and then it WOULD be
a published file with an owner.

### Four things a reader of that file has to get right

1. **Cache-safe retrieval.** Request it with a cache-busting query and
   `cache: "no-store"`. Pages sets a short max-age, but a stale intermediary
   would otherwise report the previous deploy as the current one — the exact
   failure the file exists to prevent.
2. **Reject the HTML fallback.** A 404 on Pages returns an HTML page with a 200
   in some configurations and a 404 in others, and either way it is not JSON.
   The reader must confirm the body parses AND carries a forty-hex SHA. Treating
   a successful fetch as a successful verification is how this gets worse than
   having nothing.
3. **Say `Build unknown`.** When the file is missing, unparseable, or fails the
   SHA shape, say so in those words. Never `healthy` — static revision metadata
   does not prove an application works, and a label that overstates itself is
   worse than no label.
4. **Distinct messages per failure.** Missing, unparseable, and mismatched are
   three different problems with three different fixes. One shared message sends
   the reader down the wrong one.

### And a script that compares

`scripts/check-deployed-version.mjs`, taking an expected SHA and exiting
non-zero on mismatch, on a missing file, and on an unparseable body — with a
different sentence for each. It carries `--self-test` like every other gate
here, planting an HTML body, a truncated SHA, and a mismatched SHA to prove it
still catches them.

It should NOT go in `npm run check`. The gate runs before a deploy exists; a
check that asks the live site about a revision that has not shipped yet would
fail for the most ordinary reason there is.

### If a version label ever appears in Product D

Subtle, in the footer, and reading `Build unknown` whenever verification is
unavailable. I will not add one until this exists, because a label that cannot
be verified is a claim, and this product has spent the week removing those.

## Everyone — we ship no Content-Security-Policy (2026-08-23)

Small, and it needs one line per owner rather than a shared edit, which is why
it is a request.

None of our pages sets a CSP and GitHub Pages sends none, so a browser will
run any script that reaches the document. Nothing reaches it today — the site
loads only its own modules, and `check-published` and `check-sources` hold
that — but a policy is what makes it a property rather than a fact that
happens to hold.

The tag, in each page's `<head>`:

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'">
```

Every page already satisfies it: no inline scripts, no inline styles, no
third-party hosts. So this is one line in one `<head>` per page, and nothing
should break — but it is your `<head>`, in your folder, so it is your line to
add.

**What it does NOT do, so nobody approves it for the wrong reason.** It will
not stop a browser extension. Chrome content scripts run in an isolated world
and are exempt from the page's policy, and an extension's console noise is
not something a page can refuse. This is protection against a script getting
INTO the document — an injected string, a compromised dependency we do not
have yet, a future page that reaches for a CDN. It is worth having for those,
and for nothing else.

If we ever add the routine page's own hosting, or anything that fetches, this
gets revisited rather than loosened by habit.

## Closed — settled, kept as one line each

These had their own sections until 2026-08-23. They are done, and a finished
ask is the thing most worth deleting from a file people are supposed to read.
The reasoning lives in the commits; what follows is enough to stop anybody
re-raising them.

- **Kerrian's page no longer shows a builder's name** (raised 2026-08-21).
  The `.owner-badge` is gone from `a-booking/index.html` and
  `docs/audience-baseline.json` has an empty `allowed` list, so the gate now
  fails the build on the next one instead of reporting a known one. Product
  D's `tests.html` keeps its badge and the gate skips it on purpose — a check
  page is read by a developer, not a member.
- **Dennis's `.env` template and the language gate no longer collide**
  (raised 2026-08-21). `.env.example` exists and `check-language` passes.
- **Shared ground was changed and checked** (2026-08-21). What was verified
  then is now held by gates that run on every commit, which is a better record
  than a paragraph.
- **The data law was audited and it holds** (2026-08-21). Still true: members
  see only their own data, staff-only information stays on staff surfaces, and
  nothing sends automatically. `check-audience` and `check-fixtures` hold the
  parts a script can hold.

## If you disagree with anything here

Say so on the PR or in person — every number above (14/60 thresholds
included) is labeled *proposed* until the team ratifies it. A "no" with a
reason beats a silent workaround in someone's lane.
