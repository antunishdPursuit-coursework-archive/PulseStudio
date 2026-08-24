# Pulse Studio Shared Data Contract

**Status:** Draft — team review required
**Purpose:** Give all four products the same vocabulary, identifiers, and
sample data shape before anyone builds product-specific logic.

This is a planning contract, not a final database schema. The team should
change a definition here once, then use the agreed version across every
product.

## Approved rollout and access decisions

The team will use shared anonymized fixture data for the first MVPs. A database
is deferred until the products are ready for deployment.

The class schedule is public. Members may see their own reservations and
booking history, but not other members' data. Staff may see the full schedule,
rosters, capacity, attendance, and membership-risk information required for
their work.

## Shared rules

Each record must have a stable ID. Dates and times should use ISO 8601 format
with the studio's timezone stated explicitly. Product-specific fields should
not redefine a shared field. Sample data should use fictional or anonymized
member information.

The shared data should support the four MVPs without requiring every product to
read every field. A product should read only the data its user needs.

## The envelope around the records

The records split across TWO files on 2026-08-22, and this section described
one file holding all seven collections until this correction — it needs to
name both now, or a reader believes `fixtures.json` holds a member.

**`app/shared/fixtures.json`** is public: any visitor's browser may fetch it.
It carries `PublicFixtures` in `app/shared/contract.ts` — the timetable, who
teaches, and the studio's policies:

| Field | Type | Meaning |
| --- | --- | --- |
| `timezone` | string | The IANA zone this record set's dates are in. Every product that computes a day boundary — "how many days quiet", "is this class today" — resolves it here, so a staff member in another timezone still gets the STUDIO's answer. |
| `note` | string | What this record set is, in one sentence, including that the people in it are fictional. It travels with the data so a set can never be mistaken for a real studio's records once it leaves this repo. |

Then its collections: `instructors`, `class_sessions`, `studio_policies`.

**`data/staff-records.json`** sits OUTSIDE `app/` on purpose — everything
under `app/` is served at a URL, and every field in this file names a
person: `members`, `memberships`, `reservations`, `attendance`. It carries
`StaffRecords` in the same `contract.ts`, and the only route to it is
`GET /api/staff/records`, behind the signed staff session
`app/shared/auth/staff-gate.ts` requires.

`FixtureSet` is both halves together — what the synthetic engine builds and
`scripts/check-fixtures.mjs` validates as one record set, checked against
both files, never fetched as one request. Documented 2026-08-21: `timezone`
and `note` existed in `contract.ts` and were described nowhere here, so the
document that defines the vocabulary was silent about the field every day
boundary in the studio is computed from. The gate requires both fields.

## Core entities

### Member

Represents a person with a studio account.

| Field | Type | Meaning |
| --- | --- | --- |
| `member_id` | string | Stable member identifier |
| `display_name` | string | Name shown to staff or the member |
| `membership_status` | enum | `active`, `paused`, `canceled`, or `expired` |

### Membership

Represents the member's recurring membership record.

| Field | Type | Meaning |
| --- | --- | --- |
| `membership_id` | string | Stable membership identifier |
| `member_id` | string | Member who owns the membership |
| `plan_name` | string | Membership plan or tier |
| `status` | enum | `active`, `paused`, `canceled`, or `expired` |
| `started_on` | date | Membership start date |
| `renews_on` | date/null | Next renewal date; null when the membership is not active |
| `canceled_on` | date/null | Cancellation date, if canceled |

### Class session

Represents one scheduled class occurrence, not the general class type.

| Field | Type | Meaning |
| --- | --- | --- |
| `session_id` | string | Stable identifier for this scheduled class |
| `class_type` | enum/string | Yoga, cycling, HIIT, or another studio class |
| `level` | string | Beginner, all levels, advanced, or another label |
| `instructor_id` | string | Instructor leading the session |
| `starts_at` | datetime | Start time in the studio timezone |
| `ends_at` | datetime | End time in the studio timezone |
| `capacity` | integer | Maximum number of spots |
| `session_status` | enum | `scheduled`, `canceled`, or `completed` |

### Instructor

Represents a staff member who teaches classes.

| Field | Type | Meaning |
| --- | --- | --- |
| `instructor_id` | string | Stable instructor identifier |
| `display_name` | string | Name shown in schedules and rosters |

### Reservation

Represents a member's relationship to one class session.

| Field | Type | Meaning |
| --- | --- | --- |
| `reservation_id` | string | Stable reservation identifier |
| `member_id` | string | Member who made the reservation |
| `session_id` | string | Class session reserved |
| `reservation_status` | enum | `reserved`, `waitlisted`, or `canceled` |
| `reserved_at` | datetime | Time the reservation was created |
| `canceled_at` | datetime/null | Time the reservation was canceled, if applicable |

### Attendance

Represents what happened after a member reserved or attended a session.

| Field | Type | Meaning |
| --- | --- | --- |
| `attendance_id` | string | Stable attendance record identifier |
| `member_id` | string | Member being recorded |
| `session_id` | string | Class session |
| `attendance_status` | enum | `attended`, `no_show`, or `unknown` |
| `recorded_at` | datetime | Time attendance was recorded |

### Studio policy

Represents the current answer to a member-facing policy question.

| Field | Type | Meaning |
| --- | --- | --- |
| `policy_id` | string | Stable policy identifier |
| `topic` | enum/string | Class level, what to bring, cancellation, or another topic |
| `answer` | string | Current member-facing answer |
| `effective_from` | date | Date this version became active |
| `updated_at` | datetime | Last update time |
| `is_current` | boolean | Whether this is the answer the chatbot may use |

## Product mapping

This is the starting map. Each owner should add required fields, fields their
product creates, and unresolved questions during the team review.

| Product | Owner | Reads | Creates or updates |
| --- | --- | --- | --- |
| Member Booking App | Kerrian | `member`, `membership`, `class_session`, `studio_policy` | `reservation` |
| Staff Scheduling Dashboard | Manny | `member`, `class_session`, `instructor`, `reservation`, `attendance` | Authenticated published weekly schedule at `/api/schedule`; Product A consumer pending |
| Member Support Chatbot | Dennis | `class_session`, `studio_policy` | No shared records in MVP |
| Member Re-engagement Tool | Rensley | `member`, `membership`, `reservation`, `attendance`, `class_session`, `instructor` | Draft outreach only; no automatic sending |

**Rensley corrected his own row on 2026-08-21** and left the other three
alone. `class_session` and `instructor` were always being read and were
never declared: attendance records carry a `session_id`, not a class, so
the only way to say "Last attended: yoga with Ana on July 25" — the line a
staff member judges a flag by — is to resolve the session and then its
instructor. Reading them was correct; the row was wrong.

An audit the same day compared every product's real reads against this table.
**The data law itself holds** — no member-facing surface touches staff-only
information. Product C now matches its row exactly and refuses private-member
questions without reading member records. Kerrian's and Manny's rows were
corrected on this branch (2026-08-24): Kerrian's page shows the current
cancellation policy beside its Cancel button (`studio_policy`, not declared
before), and Manny's roster resolves each booking to a member's display name
and attendance status (`member` and `attendance`, neither declared before).
Both were correct reads against an incomplete row, the same shape as
Rensley's own correction — see `docs/REQUESTFOR-A-B-C.md`.

## Definitions the team must agree on

This section reads "before implementation, define" from the day the contract
was drafted, and implementation has since answered most of these — in code,
not in a team decision recorded here. What each product actually checks
today: an active member is `membership_status === "active"`
(`MembershipStatus` in `contract.ts`); a no-show is
`attendance_status === "no_show"`; a current policy is `is_current === true`;
a canceled reservation is `reservation_status === "canceled"`; a full class is
zero seats left after `reserved` rows are counted, never `waitlisted` or
`canceled` ones; underbooked is fill below 70% (`UNDERBOOKED_BELOW` in
`app/products/b-dashboard/dashboard.ts`). A recent attendance drop is the one
that is NOT settled: Product D flags a member quiet for 14 days, and that
threshold is stated everywhere as Rensley's proposal, not a team decision —
see `docs/SENIOR-DEV-BRIEF.md`. Read the code for what a value IS; read
`docs/REQUESTFOR-A-B-C.md` for which of these the team has actually agreed to
versus which one developer decided alone.

## Decisions required before building

This section asked questions building has since answered. JSON, not CSV or
another format — `app/shared/fixtures.json` and `data/staff-records.json`.
Timezone is one IANA string carried in `PublicFixtures.timezone`, read by
every product through `todayIsoInZone()` rather than each computing its own.
ID format and enum values are typed in `app/shared/contract.ts`, the one
place a rename has to happen for every reader to see it. A missing or
conflicting record is a refusal, not a guess: `scripts/check-fixtures.mjs`
fails the gate rather than letting an unresolved reference or an illegal
status reach a screen.

Who owns updates to the schedule and policy records remains genuinely open —
both files are team-owned ground under `CLAUDE.md`, which means change with
agreement stated in the PR, not "whoever gets there first."

Data permissions are enforced, not merely defined: a member sees only their
own schedule and reservations; attendance and cancellation-risk data never
reaches the member chatbot, because `loadFixtures()` returns `PublicFixtures`
— a type with no member, attendance or risk field to read in the first
place, so importing one is a compile error rather than a runtime leak — and
the chatbot's own privacy boundary separately refuses a private-member
question before any network request is made. Rensley's outreach tool has
never sent a message automatically — every draft goes to staff review, which
is the language law now, not a proposal.

Finally, agree on the repository workflow: one branch per product or approved
shared increment, focused commits, pull-request review before merging, and no
product should silently change a shared field without team agreement.

## Review worksheet

Each owner should add answers below before implementation:

| Owner | Product | Required fields | Fields created/updated | Open questions |
| --- | --- | --- | --- | --- |
| Kerrian | Product A | `member`, `class_session` public fields, remaining spots, `studio_policy` (the current cancellation policy, shown beside Cancel), and the studio's own bookings for occupancy | `reservation` — `reserved`, `waitlisted` and `canceled`, append-only, last row wins | A test persona stands in for auth; availability counts are public. The log is scoped to ONE schedule: session ids move when the studio's date does, so a log written on another date is let go rather than resolved (`reconcileSchedule()`) |
| Manny | Product B | `member.display_name`, `class_session` (id, type, level, start, capacity, status), `instructor.display_name`, the studio's bookings and `attendance` for rosters, and Product A's `reservation` log | `pulse-schedule-b` — classes a staff member adds for the coming week, product-local | Read this row rather than the "TBD" that stood here from the first draft until 2026-08-23. The open question is real and unchanged: whether the dashboard will ever RECORD attendance, or only show it |
| Dennis | Product C | `class_session.session_id/class_type/level/starts_at/ends_at/session_status`, every `studio_policy` field, and the fixture timezone envelope | None of its own — both collections are read-only. The SHARED assistant mounted on the page (`app/shared/components/assistant.ts`) can book for a signed-in member, and when it does it writes a `reservation` row into Product A's log after its own capacity check — never the model's word for it | The hosted `/api/chat` question is answered: the studio's own server holds the key and the browser never sees it (`scripts/start-haiku.mjs`, `docs/the-server.md`). Unset key means the assistant says it is unavailable rather than inventing a reply |
| Rensley | Product D | `member.member_id/display_name/membership_status`, `membership.status/renews_on`, `reservation.member_id/session_id/reservation_status`, `attendance.member_id/session_id/attendance_status/recorded_at`, `class_session.class_type/instructor_id`, `instructor.display_name` — reached through `/api/staff/records` since 2026-08-22, because records naming a person no longer sit under `app/` | None shared — product-local draft messages only, never sent automatically | Ratify 14/60-day drop-off thresholds; what does a missing attendance record mean for a reserved session; names vs. anonymized IDs on staff screens |

Product briefs: [Product A](PRODUCT_A_MEMBER_BOOKING_APP.md),
[Product B](PRODUCT_B_STAFF_SCHEDULING_DASHBOARD.md),
[Product C](PRODUCT_C_MEMBER_SUPPORT_CHATBOT.md), and
[Product D](PRODUCT_D_MEMBER_REENGAGEMENT_TOOL.md).
