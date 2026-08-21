# app/shared — working rules for the AI on team-owned ground

**Everything in this folder is TEAM-OWNED.** No single developer owns it,
so no change happens silently: state the agreement in the commit AND the
PR, and never rename a shared identifier — the vocabulary here
(`member_id`, `display_name`, `membership_status`, snake_case throughout
the legacy contract) is what all four products speak.

## What lives here

| Area | What it is |
| --- | --- |
| `theme.css` + `theme-boot.ts` | The appearance rules as code: built-in `--bg` light/dark stays white/black, an accessible custom background/text pair is allowed, and four developer accents are scoped by `body.product-a\|b\|c\|d`; the boot persists theme preferences AND auto-mounts the session chip into any `.topnav`/`.page-head`/`.topbar` (opt out: `<body data-no-session>`) |
| `contract.ts` + `data.ts` + `fixtures.json` | The legacy shared vocabulary (typed mirror of root `SHARED_DATA_CONTRACT.md` — if they disagree, STOP and raise it) and `loadFixtures()`, the one legacy loader |
| `auth/` | The v1 `pulse-session` contract (versioned, discriminated member/staff, hostile-input reader, and a browser suite in `auth/tests.html` that states its own count), the shared studio directory (`studio.ts`), and the future-hosted Postgres schema (`schema.sql` — a design document; nothing runs it) |
| `brand.ts` | THE clone seam: the studio's name, rendered into every header at runtime — see `components/README.md` for the four-file rebrand checklist |
| `components/` | Pieces every page shows, no page owns: `brand-header.ts` (fills `.home-brand .brand-word` + `[data-studio-name]` from `brand.ts`), `logo.ts` (the pulse mark, callable), `topbar.ts` (the sign-in control) — each documented in `components/README.md` |
| `synthetic/` | The deterministic studio engine: seeded generation to 1000×5yr, cohort intent with guaranteed D-boundary members (14/15/60/61 quiet days), independent truth answer key, a validator with exact declared/found reconciliation, CSV export in D's import vocabulary, and a browser suite in `synthetic/tests.html` that states its own count |
| `home.css` | Front-door-only styles, scoped under `body.home` so they cannot leak into a product |

## The load-bearing facts (each one has bitten or will)

- **Two data vocabularies coexist ON PURPOSE**: the legacy snake_case
  contract (`contract.ts`/`fixtures.json` — still the official
  `loadFixtures()` source) and the camelCase synthetic contract
  (`synthetic/contracts.ts` — PROPOSED, unratified). Do not "unify" them;
  that is an explicit open team decision.
- **`auth/studio.ts` dates the studio to TODAY** (studio-local), so the
  sign-in roster shifts with the real calendar and a remembered
  `member_id` can go stale overnight — `readPulseSession()` then signs
  out silently by design. The pure engine itself never reads the clock;
  `synthetic/tests.ts` greps the shipped sources to enforce it. What it
  actually forbids, corrected 2026-08-21 because this line overstated it:
  a product import, a network call (`fetch(`, `XMLHttpRequest`,
  `WebSocket`, `EventSource`, `sendBeacon`), a clock read (`Date.now(`,
  `Date()`, `new Date()`, `new Date` with no parens, `performance.now(`),
  and unseeded randomness (`Math.random(`, `crypto.getRandomValues`,
  `randomUUID`) — even in a comment. `new Date(value)` is LEGAL and
  `normalize.ts` uses it twice: round-tripping a calendar date is
  arithmetic, not a clock read. Unseeded randomness was added to that list
  the same day; before then nothing checked for it, in an engine whose
  every promise rests on being reproducible from a seed.
- **Product A consumes the compatibility view** (`currentSession()` /
  `onSessionChange()`, reading `.role` and `.member_id`). Do not remove
  those exports until Kerrian migrates in his own lane.
- **Future-version `pulse-session` values are deliberately NOT deleted**
  ("not ours to destroy") — a cleanup that wipes unrecognized versions
  breaks the contract and its test.
- **`writePulseSession()` does not member-validate writes** — the
  guard-looking if-block is comment-only; the READ side clears unknown
  members. Tests cover the read side. Read the comment before "fixing".
- **Serialization order is contract**: every synthetic collection sorts
  ascending by id, byte-for-byte reproducible; the validator has an
  `unsorted-collection` check.
- **The validator scans for leaks**: record keys matching
  `/^(cohort|group|expected|eligib|quiet)/i` fail (answer-label-leak), as
  do 13–19-digit or exact-9-digit runs in any string value
  (sensitive/PII patterns). Name new fields accordingly.
- **`upcomingFillTarget` (0..1, optional) tops up upcoming sessions** to a
  deterministic occupancy band (≈target−25%..target+15%, per-session
  variance, capacity never exceeded, one seat per member, active members
  only, booked the evening before the class). UNSET = byte-identical to
  the pre-knob generator; ignored in edge-cases mode. Added for the
  capacity dashboard; proven by the "fill knob" block in
  `synthetic/tests.html`.
- **The studio's rhythms are CALIBRATED, not invented** — see
  `synthetic/CALIBRATION.md`. Slot priority comes from published real-gym
  check-in distributions (a morning peak and a bigger evening peak). It is
  a 2024 SNAPSHOT and nothing about it is live: the engine forbids network
  calls and clock reads, and no surface may claim otherwise.
- **Edge-cases mode must reconcile EXACTLY** — every declared defect
  found, nothing undeclared; EC7/EC8 conditionally skip declaration when
  the population can't support the injection. Copy that discipline for
  any new injection.
- **The chip mounts by header class**: renaming `.topnav`, `.page-head`,
  or `.topbar` in a product silently removes sign-in from that page. The
  selector is in `theme-boot.ts`, NOT in `components/topbar.ts` — topbar
  exports `mountSessionControl(host)` and theme-boot is what finds the host.
  Worth naming, because looking for it in the obvious file finds nothing.
- Shared infrastructure pages carry NO product color — black, white, and
  neutrals only; only product pages set `product-a|b|c|d`.

## Storage keys owned here

`pulse-session` (the ONE session key — hostile-input rules apply),
`pulse-theme`, and `pulse-theme-custom` (the saved custom background/text
pair). `pulse-reservations-a` belongs to Product A and is data, not identity.

## Gate

`npm run check` + `npm run build` green before any commit; the browser
proof suites (`auth/tests.html`, `synthetic/tests.html`) are the real
behavior checks — run them after touching what they cover and report the
"N checks run, N passed" line. All repo laws apply, and one more bites
here: compiled `.js` sits beside every `.ts` and is gitignored — edit
`.ts` only, import with `.js` specifiers (browser ES modules).

> AGENTS.md beside this file is a generated mirror for non-Claude
> assistants — edit THIS file, then run `bash scripts/sync-agent-briefs.sh`.
