# Process: styling and shared-surface changes

**Owner:** the team (shared ground) · **Last updated:** 2026-08-20 · **Review:** whenever the gate reports something we did not expect

## Purpose

Four developers style one studio. Without a rule for *where a style lives*,
the same header gets pasted into four folders and the four pages drift
apart — which already happened twice in one day, so this is a record of
real pain, not theory. This document says where every style belongs, and
`scripts/check-styles.mjs` enforces it at the gate.

## Scope

**Covers:** every `.css` file under `app/`, and any styles a shared
component injects from TypeScript.
**Does not cover:** page copy (see the audience law in `CLAUDE.md`),
TypeScript, or anything under `app/shared/synthetic/`.

## The one decision: where does this style go?

```
        Is it drawn by a SHARED component?
        (.home-brand, .role, .owner-badge, the session chip,
         the appearance control — anything theme-boot mounts)
                          |
              yes ────────┴──────── no
               |                     |
   app/shared/theme.css      Would another product's page
   ONCE. Never in a          want this exact rule too?
   product folder — not              |
   even "just a tweak".     yes ─────┴───── no
                             |               |
                    app/shared/theme.css   YOUR product's
                    (say so in the PR —    own styles.css.
                    shared needs team      Nobody else's
                    agreement)             business.
```

Everything shared lives in `app/shared/theme.css`. Everything that is
truly one product's own lives in that product's own stylesheet. There is
no third place, and "I'll copy it for now" is the failure mode this whole
document exists to prevent.

## RACI

| Step | Responsible | Accountable | Consulted | Informed |
|---|---|---|---|---|
| Style inside one product | that product's owner | that owner | — | nobody needed |
| Add/change a rule in `theme.css` | whoever needs it | the team | the other three owners, in the PR | everyone, via the PR |
| Delete a duplicate from your folder | that product's owner | that owner | — | shrink `docs/styles-baseline.json` in the same commit |
| Add a shared component | whoever builds it | the team | the other three owners | `app/shared/components/README.md` gets a row |

## Detailed steps

### Step 1 — Before you write CSS, run the gate
- **Who:** anyone about to style something
- **How:** `npm run check` (the styling gate runs inside it)
- **Output:** a stated count — how many stylesheets were checked, how many
  known duplicates exist, how many are new. Never a blank pass.

### Step 2 — Put the rule where the decision tree says
- **Who:** the person writing it
- **How:** shared component or shared-by-nature → `app/shared/theme.css`;
  yours alone → your own `styles.css`
- **Output:** exactly one rule, in exactly one file

### Step 3 — Comment anything a stranger could break
- **Who:** the person writing it
- **When:** every rule that is load-bearing, non-obvious, or the result of
  a bug
- **How:** say **why**, not what. `/* the sticky header overlaps anchors, so
  every anchor target carries this offset */` earns its place;
  `/* set the color */` does not.
- **Output:** the next developer keeps the rule instead of "cleaning" it

### Step 4 — Run the gate again, then commit
- **Who:** the person writing it
- **How:** `npm run check` must exit green. If it names new drift, fix it —
  do **not** add it to the baseline; that file only shrinks.
- **Output:** a commit that cannot have quietly forked the four headers

### Step 5 — If you touched `theme.css`, say so in the PR
- **Who:** the person writing it
- **How:** name the rule and why it is shared, in the PR body (the team
  agreement the lane law requires)
- **Output:** three other owners who know before they discover it

## Why we do not use Sass/SCSS

An honest answer, because "just add SCSS" is the reflex and it is wrong
*here*:

- **It would add a build step to CSS that does not exist today.** The
  team's stack is HTML, CSS, TypeScript — CSS ships to the browser exactly
  as written, and anybody can open a stylesheet and read what runs. A
  compiler means a build to run, output to gitignore, and a source map
  between what you wrote and what shipped.
- **The things people want Sass for, we already have.** Variables are CSS
  custom properties, and ours are *better* than Sass variables because they
  live at runtime — that is precisely how one `--accent` recolors a whole
  product and how the appearance control repaints the site without a
  rebuild. Nesting is a nice-to-have that plain selectors already express.
  Partials are what `theme.css` + one stylesheet per product already are.
- **Our real problem was never syntax — it was ownership.** SCSS would not
  have stopped the same block being pasted into four folders. A checked
  rule does.

**If the team ever wants Sass, this doc is where you argue for it** — with
what it fixes that the gate does not. Until then: plain CSS, custom
properties, one home per rule, and comments where the reason is not on the
screen.

## Exceptions and edge cases

| Scenario | What to do |
|---|---|
| Two products need the same look, but only those two | Put it in `theme.css` anyway and say so in the PR. Two copies is how four copies start. |
| A shared rule is *almost* right for your page | Do not copy-and-tweak. Either extend it under your own class in your folder, or change the shared rule for everyone (PR + agreement). |
| A rule genuinely is yours alone but shares a shared component's name | Rename yours so the name tells the truth. The gate flags names, on purpose. |
| The gate flags something you believe is correct | Say so in the PR and bring it to the team — do not edit the baseline to silence it. A wrong gate is a bug worth fixing loudly. |
| Styles injected from TypeScript by a shared component | Allowed for the component's own visuals (`topbar.ts` does this). Anything a page needs *before* its module loads belongs in `theme.css`. |
| `@media` blocks | The gate reads top-level rules only and does not look inside media queries — a stated limit. Apply the same rule by hand there. |

## Metrics

| Metric | Target | How to measure |
|---|---|---|
| New style drift | **0** | `npm run check` — exits non-zero on any new duplicate |
| Known duplicates | shrinking every week, never growing | count `allowed` in `docs/styles-baseline.json` (**13** the day this landed) |
| Gate still capable of failing | proven, not assumed | `node scripts/check-styles.mjs --self-test` — plants a known-bad case and a known-good case; it also failed a real planted duplicate before this shipped |

## Related documents

- `CLAUDE.md` — the working agreement: lane, color, audience, data, language, git laws
- `app/shared/CLAUDE.md` — how shared ground works
- `app/shared/components/README.md` — the shared components and the four-file rebrand checklist
- `docs/styles-baseline.json` — today's known duplicates, with owners
- `app/shared/ready.html` — what is presentable and what is still open
