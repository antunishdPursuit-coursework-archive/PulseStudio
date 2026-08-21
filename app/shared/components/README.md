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
4. **`app/index.html`** — the front door's title, meta description, and
   theme-color: values a `<meta>` tag cannot read at runtime.

That is the whole rebrand **for everything shared**. Two honest remainders,
each in an owner's lane rather than here (an audit caught this page claiming
otherwise):

- **Each product page's `<title>`** still spells the studio out, because a
  document title is read before any module runs. Four one-word edits, one
  per owner.
- **Anything a product hardcodes in its own copy.** The gate cannot see
  prose, so a rebrand ends with one grep for the old studio name.

If you find a *shared* file asking to be edited on a rebrand, that is a bug
in this structure — say so instead of adding it to the list.

## The rule for adding a component

One file, one job, named for the job. It may FILL markup a page owns; it
never creates page structure inside someone's lane. If it needs styles the
page must have before the module loads, the styles go in `theme.css`;
styles that only matter once the component exists may self-inject
(`topbar.ts` does).
