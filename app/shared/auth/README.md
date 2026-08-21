# The shared session contract (v1) — test persona, not authentication

**TEAM-OWNED.** One versioned browser-session contract for the whole
studio. It is an OPTIONAL continuity feature over fictional records: every
product route opens with no session at all, nothing redirects, nothing is
gated. Browser storage cannot enforce access and no code here claims it
can — real enforcement belongs to the hosted version and its server.

## The identity rules (v1 — supersedes the v0 email-keyed reading)

- A **member's** authoritative identity is the **immutable member id** the
  shared records already carry (`SyntheticMember.id`, `member:000001`).
- **Display names are presentation only**: never keys, never slugged,
  Unicode preserved exactly, duplicates allowed, a rename never changes
  who someone is.
- **Email is contact and matching data**, not identity. v1 stores no email
  in the session and derives none — the v0 habit of manufacturing
  `@studio.test` addresses is gone.
- **Staff are their own actor**, not fictional members: Front Desk is
  `{ version: 1, actor_type: "staff", staff_id: "staff:front-desk",
  role: "front_desk", display_name: "Front Desk" }` — no membership row
  exists or may be invented for it.

Field names are the repo's own snake_case vocabulary (`member_id`,
`display_name` — as in `contract.ts` and every product), so the contract
speaks one dialect; the spec's sketched camelCase names were adjusted for
exactly that reason and nothing else.

## The contract

```ts
export type PulseSession =
  | { version: 1; actor_type: "staff"; staff_id: string; role: "front_desk"; display_name: string }
  | { version: 1; actor_type: "member"; member_id: string; display_name: string };

readPulseSession(): PulseSession | null
writePulseSession(session: PulseSession): void
clearPulseSession(): void
subscribeToPulseSession(listener): () => void   // same-tab + cross-tab, deduped, unsubscribable
```

One key — **`pulse-session`** — in `localStorage`, so the optional persona
survives full page loads, tabs, and closing the browser (the same
lifecycle as `pulse-theme`). Stated plainly: convenience persistence, for
testing purposes.

`readPulseSession()` treats storage as hostile input: malformed JSON,
wrong shapes, blank ids, smuggled cross-actor fields, unknown staff ids,
and members who don't exist in the shared studio all read as `null` —
never a throw, never a blocked page — and garbage is cleared so it cannot
wedge sign-in. One deliberate exception: a value whose `version` is newer
than this build is left in place (a newer build may own it) and simply
reads as `null` here. If storage itself is unavailable or throwing, the
page stays usable: the current choice is held in memory for the life of
the page and will not survive navigation — stated behavior.

Member sessions resolve against `studio.ts` — the same deterministic
studio Product A books against — so a remembered `member_id` is always a
real booking identity, and a stale one signs out visibly instead of
lingering.

## What exists

| File | What it is |
| --- | --- |
| `session.ts` | The v1 contract, its defensive reader/writer, events, and the compatibility view |
| `studio.ts` | The one shared studio the dialog lists and sessions resolve against |
| `schema.sql` | The Postgres schema for the hosted version — `member_id` is the identity there too; email is the login credential |
| `tests.html` / `tests.ts` | 32 browser-run checks, written failing-first against this API |
| `../components/topbar.ts` | The sign-in control: member picker (name · member id · status — no emails), Front Desk as a separate staff row, chip + Sign out |

## The compatibility view (temporary, by design)

Product A adopted the earlier session API in its own lane
(`currentSession()` / `onSessionChange()`, reading `.role` and
`.member_id`). Products are read-only to shared-infrastructure work, so
`session.ts` keeps those two exports as a **derived view over the v1
contract** — same key, same validator, one source of truth, so the two
views cannot disagree. When A's owner moves to `readPulseSession()` in
their own lane, the view retires.

## Owner integration notes (each in their own lane, their call)

- **Kerrian / Booking** — already reads the shared session; when
  convenient, switch `currentSession()` → `readPulseSession()` and branch
  on `actor_type` instead of `role`.
- **Manny / Scheduling** — the dashboard loads `theme-boot.js` and carries
  the chip already. `pulse-reservations-a` (A's runtime reservations) is
  data, not identity — no action needed.
- **Dennis / Support** — the chip is already on the page; the chatbot may
  branch on `actor_type` to avoid staff-flavored answers for members.
- **Rensley / Re-engagement** — suggested disclosure when showing shared
  fixture records (not part of this patch): "These are the shared
  records. Add your studio's attendance export above to review your own
  records; the file stays in this browser and is never uploaded."

A page that should not carry the chip (a proof page) opts out with
`<body data-no-session>`.
