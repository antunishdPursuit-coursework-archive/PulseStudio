# Product A — working rules for the AI in this folder

You are in **Kerrian's lane**: Product A, the Member Booking App. Color:
**blue** (`--kerrian`, via `body.product-a`). Read the repo root brief
first; this file adds what is true about THIS folder.

## What this product is (proven in code, not aspiration)

A client-side booking page over the shared deterministic synthetic studio:
a day-chip schedule with per-day class counts and spots left, book /
waitlist / cancel with a full guard chain (canceled, not-scheduled,
already-booked, already-waitlisted, full — each a typed error), automatic
waitlist promotion when a reserved spot cancels, a "Your reservations"
panel for the signed-in member, and `?session=<id>` deep links that
preselect and highlight a class. No server, no framework: `main.ts`
compiles to a sibling `main.js` ES module.

## Lane law

- Create and edit files ONLY in `app/products/a-booking/`.
- `app/shared/`, `app/index.html`, root docs, `package.json`, `.github/`
  are TEAM-OWNED — change only with agreement stated in the commit and PR.
- `b-dashboard/`, `c-chatbot/`, `d-reengagement/` are other people's work.
  Never edit them; report defects to their owner instead.

## Key files

| File | What it is |
| --- | --- |
| `main.ts` | All product logic: schedule, booking rules, capacity math, waitlist promotion, the one-time studio auto-fill, session-gated UI |
| `reservations.ts` | The storage module: `RUNTIME_KEY = "pulse-reservations-a"`, load/save, `latestReservation()` (last row wins) |
| `index.html` | The page shell; carries the DOM anchors `main.ts` requires (`requiredElement()` throws if one is missing) |
| `styles.css` | Product-local styling; every color is a theme token |

## Identity and sign-in

This page keeps NO auth state of its own. It reads the shared
`pulse-session` through `shared/auth/session.js` — today via the
compatibility view `currentSession()` / `onSessionChange()` (it reads
exactly `.role` and `.member_id`). Booking requires a member session;
staff get an explicit "Member sign-in required" line; signed-out visitors
see the schedule with disabled actions — the route itself is never gated.
The upgrade path, whenever Kerrian wants it: switch to
`readPulseSession()` and branch on `actor_type` (see
`app/shared/auth/README.md`). Booking identity = the member ids of
`sharedStudio()` — the same generator call the sign-in dialog lists.

## The traps that are DELIBERATE (do not "fix" without team intent)

- **The auto-fill is unconditional and random**: on any load where the
  `pulse-reservations-a` log is empty, `spreadReservationsAcrossStudio()`
  randomly books 40–100% of each class from active members. The
  `?fill-reservations=1` param is cosmetic — it never gates the fill.
  Clearing the key regenerates a different random fill; two browsers will
  show different spots-left numbers over the SAME deterministic studio.
- **The log is append-only and last-row-wins.** `cancelReservation()`
  appends a canceled row REUSING the prior `reservation_id`, and
  promotion appends a fresh reserved row above the old waitlist row — so
  `reservation_id` is NOT unique in the log. Consumers must use
  `latestReservation()` semantics, never index by id.
- **`-04:00` is hardcoded** in the day/time formatters — right in EDT,
  an hour off in EST. Display-only, known simplification.
- **The studio is dated to TODAY** (`sharedStudio()`), so yesterday's
  reservations can reference session ids that no longer render; they
  linger harmlessly in the log.

## Seams other lanes rely on — never break silently

- `localStorage["pulse-reservations-a"]`: an append-only contract-shaped
  `Reservation[]` published for the dashboard to read. Key name, field
  names (`reservation_id`, `member_id`, `session_id`,
  `reservation_status`, `reserved_at`, `canceled_at`), and last-row-wins
  are all contract.
- The `?session=<id>` deep link — other products may link into a class.

## Gate

`npm run check` green before every commit (and `npm run build` if you
touched TypeScript). Compiled `.js` is gitignored — edit `.ts` only. The
repo-wide laws (no "demo"/"example"/"mock", no AI attribution, black or
white backgrounds only, stated negatives, never commit red) all apply.

> AGENTS.md beside this file is a generated mirror for non-Claude
> assistants — edit THIS file, then run `bash scripts/sync-agent-briefs.sh`.
