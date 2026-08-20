# Sign-in (shared) — test mode today, Postgres when sold

**TEAM-OWNED.** One sign-in for all four products, built so no product
folder had to change to get it.

## The identity law (locked 2026-08-20)

A person is a **member**, identified by **the email on their membership**.
One word in every UI — never customer, client, user, or guest — and one
storage key, **`pulse-session`**, that every product reads. Every identifier
in this folder reuses the name the repo already had: `member_id`,
`display_name`, `membership_status` from `app/shared/contract.ts`, and
`email` as the shared synthetic engine already names it. Nothing renamed,
nothing invented.

## What exists

| File | What it is |
| --- | --- |
| `session.ts` | The session: read/write/clear `pulse-session` in localStorage, change listeners, the test-address rule, the staff test login |
| `schema.sql` | The Postgres schema for the hosted (sold) version — same names, real passwords (hashed), server-enforced sessions |
| `../components/topbar.ts` | The sign-in control every header shows: Sign in button → member picker dialog; signed in → name + Sign out |

## How it works in THIS build (test mode, for testing purposes)

This is a static site — no server, so **no password exists here** and the
dialog says so in the open. Sign in by picking a member from the shared
records; the address shown is derived deterministically as
`display_name-slug@studio.test` (`.test` is a reserved domain — those
addresses can never be real, which keeps the public-repo law that every
person in the fixtures is fictional; a name that slugs to nothing falls
back to `member_id`, so two non-Latin names never collapse into one).
One extra row, **Front Desk (staff)**, exists to test the staff-facing
surfaces. The choice is remembered the simplest way there is: localStorage,
exactly like the black/white theme — it survives closing the browser, and
Sign out forgets it.

## How it works when the site is SOLD (pg)

`schema.sql` is the database: `members` (the contract's shape + email),
`logins` (email is the primary key — the identity law as a constraint;
`password_hash` via pgcrypto; `member_id` nullable for staff), and
`sessions` (server-issued tokens with expiry, replacing the browser-local
key). The session SHAPE the products read does not change — only where it
comes from.

## How every route got sign-in without touching any lane

`theme-boot.js` — already loaded by every page except the staff dashboard —
mounts the control into the page's existing header. So Booking, Support,
Re-engagement, and the front door all carry it with **zero edits inside a
product folder**. The control paints itself with `var(--accent)`, so on
each product's page it wears that builder's color (the color law), and its
dialog surface is `var(--bg)` — black or white only.

A page that should NOT carry the control (a proof page, for instance) opts
out with `<body data-no-session>` — the three test/proof pages do.

## Per-product adoption notes (each owner's call, in their own lane)

- **Kerrian / Booking** — the page keeps its own member picker today; when
  ready, replace it by reading `currentSession()` from
  `../../shared/auth/session.js` and drop the product-local form. One-lane
  change, whenever suits.
- **Manny / Scheduling** — the dashboard doesn't load `theme-boot.js` yet;
  adding that one script tag gives the page the control (and the theme
  toggle) for free.
- **Dennis / Support** — nothing required; the chip is already there. The
  chatbot may greet the signed-in member by `display_name` if wanted.
- **Rensley / Re-engagement** — staff surface; may later read `role` to
  greet staff by name.

None of this is security. A static page cannot enforce who sees what — the
hosted version enforces at the server, which is the entire reason
`schema.sql` exists. Until then the products stay honest about it, the same
way `robots.txt` already spells out.
