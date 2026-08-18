# Product B: Staff Scheduling Dashboard

**Owner:** Manny
**Phase:** Problem framing
**Evidence level:** Planned

## First user and outcome

The first user is the Pulse Studio owner or an instructor managing upcoming
classes. The outcome is a quick view of class capacity, rosters, and
underbooked sessions so staff can decide what needs attention.

## Problem

Staff do not have a simple way to see which upcoming classes are underbooked,
so they may miss opportunities to promote a class or adjust the schedule.

## MVP behavior contract

The dashboard is staff-only. It reads the shared schedule and reservation
records, calculates current fill levels, and flags classes that meet the agreed
underbooked rule. It does not change reservations or automatically promote or
cancel classes in the first increment.

## Golden path

1. A staff user opens the dashboard.
2. The dashboard loads upcoming scheduled sessions and their reservations.
3. Staff see capacity, confirmed reservations, availability, and the agreed
   underbooked flag for each session.
4. Staff open a session to review its roster and decide what action to take.

## Shared data use

Reads `class_session`, `instructor`, `reservation`, and the member details that
staff are permitted to see. It must use the field names, IDs, status values,
and timezone defined in `SHARED_DATA_CONTRACT.md`.

Product B is read-only for the shared-fixture MVP. Any staff action such as
promoting or canceling a class remains a human decision outside the dashboard.

## Riskiest boundary

The dashboard must count reservations consistently and apply one agreed
underbooked threshold. It must not treat waitlisted or canceled reservations as
confirmed bookings.

## Acceptance checks

- Each upcoming session shows the correct capacity and confirmed reservation
  count.
- Fill rate uses the agreed formula and excludes canceled reservations.
- The underbooked flag uses the threshold recorded by the team.
- Canceled and completed sessions are clearly labeled or excluded according to
  the agreed rule.
- Staff can view the full roster, while the public calendar cannot expose it.
- Product B can read reservations created by Product A without changing their
  shared meaning.

## Non-goals for this increment

Automatic class promotion, automatic cancellation, instructor payroll,
forecasting, notifications, member re-engagement, and database deployment are
not part of the first fixture-backed MVP.

## Open decisions for Manny and the team

Agree on the underbooked threshold, the time window for upcoming classes, how
waitlists affect capacity, what staff roles can see, and whether a roster shows
member names or anonymized IDs in the first release.
