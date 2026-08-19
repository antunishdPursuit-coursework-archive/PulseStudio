# Publishing the app with GitHub Pages — the decision and why

**From:** Rensley (Product D) · **Status:** ADOPTED 2026-08-18 (Option A).
`.github/workflows/pages.yml` now builds and publishes on every push to
`main`. This file stays as the record of what was chosen and why, so the
next person does not rediscover the trap the hard way.

## The problem in one line

Browsers cannot run TypeScript, GitHub Pages does not build, and our
compiled `.js` is gitignored — so Pages serving `main` today would return a
page that loads, asks for `main.js`, gets a 404, and sits on "Loading…"
forever. A URL that looks deployed and does nothing is worse than no URL,
so this has to be decided, not improvised.

Verified 2026-08-18: Pages is currently OFF for this repo —
`https://gymsley.github.io/app/` returns 404.

## Two options — the team picks one

**Option A — build in CI (recommended).** The workflow below runs
`npm run build` and publishes `app/`. The repo stays source-only, nobody's
habits change, every product goes live on every push to `main`.
Cost: one new team-owned file, plus the owner's Settings click.

**Option B — commit the compiled output.** Remove the `app/**/*.js` lines
from `.gitignore` and Pages serves `main` directly, no CI at all.
Cost: every pull request carries generated diffs. The usual objection —
conflicts in files nobody wrote — is much weaker here than in a normal repo,
because the lane law keeps each developer's compiled files inside their own
folder; only the four `app/shared/*.js` files are common ground.
Fastest path to a working URL if the team wants one today.

Everything below describes Option A.

## The workflow (copy into `.github/workflows/pages.yml` once agreed)

```yaml
name: pages
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: app
      - id: deployment
        uses: actions/deploy-pages@v4
```

## The owner step after merging it

Repo → Settings → Pages → Source: **GitHub Actions**. That's all.

## What each product gets

- `https://gymsley.github.io/app/` — the front door
- `https://gymsley.github.io/app/products/<x>/` — each product, live
- Product D's unit checks stay one click away at
  `/products/d-reengagement/tests.html`

## Notes for the review

The workflow reads the repo, builds, and publishes `app/` — it stores no
secrets and changes no source. Staff-only pages keep their
`noindex, nofollow` meta. If the team prefers a different host later, nothing
about the source changes — this file just gets replaced by that decision.
