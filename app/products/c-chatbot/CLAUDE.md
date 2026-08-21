# Product C — working rules for the AI in this folder

You are in **Dennis's lane**: Product C, the Member Support Chatbot.
Color: **green** (`--dennis`, via `body.product-c`). Read the repo root
brief first; this file adds what is true about THIS folder.

## What this product is (proven in code, not aspiration)

A single-page member support chat that keeps a fail-closed privacy refusal in
the browser, builds member-safe context from the shared synthetic dataset and
Booking's published browser reservation log, and sends safe questions to
Claude Haiku through the local `/api/chat` server. The deployed GitHub Pages
site has no backend and states that conversational support is unavailable.
Every answer renders as chat bubbles with an explicit schedule-and-policy
status line. The local server and its maintained safe guidance live in
`scripts/start-haiku.mjs` and `docs/member-support-haiku.md` by team agreement.

## Lane law

- Create and edit files ONLY in `app/products/c-chatbot/`.
- `app/shared/`, `app/index.html`, root docs, `package.json`, `.github/`
  are TEAM-OWNED — change only with agreement stated in the commit and PR.
- `a-booking/`, `b-dashboard/`, `d-reengagement/` are other people's work.
  Never edit them; report defects to their owner instead.

## The deliberate design (do not "fix" without Dennis's intent)

- **`timeZone: "UTC"` in `formatSession()` is CORRECT.** Synthetic
  `startsAt` values are studio-local wall times with no offset; appending
  `"Z"` and formatting as UTC prints them exactly as written, immune to
  DST. Re-pointing it at `America/New_York` would BREAK the display.
  The comment at `main.ts:69-71` says so.
- **The privacy guard fails closed.** Any question containing a fixture
  member's first name (≥3 chars), or phrases like "my booking", is
  refused — the chatbot has no session identity, so it cannot know whose
  data "my" means. Innocent questions can be refused; that is the design.
- **Haiku never receives specific member records.** The browser sends only
  the studio name and timezone, upcoming class details with aggregate spaces
  left, current policies, and the member's safe question.
- **The dataset regenerates with TODAY's date** on every load
  (overriding the pinned default), so answers drift with the real
  calendar and differ from products that pin `asOfDate`.
- The browser privacy guard still runs before the network request. Its
  deliberate false positives remain safer than sending an ambiguous member
  question to the model.

## Integration facts

- Data: `shared/synthetic/config.js`, `contracts.js`, `generate.js`, plus
  Product A's published browser reservation log. It does NOT use
  `loadFixtures()`, `fixtures.json`, or `shared/auth/session.js`.
- Theme: `product-c` body class + `shared/theme.css` +
  `shared/theme-boot.js` — which also mounts the shared sign-in chip in
  the header. The chatbot itself ignores the session today; if it ever
  branches by `actor_type`, that is Dennis's lane call (see
  `app/shared/auth/README.md`).
- Storage: it writes nothing. Spaces-left answers defensively read Product A's
  published `pulse-reservations-a` log; the latest row per member and session
  overrides the generated booking state.
- Network: `npm run start:haiku` serves the site and proxies `/api/chat` to
  Anthropic with `ANTHROPIC_API_KEY` from the local environment. The key never
  enters browser code or the repository. The server rereads the marked safe
  guidance and Storytold beats on every request.

## Gate

`npm run check` green before every commit (and `npm run build` if you
touched TypeScript). Compiled `main.js` is gitignored — edit `main.ts`
only. The repo-wide laws (no "demo"/"example"/"mock", no AI attribution,
black or white backgrounds only, stated negatives, never commit red) all
apply.

> AGENTS.md beside this file is a generated mirror for non-Claude
> assistants — edit THIS file, then run `bash scripts/sync-agent-briefs.sh`.
