# Product B — working rules for the AI in this folder

You are in **Manny's lane**: Product B, the Staff Scheduling Dashboard
("Capacity Watch"). Color: **amber** (`--manny`, via `body.product-b`).
Read the repo root brief first; this file adds what is true about THIS
folder.

## What this product is (proven in code, not aspiration)

(A staff view of upcoming class sessions is protected by the shared
server-backed staff door before any dashboard content renders.) Fill rates
with attention flags
(Underbooked / Filling soon / Full — computed from generator `booked`
bookings, then overridden per member by the latest matching row in the
booking app's `pulse-reservations-a`), a status filter, a per-session
roster view, an "add a class session" dialog whose confirmed weeks persist
to this browser, a by-room demand panel, and a hand-off link to Product D.
Driven by the shared synthetic studio adapter plus this browser's localStorage;
published schedule writes also cross the authenticated server boundary.

## THE structural facts to know before touching anything

**The live page is `index.html` + `staff-dashboard.js` + `dashboard.ts`.**
`staff-dashboard.js` mounts `../../shared/auth/staff-gate.js` first; an
anonymous visitor sees only the shared staff sign-in door, and the dashboard
DOM is not initialized until the server confirms a signed staff session.
`staff-dashboard.js` is hand-written, git-tracked SOURCE, despite being a
`.js` in a TypeScript repo (it has no `.ts` twin; do not delete it as
"compiled output"). It keeps the DOM wiring; the arithmetic — fill bands,
seat counts, session-time formatting, the attention rule, room grouping —
lives in `dashboard.ts` (added 2026-08-23), which `tsc` type-checks and
`tests.ts` pins. Open `tests.html` to run the suite in a browser; the
summary line reads "N checks run, P passed, F failed." (headless running
waits on `scripts/run-suites.mjs` naming this page — team ground).

Meanwhile `main.ts` is DEAD: an earlier `loadFixtures()`-based dashboard.
Of the seven DOM ids it requires, only `#sessions` exists in `index.html`;
the other six (`#status`, `#summary`, `#roster-dialog`, `#roster-content`,
`#roster-title`, `#close-roster`) exist nowhere, so it would throw on
`#status` before rendering anything — and nothing loads it, so editing it
changes nothing on the page. `staff-dashboard.html` WAS a stale sibling
page and is gone (retired 2026-08-23 on the do-not-merge/b proposal
branch): it loaded the same script as `index.html` but declared only 12 of
the ids that script reaches for, so it threw `Cannot set properties of
null` on every load and rendered nothing. `index.html` is the one
dashboard, and it carries its own `noindex` and favicon lines.

## Lane law

- Create and edit files ONLY in `app/products/b-dashboard/`.
- `app/shared/`, `app/index.html`, root docs, `package.json`, `.github/`
  are TEAM-OWNED — change only with agreement stated in the commit and PR.
- `a-booking/`, `c-chatbot/`, `d-reengagement/` are other people's work.
  Never edit them; report defects to their owner instead.

## The deliberate design (do not "fix" without Manny's intent)

- **Week 0 follows the studio-local date** from `sharedStudioWithFill(0.85)`;
  the shared generator remains deterministic for that date, while the
  dashboard stays aligned with Product A's current schedule. The week picker
  shows four weeks at a time and
  `#previousWeeks`/`#nextWeeks` page the window; forward paging has no
  upper bound, so a staff person can walk into empty weeks (each states
  "0 sessions").
- **Rooms**: generator sessions carry no room field and default to the
  string `"Studio"`; a session added in the dialog carries whatever room
  was typed. The demand panel groups by that field, busiest room first,
  and `#fastestRoom` ("Busiest room") is the top row's label.
- **Publish writes the shared schedule**: confirming a draft sends the
  week's `local-N` sessions to `/api/schedule` through the staff session and
  also caches the accepted result in this browser under `pulse-schedule-b`.
  Product A does not read the endpoint yet; its consumer is a separate,
  approved change for Kerrian's lane.
- The roster locally re-maps generator camelCase into contract-style
  snake_case names — it LOOKS like contract data but is a private
  adapter inside this folder.
- The fill-rate bands (70 / 90 / 100) live once, as named constants at
  the top of `dashboard.ts`. The root product brief still lists the
  threshold as an open decision for the team; until it is ratified,
  these are the numbers, and `tests.ts` pins both sides of every edge.

## Integration facts

- Data: `shared/auth/studio.js` → `shared/synthetic/` — the live page uses
  the shared generator adapter with the same studio-local date as Product A,
  while bypassing `loadFixtures()`/`fixtures.json` entirely.
- Theme: `index.html` carries `product-b`, links `shared/theme.css`, and
  loads `shared/theme-boot.js` — which also gives the page the shared
  sign-in chip and theme toggle for free.
- Storage: this product caches one key, `pulse-schedule-b` (the server's
  accepted published weeks), and READS the booking app's `pulse-reservations-a` — on load, on
  window focus, and on storage events — validating every row and stating
  the rejected count on the page. It never writes A's key. A canceled
  runtime row decrements a session's confirmed count and a reserved one
  increments it, so the tiles are generator data PLUS this browser.
- The header links to `../a-booking/index.html`, and the "Plan
  re-engagement" callout links to `../d-reengagement/index.html` — both
  relative, so they hold on localhost and on the published site alike.

## Gate

`npm run check` green before every commit. Never commit compiled `.js`
(`main.js`, `dashboard.js` and `tests.js` here are exactly that —
untracked, leave them be); remember that `staff-dashboard.js` is the one
deliberate exception: tracked source. The repo-wide laws (no
"demo"/"example"/"mock", no AI attribution, backgrounds always via
`var(--bg)` and never hardcoded, stated negatives, never commit red) all
apply.

> AGENTS.md beside this file is a generated mirror for non-Claude
> assistants — edit THIS file, then run `bash scripts/sync-agent-briefs.sh`.
