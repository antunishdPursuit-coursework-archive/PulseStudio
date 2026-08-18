# Pulse Studio

## Project 4: Membership Studio

Pulse Studio is a single-location boutique fitness studio offering group
classes such as yoga, cycling, and HIIT. Members pay a recurring monthly
membership for access to a set number of classes, rather than paying per visit.
The studio is run by an owner and a small group of instructors who each teach a
regular weekly schedule of classes.

## Business model type

Pulse Studio uses a membership model. Members pay a recurring monthly fee for
ongoing access to a set number of classes. It is similar to a subscription, but
it supports an in-person physical service rather than software.

## Customers and users

There are two user groups:

- **Members** have an active membership and want to see the class schedule and
  reserve a spot.
- **Studio staff** include the owner and instructors. They need to see class
  rosters and capacity and identify members who might be at risk of canceling.

## Common pain points

- Members have no easy way to see the full week's class schedule and reserve a
  spot in advance, so classes fill up or sit empty unpredictably.
- Staff have no simple way to see, at a glance, which upcoming classes are
  underbooked and might need to be promoted or canceled.
- The studio has no way to notice a member who has quietly stopped coming until
  after they have already canceled their membership.
- Members have common questions about class levels, what to bring, and the
  cancellation policy that take staff time to answer one at a time.

## Product suite

Each teammate builds one product:

### Product A: Member Booking App

Lets a member view the week's class schedule and reserve a spot in a specific
class.

### Product B: Staff Scheduling Dashboard

Shows staff the roster and capacity for each upcoming class, flagging any class
that is significantly underbooked.

### Product C: Member Support Chatbot

Answers member questions about class levels, what to bring, and studio
policies using the studio's actual current class schedule and policies.

### Product D: Member Re-engagement Tool

Identifies members whose attendance has recently dropped off and drafts a
personalized outreach message staff can send.

## Team assignments

| Product | Owner |
| --- | --- |
| Product A: Member Booking App | Kerrian |
| Product B: Staff Scheduling Dashboard | Manny |
| Product C: Member Support Chatbot | Dennis |
| Product D: Member Re-engagement Tool | Rensley |

## How the team builds

The app lives in `app/` — plain HTML, CSS, and TypeScript, no framework. Each
product has its own folder under `app/products/`; the shared vocabulary, theme,
and fixtures live in `app/shared/` and are team-owned. The working agreement
every developer's AI follows is [CLAUDE.md](CLAUDE.md) — read it before the
first edit. Gate before committing: `npm run check`. Run it with
`npm install && npm run build && npm run start`, then open
http://localhost:4173.

## Current phase

Problem framing and shared project setup. The team will agree on the shared
studio data definitions and handoff boundaries before building separate MVPs.

See [SHARED_DATA_CONTRACT.md](SHARED_DATA_CONTRACT.md) for the draft shared
data contract and team review worksheet.

Product briefs are available for [Product A](PRODUCT_A_MEMBER_BOOKING_APP.md),
[Product B](PRODUCT_B_STAFF_SCHEDULING_DASHBOARD.md), and
[Product D](PRODUCT_D_MEMBER_REENGAGEMENT_TOOL.md). The Product C brief will be
added when its owner is ready to define their increment.
