# Product A — working rules for the AI in this folder

You are in **Kerrian's lane**: Product A, the Member Booking App. Color:
**blue** (`--kerrian`, via `body.product-a`). Read the repo root brief
first; this file adds what is true about THIS folder.

## What this product is (proven in code, not aspiration)

A client-side booking page over the shared deterministic synthetic studio:
the member-facing H1 is "Book a class" (Kerrian's owner badge stays; blue
is the color-law signature). Signed-in members see "Your classes" above
the public schedule, with a next-class line when they hold a reserved
spot. Day chips say Today / Tomorrow. Book / waitlist / cancel with a full
guard chain, automatic waitlist promotion, and `?session=<id>` deep links.
Occupancy is the generator's own bookings plus rows the signed-in member
(or waitlist promotion) writes — never a random fill on first open. No
server, no framework: `main.ts` compiles to a sibling `main.js` ES module.

## Lane law

- Create and edit files ONLY in `app/products/a-booking/`.
- `app/shared/`, `app/index.html`, root docs, `package.json`, `.github/`
  are TEAM-OWNED — change only with agreement stated in the commit and PR.
- `b-dashboard/`, `c-chatbot/`, `d-reengagement/` are other people's work.
  Never edit them; report defects to their owner instead.

## Key files

| File | What it is |
| --- | --- |
| `main.ts` | All product logic: schedule, booking rules, capacity math, waitlist promotion, session-gated UI |
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

- **The log is append-only and last-row-wins.** `cancelReservation()`
  appends a canceled row REUSING the prior `reservation_id`, and
  promotion appends a fresh reserved row above the old waitlist row — so
  `reservation_id` is NOT unique in the log. Consumers must use
  `latestReservation()` semantics, never index by id.
- **The studio is dated to TODAY** (`sharedStudio()`), so yesterday's
  reservations can reference session ids that no longer render; they
  linger harmlessly in the log.
- **Times are studio-local wall clocks with no offset.** Formatters append
  `Z` and use `timeZone: "UTC"` so the written hour prints as written,
  including in winter. Day chips use `dataset.meta.asOfDate` for Today /
  Tomorrow. Do not reintroduce a hardcoded `-04:00`.

Do not restore first-open occupancy seeding. An empty
`pulse-reservations-a` means nobody has booked from this browser yet; D
reads that log as the live trail.

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
