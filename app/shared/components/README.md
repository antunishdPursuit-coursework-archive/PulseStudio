# app/shared/components — pieces every page shows, no page owns

**TEAM-OWNED.** Named so a thing is found by what it does:

| File | What it is | How a page gets it |
| --- | --- | --- |
| `brand-header.ts` | Renders the studio's name into every branded home link (`.home-brand .brand-word`), refreshes their aria-labels, and fills any `[data-studio-name]` with the plain name — all from `../brand.ts` | Automatic: `theme-boot.js` calls `renderStudioBrand()` on every page |
| `logo.ts` | The pulse mark as a callable SVG (`pulseLogo(size)`), same path as `app/favicon.svg`, stroke = `currentColor` | Import and append where a mark is wanted |
| `topbar.ts` | The sign-in control: Sign in button → member picker dialog; signed in → name chip + Sign out. Self-injected styles, accent-aware | Automatic: `theme-boot.js` mounts it into `.topnav`/`.page-head` (opt out: `<body data-no-session>`) |
| `site-footer.ts` | The ONE footer for the whole studio: the mark, the studio word, four named link groups (members · staff · the studio · legal), the outreach promise, the studio's address and its three contact lines, and the way to settings. Every href resolves from the site root, so the same list works at three page depths; every visible detail is real text, never CSS `content:`, so an address can actually be copied | Automatic: `theme-boot.js` appends it (a page that writes its own `<footer>` keeps it; `<body data-no-footer>` refuses one) |
| `alert.ts` | Notice · Problem · Done. A message that says what is true, in a live region created empty at boot so a screen reader is already listening. Nothing here disappears on a timer | Automatic region; `showAlert()` / `dismissAlert()` from anywhere |

## The clone story (change everything from the least files)

1. **`app/shared/brand.ts`** — the studio's NAME **and its contact details**
   (`STUDIO_CONTACT`: street, town, state, postcode, email, and the numbers
   it takes calls and texts on). Every header and every footer follows at
   runtime. A clone that renames the studio and keeps somebody else's
   address is the failure this seam exists to make impossible, so the two
   live in the same file.
2. **`app/shared/theme.css`** — the accent tokens (and the one shared
   `.home-brand` ruleset all headers use — style it here, never per-page).
3. **`app/favicon.svg`** — the mark (`logo.ts` carries the same path for
   in-page use).
3b. **`app/shared/photos/`** — the studio's own pictures, and
   `app/shared/fonts/` if the new studio has its own faces. Both fold into
   one instruction: replace the files, keep the licence files honest.
4. **`app/index.html`** — the front door's title, meta description,
   theme-color, and the address / telephone / email inside its JSON-LD
   block: values markup a crawler reads cannot get from a module at
   runtime.

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

A suite still cannot take this over, and the reason changed on 2026-08-23,
so the old one is recorded rather than replaced. It used to be that
`scripts/run-suites.mjs` gave each suite a stub DOM with no
`querySelectorAll` and no `setAttribute` — that is no longer true. The stub
is now a small real tree (parents, children, attributes, and a selector
engine that THROWS on any selector it cannot parse rather than answering
"no matches"), because the footer and the alert box are worth checking and
every property worth pinning about them is a property of a tree.

The argument survives the fact. What the brand seam needs proving about is
that FOUR PAGES ON DISK are wired to a module, and the fallback markup in
those pages is byte-identical to what the module writes. A stub DOM can
only ever host the module; it cannot open the pages. That is
`scripts/check-brand.mjs`'s job, and it reads the pages.

## The rule for adding a component

One file, one job, named for the job. If it needs styles the page must have
before the module loads, the styles go in `theme.css`; styles that only
matter once the component exists may self-inject (`topbar.ts` does).

**On creating structure in someone else's page — the rule, corrected
2026-08-23.** This said a component "may FILL markup a page owns; it never
creates page structure inside someone's lane", and that sentence was
already false when it was written: `topbar.ts` builds a sign-in chip and a
picker dialog inside four product headers, `theme-boot` builds the
appearance control and, for the four pages that declare no icon, a
`<link rel="icon">`. None of that markup is filled — it is created, in
somebody else's page, by shared code.

What the rule is actually protecting is a product's OWN CONTENT. So it is
now written as the two things that were always meant:

- **Shared code may create the CHROME** — the strip above the page, the
  strip below it, and the alert region between them. Chrome is identical on
  every page and belongs to nobody, which is exactly why one module builds
  it instead of four folders pasting it.
- **Shared code may never reach INSIDE a product's content.** It appends to
  `<body>` or fills a named hook (`.home-brand`, `[data-studio-name]`); it
  does not walk into `<main>` and rearrange what an owner put there.

Every piece of chrome carries an opt-out its owner can use without asking
anybody — `<body data-no-session>`, `<body data-no-footer>` — and adding
one to the list is a team-owned change stated in the pull request.
