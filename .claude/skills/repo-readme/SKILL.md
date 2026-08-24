---
name: repo-readme
description: Write or revise this repository's README and other prose docs the way Pulse Studio actually writes them — every claim checkable, numbers pointed at the command that knows them, mistakes recorded rather than erased. Use when editing README.md, a folder brief, or any doc a teammate reads before writing code.
---

# Writing docs the Pulse Studio way

This repository has been bitten by prose more than by code. An audit compared
every checkable statement in its docs to the code and found **55 that were
false** — the front door told members a note was "written by real staff" when
software composed it; the readiness board said one exception where there were
two; a brief said the dashboard persisted nothing while it wrote a storage key
on every publish.

None of that was carelessness. It was prose written once and left behind by
code that moved. So the rules below are not style preferences. Each one exists
because its absence produced a specific, documented failure.

## The one rule under all the others

**Never write a sentence the reader cannot check.**

If you write it, say where it comes from. If you cannot say where it comes
from, do not write it.

## Numbers

**Do not put a number in prose when something else already knows it.** Point at
that thing instead.

This repo has shipped: "four gates" the day a fifth landed · "the ten gates"
when twelve were running · "the codebase is 2,150 lines" when one product alone
was four times that · "592 KB total" for files weighing 352,762 bytes · "147
tracked files" at 160 · a mutation score of 52% measured before the checks that
moved it to 56% · "the three suites" on ten lines across five documents while
six suites ran.

```markdown
<!-- rots on the next commit -->
The repo has 160 tracked files and 12 gates.

<!-- stays true -->
Gates are the `check-*.mjs` list in `package.json`; each prints the count it
reached. Read it there, not here.
```

When a number is genuinely worth printing — a measurement, a threshold, a
ratio — **print how it was measured beside it**:

```markdown
`#f59e0b` as text on white is 2.15:1, below WCAG AA's 4.5:1.
Measured by `scripts/check-contrast.mjs`, which imports the same colour
module the browser runs rather than keeping a second copy of the formula.
```

## Mistakes

**Record the correction; do not silently overwrite.** A doc that quietly
changes teaches nobody, and the next person makes the same mistake.

```markdown
This list said FOUR until 2026-08-22, one day after the correction it
records, because the fifth rule landed and the sentence did not.
```

Do this when the mistake is instructive. Do **not** do it for a typo — the
repo keeps lessons, not a changelog.

## Negatives

**State what was checked, even when the answer is nothing.** A blank section
reads as an oversight; a stated zero reads as a result.

```markdown
<!-- no -->
(nothing here yet)

<!-- yes -->
0 approved routines. Nothing to include yet — no routine reaches a member
until a qualified person approves its exact content.
```

## Honest limits

**Every rule, gate, and mechanism gets a paragraph on what it does NOT do.**
This is the highest-value habit in the repo, and the easiest to skip.

```markdown
**Honest limits.** It reads the tracked file LIST, not file contents, so it
cannot tell compiled output from hand-written source by looking — the
baseline records which is which because a person decided, not because this
script worked it out.
```

If you cannot name a limit, you have not understood the thing well enough to
document it.

## Ownership

Anything actionable names **who** and **what one action closes it**.

```markdown
- **Manny** — `b-dashboard/index.html` declares no icon link, so browsers ask
  for `/favicon.ico` and get a 404. One line in the head:
  `<link rel="icon" href="../../favicon.svg" type="image/svg+xml">`
```

## Structure

- **Three or more parallel facts → a table.** Never a run of bullets each
  shaped `**Name** — value — value`.
- **Every fenced block is runnable or real.** No pseudo-commands, no `...`
  standing in for a path. If a reader pastes it, it works.
- **Headings are what a reader is looking for**, not what the writer is
  describing. "Running the app" beats "Development environment setup".
- **Lead with the thing that surprises**, not with context the reader can
  infer. The most important sentence goes first, not last.
- **No emoji section markers, no badge rows that decorate rather than
  inform**, no "🚀 Getting Started". Weight comes from typography and order.

## The repo's own laws that apply to prose

- **Banned words, repo-wide, enforced by `check-language.mjs`:** the three
  words for pretend data. The team's word for shared sample records is
  **fixture**, and the first shipped version is **the first release**. Quoting
  is exempt; loose use fails the build.
- **The audience law:** anything a member or staff person reads never names a
  builder or a product letter. Authorship is carried by colour. Builder-facing
  pages are exempt *by name, with the reason in the code*.
- **No assistant is ever a contributor** — no AI name, no `Co-Authored-By`, no
  "Generated with", anywhere.
- **The repo is public.** No secrets, no real member data, every person in the
  fixtures fictional.

## What a README specifically owes a newcomer

The filing law reserves the root for **what somebody who just cloned this and
knows nothing needs in the first thirty seconds**. A README that opens with
business-model framing has spent that thirty seconds on the wrong thing.

Order that works here:

1. **What this is**, in one or two sentences — and what it looks like (the live
   link, the brand mark).
2. **Run it** — the three commands, verbatim, that get a working local site.
3. **What is in it** — the products, as a table, each with its live URL.
4. **How the team works** — lanes, gates, and the one command that must pass.
5. **The honest state** — what is built, what is not, what is known-broken.
6. Everything else.

## Before you call it done

Run this against what you wrote:

- [ ] Every number either points at its source or names how it was measured.
- [ ] Every command in a fence has been run, in this repo, and worked.
- [ ] Every file path exists (`git ls-files | grep <path>`).
- [ ] Every claim about behaviour was checked against the code, not from memory.
- [ ] Anything actionable names an owner and one closing action.
- [ ] Every mechanism has its honest limit stated.
- [ ] `node scripts/check-language.mjs` passes.
- [ ] `node scripts/check-audience.mjs` passes if the file is under `app/`.
- [ ] You could hand it to somebody outside the team and they could check you.

**Filing note:** this skill lives at `.claude/skills/` because that is where the
tooling looks for it, the same way `.github/workflows/` is fixed. It is not a
counterexample to the filing law's four questions — it has no choice of home.
