# app/shared/components — pieces every page shows, no page owns

**TEAM-OWNED.** Named so a thing is found by what it does:

| File | What it is | How a page gets it |
| --- | --- | --- |
| `brand-header.ts` | Renders the studio's name into every branded home link (`.home-brand .brand-word`), refreshes their aria-labels, and fills any `[data-studio-name]` with the plain name — all from `../brand.ts` | Automatic: `theme-boot.js` calls `renderStudioBrand()` on every page |
| `logo.ts` | The pulse mark as a callable SVG (`pulseLogo(size)`), same path as `app/favicon.svg`, stroke = `currentColor` | Import and append where a mark is wanted |
| `topbar.ts` | The sign-in control: Sign in button → member picker dialog; signed in → name chip + Sign out. Self-injected styles, accent-aware | Automatic: `theme-boot.js` mounts it into `.topnav`/`.page-head` (opt out: `<body data-no-session>`) |

## The clone story (change everything from the least files)

1. **`app/shared/brand.ts`** — the studio's NAME. Every header follows at
   runtime.
2. **`app/shared/theme.css`** — the accent tokens (and the one shared
   `.home-brand` ruleset all headers use — style it here, never per-page).
3. **`app/favicon.svg`** — the mark (`logo.ts` carries the same path for
   in-page use).
3b. **`app/shared/photos/`** — the studio's own pictures, and
   `app/shared/fonts/` if the new studio has its own faces. Both fold into
   one instruction: replace the files, keep the licence files honest.
4. **`app/index.html`** — the front door's title, meta description, and
   theme-color: values a `<meta>` tag cannot read at runtime.

That is the whole rebrand **for everything shared**. Two honest remainders,
each in an owner's lane rather than here (an audit caught this page claiming
otherwise):

- **Three product pages' `<title>`** still spell the studio out, because a
  document title is read before any module runs. This said FOUR until
  2026-08-22, and it was already three: `d-reengagement` ships the title
  `Member Re-engagement` with no studio name in it and sets the full title
  at runtime from `brand.ts`, so it has no remainder to edit. That is the
  pattern that removes this bullet entirely — a static title carrying only
  the page's own name, the studio's added by the module. The other three
  are a one-word edit each, in their owner's lane:

  | Page | Its `<title>` today |
  | --- | --- |
  | `a-booking` | `Book a class — Pulse Studio` |
  | `b-dashboard` | `Pulse Studio · Staff dashboard` |
  | `c-chatbot` | `Member Support — Pulse Studio` |
- **Anything a product hardcodes in its own copy.** The gate cannot see
  prose, so a rebrand ends with one grep for the old studio name.

If you find a *shared* file asking to be edited on a rebrand, that is a bug
in this structure — say so instead of adding it to the list.

## The seam was watched working, and it cannot be watched by eye

`scripts/check-brand.mjs` holds the wire from `brand.ts` to every header.
It exists because THE FALLBACK IS A PERFECT IMPOSTOR: each product page
ships static markup reading `PULSE<span>STUDIO</span>`, and
`renderStudioBrand()` writes back exactly those bytes, down to the
`aria-label` the page already carries. So a page that is not wired at all
looks identical to one that works, in every browser, forever — until
somebody rebrands and four headers keep the old name.

Two things were tried as proof and are recorded here because they LOOK
like proof and are not: the rendered brand word, and the `aria-label`.
Both are byte-identical to what the page already ships.

What actually proves it, done on 2026-08-22: set `STUDIO_NAME` to another
name, rebuild, reload. Every header followed — the brand word became
`VERO<span>FITNESS</span>`, the `aria-label` became "Return to Vero
Fitness home", and D's runtime title became "Member Re-engagement — Vero
Fitness". The gate failed at the same moment with four stale fallbacks
named, one per product page. Both were then reverted.

A suite cannot take this over. `scripts/run-suites.mjs` gives each suite a
stub DOM with no `querySelectorAll` and no `setAttribute`, deliberately —
widening it until it could host `renderStudioBrand` would prove the stub
works, not the page.

## The rule for adding a component

One file, one job, named for the job. It may FILL markup a page owns; it
never creates page structure inside someone's lane. If it needs styles the
page must have before the module loads, the styles go in `theme.css`;
styles that only matter once the component exists may self-inject
(`topbar.ts` does).
