# Taking your folder off a `do-not-merge/` branch

**From:** Rensley (Product D) · **Lives in:** `docs/`, because you read it
before you write code and it ships to nobody.

There are four branches named `do-not-merge/<x>`. They are named that way so
the name is the instruction: **nobody merges them.** Each one carries a
worked-through version of one product folder, offered to its owner to read,
run, and take or refuse. The permission that lets them cross lane boundaries
at all is declared in `docs/proposal-branches.json`, and
`scripts/check-lanes.mjs` prints every crossing on every run, so none of it is
silent.

**Take your folder from `do-not-merge/v0.0.2`.** The three per-product
branches came first and are behind on shared ground; read them for history,
not for code.

| Branch | What it carries | Take from it? |
| --- | --- | --- |
| `do-not-merge/v0.0.2` | `a-booking`, `b-dashboard`, `c-chatbot` | **yes — this one** |
| `do-not-merge/a` | `app/products/a-booking/` — Kerrian | only to read the history |
| `do-not-merge/b` | `app/products/b-dashboard/` — Manny | only to read the history |
| `do-not-merge/c` | `app/products/c-chatbot/` — Dennis | only to read the history |

## What changed on 2026-08-24, and why this page was rewritten

Product D and the `app/shared/` ground it depends on **merged to `main`** in
PR #71. `main` is green there: `npm run check` passes every gate, 1,534 checks
across 4 suites, 0 failed, measured from a clean checkout.

Two consequences, and the second one reverses this page's old advice:

1. **Product D is no longer on the shelf branch.** It was removed once it was
   verified byte-identical to `main`. The shelf now carries three folders, not
   four.
2. **Do NOT take `app/shared/` from the branch any more.** This page used to
   say "take `app/shared/` whole", and that was right while `main` was behind.
   It is wrong now, and it fails loudly: `main` already has the shared ground,
   and the branch is *ahead* of it on four files that carry an unfinished
   change. Running `git checkout do-not-merge/v0.0.2 -- app/shared` against
   today's `main` produces four TypeScript errors in `b-dashboard/main.ts` and
   `c-chatbot/main.ts`. That is measured, not predicted — it was run before
   this paragraph was written.

**The shared ground you need is already on `main`.** Branch from `main`, take
only your own folder, and the imports resolve.

## The three commits still on the shelf, and who owns each

These could not travel to `main` with Product D, because each one is coupled
to a product folder that stayed behind. They are not leftovers to tidy away —
each is a real change waiting for its other half.

| Commit | What it does | Whose halves it needs |
| --- | --- | --- |
| `c042fb8c` | splits `FixtureSet` into `PublicFixtures` + `StaffRecords` in `app/shared/contract.ts` and `app/shared/data.ts`, and moves the assistant's name guard into `scripts/start-haiku.mjs` | Manny **and** Dennis — it does not compile without both `b-dashboard/main.ts` and `c-chatbot/main.ts` |
| `257dca8e` | the checks that pin that split, including one a `(fixtures as any).members` cast cannot walk past | travels with `c042fb8c` |
| `bdc5044b` | moves `.session h3` into `app/shared/theme.css` | Kerrian **and** Manny — correct only once the duplicate copies in `a-booking/styles.css` and `b-dashboard/staff-dashboard.css` are deleted in the same change |

`c042fb8c` is the one worth understanding before you touch it. The member
support page used to fetch every member's display name so it could check the
assistant's answer against them — a member-facing page holding the whole
roster, which is a bigger leak than the one it prevented and which the data
law forbids outright. The commit moves that check to the server, which already
holds the roster and already sees the answer; the server returns a verdict,
never the roster and never the name it matched. The type split is the second
guard on the same rule: `loadFixtures()` comes back with no `members` field at
all, so reading one is a compile error rather than an `undefined` on a
member's screen.

It touches team-owned ground. Land it in ONE pull request with both product
halves, and state the agreement in the body.

## How to take your folder

All three of you start the same way:

```bash
git fetch origin
git switch -c <your-branch> origin/main
```

**Kerrian — `a-booking`.** Applies clean. No conflicts.

```bash
git checkout do-not-merge/v0.0.2 -- app/products/a-booking
npm run check
```

**Manny — `b-dashboard`.** Applies clean, but read the defect section below
first — there is a live one in your folder on `main` right now.

```bash
git checkout do-not-merge/v0.0.2 -- app/products/b-dashboard
npm run check
```

**Dennis — `c-chatbot`. Do not copy yours byte-for-byte.** You shipped
`645ec2c` to `main` *after* this shelf branch forked, and it rewrote the same
`main.ts` and `support.ts` the shelf version changes. A plain `git checkout`
silently reverts your own hardening. The conflicting set is `main.ts`,
`support.ts`, `tests.ts`, `tests.html`, `index.html`, `CLAUDE.md`, `AGENTS.md`.
Merge deliberately instead, and resolve each one by hand:

```bash
git checkout --merge do-not-merge/v0.0.2 -- app/products/c-chatbot
```

To read before deciding, in any of the three cases:

```bash
git diff origin/main..do-not-merge/v0.0.2 -- app/products/<your-folder>
```

Then, before you commit anything:

```bash
npm run check
```

That is the gate. It runs `tsc` — which emits, so the suites execute the code
you just took rather than the last build — then every gate script and every
suite `run-suites` finds. Each prints the count it reached. Read the counts.

And note what a green gate does not do: **it never opens a browser.** Run
`npm run start` and look at your pages before you open the pull request.

## A defect this hand-off found in Manny's folder — CLOSED 2026-08-24

**Read this as history, not as a warning.** Manny fixed it in `0793e2b`
("align dashboard with shared studio"). Re-verified in a browser afterwards:
an anonymous visitor to `/products/b-dashboard/` now gets the staff door and
nothing else — no capacity, no enrollment totals, no roster. The audience
law's sentence, "a door on the dashboard and the re-engagement tool", is true
of both halves again.

The record is kept because the CAUSE is still worth reading before you touch
that folder.

What was true, verified in a browser against `main` at `3457374`:

`GET /products/b-dashboard/` returned **200 to an anonymous visitor** and
rendered the whole staff dashboard — weekly operations, session counts,
enrollment totals, and a **"View roster"** button on every class that opened a
table of member names with reservation and attendance status. There was no
door on it at all, while the re-engagement tool, a staff surface of the same
kind, correctly showed only a sign-in door.

**Severity was worth getting right, because it decided the fix.** The names on
that screen were not the studio's records: `staff-dashboard.js` calls
`generateStudio()` and invents a studio in the browser from a seed. The real
records were gated throughout and the gate held — `GET /api/staff/records`
with no cookie returns **401**, and `GET /data/staff-records.json` returns
**404**. So no member data was ever exposed. It was a **staff surface with no
door**, which the audience law forbids outright — "STAFF surfaces are GATED,
and the gate is real." Had it been read as a data breach, the fix would have
gone hunting in the wrong place.

**The cause was written down in two baselines before anybody noticed the
door was missing, and that is the part worth sitting with.**
`b-dashboard/index.html` loads `staff-dashboard.js` — hand-written JavaScript
with no TypeScript source, so `tsc` never opens it
([sources-baseline.json](./sources-baseline.json)). Meanwhile
`b-dashboard/main.ts` was loaded by no page at all
([reachable-baseline.json](./reachable-baseline.json)). Two modules for one
dashboard, and **the door had gone on the one nothing runs.** A door on an
unreached module is a picture of a door.

**One half of that is still true.** The live module is still hand-written
JavaScript with no TypeScript source, so no compiler reads the file the
dashboard actually runs — which is exactly the condition that let a missing
door go unnoticed. Its line in `sources-baseline.json` is still there, and
that list only shrinks. Giving that module a TypeScript source is Manny's
call and the next thing worth doing in that folder.

## What is NOT yours to take

Those branches also touch files nobody owns alone: `README.md`, `CLAUDE.md`,
`AGENTS.md`, `app/index.html`, `app/shared/`, `docs/`, `scripts/`, and the
product briefs. Those are team-owned. Taking one of them is a team decision
stated in the pull request, not a `git checkout` you run on a Tuesday. If a
change you want depends on one, raise it — don't carry it across quietly.

And the obvious one: take your own folder. Another developer's folder on your
branch is the exact thing the lane law exists to prevent, and the gate will
name you for it.

## If something does not work

Say so on the branch it came from rather than fixing it silently in your lane.
A defect that reaches your folder from mine is mine to fix, and the fastest
way for it to reach the other two is for you to patch it privately.
