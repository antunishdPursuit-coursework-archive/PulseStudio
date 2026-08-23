# Product C — working rules for the AI in this folder

You are in **Dennis's lane**: Product C, the Member Support Chatbot.
Color: **green** (`--dennis`, via `body.product-c`). Read the repo root
brief first; this file adds what is true about THIS folder.

## What this product is (proven in code, not aspiration)

A single-page member support chat that loads the shared fixture through
`loadFixtures()`, sends only upcoming scheduled `class_session` records and current
`studio_policy` records to Claude Haiku, and keeps a fail-closed privacy
refusal in the browser. Its pure support rules live in `support.ts` and are
checked by `tests.ts`. The deployed GitHub Pages site has no backend and
states that conversational support is unavailable. The local server lives in
`scripts/start-haiku.mjs`; setup is documented in
`docs/member-support-haiku.md` by team agreement.

## Lane law

- Create and edit files ONLY in `app/products/c-chatbot/`.
- `app/shared/`, `app/index.html`, root docs, `package.json`, `.github/`
  are TEAM-OWNED — change only with agreement stated in the commit and PR.
- `a-booking/`, `b-dashboard/`, `d-reengagement/` are other people's work.
  Never edit them; report defects to their owner instead.

## The deliberate design

- **The shared-data boundary is exact:** Product C accesses
  `FixtureSet.timezone`, `class_sessions`, and `studio_policies`; timezone is
  the fixture envelope, not another record collection. It does not access
  members, memberships, instructors, reservations, attendance, synthetic
  records, or another product's browser storage.
- **Policies are read-only.** Only records with `is_current: true` reach the
  model. The cancellation answer comes from `pol_001`; missing policy topics
  get a stated miss rather than an invented answer.
- **The privacy guard fails closed without member records.** Generic patterns
  refuse attendance, history, account, membership, booking, reservation, and
  questions shaped like "did Maria come last week?" before any network call.
  The shared outbound guard also rejects staff-only language in a reply, but
  Product C does not load the member roster for name matching.
- **No instructor or availability claims.** Those require collections outside
  this product's agreed boundary.

## Integration facts

- Data: `shared/data.js` and the `FixtureSet` types in `shared/contract.js`.
  Product C creates or updates no shared record.
- Theme: `product-c` body class + `shared/theme.css` +
  `shared/theme-boot.js`, which also mounts the shared sign-in chip.
- Storage: Product C reads and writes no browser storage.
- Network: `npm run start:haiku` serves the site and proxies `/api/chat` to
  Anthropic with `ANTHROPIC_API_KEY` from the local environment. The key never
  enters browser code or the repository. The server accepts only the agreed
  session and policy fields and reads no other project context.

## Gate

`npm run check` green before every commit (and `npm run build` if you
touched TypeScript). Compiled `main.js` is gitignored — edit `main.ts`
only. The repo-wide laws all apply.

> AGENTS.md beside this file is a generated mirror for non-Claude
> assistants — edit THIS file, then run `bash scripts/sync-agent-briefs.sh`.
