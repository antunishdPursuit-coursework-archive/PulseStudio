# Shared Synthetic Studio Data Engine

**Location:** `app/shared/synthetic/` — TEAM-OWNED shared infrastructure.
**Status:** built on the owner's direction; the contract is **PROPOSED** until
Kerrian, Manny, and Dennis ratify it — but proposed has stopped meaning
unused. This said "nothing outside this folder depends on these types, and
no product folder was touched" until 2026-08-22, and by then every product
folder imported from here: `a-booking/main.ts` and `c-chatbot/main.ts`
directly, `d-reengagement` through its `deps.ts` seam, `b-dashboard`
through `staff-dashboard.js`. So does the shared session layer —
`auth/studio.ts` generates the studio sign-in resolves against, and
`auth/sign-in.ts` and `components/topbar.ts` speak `SyntheticMember`. What
ratification decides now is whether these shapes get renamed underneath
code already running on them.

One deterministic, normalized, fictional studio — up to 500 members with
memberships, instructors, class sessions, bookings, and attendance that all
refer to the same entities. Not four generators: **one studio, one identity
system, one source of truth**, consumed consistently by every product through
its own adapter.

## The contract's position (the decision the team ratifies)

**Membership periods are authoritative.** A member's current status is
derived from their period history as of the dataset's `asOfDate`; the member
row's `currentStatusSnapshot` is a labeled convenience that validation asserts
against the periods. When they disagree, the periods win.

Identity: every entity carries a stable, opaque, namespaced id
(`member:000042`). Names and emails are attributes, never keys — relationships
join by id only. Names are never slugged, fuzzy-matched, or merged; emails are
trimmed and case-folded, nothing more; every email uses the reserved
`.invalid` TLD so no real personal information can exist by construction.

Time: strict `YYYY-MM-DD` dates and strict `YYYY-MM-DDTHH:MM:SS` studio-local
timestamps, timezone stated once in the meta. The pure engine never reads the
runtime clock — `asOfDate` always arrives as data.

## Files

| File | Role |
| --- | --- |
| `contracts.ts` | The authoritative schema + namespaced id helpers |
| `config.ts` | Deterministic configuration and its guard-rails |
| `random.ts` | Independent named streams (identity draws can never reshuffle attendance) |
| `normalize.ts` | Conservative normalization + strict calendar arithmetic |
| `identity.ts` | Stable ids, fictional names (Unicode preserved), `.invalid` emails |
| `lifecycle.ts` | Membership periods: derivation and coherence |
| `schedule.ts` | Non-overlapping daily class schedule, past + 14 days ahead |
| `scenarios.ts` | Cohort plans — the behavioral intent behind every member |
| `generate.ts` | The orchestrator: one lifecycle, anchors first, loud failures |
| `validate.ts` | The gatekeeper: zero problems (clean) or exactly-declared (edge) |
| `serialize.ts` | Stable JSON out, validated shape back in |
| `tests.ts` / `tests.html` | The browser-run proof suite with measured 500-member performance |
| `index.html` / `page.ts` | The reporting UI: generate, inspect, download locally |

## Modes

- **clean** — every invariant holds; validation must return zero problems or
  the dataset is not published.
- **edge-cases** — the clean build plus **declared** defects (orphan
  references, duplicate and conflicting attendance, an unreadable timestamp,
  future attendance, over-capacity, attendance during a pause, overlapping
  attendance, a lying snapshot). The validator must find exactly the declared
  list: every declared defect found, nothing undeclared found — the injector
  and the validator hold each other to account.
- **scale** — the clean rules at the configured population, up to 500
  members, with measured generation + validation time.

## Cohorts

Regulars, ordinary members, newcomers without attendance, recently quiet,
long-lapsed, paused, resumed, canceled, returning-after-a-gap, no-show-prone,
class-preference switchers, two different members sharing one name, and
Unicode-named members — plus guaranteed Product-D boundary members at exactly
14, 15, 60, and 61 quiet days. Behavior is intent, not uniform noise: members
have favourite classes and instructors, cadences, and histories that read as
people.

The **anchor discipline** makes truth exact: every attending member's last
visit is placed first, earlier history fills strictly before it, so realized
last-attended always equals planned intent — and the validator holds the
records to the truth metadata.

## Truth metadata (independent by construction)

`SyntheticTruth` carries expected cohorts, current statuses, quiet days,
re-engagement eligibility (the shared policy: active AND quiet > 14 AND
≤ 60), dashboard metrics, and declared violations. It is computed from
construction intent — **never by importing a product's engine** — so it can
catch product defects instead of repeating them. The proof suite audits the
shipped engine sources: no product imports, no network calls, no clock reads.

## Consumption model (one-way dependencies)

```
shared synthetic records
        ↓
Product A adapter   (Kerrian's lane)
Product B adapter   (Manny's lane)
Product C adapter   (Dennis's lane)
Product D deps.ts   (Rensley's lane)
```

Products may depend on shared contracts; shared code never depends on a
product. Integration is a separate increment per owner, in their own folder.

## Migration (nothing is deleted today)

1. This engine generates and validates alongside the legacy
   `app/shared/fixtures.json`.
2. Each owner adds an adapter in their own lane and compares old vs new.
3. The shared source switches only after all four products pass.
4. Retiring the legacy fixtures is a separate team decision.

## Unresolved team decisions

1. Ratify the contract — above all, periods-are-authoritative.
2. Whether the legacy shared contract eventually adopts these shapes.
3. Per-product adapters (each owner's lane, their timing).
4. Linking this page from the front door (`app/index.html` is team-owned).
5. Whether walk-in attendance (no booking) survives ratification.

## Run it

From the repo root: `npm install && npm run build && npm run start`, then
open `http://localhost:4173/shared/synthetic/` — the proof suite lives at
`/shared/synthetic/tests.html` and states its verdict as
"N checks run, N passed, 0 failed" with measured 500-member timings.
