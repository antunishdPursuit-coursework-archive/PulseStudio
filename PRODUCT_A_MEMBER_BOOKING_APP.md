# Product A: Member Booking App

**Owner:** Kerrian
**Phase:** Problem framing
**Evidence level:** Planned

## First user and outcome

The first user is a Pulse Studio member who wants to find a class this week
and reserve a spot. The outcome is a clear reservation confirmation that shows
the member only their own booking information.

## Problem

Members do not have an easy way to see the full week's schedule and reserve a
spot in advance, so classes can fill up or remain unpredictably empty.

## MVP behavior contract

The public calendar shows scheduled classes to anyone. A member can select a
class and reserve a spot when capacity is available. After booking, the member
can see their own reservation and confirmation; the MVP does not expose other
members' names, bookings, or attendance.

For the shared-fixture first release, the team must decide how the signed-in
member is selected without building a full authentication system. Real authentication is outside
this first increment unless the team explicitly approves it.

## Golden path

1. A visitor opens the public weekly calendar.
2. A member selects a scheduled class and identifies their member account.
3. The app checks capacity and creates a reservation.
4. The member sees a confirmation and a list of their own reservations.

## Shared data use

Reads `member`, `membership`, and `class_session`. Creates a `reservation`.
It must use the field names, IDs, status values, and timezone defined in
`SHARED_DATA_CONTRACT.md`.

The booking flow should not create attendance records. Attendance is recorded
after a class and belongs to the staff/operations workflow.

## Riskiest boundary

Capacity must remain correct when a class is full, and the public calendar must
not reveal member-specific data.

## Acceptance checks

- The calendar shows only scheduled sessions and the agreed public fields.
- A member can reserve an available session once.
- A full or canceled session cannot receive a new reservation.
- Repeating the same booking action does not create a duplicate reservation.
- The confirmation shows only the selected member's reservation.
- The reservation record matches the shared contract and can be read by
  Product B.

## Non-goals for this increment

Payments, membership signup, full production authentication, waitlists,
automated reminders, recurring bookings, and attendance tracking are not part
of the first fixture-backed MVP.

## Open decisions for Kerrian and the team

Agree on the member-selection method, whether availability counts are
public, the cancellation rule, and whether waitlists are deferred entirely.
