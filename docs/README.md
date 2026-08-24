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
| [equivalent-mutants.md](./equivalent-mutants.md) | Survivors `npm run mutate` reports that nobody can close, with the reason each is unreachable — read before chasing one. Also every way the runner itself lied before each was fixed, listed there rather than counted here — this cell said "three" until 2026-08-22, when that document already held more. |
| [hosted-schema.sql](./hosted-schema.sql) | The Postgres schema a sold, hosted copy would use for sign-in. Nothing runs it and nothing opens it; it moved out of `app/shared/auth/` on 2026-08-23 for the same reason the two documents below moved — `app/` publishes everything under it |
| [the-server.md](./the-server.md) | How Product C runs with Haiku locally and which shared records may reach the service |
| [REQUESTFOR-A-B-C.md](./REQUESTFOR-A-B-C.md) | What Product D needs from A, B and C, and what D gives back — one section per teammate, each ending in ONE ask |
| [SENIOR-DEV-BRIEF.md](./SENIOR-DEV-BRIEF.md) | The whole of Product D in one file: what it does, how it is proven, and every open question — written to be read start to finish by someone new |

Both of the last two moved here from `app/products/d-reengagement/` on
2026-08-21. They had been sitting inside the deploy folder, which meant the
live site served them: anyone could fetch the team's internal brief from the
public URL. Nothing under `app/` is private, so nothing internal goes there.

## Pages worth reading that are not in here

These ship on the site rather than in `docs/`, because `app/` is the
website and everything under it has a public address. They are listed here
because a teammate looking for them looks in this folder first.

| Page | What it is for |
| --- | --- |
| [the brand book](https://antunishdpursuit.github.io/PulseStudio/shared/brand-sheet.html) (`app/shared/brand-sheet.html`) | The mark, the two typefaces, every accent hex with its measured contrast ratio, the motion rule, the asset set and the studio's voice. Five pages, A4 landscape, prints to PDF exactly as it renders. Read it before building a surface or picking a colour — and read the colour page before arguing about an accent, because it prints the ratios rather than the intentions. It is exempt from `check-audience.mjs` (it names each builder, because the colour law ties a colour to a person), which is why it is a reference and not a customer screen |
| [the readiness board](https://antunishdpursuit.github.io/PulseStudio/shared/ready.html) (`app/shared/ready.html`) | Every open gap, in red, with an owner |
| [storytold](https://antunishdpursuit.github.io/PulseStudio/shared/storytold.html) (`app/shared/storytold.html`) | How a member's tap becomes a booking, a filled class, an answered question and a note — green segments are hand-offs that fire today |

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
  | Copy speaks to its user, never about the project | root `CLAUDE.md` (the audience law) | `scripts/check-audience.mjs` (reads static copy on consumer pages; the storytold page, the readiness board and any `tests.html` are named in the script itself, each with its reason. [audience-baseline.json](./audience-baseline.json) is the other list — copy that was already failing on the day the gate landed — and it is empty, because its one entry was cleared on 2026-08-22) |
  | Nothing under `app/` is private | root `CLAUDE.md` (the filing law) | `scripts/check-published.mjs` (fails on a NEW file under `app/` that the website would never ask for; the ones already there are in [published-baseline.json](./published-baseline.json)) |
  | Every published page has decided whether it wants to be found | root `CLAUDE.md` (the audience law — staff tools sit behind a clearly named door) | `scripts/check-published.mjs` (a page must be in `sitemap.xml` OR carry `noindex`, never both and never neither; `robots.txt` cannot do this job on a Pages project site and says so itself) |
  | Every published page points at the icon the site ships | the filing law (`favicon.svg` sits at the top of `app/` because that is where it is looked for) | `scripts/check-published.mjs` (a browser given no `<link rel="icon">` asks for `/favicon.ico` and gets a 404 on every load; the four pages still without one are in [published-baseline.json](./published-baseline.json)) |
  | The root holds only what a new cloner needs in the first 30 seconds | root `CLAUDE.md` (the filing law) | `scripts/check-published.mjs` (README, CLAUDE.md, package.json, tsconfig.json and the product briefs; the nine already there — seven of them an older, unpublished copy of the site — are in [published-baseline.json](./published-baseline.json)) |
  | Settings lives in exactly one place, and light is the default | root `CLAUDE.md` (the settings law) | `scripts/check-settings.mjs` (the shared settings page owns the only mount point; no product folder builds its own appearance control or touches the theme keys; the header carries light/dark only; the bare `:root` palette is light, so a device that asks for nothing gets light. It reads source text and never opens a browser — it can tell you the page is wired, not that it renders) |
  | Each folder's AGENTS.md really is a mirror of its CLAUDE.md | root `CLAUDE.md` ("if the two ever disagree, CLAUDE.md wins and the mirror needs regenerating") | `scripts/check-mirrors.mjs` (regenerates each mirror in memory and compares; it never writes, because repairing the drift would hide that somebody edited the wrong file) |
  | No compiled `.js` is committed, and every module the site runs has a TypeScript source | root `CLAUDE.md` (the git law) and `.gitignore` | `scripts/check-sources.mjs` (`git add -f` walks past an ignore rule; this looks afterwards. The one already tracked is in [sources-baseline.json](./sources-baseline.json)) |
  | A file kept "just in case" is a file the next person has to evaluate | root `CLAUDE.md` (the filing law) | `scripts/check-reachable.mjs` (walks from every `<script src>` through the compiled imports; needs a build, and knows a types-only module is not dead code. The three already unreached are in [reachable-baseline.json](./reachable-baseline.json)) |

  Each runs inside `npm run check`, each carries `--self-test`, and each
  states the counts it actually reached rather than passing in silence.

  Every gate in the table above decides "was I run, or imported?" through
  [`scripts/is-command.mjs`](../scripts/is-command.mjs), and so does
  `scripts/node-floor.mjs`; it is one copy on purpose, and its importers
  are the list to read rather than a number written here — this sentence
  said "all ten" until 2026-08-22, by which point the table had grown past
  ten. The ten gates that existed when the copies were merged each carried
  their own, and all ten were wrong the same
  way: `import.meta.url` is the file's REAL path while `process.argv[1]` is
  whatever the caller typed, so a symlink anywhere in that path made the
  guard false and the gate exit 0 having checked nothing — no output, no
  failure, and `--self-test` silenced identically. macOS makes `/tmp` a
  symlink, so this was easy to hit locally; GitHub's workspace is not
  symlinked, which is why CI never showed it.
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
  **The runner's stub DOM was widened on 2026-08-23, and the reason is this
  standard rather than convenience.** `scripts/run-suites.mjs` used to give
  each suite four methods — append, appendChild, textContent, classList.add
  — which is enough for a suite that only writes a result line. The moment
  a shared COMPONENT became worth checking (the site footer, the alert
  box), every check on one threw "Cannot set properties of undefined",
  which reads as a broken runner rather than a broken check — the worst of
  both, since it neither passes honestly nor fails honestly.

  It is now a small real tree with a selector engine, and the load-bearing
  decision in it is what happens to a selector the engine cannot parse:
  **it throws.** A stub that answered "no matches" would turn every check
  using such a selector into a silent pass, which is the failure mode this
  whole page is about. `node scripts/run-suites.mjs --self-test` still
  plants a failing check and proves the runner would exit 1; the three
  plants that proved the new component checks can fail — a merged try block
  in `storageWorks`, a footer link resolved against the page, an alert that
  stacks instead of replacing — each took down the checks that name them,
  and none took down anything else.

  What the stub still cannot do is written at the top of the file: no
  layout, no styles, no event dispatch, and `a.href` is whatever was
  assigned rather than what a browser would resolve. A green here is not a
  page anyone has looked at.

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
