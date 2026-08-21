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

Until then I have blocked `/products/b-dashboard/` in `app/robots.txt`, which
stops the crawl but is the weaker protection — the URL can still be listed.
When you add the meta tag, **delete that Disallow line**: a page that is
blocked from crawling can never be read, so its noindex tag is never seen and
never takes effect. Crawlable + noindex is the combination that actually
keeps a page out of the index. The reasoning is written into
`app/robots.txt` itself.

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

## Everyone — the shared fixture goes stale on 2026-08-29 (2026-08-21)

Dated, so nobody meets it by surprise — and deliberately NOT a deadline on
your build. In eight days this fixture stops demonstrating one thing it was
built for. The gate says so on every run and keeps passing.

The dates in that file are fixed and the calendar is not. Its newest attended
class is 2026-08-15. Once that passes fourteen days, every member in the
fixture reads as long-quiet, and the deliberate near-miss the product briefs
require — a member who attended RECENTLY and must therefore NOT be flagged —
stops existing. The file stays perfectly VALID; it just stops demonstrating
the thing it was built to demonstrate.

Nothing was watching for that, which is the actual problem. The unit suites
pin "today" to a reference date so they cannot rot — correct, and it means
they cannot warn either. `scripts/check-fixtures.mjs` now reads the real
clock in that one place and prints the countdown on every run:

```
check-fixtures: newest attended class is 2026-08-15, 6 days ago —
8 days of usable life left (goes stale 2026-08-29).
```

**The ask — a team decision, not a lane one:** roll the fixture's dates
forward when it suits, or agree a different answer. Rolling forward is a
team-owned data change and it changes what the staff dashboard shows live,
which is why I have not done it unilaterally.

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

## Dennis — Product C has no brief in the root (2026-08-21)

Not urgent and not a defect — a gap the docs had stopped mentioning in two
of the three places they should.

`CLAUDE.md` says "Each product's brief (`PRODUCT_<X>_*.md` in the repo root)
defines its scope", and lists the product briefs as part of what somebody
who just cloned this needs in the first thirty seconds. Three exist: A, B
and D. `README.md` was already honest about the fourth — it says the Product
C brief will be added when its owner is ready. `CLAUDE.md` and
`SHARED_DATA_CONTRACT.md` were not: the contract's last line linked only A
and B, omitting D as well.

Both corrected to say what is actually there. Until a brief exists, Product
C's scope is defined by `app/products/c-chatbot/CLAUDE.md` and by your row
in the shared contract's review worksheet — which currently reads TBD for
required fields, fields created, and open questions.

**The ask, whenever it suits:** the worksheet row is the smaller half and
would help Product D directly. I read `class_session` and `instructor`
display fields to personalise a draft; knowing which of those you also read,
and whether you expect `studio_policy` to stay read-only, tells me whether
we ever contend over the same records. The brief itself can wait for your
increment.

Nothing in `c-chatbot/` was touched.

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

## If you disagree with anything here

Say so on the PR or in person — every number above (14/60 thresholds
included) is labeled *proposed* until the team ratifies it. A "no" with a
reason beats a silent workaround in someone's lane.
