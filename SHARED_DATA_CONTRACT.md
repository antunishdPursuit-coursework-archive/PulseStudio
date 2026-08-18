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
| `renews_on` | date | Next renewal date, if active |
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
| Member Booking App | Kerrian | `member`, `membership`, `class_session` | `reservation` |
| Staff Scheduling Dashboard | Manny | `class_session`, `instructor`, `reservation` | Product-specific flags only |
| Member Support Chatbot | Dennis | `class_session`, `studio_policy` | No shared records in MVP |
| Member Re-engagement Tool | Rensley | `member`, `membership`, `reservation`, `attendance` | Draft outreach only; no automatic sending |

## Definitions the team must agree on

Before implementation, define what counts as an active member, an underbooked
class, a recent attendance drop, a full class, a no-show, a current policy, and
a canceled reservation. Do not hard-code thresholds until the group agrees on
them and records the reason.

## Decisions required before building

The team will use one shared fixture set for the MVPs. The remaining decision
is whether that fixture is stored as JSON, CSV, or another simple format, plus
who owns updates to the schedule and policy records. We also need a consistent
timezone, ID format, enum values, and rule for handling missing or conflicting
records.

The group should define data permissions: members may see their own schedule
and reservations, while staff-only attendance and cancellation-risk data must
not be exposed through the member chatbot. Rensley's outreach tool should
always produce a draft for staff review rather than send a message
automatically.

Finally, agree on the repository workflow: one branch per product or approved
shared increment, focused commits, pull-request review before merging, and no
product should silently change a shared field without team agreement.

## Review worksheet

Each owner should add answers below before implementation:

| Owner | Product | Required fields | Fields created/updated | Open questions |
| --- | --- | --- | --- | --- |
| Kerrian | Product A | TBD | TBD | TBD |
| Manny | Product B | TBD | TBD | TBD |
| Dennis | Product C | TBD | TBD | TBD |
| Rensley | Product D | `member.member_id/display_name/membership_status`, `membership.status/renews_on`, `reservation.member_id/session_id/reservation_status`, `attendance.member_id/session_id/attendance_status/recorded_at`, `class_session.class_type/instructor_id`, `instructor.display_name` | None shared — product-local draft messages only, never sent automatically | Ratify 14/60-day drop-off thresholds; what does a missing attendance record mean for a reserved session; names vs. anonymized IDs in the demo |

Product briefs: [Product A](PRODUCT_A_MEMBER_BOOKING_APP.md) and [Product B](PRODUCT_B_STAFF_SCHEDULING_DASHBOARD.md).
