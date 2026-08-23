# Product A: Member Booking App

**Owner:** Kerrian
**Phase:** Shipped — first release
**Evidence level:** Running code, checked by `app/products/a-booking/tests.html`

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

For the shared-fixture first release, the signed-in member comes from the
shared `pulse-session` contract (`app/shared/auth/session.ts`) — the top-bar
sign-in every product reads. Booking identity is the member ids of
`sharedStudio()`, the same generator call the sign-in dialog lists. Real
authentication remains outside this increment.

When a scheduled class has no spots left, a signed-in member may join the
waitlist. Canceling a reserved spot promotes the earliest waitlisted member
automatically. A member holds at most one row per session: booked, waitlisted,
or canceled, last row wins. A member whose membership is not active is told so
in place of the Book button and cannot take a seat.

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

Payments, membership signup, full production authentication,
automated reminders, recurring bookings, and attendance tracking are not part
of the first fixture-backed MVP.

## Open decisions for Kerrian and the team

The cancellation rule. Today the code lets a member cancel any time — the
Cancel button states the studio's current cancellation policy and asks for a
confirming second press, but no cutoff is enforced, because the policy record
carries the rule only as prose. Enforcing it needs a machine-readable cutoff
on the shared policy record, which is a team decision. The other three
decisions this section used to hold are settled in shipped code: member
selection is the shared `pulse-session`, availability counts are public, and
waitlists ship with automatic promotion.
