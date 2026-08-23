# Product C — working rules for the AI in this folder

You are in **Dennis's lane**: Product C, the Member Support Chatbot.
Color: **green** (`--dennis`, via `body.product-c`). Read the repo root
brief first; this file adds what is true about THIS folder.

## What this product is (proven in code, not aspiration)

A single-page member support chat that loads the shared fixture through
`loadFixtures()`, sends only upcoming scheduled `class_session` records and
current `studio_policy` records to Claude Haiku, and keeps a fail-closed
privacy refusal in the browser. The rules live in `support.ts` as pure
functions; `tests.ts` (open `tests.html`) checks each one against a known
answer. The audience and the outbound answer guard come from the shared
`assistant-audience.ts`. The deployed GitHub Pages site has no backend and
states that conversational support is unavailable. The local server lives in
`scripts/start-haiku.mjs`; setup is documented in
`docs/the-server.md` by team agreement.

## Lane law

- Create and edit files ONLY in `app/products/c-chatbot/`.
- `app/shared/`, `app/index.html`, root docs, `package.json`, `.github/`
  are TEAM-OWNED — change only with agreement stated in the commit and PR.
- `a-booking/`, `b-dashboard/`, `d-reengagement/` are other people's work.
  Never edit them; report defects to their owner instead.

## The deliberate design

- **The shared-data boundary is exact:** Product C accesses
  `PublicFixtures.timezone`, `class_sessions`, and `studio_policies`;
  timezone is the fixture envelope, not another record collection. It cannot
  access members, memberships, reservations or attendance — those are not in
  the public half at all, and the type has no such fields, so a read of one
  is a compile error rather than an undefined at runtime. It does not touch
  synthetic records or another product's browser storage.

  The assistant's outbound guard is in two halves now. The staff-vocabulary
  half runs here on the finished text; the NAME half runs on the server,
  which holds the roster. This page used to fetch every member's display
  name to run that check itself — a member-facing page holding the whole
  roster, which is a larger leak than the one it prevented.
- **Policies are read-only.** Only records with `is_current: true` reach the
  model. The cancellation answer comes from `pol_001`; missing policy topics
  get a stated miss rather than an invented answer.
- **The privacy guard fails closed without member records.** Generic patterns
  in `support.ts` refuse attendance, history, account, membership, booking,
  reservation — singular or plural, either apostrophe — and questions shaped
  like "did Maria come last week?" before any network call. Schedule
  questions ("which classes can I attend?") pass; the guard's word list is
  checked question-by-question in `tests.ts`.
- **The answer is guarded on the way out too, and the name half needs
  names to check against.** `answerProblems()` from
  `shared/assistant-audience.ts` runs on the model's reply last. This
  sentence used to say "staff vocabulary or another member's name never
  reaches this member-facing screen" while `main.ts` called it with only
  two arguments — no `otherMemberNames` — so only the staff-vocabulary
  patterns ever ran and the name half was inert. Found by an adversarial
  review, not by any check: nothing here exercises `main.ts` itself (it
  looks up DOM elements at import time, same reason `support.ts` exists
  apart from it). Fixed by passing every OTHER signed-in member's own
  `display_name` from the loaded fixtures, the reader's own excluded —
  never refused for saying their own name back to them.
- **No instructor or availability claims.** Those require collections outside
  this product's agreed boundary.

## Integration facts

- Data: `shared/data.js` and the `FixtureSet` types in `shared/contract.js`.
  Product C creates or updates no shared record.
- Theme: `product-c` body class + `shared/theme.css` +
  `shared/theme-boot.js`, which also mounts the shared sign-in chip.
- Storage: Product C writes no browser storage. It reads the shared session
  through `shared/auth/session.js` only to pick the greeting's voice —
  convenience, never access control; the page stays member-facing whoever
  is signed in.
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
