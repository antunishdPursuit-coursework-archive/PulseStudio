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
- Surfaces may ADAPT to the signed-in actor (`actor_type`: member or
  staff) — different emphasis, different words — but never hide or block a
  route: the browser session is convenience, not access control, and
  pretending otherwise would break the truth law.
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

- Gate before every commit: `npm run check` must pass. It compiles every
  `.ts`, checks for style drift, and runs all 284 unit checks from the three
  suites (synthetic engine, session contract, re-engagement) headlessly — the
  same checks the `tests.html` pages show in a browser. It prints the count it
  actually ran, never a silent pass.
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
  each file's one-line header), read natively by OpenAI Codex and most
  general agents. Regenerate it whenever CLAUDE.md changes:
  `bash scripts/sync-agent-briefs.sh`. If the two ever disagree, CLAUDE.md
  wins and the mirror needs regenerating.
- **`.cursor/rules/*.mdc`** — thin Cursor rules that point at the
  canonical files (one always-on team rule, one per-folder rule scoped by
  glob). They carry no content of their own, so they cannot drift.

Whichever assistant you run: identify your developer, read the root brief
plus the brief of the folder you are editing, and obey both.
