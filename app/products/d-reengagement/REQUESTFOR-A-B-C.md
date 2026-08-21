# Integration requests — from Product D to A, B, and C

**From:** Rensley (Product D — Member Re-engagement) · **Lives in:** my folder,
so nobody waits on me to find anything · **Format per teammate:** what I give
you → what I need from you → a check with a known answer → ONE ask.

The ground truth for all three sections: Pulse Studio is **one gym, one
location, one shared record set**. Product D reads `member`, `membership`,
`reservation`, and `attendance` through `app/shared/data.ts` only, writes
nothing shared, and drafts outreach that staff send themselves. Verify any
claim I make from this folder: open
`/products/d-reengagement/tests.html` — it states
"92 checks run, 92 passed, 0 failed" — and the page itself states
"5 members checked, 1 flagged as of <today>".

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

## The studio mailbox (affects everyone)

The studio's record mailbox is configuration, and for this studio it is
deliberately UNSET (`studioEmail: null` in `config.ts`). A studio that keeps
a shared mailbox puts its own address there; the footer names it and every
draft BCCs it, so the studio keeps a copy of what staff sent. With no
address set, the page simply does not mention one — naming a mailbox nobody
reads would be worse than naming none.

Either way, nothing in this repo sends mail. That stays human.

## If you disagree with anything here

Say so on the PR or in person — every number above (14/60 thresholds
included) is labeled *proposed* until the team ratifies it. A "no" with a
reason beats a silent workaround in someone's lane.
