# Product D — working rules for the AI in this folder

You are in **Rensley's lane**: Product D, the Member Re-engagement Tool.
These rules were each paid for at least once. Follow them exactly.

## The git law that keeps biting

**The session's working directory RESETS between turns**, and this repo is
usually NOT the session's primary cwd. A bare `git` command has run in the
wrong repository twice — once nearly merging into a production codebase.
Therefore: **every git command carries `-C /Users/Rensley/Desktop/pulseStudio/PulseStudio`**
(or an explicit `cd` inside the same compound command). No bare git, ever.

## Lane law

- Create and edit files ONLY in `app/products/d-reengagement/`.
- `app/shared/`, `app/index.html`, root docs, `package.json`, `.github/`
  are TEAM-OWNED — change only with agreement stated up front, in the
  commit and the PR.
- `a-booking/`, `b-dashboard/`, `c-chatbot/` are other people's work.
  Never edit them for any reason; defects found there go in
  `docs/REQUESTFOR-A-B-C.md` as a note to that owner.
- Outside imports flow through `deps.ts` only — it is the portability seam.

## The live trail (2026-08-20)

The page's DEFAULT records are the RUNNING studio: `live-studio.ts` builds
a contract `FixtureSet` from `sharedStudio()` (the same cached dataset
Booking books against and sign-in lists) and merges in Booking's published
reservation log — localStorage `pulse-reservations-a`, read defensively,
NEVER imported from A's code. Last row wins, exactly as Booking reads its
own log. `upcomingReservedMemberIds()` (logic.ts) then keeps a quiet member
who already booked back in OUT of the outreach list, stated by name. The
CSV door and the generated studio remain the other two doors, unchanged.

## Storage keys this product writes

`pulse-outreach-ledger` (notes taken, once per lapse), `pulse-suppressions`
(do-not-contact), and `pulse-storage-probe` — transient, written and deleted
in one breath to find out whether this browser saves site data at all.
Nothing reads the probe, and the shared session listener wakes only for
`pulse-session`, so it never reaches another tab. `pulse-reservations-a` is
Product A's and is READ ONLY here.

## Repo laws

- The words "demo", "example", and "mock" appear NOWHERE — code, comments,
  docs, commits, UI. Sample records are "fixtures"; a generated dataset is
  "synthetic".
- No AI is ever a contributor: no Co-Authored-By, no "generated with", no
  assistant names anywhere. Rensley is sole author; commit messages are
  plain sentences a teammate can read.
- Branch, then merge to main immediately; push each green change; DELETE
  merged branches (GitHub stays uncluttered). Never force-push, never
  rewrite published history.

## Gate — before every commit

```
npm run check     # tsc --noEmit, must exit 0
npm run build     # emits the .js the browser runs (gitignored by design)
```

Then prove it in the browser, never from code reading:
`/products/d-reengagement/tests.html` and `/shared/synthetic/tests.html`
must both state "N checks run, N passed, 0 failed". A claim without a
browser proof is not a result.

## Product laws (from the team contract — not negotiable)

- DRAFT-ONLY: no send action exists or ever will. `mailto:` opens the
  staff member's own client; the human presses send.
- READ-ONLY over shared records; STAFF-ONLY surface (`noindex`, and
  deliberately crawlable so the tag can be read).
- Evidence rules: only `attended` counts as a visit — `no_show` and
  `unknown` never do; "today" is the studio's calendar date, never the
  viewer's clock; future or unreadable dates are never evidence.
- STATED RESULTS: say what was checked and what the evidence supported
  ("5 members checked, 1 flagged … 1 could not be used as evidence"),
  never a blank panel, never a clean answer built on unusable evidence.

## Map

`README.md` here holds the file map, the rebrand checklist, and the
plug-in spec. The proposed 14/60-day thresholds await team ratification.
