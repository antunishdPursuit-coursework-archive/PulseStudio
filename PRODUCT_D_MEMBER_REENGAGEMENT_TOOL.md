# Product D: Member Re-engagement Tool

**Owner:** Rensley
**Phase:** Problem framing
**Evidence level:** Planned

## First user and outcome

The first user is the Pulse Studio owner reviewing the member base once a week.
The outcome is a short, ranked list of members who used to attend regularly but
have gone quiet, each with a ready-to-copy personal message, so no fading
member goes unnoticed until they cancel.

## Problem

Members who are about to cancel go quiet for weeks first, and staff miss it
because they only ever look at today's roster — nothing in the studio shows
who has *stopped* showing up.

## MVP behavior contract

The tool is staff-only and read-only over the shared fixtures. It computes one
number per active member — days since their last attended class — and flags
members matching the agreed drop-off rule. For each flagged member it shows the
evidence (last class attended, date, how often they used to come) and fills a
message template with that member's details. Staff copy the message and send it
themselves through their own channel. The tool never sends anything and never
writes a shared record.

**Proposed drop-off rule (for team ratification, not yet agreed):** flag a
member when `membership_status` is `active` and their most recent
`attendance_status = "attended"` record is more than **14 days** old but no
more than **60 days** old. Rank flagged members by how often they attended in
the 60 days before going quiet, most frequent first.

Proposed exclusions: `paused`, `canceled`, and `expired` members (different
conversations), and members with no attendance history at all (that is an
onboarding problem, not a re-engagement problem).

Why these numbers: two weeks of silence from a regular is the point where a
personal note still reads as care rather than a retention campaign; past 60
days the honest conversation is a pause-or-cancel offer, which is out of scope
for this increment. The team should adjust both numbers once we see the
fixture data.

## Golden path

1. A staff user opens the re-engagement view.
2. The tool loads active members with their reservation and attendance history
   from the shared fixtures.
3. Staff see the flagged members ranked by prior attendance frequency, each
   with the evidence for why they were flagged.
4. Staff open one member, read the drafted message, copy it, and send it
   themselves.

## Shared data use

Reads `member`, `membership`, `reservation`, and `attendance`, plus
`class_session` and `instructor` display fields to personalize the draft
(favorite class type, usual instructor). It must use the field names, IDs,
status values, and timezone defined in `SHARED_DATA_CONTRACT.md`.

Only `attendance_status = "attended"` records count as attendance. Canceled
reservations, `no_show`, and `unknown` records never count as a visit.
Product D creates or updates no shared records — drafts are product-local and
copy-only.

## Riskiest boundary

Cancellation-risk information is staff-only inference. Nothing this tool
computes — flags, rankings, or drafts — may be exposed through the member
booking app or the member chatbot, and the tool must never send a message
itself. The second risk is a quiet misread of the data: counting a reservation
or a no-show as a visit would hide exactly the members this product exists to
catch.

## Acceptance checks

- Against a known-answer fixture, the tool flags exactly the expected members
  — including at least one deliberate near-miss that must NOT be flagged (a
  recent attendee, a paused member, and a never-attended new member).
- Canceled reservations and `no_show` records never count as attendance.
- Each flagged member shows their evidence: last attended class, its date, and
  prior frequency.
- The draft message renders with the member's real fixture details — no
  unfilled placeholders like `{name}` ever reach the screen.
- When no one is flagged, the tool states the negative — "N active members
  checked, 0 flagged" — never a blank panel.
- Flags and drafts are reachable only from the staff view; Products A and C
  surfaces cannot read them.
- The tool changes no shared record: fixtures are byte-identical after a run.

## Non-goals for this increment

Sending messages (email, SMS, or otherwise), scheduling or automation,
AI-generated message copy (template fill-in only in this increment), churn
prediction or scoring models, new-member onboarding outreach, discounts or
win-back offers, and database deployment are not part of the first
fixture-backed MVP.

## Open decisions for Rensley and the team

Ratify or adjust the 14/60-day thresholds and record the reason. Agree on what
a *missing* attendance record means for a reserved session (unknown vs.
no-show) and whether attendance recording is expected for every reservation in
the fixtures. Decide whether a reservation without attendance counts as any
engagement signal. Decide whether the demo shows member names or anonymized
IDs (same question Manny has for rosters). Decide whether the view caps at a
top-5 weekly digest or shows every flagged member.
