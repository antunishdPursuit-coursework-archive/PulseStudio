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

**Take everything from `do-not-merge/v0.0.2`.** It is the only branch that
carries all four product folders AND the `app/shared/` they all import. The
three per-product branches came first and are now behind on shared ground — a
folder taken from one of them, with that branch's `app/shared/`, is missing the
footer, the alert region, the settings page and the assistant service.

| Branch | What it carries | Take from it? |
| --- | --- | --- |
| `do-not-merge/v0.0.2` | all four folders **and** the current `app/shared/` | **yes — this one** |
| `do-not-merge/a` | `app/products/a-booking/` — Kerrian | only to read the history |
| `do-not-merge/b` | `app/products/b-dashboard/` — Manny | only to read the history |
| `do-not-merge/c` | `app/products/c-chatbot/` — Dennis | only to read the history |

## The one thing that will break if you skip it

**Your folder does not stand alone. Take `app/shared/` with it.**

Every product imports from `app/shared/`. Copy a product folder into a tree
whose `app/shared/` is older, and the page loads until the first import
resolves to a module that has moved or changed shape — then it stops, in the
browser, with nothing on screen. That failure looks like your folder is
broken. It isn't.

Here is the minimum each product would break without, read out of the source
rather than remembered:

| Product | What it imports from `app/shared/` |
| --- | --- |
| A — booking | `auth/session`, `auth/studio`, `contract`, `synthetic/contracts` |
| B — dashboard | `contract`, `data` |
| C — chatbot | `contract`, `data` |
| D — re-engagement | `auth/session`, `auth/studio`, `brand`, `contract`, `storage`, `text`, `today`, `synthetic/config`, `synthetic/contracts`, `synthetic/csv-export`, `synthetic/generate` |

That table is the TypeScript imports only. Every page ALSO pulls
`app/shared/theme.css` and `theme-boot.js` from its HTML, plus whichever
shared component it mounts — the header, the footer, the alert region. Which
is why the honest instruction is the short one at the top: **take
`app/shared/` whole.** Chasing a partial list is how you find the missing
piece one blank page at a time.

## How to take it

Three ways, cheapest first. All of them run from `main` with your own branch
checked out.

**Just your folder, plus shared:**

```bash
git checkout do-not-merge/v0.0.2 -- app/products/a-booking app/shared
```

Manny substitutes `b-dashboard`, Dennis `c-chatbot`. The `app/shared` on the
end is not optional — see the section above.

**One commit you liked, not the whole branch:**

```bash
git cherry-pick <sha>
```

**Read it first, decide later:**

```bash
git diff main..do-not-merge/v0.0.2 -- app/products/a-booking
```

Then, before you commit anything:

```bash
npm run check
```

That is the gate. It runs `tsc` — which emits, so the suites execute the code
you just took rather than the last build — then every gate script and every
suite `run-suites` finds. Each prints the count it reached. Read the counts.

## What is NOT yours to take

Those branches also touch files nobody owns alone: `README.md`, `CLAUDE.md`,
`AGENTS.md`, `app/index.html`, and the product briefs. Those are team-owned.
Taking one of them is a team decision stated in the PR, not a `git checkout`
you run on a Tuesday. If a change you want depends on one, raise it — don't
carry it across quietly.

And the obvious one: take your own folder. Another developer's folder on your
branch is the exact thing the lane law exists to prevent, and the gate will
name you for it.

## If something does not work

Say so on the branch it came from rather than fixing it silently in your lane.
A defect that reaches your folder from mine is mine to fix, and the fastest
way for it to reach the other two is for you to patch it privately.
