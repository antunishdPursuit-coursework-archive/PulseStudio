# Pulse Studio

> **In development.** Start here: **[Are we ready to present?](https://antunishdpursuit.github.io/PulseStudio/shared/ready.html)**
> · [Storytold — how the records flow](https://antunishdpursuit.github.io/PulseStudio/shared/storytold.html)
> · [The live site](https://antunishdpursuit.github.io/PulseStudio/)


## Project 4: Membership Studio

Pulse Studio is a single-location boutique fitness studio offering group
classes such as yoga, cycling, and HIIT. Members pay a recurring monthly
membership for access to a set number of classes, rather than paying per visit.
The studio is run by an owner and a small group of instructors who each teach a
regular weekly schedule of classes.

## Business model type

Pulse Studio uses a membership model. Members pay a recurring monthly fee for
ongoing access to a set number of classes. It is similar to a subscription, but
it supports an in-person physical service rather than software.

## Customers and users

There are two user groups:

- **Members** have an active membership and want to see the class schedule and
  reserve a spot.
- **Studio staff** include the owner and instructors. They need to see class
  rosters and capacity and identify members who might be at risk of canceling.

## Common pain points

- Members have no easy way to see the full week's class schedule and reserve a
  spot in advance, so classes fill up or sit empty unpredictably.
- Staff have no simple way to see, at a glance, which upcoming classes are
  underbooked and might need to be promoted or canceled.
- The studio has no way to notice a member who has quietly stopped coming until
  after they have already canceled their membership.
- Members have common questions about class levels, what to bring, and the
  cancellation policy that take staff time to answer one at a time.

## Product suite

Each teammate builds one product:

### Product A: Member Booking App

Lets a member view the week's class schedule and reserve a spot in a specific
class.

Open [app/products/a-booking/](app/products/a-booking/index.html) from the
front door. The public calendar and remaining-spot counts read the shared
studio; members pick their name to reserve. Runtime reservations are stored
in the browser under `pulse-reservations-a` and never written into shared
fixtures. A session can be preselected with `?session=<session_id>`.

### Product B: Staff Scheduling Dashboard

Shows staff the roster and capacity for each upcoming class, flagging any class
that is significantly underbooked.

### Product C: Member Support Chatbot

Answers member questions about class levels, what to bring, and studio
policies using the studio's actual current class schedule and policies.

### Product D: Member Re-engagement Tool

Identifies members whose attendance has recently dropped off and drafts a
personalized outreach message staff can send. Staff see who has gone quiet,
the evidence for every flag (last class attended, instructor, date, and how
often they used to come), and a ready personal note to copy or open in their
own email app. It never sends anything — that stays a human decision. Staff
can also check the studio's own attendance export, which is read in the
browser and never uploaded anywhere.
[Live](https://antunishdpursuit.github.io/PulseStudio/products/d-reengagement/) ·
[Unit checks](https://antunishdpursuit.github.io/PulseStudio/products/d-reengagement/tests.html)
· [Brief](PRODUCT_D_MEMBER_REENGAGEMENT_TOOL.md) ·
[Folder README](app/products/d-reengagement/README.md)

## Team assignments

| Product | Owner |
| --- | --- |
| Product A: Member Booking App | Kerrian |
| Product B: Staff Scheduling Dashboard | Manny |
| Product C: Member Support Chatbot | Dennis |
| Product D: Member Re-engagement Tool | Rensley |

## Live

<https://antunishdpursuit.github.io/PulseStudio/> — the front door, linking to all four
products. (The team repo is what deploys; a personal fork is not published.)

## How the team builds

The app lives in `app/` — plain HTML, CSS, and TypeScript, no framework. Each
product has its own folder under `app/products/`; the shared vocabulary, theme,
and fixtures live in `app/shared/` and are team-owned. The working agreement
every developer's AI follows is [CLAUDE.md](CLAUDE.md) — read it before the
first edit. Gate before committing: `npm run check`. Run it with
`npm install && npm run build && npm run start`, then open
http://localhost:4173.

Every pull request runs the gate, and every push to `main` runs it again and
then publishes the built site (`.github/workflows/pages.yml`). A red gate
never reaches the live URL. Those are two jobs on purpose: the gate claims no
deploy permission, so it can run on a branch, while only `main` reaches the
publishing half. Before that split there was no way to learn whether a branch
was green except to merge it and watch the live site.
Compiled `.js` stays out of the repo on purpose — the source is the source,
and CI does the building.

## Member privacy

The booking app and the support chatbot are member-facing and public. The
staff dashboard and the re-engagement tool are **staff-only**: they show
rosters, attendance, and cancellation risk, and `app/sitemap.xml` lists the
public pages only.

Every staff page should carry
`<meta name="robots" content="noindex, nofollow">` in its own `<head>` — that
is the guaranteed way to stay out of a search index, and it only works if the
page stays crawlable so the tag can be read. `app/robots.txt` blocks the crawl
only for a staff page that does not have the tag yet, because blocking is the
weaker fallback: it stops the content being fetched, but the URL can still be
listed. Read the comments in that file before changing it.

## Where the data comes from

**Every person in this repo is invented.** No real member's record is here,
and nothing is downloaded at runtime — the site is static and the studio
engine is forbidden by its own suite from making a network call or reading
the clock. Records are generated from a seed, so the same seed gives the
same studio on any machine.

The *shapes* those invented records follow were calibrated against one
openly licensed public dataset:

| | |
| --- | --- |
| Dataset | **Gym Membership Dataset**, by Tarek Adam |
| Where | <https://www.kaggle.com/datasets/ka66ledata/gym-membership-dataset> |
| Licence | CC0 1.0 Public Domain — no attribution required; given anyway |
| What was taken | Published column summaries only — weekly visit frequency and the share of members attending group classes. **No rows were copied.** |

**Read the licence line and then read this one: that dataset describes
itself as synthetic.** It is a simulated gym membership database published
for practice with data analysis. So the studio's shapes are borrowed from
somebody else's model, not measured from a real gym, and no surface in this
repo may say otherwise. `app/shared/synthetic/CALIBRATION.md` records what
was taken, what was deliberately left alone and why — including one figure
that turned out not to be derivable from the source at all, and the
correction that followed.

That file is the place to look before adding another source. It also lists
the datasets rejected on licensing grounds, which matters for a repo shown
to real studios: a NonCommercial or ShareAlike source would reach for this
project's own licensing.

## Current phase

Problem framing and shared project setup. The team will agree on the shared
studio data definitions and handoff boundaries before building separate MVPs.

See [SHARED_DATA_CONTRACT.md](SHARED_DATA_CONTRACT.md) for the draft shared
data contract and team review worksheet.

Product briefs are available for [Product A](PRODUCT_A_MEMBER_BOOKING_APP.md),
[Product B](PRODUCT_B_STAFF_SCHEDULING_DASHBOARD.md), and
[Product D](PRODUCT_D_MEMBER_REENGAGEMENT_TOOL.md). The Product C brief will be
added when its owner is ready to define their increment.
