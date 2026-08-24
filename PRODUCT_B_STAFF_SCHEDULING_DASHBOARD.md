# Product B: Staff Scheduling Dashboard

**Owner:** Manny
**Phase:** Shipped
**Evidence level:** Built and checked — `app/products/b-dashboard/tests.html`, 39 checks, run headlessly by `npm run check`. This line said "Problem framing" / "Planned" for a while after the code shipped — the same mistake Product A's brief made and was corrected for; nobody had come back to fix this one until now.

## First user and outcome

The first user is the Pulse Studio owner or an instructor managing upcoming
classes. The outcome is a quick view of class capacity, rosters, and
underbooked sessions so staff can decide what needs attention.

## Problem

Staff do not have a simple way to see which upcoming classes are underbooked,
so they may miss opportunities to promote a class or adjust the schedule.

## MVP behavior contract

The dashboard is staff-only, and that is enforced by the studio's server now,
not merely by omission: neither staff page draws anything until
`/api/staff/session` confirms a signed session, and the records themselves —
members, memberships, reservations, attendance — sit outside `app/` in
`data/staff-records.json`, reachable only through `/api/staff/records` behind
that same session. It reads the shared schedule and reservation records,
calculates current fill levels, and flags classes below 70% fill
(`UNDERBOOKED_BELOW` in `dashboard.ts`). It does not change reservations —
staff add classes to the coming week's schedule and publish it, but nothing
here promotes or cancels a class automatically.

## Golden path

1. A staff user opens the dashboard.
2. The dashboard loads upcoming scheduled sessions and their reservations.
3. Staff see capacity, confirmed reservations, availability, and the agreed
   underbooked flag for each session.
4. Staff open a session to review its roster and decide what action to take.

## Shared data use

Reads `class_session`, `instructor`, `reservation`, and the member details
staff are permitted to see — through `/api/staff/records` now, not a fixture
file under `app/`. It uses the same generated studio Product A books against
(`sharedStudioWithFill()` in `app/shared/auth/studio.ts`), which is what makes
the next line true rather than aspirational.

Product B is read-only for reservations: staff build and publish next week's
class schedule here, but promoting or canceling an individual reservation
remains a human decision outside the dashboard.

## Riskiest boundary

The dashboard counts reservations consistently — `confirmedCount()` in
`dashboard.ts` counts only `reserved` rows, never `waitlisted` or `canceled` —
and applies one threshold, `UNDERBOOKED_BELOW = 70`.

This boundary used to be riskier than it looked: until 2026-08-23 the
dashboard generated its OWN studio instead of reading the shared one, so no
class id it knew about was ever one Product A had booked, and every real
reservation arrived as "outside the current schedule." Watched end to end in
a browser after the fix: a member books on Product A, the dashboard's own
line reads "1 in this schedule, 0 outside it," and that member is on the
class's roster.

## Acceptance checks

- Each upcoming session shows the correct capacity and confirmed reservation
  count. — checked (`tests.html`).
- Fill rate excludes canceled AND waitlisted reservations. — checked.
- The underbooked flag uses a 70% threshold. — checked; not yet stated to the
  team as ratified rather than Manny's own call.
- Canceled and completed sessions are clearly labeled and excluded from the
  upcoming list. — checked.
- Staff can view the full roster; the public calendar cannot expose it. — true
  on both counts: the dashboard is gated by the studio's server, and Product
  A's page never reads staff-only fields.
- Product B can read reservations created by Product A without changing their
  shared meaning. — true since 2026-08-23; see Riskiest boundary above.

## Non-goals for this increment

Automatic class promotion, automatic cancellation, instructor payroll,
forecasting, notifications, and member re-engagement are not part of this
dashboard. Database deployment is also not part of it — the studio's records
are the same seeded, deterministic dataset every product reads, served by
`scripts/start-haiku.mjs` rather than a database.

## Open decisions for Manny and the team

Settled by the code, not yet stated as ratified by the team: the underbooked
threshold is 70%; a waitlisted reservation never counts toward fill; the
roster shows each member's display name, not an anonymized id — the same
name Product A and the shared sign-in already use for that person. Genuinely still open: what staff ROLES (beyond the one front-desk actor the
shared sign-in offers today) should see.
