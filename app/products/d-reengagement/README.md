# Member Re-engagement Tool (Product D)

**Owner:** Rensley · **Lane:** this folder only · **Color:** violet

Staff open one page and see which active members used to come and have gone
quiet, why each one was flagged, and a ready personal message to copy or open
in their own email app. Nothing here sends — staff send every message
themselves, and the studio mailbox rides along as BCC for the record.

## The rule (proposed, awaiting team ratification)

Flag a member when all of these hold, measured in studio-local calendar days:

- `membership_status` is `active` — paused, canceled, and expired are
  different conversations, and never-attended members are onboarding, not
  re-engagement
- their most recent `attendance_status = "attended"` record is **more than
  14 and at most 60 days old** — a `no_show` or `unknown` is never a visit
- flagged members rank by attendance in the 60 days before they went quiet,
  most frequent first — the most valuable save on top

## Files

| File | What it is |
| --- | --- |
| `config.ts` | Every brand-specific value: studio name, mailbox, thresholds, the outreach voice |
| `logic.ts` | Pure rule functions — no DOM, no clock, no fetch; "today" is a parameter |
| `main.ts` | The page: loads shared fixtures, renders flags, evidence, drafts |
| `styles.css` | Violet-on-black/white styling over the shared theme tokens |
| `tests.ts` / `tests.html` | Browser-run unit checks with a pinned reference date |

## Run it

From the repo root: `npm install && npm run build && npm run start`, then open
http://localhost:4173/products/d-reengagement/ — the unit checks live at
`/products/d-reengagement/tests.html` and state their verdict as
"N checks run, N passed, 0 failed".

## Reproduce this for another studio

This product is built to be rebranded without touching its logic:

1. `config.ts` — new studio name, mailbox, voice, and (if ratified
   differently) thresholds.
2. The shared theme's accent token for this product — one color change
   recolors every control, glow, and pill on the page.
3. That's the whole list. The rule, evidence, and checks carry over as-is.

## Laws this product lives by

Read-only over shared records (fixtures are byte-identical after any use).
Draft-only forever — no send action exists. Staff-only surface
(`noindex, nofollow`). Stated results everywhere: the page says
"5 members checked, 1 flagged", never a blank panel.
