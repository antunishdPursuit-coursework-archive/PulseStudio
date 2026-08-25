<p align="center">
  <img src="app/shared/readme-banner.svg" alt="Pulse Studio" width="620">
</p>

# Pulse Studio

**A boutique fitness studio's software, built by four people in one repository
without ever touching each other's files.**

Four products — booking, a staff dashboard, a support assistant, and a
re-engagement tool — share one studio's records, one visual system, and one
gate that every change passes before it reaches the live site.

**[Open the live site →](https://antunishdpursuit.github.io/PulseStudio/)** — GitHub
Pages, static: every member-facing page works, and the member support
assistant and both staff doors say so and stay closed, honestly, because a
static host has no process to hold a key or check a passphrase in.

**[Or the server-backed copy →](https://pulse.githat.io/)** — same site, run
by [scripts/start-haiku.mjs](scripts/start-haiku.mjs) on a real process, so
the assistant answers and staff sign-in is a real gate. See
[docs/the-server.md](docs/the-server.md) for what a process gives you that a
static host cannot, and why the source names no host for it.

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

Then open <http://localhost:4173>. `build` is `tsc` and nothing else; `start`
runs the studio's own server, `scripts/start-haiku.mjs` — no database, but it
is not a static file server either. Without any environment variables set it
still serves every page and the member-facing site works in full; two things
stay honestly closed rather than failing open: the member support assistant
answers that it is unavailable (needs `ANTHROPIC_API_KEY`), and both staff
surfaces show a closed door (needs `STAFF_PASSPHRASE`). See
[docs/the-server.md](docs/the-server.md) for both.

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

`tsc`, then every `check-*.mjs` script in `package.json`, then every browser
suite `scripts/run-suites.mjs` finds under `app/` — six today, found rather
than counted so a new one cannot ship unrun. Each prints the count it
actually reached — read the number there, never from prose, including this
README, which said "three" for a while after a fourth suite started running.

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
public pages only. Both staff pages carry
`<meta name="robots" content="noindex, nofollow">` in their `<head>`, and
`app/sitemap.xml`/`app/robots.txt` agree with that — but a meta tag only
asks a well-behaved crawler not to index a page it can still fetch, and was
never the thing keeping a person out.

**That part is real now, not a request.** Records that name a person —
members, memberships, reservations, attendance — do not live under `app/`
at all; they sit in `data/staff-records.json`, outside the folder the site
publishes. The only route to them is `GET /api/staff/records`, and the
studio's own server refuses it without a session it signed itself after a
passphrase. Neither staff page draws anything until the server says yes;
where there is no server — a static host — the door reports exactly that
and stays shut. See [docs/the-server.md](docs/the-server.md) for how.

**The site talks to nobody outside itself.** Every `fetch()` in the app is a
relative, same-origin path — `grep -rn "fetch(" app/` is where to read the
current list rather than a count in this paragraph, which has already been
wrong once. No analytics, no tag manager, no Shared Storage, no third-party
host — not even a font: both typefaces are self-hosted from this origin.

**One cookie exists, and it is not tracking.** Staff sign-in sets
`__Host-pulse-staff` — first-party, `HttpOnly`, `Secure`, no `Domain`
attribute possible under that prefix — which is how the studio's server
knows a request already proved it holds the staff passphrase. Nothing else
sets a cookie. Anything a browser console reports beyond what is listed here
came from an extension, not from this site.

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

This section used to list one thing worth knowing before reading further:
that the support assistant answered nothing on the deployed site, because it
posts every question to an address a static build does not publish. That
stopped being true on 2026-08-25 — the same site now also runs at
[pulse.githat.io](https://pulse.githat.io/), a real process, and the
assistant answers there. It stayed listed here until the hosted copy
actually existed, not until one was merely proposed. GitHub Pages, the
static copy above, still cannot run it — that limit is architectural, not a
remaining task.

This section used to list a second item — a member's booking never reaching
the dashboard's meters, because the dashboard generated its own studio
instead of reading the shared one. That is fixed: the dashboard now calls
the same shared studio function every other product does, watched end to
end in a browser — a member books, the dashboard's own line reads the
booking, and that member is on the class roster. It stayed listed here
until the fix actually landed, not until it was merely diagnosed.

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
