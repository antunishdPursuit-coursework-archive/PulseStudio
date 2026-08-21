# docs — how this team works

Process documents for the people building Pulse Studio. These sit OUTSIDE
`app/` on purpose: `app/` is the studio's product and is what deploys;
`docs/` is how we build it and ships to nobody.

| Document | What it settles |
| --- | --- |
| [styling.md](./styling.md) | Where every style lives (shared vs your folder), why we do not use Sass, when a comment is required — enforced by `scripts/check-styles.mjs` at the gate |
| [styles-baseline.json](./styles-baseline.json) | The style duplication that existed the day the gate landed, with the owner who can delete each one. This list only shrinks. |
| [contrast-baseline.json](./contrast-baseline.json) | The accent colours that were below WCAG AA the day `check-contrast.mjs` landed, with the owner who can clear each one. A developer's colour is theirs, so nobody else clears these. This list only shrinks. |
| [member-support-haiku.md](./member-support-haiku.md) | How Product C runs with Haiku locally, plus the marked member-safe guidance the local server reads on every question |
| [REQUESTFOR-A-B-C.md](./REQUESTFOR-A-B-C.md) | What Product D needs from A, B and C, and what D gives back — one section per teammate, each ending in ONE ask |
| [SENIOR-DEV-BRIEF.md](./SENIOR-DEV-BRIEF.md) | The whole of Product D in one file: what it does, how it is proven, and every open question — written to be read start to finish by someone new |

Both of the last two moved here from `app/products/d-reengagement/` on
2026-08-21. They had been sitting inside the deploy folder, which meant the
live site served them: anyone could fetch the team's internal brief from the
public URL. Nothing under `app/` is private, so nothing internal goes there.

**The rules themselves live elsewhere, on purpose:** `CLAUDE.md` at the repo
root is the working agreement every AI and developer reads first, and
`app/shared/CLAUDE.md` covers shared ground. A process doc explains HOW to
follow a law; it never becomes a second copy of the law.

## The standard every document here is held to

Borrowed from harder projects, and each one is here because ignoring it
cost somebody a day:

- **A rule nobody can check is a wish.** If a doc states a rule, something
  should be able to fail when the rule is broken — a gate, a test, a
  script. `styling.md` has `scripts/check-styles.mjs`.

  The table below is the list of which laws have one. It is a table and not
  a number in this sentence because the number has changed every time
  somebody read this page, and a count in prose is a second thing to keep
  true — the standard two bullets down says so.

  The reason the language and no-attribution laws got gates is the standard
  proving itself: both were stated in six files each and enforced by
  nobody, so `npm run check` printed 314 checks and 0 failures while the
  root data contract used a banned word on line 162. The lane law's reason
  is the same shape but worse, because that law is the one holding the
  four-person model up: on 2026-08-20 a single commit edited three other
  developers' product folders, and the only thing that had ever stood
  between the repo and that was good manners.

  | Law | Stated in | Enforced by |
  | --- | --- | --- |
  | Where styles live | [styling.md](./styling.md) | `scripts/check-styles.mjs` |
  | The words we do not use, and no AI as a contributor | root `CLAUDE.md` | `scripts/check-language.mjs` |
  | The shared vocabulary the records must speak | root `SHARED_DATA_CONTRACT.md` | `scripts/check-fixtures.mjs` |
  | The shared fixture still demonstrates what it claims to | the product briefs' acceptance checks | `scripts/check-fixtures.mjs` (the one place that reads the real clock, on purpose — it prints the countdown every run) |
  | Every developer's colour has to be readable | root `CLAUDE.md` (the colour law) | `scripts/check-contrast.mjs` |
  | Nobody edits another developer's folder | root `CLAUDE.md` (the lane law) | `scripts/check-lanes.mjs` (reads only what this branch adds to `origin/main`, skips merges, and counts team-owned changes it cannot judge) |

  Each runs inside `npm run check`, each carries `--self-test`, and each
  states the counts it actually reached rather than passing in silence.
- **Prove the check can fail.** A check that only ever passes is
  indistinguishable from a broken one. Every gate here carries a
  self-test that plants a known-bad case (`--self-test`), and was run
  against a real planted fault before it shipped.
- **A stated negative beats an absence.** "0 new duplicates in 4
  stylesheets" is a result; a silent pass is not.
- **Never write a count you cannot keep true.** Numbers in prose go stale;
  where a number matters, say where to read it live.

  This is the one standard here with no gate behind it, and that is a
  decision rather than an omission. Five instances were found and removed on
  2026-08-21 — four documents naming a check count, and a public page saying
  a session was "32 checks deep". A gate for it is buildable: the same
  mention-versus-use rule `check-language.mjs` already uses separates a
  number being QUOTED while explaining that it went stale from a number
  being asserted as fact, and prototyping it produced exactly one false
  positive out of seven hits. It is not built because the failure is rare,
  costs a stale sentence rather than a wrong answer, and the false positives
  would land on anyone legitimately discussing a number — which is most of
  the writing in `docs/`. A gate that cries wolf about prose teaches people
  to ignore gates.

  The pattern to watch, since a person has to: `styling.md` gets this right
  by writing "**13** the day this landed" and naming the file to count it
  in. A bare "32 checks" is a snapshot of one afternoon dressed as a
  property of the code.
- **Say the limits out loud.** Every gate here documents what it does NOT
  catch. A checker that oversells itself is worse than none.
