# docs — how this team works

Process documents for the people building Pulse Studio. These sit OUTSIDE
`app/` on purpose: `app/` is the studio's product and is what deploys;
`docs/` is how we build it and ships to nobody.

| Document | What it settles |
| --- | --- |
| [styling.md](./styling.md) | Where every style lives (shared vs your folder), why we do not use Sass, when a comment is required — enforced by `scripts/check-styles.mjs` at the gate |
| [styles-baseline.json](./styles-baseline.json) | The style duplication that existed the day the gate landed, with the owner who can delete each one. This list only shrinks. |
| [audience-baseline.json](./audience-baseline.json) | Builder names and product letters still visible in customer copy, with the owner who can clear each. This list only shrinks. |
| [published-baseline.json](./published-baseline.json) | Everything `app/` serves at a public URL that is not the website, with the owner of each and why it is allowed to sit there. This list only shrinks. |
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
  | No secrets and no keys in a public repo | root `CLAUDE.md` (the git law) | `scripts/check-secrets.mjs` (current file contents only — it cannot see history, and says so) |
  | Copy speaks to its user, never about the project | root `CLAUDE.md` (the audience law) | `scripts/check-audience.mjs` (reads static copy on consumer pages; the storytold page and the readiness board are named exemptions with reasons, in [audience-baseline.json](./audience-baseline.json)) |
  | Nothing under `app/` is private | root `CLAUDE.md` (the filing law) | `scripts/check-published.mjs` (fails on a NEW file under `app/` that the website would never ask for; the ones already there are in [published-baseline.json](./published-baseline.json)) |

  Each runs inside `npm run check`, each carries `--self-test`, and each
  states the counts it actually reached rather than passing in silence.
- **Prove the check can fail.** A check that only ever passes is
  indistinguishable from a broken one. Every gate here carries a
  self-test that plants a known-bad case (`--self-test`), and was run
  against a real planted fault before it shipped.

  The unit SUITES had no equivalent, and on 2026-08-21 a check was written
  in the re-engagement suite that could not fail at all — it asserted that
  two equal strings were equal. `npm run mutate` answers the question for a
  whole module: it changes one token in the compiled output, reruns the
  suite, and puts the file back. First run on the re-engagement engine: 143
  mutations, 110 caught, 33 survived. Reading the survivors found three real
  gaps — every guard in the date parser masked by the one after it, the
  "usually X" chooser returning most-RECENT instead of most-COMMON without
  a single check noticing, and an evidence line whose four branches were
  only ever tested at two corners. Closing them took it to 116 of 143.

  It is deliberately NOT in `npm run check`: the number is a survey of the
  suite, not a property of the code, and failing a build on it would teach
  people to delete checks to keep a percentage up.
- **A stated negative beats an absence.** "0 new duplicates in 4
  stylesheets" is a result; a silent pass is not.
- **Never write a count you cannot keep true.** Numbers in prose go stale;
  where a number matters, say where to read it live.

  This is the one standard here with no gate behind it, and that is a
  decision rather than an omission — but the decision has been restated,
  because the reason first given for it turned out to be false.

  **It said "the failure is rare". It is not.** 2026-08-21 alone: five
  instances found and removed in the morning (four documents naming a check
  count, and a public page saying a session was "32 checks deep"); then the
  phrase "four gates" left stale in six documents by the commit that added a
  fifth; then a whole table in `SENIOR-DEV-BRIEF.md` in which every number
  was wrong — `logic.ts` listed at 185 lines against 905, `tests.ts` at 585
  against 2549, the suite at 75 checks against 435 — inside the document
  that carries this very lesson. Three separate recurrences in one day is a
  standing hazard, not a rarity.

  **What still holds is the other half.** A gate for it is buildable: the
  mention-versus-use rule `check-language.mjs` already uses separates a
  number QUOTED while explaining that it went stale from one asserted as
  fact, and prototyping produced one false positive in seven hits. It stays
  unbuilt because those false positives land on anyone legitimately
  discussing a number, which is most of the writing in `docs/`, and a gate
  that cries wolf about prose teaches people to ignore gates.

  **Two narrower gates were measured and rejected the same day**, recorded
  so nobody re-derives them. Every path-shaped string in the docs: 471
  references, 107 unresolved, and nearly all of those false — bare filenames
  used as shorthand (`contract.ts` for `app/shared/contract.ts`), URL paths
  for served pages, and gitignored build output. Explicit markdown links
  only: 32 of them, all resolving, so the gate would guard nothing that is
  broken — and it would not have caught the miss that prompted the search,
  because the file that did not exist was a backticked cell in a table, not
  a link.

  **So the countermeasure is structural, not a gate: do not write the
  number.** The file table in `SENIOR-DEV-BRIEF.md` lost its Lines column
  rather than gaining correct values, because the correct values are wrong
  again next week. What a file DOES stays true.

  The pattern to watch, since a person has to: `styling.md` gets this right
  by writing "**13** the day this landed" and naming the file to count it
  in. A bare "32 checks" is a snapshot of one afternoon dressed as a
  property of the code.
- **Say the limits out loud.** Every gate here documents what it does NOT
  catch. A checker that oversells itself is worse than none.
