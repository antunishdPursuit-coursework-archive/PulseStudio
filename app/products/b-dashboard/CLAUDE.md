# Product B — working rules for the AI in this folder

You are in **Manny's lane**: Product B, the Staff Scheduling Dashboard
("Capacity Watch"). Color: **amber** (`--manny`, via `body.product-b`).
Read the repo root brief first; this file adds what is true about THIS
folder.

## What this product is (proven in code, not aspiration)

A static staff view of upcoming class sessions: fill rates with attention
flags (Underbooked / Filling soon / Full, computed from `booked` bookings
only), a status filter, a per-session roster view, a local-only "add a
class session" dialog, a single-room demand panel, and a hand-off button
to Product D. Driven entirely by the shared synthetic generator — no
server, no persistence of any kind.

## THE structural fact to know before touching anything

**The live page is `index.html` + `staff-dashboard.js` — and
`staff-dashboard.js` is hand-written, git-tracked SOURCE**, despite being
a `.js` in a TypeScript repo (it has no `.ts` twin; do not delete it as
"compiled output"). Meanwhile `main.ts` is DEAD: an earlier
`loadFixtures()`-based dashboard whose required DOM ids exist in neither
HTML file — nothing loads it, and editing it changes nothing on the page.
`staff-dashboard.html` WAS a stale sibling page and is gone (retired
2026-08-23 on the do-not-merge/b proposal branch): it loaded the same
script as `index.html` but declared only 12 of the 33 ids that script
reaches for, so it threw `Cannot set properties of null` on line 19 of the
script on every load and rendered nothing. Nothing linked to it; the only
ways in were a typed URL or an old bookmark. `index.html` is the one
dashboard, and it now carries its own `noindex` and favicon lines.

## Lane law

- Create and edit files ONLY in `app/products/b-dashboard/`.
- `app/shared/`, `app/index.html`, root docs, `package.json`, `.github/`
  are TEAM-OWNED — change only with agreement stated in the commit and PR.
- `a-booking/`, `c-chatbot/`, `d-reengagement/` are other people's work.
  Never edit them; report defects to their owner instead.

## The deliberate design (do not "fix" without Manny's intent)

- **The dataset is frozen on purpose**: seed `capacity-watch-2026`,
  `asOfDate: "2026-08-19"`, and the 7-day window is computed from that
  date, not from today — the dashboard shows the same week forever,
  deterministically.
- **One room.** Generator sessions carry no room field; every room label
  and `#fastestRoom` are the hardcoded string `"Studio"`, and the demand
  panel is that one room's peak fill. The home page's copy was already
  corrected once for overstating this.
- **Publish is in-memory only**: dialog-added sessions (`local-N` ids)
  vanish on reload. Nothing here persists.
- The roster locally re-maps generator camelCase into contract-style
  snake_case names — it LOOKS like contract data but is a private
  adapter inside this folder.
- `#reengageBtn` navigates to the ABSOLUTE GitHub Pages URL of Product D
  — from a local `npm run start` session it leaves localhost. If D's
  hosting ever moves, this link must follow.

## Integration facts

- Data: `shared/synthetic/config.js` + `generate.js` ONLY — the live page
  bypasses `loadFixtures()`/`fixtures.json` entirely (a cross-lane fact
  the team knows about).
- Theme: `index.html` carries `product-b`, links `shared/theme.css`, and
  loads `shared/theme-boot.js` — which also gives the page the shared
  sign-in chip and theme toggle for free.
- This product reads and writes NO storage keys of its own. Product A
  publishes `pulse-reservations-a` (append-only, last-row-wins) as a seam
  this dashboard MAY read one day; today it does not.
- The header links to `../a-booking/index.html` — Kerrian's page must
  keep existing at that path.

## Gate

`npm run check` green before every commit. Never commit compiled `.js`
(`main.js` here is exactly that — untracked, leave it be); remember that
`staff-dashboard.js` is the one deliberate exception: tracked source. The
repo-wide laws (no "demo"/"example"/"mock", no AI attribution, black or
white backgrounds only, stated negatives, never commit red) all apply.

> AGENTS.md beside this file is a generated mirror for non-Claude
> assistants — edit THIS file, then run `bash scripts/sync-agent-briefs.sh`.
