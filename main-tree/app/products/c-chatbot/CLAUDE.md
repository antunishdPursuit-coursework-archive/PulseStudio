# Product C — working rules for the AI in this folder

You are in **Dennis's lane**: Product C, the Member Support Chatbot.
Color: **green** (`--dennis`, via `body.product-c`). Read the repo root
brief first; this file adds what is true about THIS folder.

## What this product is (proven in code, not aspiration)

A single-page, fully client-side keyword-routed Q&A widget — **no LLM and no
network calls** — that answers member questions from the shared synthetic
dataset and Booking's published browser reservation log through four paths, checked in this order: a
privacy refusal for member-data questions, current-policy answers on five
topics, a next-5-classes schedule answer with optional spaces-left counts,
and an honest capability-listing fallback. Every answer renders as chat
bubbles with an explicit "N classes and M policies checked" status line.
Three source files: `index.html`, `main.ts` (~143 lines — everything),
`styles.css`.

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
- **Matching is lowercase substring/keyword** (`question.includes`). No
  fuzzy matching, no typo handling — claims of anything smarter would
  break the truth law.
- **The dataset regenerates with TODAY's date** on every load
  (overriding the pinned default), so answers drift with the real
  calendar and differ from products that pin `asOfDate`.
- The five policy topic strings in `policyAnswer()` ("cancellation",
  "what to bring", "class levels", "guest passes", "late arrival") must
  keep matching the topics the synthetic generator emits.

## Integration facts

- Data: `shared/synthetic/config.js`, `contracts.js`, `generate.js` —
  its ONLY runtime data dependencies. It does NOT use `loadFixtures()`,
  `fixtures.json`, or `shared/auth/session.js`.
- Theme: `product-c` body class + `shared/theme.css` +
  `shared/theme-boot.js` — which also mounts the shared sign-in chip in
  the header. The chatbot itself ignores the session today; if it ever
  branches by `actor_type`, that is Dennis's lane call (see
  `app/shared/auth/README.md`).
- Storage: it writes nothing. Spaces-left answers defensively read Product A's
  published `pulse-reservations-a` log; the latest row per member and session
  overrides the generated booking state.

## Gate

`npm run check` green before every commit (and `npm run build` if you
touched TypeScript). Compiled `main.js` is gitignored — edit `main.ts`
only. The repo-wide laws (no "demo"/"example"/"mock", no AI attribution,
black or white backgrounds only, stated negatives, never commit red) all
apply.

> AGENTS.md beside this file is a generated mirror for non-Claude
> assistants — edit THIS file, then run `bash scripts/sync-agent-briefs.sh`.
