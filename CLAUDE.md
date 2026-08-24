# Pulse Studio — instructions for the AI (read before doing anything)

Four people build four products in this one repo. This file is how all four
AIs work in agreement instead of colliding. It is TEAM-OWNED: change it only
with team agreement.

## Step 1 — know who you are working with

Before your first edit, identify your developer. If the person has not told
you and you cannot tell from context, ASK: "Who am I working with — Kerrian,
Manny, Dennis, or Rensley?" Then work only in their lane.

| Developer | Product | Their lane (the only folder they edit) | Color |
| --- | --- | --- | --- |
| Kerrian | A — Member Booking App | `app/products/a-booking/` | Blue `#3b82f6` |
| Manny | B — Staff Scheduling Dashboard | `app/products/b-dashboard/` | Amber `#f59e0b` |
| Dennis | C — Member Support Chatbot | `app/products/c-chatbot/` | Green `#10b981` |
| Rensley | D — Member Re-engagement Tool | `app/products/d-reengagement/` | Violet `#8b5cf6` |

Each product's brief (`PRODUCT_<X>_*.md` in the repo root) defines its scope.
All four product briefs now exist.
Do not build features from another product's brief.

## The lane law (why merges never conflict)

- Create and edit files ONLY inside your developer's product folder.
- Everything else is TEAM-OWNED — `app/shared/`, `app/index.html`, the root
  docs, `package.json`, `tsconfig.json`, this file. Changing a team-owned file
  requires team agreement first, stated in the PR. Never change one silently.
- Never commit compiled `.js` (it is gitignored). Build artifacts create
  conflicts the source never had.

Because every developer writes only inside their own folder, two branches can
never touch the same file — that is what makes merge conflicts structurally
impossible. If you believe you need to edit outside your lane, stop and say so
instead of doing it.

## The color law

- Built-in light and dark backgrounds are white and black — always use
  `var(--bg)` from `app/shared/theme.css`. A person may select an accessible
  custom background/text pair through the shared appearance control; no
  gradients.
- Every visible feature carries its developer's color: the page `<body>` has
  `class="product-a|b|c|d"` and controls use `var(--accent)` /
  `var(--accent-ink)`. Anyone looking at any screen can tell who built what.
- Never restyle another developer's color or add a fifth.

## The settings law

- Settings has ONE home: `app/shared/settings.html`, linked from the footer
  of every page. A product NEVER builds its own settings, appearance, or
  theme control — not a switch, not a picker, not a remembered preference.
  Two settings screens are two answers to the same question, and the person
  using the site finds out which one lost.
- The page header carries the **light/dark switch and nothing else**. It
  used to carry the whole settings surface in a drop-down, wedged beside a
  brand, a sign-in chip and a product's own navigation, where a person had
  to find the drawer before they could use any of it. That was the mistake;
  this is the correction.
- **Light is the default. Dark only when the device asks.** A person's own
  choice beats both and follows them across every page. In CSS that means
  the bare `:root` in `app/shared/theme.css` carries the light palette and
  every dark value sits behind `prefers-color-scheme: dark` or an explicit
  `[data-theme="dark"]` — never the other way round.
- `pulse-theme` and `pulse-theme-custom` belong to `app/shared/theme-boot.ts`.
  No product reads or writes them.
- A NEW setting is a section on that one page, added in shared ground with
  team agreement stated in the PR. It is never a second page and never a
  control in a product folder.

`scripts/check-settings.mjs` holds all five, and it started with an empty
list: on the day it landed no product folder violated any of them.

## The audience law

- Every consumer-facing surface speaks TO its user — a member or a staff
  person — never ABOUT the project. Product letters, builder names, and
  build-process talk stay OFF customer-visible copy. Authorship is carried
  by the builder's COLOR (the color law), by each folder's brief, and by
  `app/shared/storytold.html` — the one page that tells the builders'
  story. If copy would only matter to someone evaluating the project, it
  belongs on storytold, not on a customer screen.
- Signing in on the front door may LAND a person on their own home —
  a member on booking, staff on the dashboard — because nobody signs in to
  keep reading the front page. Landing is not gating: it happens only on
  the act of signing in, only in the tab where it happened, never on page
  load or sign-out, and every route stays reachable by link and by URL.
- MEMBER surfaces may ADAPT to the signed-in actor (`actor_type`: member or
  staff) — different emphasis, different words — but never hide or block a
  route. The browser session is convenience, not access control.
- STAFF surfaces are GATED, and the gate is real. This rule used to read
  "never hide or block a route", full stop, and the reasoning was sound
  while this was only static files: nothing a page checks about itself can
  stop a person who can edit the page, so a browser-side gate would have
  been a picture of a gate, and drawing one would have broken the truth
  law. The studio runs a server now. It holds the staff passphrase, it
  signs the session cookie, and it refuses `data/staff-records.json` to a
  request that cannot present one — a decision made where a visitor cannot
  reach it. So `app/shared/auth/staff-gate.ts` mounts a door on the
  dashboard and the re-engagement tool, and neither draws anything until
  the server says yes. Where there is no server, the door stays shut and
  says so; it never fails open.
- Records that name a person do NOT live under `app/`. Everything there is
  served at a URL, which is why members, memberships, reservations and
  attendance moved to `data/staff-records.json` — outside `app/`, where the
  static handler answers 403 and only `/api/staff/records` reaches them.
  `app/shared/fixtures.json` keeps what any visitor may read: the
  timetable, who teaches, and the studio's policies.
- Staff surfaces say "staff" plainly. Member surfaces never show another
  member's data. The front door leads with members; staff tools sit behind
  a clearly named door.

## The data law

- `SHARED_DATA_CONTRACT.md` is the vocabulary. `app/shared/contract.ts` is
  that contract as TypeScript types. If they ever disagree, stop and raise it
  with the team — never improvise a fix inside one product.
- All shared records load through `loadFixtures()` in `app/shared/data.ts`.
  No product keeps its own copy of shared data or redefines a shared field.
- Members see only their own data; staff-only information (rosters,
  attendance, cancellation risk) never appears in a member-facing surface.
- Product D drafts outreach for staff review only — nothing in this repo ever
  sends a message automatically.

## The language law

- Never use the words "demo", "example", or "mock" anywhere in this repo —
  code, comments, docs, commits, or UI copy. This is a real app that will be
  real. The team's word for shared sample records is "fixture", and the first
  shipped version is "the first release".
- State negatives explicitly: a screen with nothing to show says what it
  checked ("5 members checked, 0 flagged"), never a blank panel.
- Never claim something works that you have not watched work.

## The git law

- Gate before every commit: `npm run check` must pass. It is `tsc` — which
  EMITS, so the suites run the code you just changed rather than the last
  build — then every gate `package.json` lists and every suite
  `run-suites` finds. (Neither is counted here, and the reason is this
  sentence's own history: it said "four" gates from the day a fifth was
  added, the TABLE below then listed four of them for as long again, and
  it went on saying "the three suites" while six were running — that
  third one was wrong on ten lines, in five documents and their
  mirrors, at the same time. One cause every time: a count in prose
  that nothing checks. If you add a gate, add its row.) Each prints the count it
  actually reached, never a silent pass; read the count there, not from
  prose. Several of the laws above are no longer only stated:

  | What runs | Which law it holds |
  | --- | --- |
  | `tsc` | types, and it writes the `.js` the next step runs |
  | `scripts/check-styles.mjs` | where styles live — a product may not restyle what the shared theme owns |
  | `scripts/check-contrast.mjs` | the colour law — a NEW pairing below WCAG AA fails |
  | `scripts/check-language.mjs` | the language law and "no AI is ever a contributor" |
  | `scripts/check-fixtures.mjs` | the data law — every reference resolves, the stated UTC offsets match the studio's real ones, and the fixture has not aged out |
  | `scripts/check-lanes.mjs` | the lane law — no commit reaches into another developer's folder |
  | `scripts/check-published.mjs` | the filing law — nothing new under `app/` the website would not ask for, every page has decided whether it wants to be indexed and where its icon is, and the root holds only the contract |
  | `scripts/check-audience.mjs` | the audience law — no builder name or product letter in copy a member reads |
  | `scripts/check-secrets.mjs` | the git law — no credential material in a public repo |
  | `scripts/check-sources.mjs` | the git law — no committed build output, and every module the site runs has a TypeScript source |
  | `scripts/check-reachable.mjs` | the filing law — no module under `app/` that no page reaches |
  | `scripts/check-mirrors.mjs` | every `AGENTS.md` is still a byte-equivalent mirror of its `CLAUDE.md` |
  | `scripts/check-brand.mjs` | the clone seam — a page that shows the studio's name is wired to receive it |
  | `scripts/check-settings.mjs` | the settings law — settings lives in exactly one place, the header carries light/dark only, and light is the built-in default |
  | `scripts/run-suites.mjs` | every browser suite it finds under `app/`, run headlessly |

  Every gate carries `--self-test`, which plants known-bad input and proves
  it still catches it. Run one if you ever doubt a green. And note what none
  of them do: **a green gate does not open a browser.** Look at the pages
  your change could affect.
- One branch per product change, plain commit messages anyone can read.
  Merge to `main` through a PR using the template.
- The AI is NEVER a contributor: no Claude or AI names, no `Co-Authored-By`,
  no "Generated with" — not in commits, PR bodies, code comments, or anywhere
  else. Work is authored by the developer alone.
- This repo is PUBLIC: no secrets, no keys, no real member data. Every person
  in the fixtures is fictional.

## The filing law (where a new file goes)

Four directories, and one question decides between them. Ask it before you
create a file, not after:

| Ask | Then it goes in | Because |
| --- | --- | --- |
| Would a browser ever request this at a URL? | `app/` | `app/` **is** the website. The Pages workflow publishes it with `path: app`, so every file under it gets a public address. |
| Does a human or CI run it, and it never ships? | `scripts/` | Tooling. Plain `.mjs`, path derived from `import.meta.url` so anyone can run it from a clean clone. |
| Does a teammate read it before writing code, and it ships to nobody? | `docs/` | Process and internal notes. See `docs/README.md`. |
| Does somebody who just cloned this and knows nothing need it in the first 30 seconds? | the root | The contract: `README.md`, `CLAUDE.md`, `package.json`, `tsconfig.json`, the product briefs. |

**If the answer to all four is no, delete it — do not file it.** That is the
part that keeps a root clean. A file kept "just in case" is a file the next
person has to evaluate.

Two consequences that have already cost us something:

- **Nothing under `app/` is private.** Two of Product D's internal documents
  sat in a product folder and were being served at a public URL until
  2026-08-21. If it is not for a member of the studio, it does not go in
  `app/`.
- **A path from your machine is not tooling.** Eleven scratch runners lived
  in the repo root hardcoding one developer's home directory, so no teammate
  could run any of them. A script nobody else can run belongs nowhere.

Depth inside `app/` is also a URL, not an organising choice: `robots.txt`,
`sitemap.xml` and `favicon.svg` sit at the top of `app/` because crawlers
look for them there. Do not tidy them into a subfolder.

## Running the app

```bash
npm install
npm run build
npm run start
```

Then open http://localhost:4173 — the front door links to all four products.

## Per-folder briefs and the multi-assistant mirrors

Every working folder carries its own brief so a session opened anywhere
knows its owner, its lane, and that folder's real state:

- `app/products/a-booking/CLAUDE.md` — Kerrian's lane
- `app/products/b-dashboard/CLAUDE.md` — Manny's lane
- `app/products/c-chatbot/CLAUDE.md` — Dennis's lane
- `app/products/d-reengagement/CLAUDE.md` — Rensley's lane
- `app/shared/CLAUDE.md` — team-owned ground; change only with agreement

The team does not all run the same assistant, so the same brief exists in
each tool's native dialect, and THE CONTENT IS LAW, THE FILENAME IS NOT:

- **CLAUDE.md** — the canonical file, read natively by Claude Code.
- **AGENTS.md** — a byte-equivalent mirror of the sibling CLAUDE.md (after
  each file's two-line header and the blank line after it), read natively
  by OpenAI Codex and most
  general agents. Regenerate it whenever CLAUDE.md changes:
  `bash scripts/sync-agent-briefs.sh`. If the two ever disagree, CLAUDE.md
  wins and the mirror needs regenerating.
- **`.cursor/rules/*.mdc`** — thin Cursor rules that point at the canonical
  files (one always-on team rule, one per-folder rule scoped by glob). Each
  states only which lane it is for and where to read the laws, so there is
  almost nothing in them TO drift — a property that has to be maintained,
  not assumed. The always-on team rule DID once carry its own copy of the
  laws, and it drifted exactly as you would expect: it told every Cursor
  user "backgrounds are black or white only" long after the colour law
  started allowing an accessible custom pair, so the rule read on every
  edit forbade what the law permitted. If you are tempted to paste a law
  into a `.mdc` file, that is the story to remember.

Whichever assistant you run: identify your developer, read the root brief
plus the brief of the folder you are editing, and obey both.
