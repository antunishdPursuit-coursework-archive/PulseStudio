<p align="center">
  <img src="app/shared/og-image.svg" alt="Pulse Studio" width="620">
</p>

# Pulse Studio

**A boutique fitness studio's software, built by four people in one repository
without ever touching each other's files.**

Four products — booking, a staff dashboard, a support assistant, and a
re-engagement tool — share one studio's records, one visual system, and one
gate that every change passes before it reaches the live site.

**[Open the live site →](https://antunishdpursuit.github.io/PulseStudio/)**

| | |
| --- | --- |
| **Is it ready?** | [The readiness board](https://antunishdpursuit.github.io/PulseStudio/shared/ready.html) — every open gap in red, named |
| **How do the records flow?** | [Storytold](https://antunishdpursuit.github.io/PulseStudio/shared/storytold.html) — the map, where green segments pulse because that hand-off runs today |
| **What does it look like?** | [The brand book](https://antunishdpursuit.github.io/PulseStudio/shared/brand-sheet.html) — mark, type, colour; prints to PDF as it stands |

## Run it

```bash
npm install
npm run build
npm run start
```

Then open <http://localhost:4173>. That is the whole setup — no database, no
API keys, no services. `build` is `tsc` and nothing else; `start` is a static
file server pointed at `app/`.

Needs Node 20.19 or newer. Below that the compiled modules fail to load with an
error that blames the wrong thing — `scripts/node-floor.mjs` explains why and
prints the real reason.

## The four products

| | Product | For | Live | Built by |
| --- | --- | --- | --- | --- |
| **A** | Member Booking | members | [Book a class](https://antunishdpursuit.github.io/PulseStudio/products/a-booking/) | Kerrian |
| **B** | Staff Scheduling Dashboard | staff | [Dashboard](https://antunishdpursuit.github.io/PulseStudio/products/b-dashboard/) | Manny |
| **C** | Member Support | members | [Support](https://antunishdpursuit.github.io/PulseStudio/products/c-chatbot/) | Dennis |
| **D** | Member Re-engagement | staff | [Re-engage](https://antunishdpursuit.github.io/PulseStudio/products/d-reengagement/) | Rensley |

Each has a brief in the root: [A](PRODUCT_A_MEMBER_BOOKING_APP.md) ·
[B](PRODUCT_B_STAFF_SCHEDULING_DASHBOARD.md) ·
[C](PRODUCT_C_MEMBER_SUPPORT_CHATBOT.md) ·
[D](PRODUCT_D_MEMBER_REENGAGEMENT_TOOL.md).

## How four people share one repository

**One folder each, and nothing outside it.**

| Developer | Product | The only folder they edit |
| --- | --- | --- |
| Kerrian | A | `app/products/a-booking/` |
| Manny | B | `app/products/b-dashboard/` |
| Dennis | C | `app/products/c-chatbot/` |
| Rensley | D | `app/products/d-reengagement/` |

Everything else — `app/shared/`, the front door, the root docs, CI — is
team-owned and changes only with agreement stated in the pull request.

Because two branches can never touch the same file, **merge conflicts are
structurally impossible** rather than merely rare. `scripts/check-lanes.mjs`
enforces it by git author and names any commit that reaches outside its lane.

The working agreement every developer's assistant reads before its first edit
is [CLAUDE.md](CLAUDE.md).

## The gate

```bash
npm run check
```

`tsc`, then every `check-*.mjs` script in `package.json`, then three browser
suites run headlessly. Each prints the count it actually reached — read the
number there, never from prose, including this README.

Each gate holds one law that used to be only written down: where styles live,
that a new colour pairing meets WCAG AA, that no page shows a builder's name
to a member, that nothing new under `app/` is published by accident, that every
brief still matches its mirror. **Every gate carries `--self-test`**, which
plants known-bad input and proves it still catches it. Run one whenever you
doubt a green.

Every pull request runs the gate; every push to `main` runs it again and then
publishes. A red gate never reaches the live URL.

**And note what none of them do: a green gate does not open a browser.** Look
at the pages your change could affect.
## The studio it models

A single-location boutique fitness studio — yoga, cycling, HIIT. Members pay a
recurring monthly membership for a set number of classes rather than paying per
visit. An owner and a small group of instructors each teach a regular weekly
schedule.

Two groups use it, and the difference decides what every screen may show:

- **Members** want the week's schedule and a spot in a class.
- **Staff** — the owner and instructors — need rosters, capacity, and to notice
  a member who has quietly stopped coming.

The four problems the products exist for: members cannot see the week ahead and
reserve, so classes fill or sit empty unpredictably · staff cannot see at a
glance which classes are underbooked · nobody notices a member drifting away
until they cancel · the same questions about class levels and the cancellation
policy take staff time one at a time.

## Member privacy

The booking app and the support assistant are member-facing and public. The
staff dashboard and the re-engagement tool are **staff-only**: they show
rosters, attendance, and cancellation risk, and `app/sitemap.xml` lists the
public pages only.

Every staff page should carry `<meta name="robots" content="noindex, nofollow">`
in its own `<head>` — the guaranteed way to stay out of a search index, and it
only works if the page stays crawlable so the tag can be read. `app/robots.txt`
blocks the crawl only for a staff page that does not have the tag yet, because
blocking is the weaker fallback: it stops the content being fetched, but the URL
can still be listed. Read the comments in that file before changing it.

**The site talks to nobody.** Measured 2026-08-23 across every shipped module:
three network calls exist and all three are same-origin. No analytics, no tag
manager, no cookies, no Shared Storage, no third-party host — not even a font.
Both typefaces are self-hosted from this origin. Anything a browser console
reports beyond that came from an extension, not from here.

## Where the data comes from

**Every person in this repository is invented.** No real member's record is
here, and nothing is downloaded at runtime — the studio engine is forbidden by
its own suite from making a network call or reading the clock. Records generate
from a seed, so the same seed gives the same studio on any machine.

The *shapes* those records follow were calibrated against one openly licensed
public dataset:

| | |
| --- | --- |
| Dataset | **Gym Membership Dataset**, by Tarek Adam |
| Where | <https://www.kaggle.com/datasets/ka66ledata/gym-membership-dataset> |
| Licence | CC0 1.0 Public Domain — no attribution required; given anyway |
| What was taken | Published column summaries only — weekly visit frequency and the share of members attending group classes. **No rows were copied.** |

**Read the licence line, then read this one: that dataset describes itself as
synthetic.** It is a simulated membership database published for practice with
data analysis. So the studio's shapes are borrowed from somebody else's model,
not measured from a real gym, and no surface here may say otherwise.
[`app/shared/synthetic/CALIBRATION.md`](app/shared/synthetic/CALIBRATION.md)
records what was taken, what was deliberately left alone and why — including
one figure that turned out not to be derivable from the source at all, and the
correction that followed. Read it before adding another source; it also lists
the datasets rejected on licensing grounds, which matters for a repository
shown to real studios.

## Where things stand

All four products are built, published, and live. Every push to `main` gates
and republishes.

What is **not** finished is stated in red on
[the readiness board](https://antunishdpursuit.github.io/PulseStudio/shared/ready.html)
rather than left to be found on the day, and the open asks between developers
live in [docs/REQUESTFOR-A-B-C.md](docs/REQUESTFOR-A-B-C.md) with an owner and
one closing action each.

Two things worth knowing before you read further:

- **A member's booking does not reach the dashboard's meters yet.** The
  dashboard reads the booking log but builds its own studio, so the class ids
  never match. One config line, in one lane, and it is the honest thing to show.
- **The support assistant answers nothing on the deployed site.** It posts every
  question to an address a static build does not publish. It works locally with
  a key; the hosted endpoint is its remaining blocker.

This section claimed the team was still framing the problem and had not started
building, until 2026-08-22.

## Reading further

| | |
| --- | --- |
| [CLAUDE.md](CLAUDE.md) | the working agreement — read before the first edit |
| [SHARED_DATA_CONTRACT.md](SHARED_DATA_CONTRACT.md) | the shared vocabulary all four products speak |
| [docs/](docs/) | process notes, gate baselines, and what each teammate is owed |
| [app/shared/CLAUDE.md](app/shared/CLAUDE.md) | the load-bearing facts about team-owned ground, each of which has bitten someone |

Compiled `.js` stays out of the repository on purpose — the source is the
source, and CI does the building.
