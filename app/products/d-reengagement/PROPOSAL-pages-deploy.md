# Proposal: publish the app with GitHub Pages (team decision)

**From:** Rensley (Product D) · **Status:** proposed — needs team agreement,
because adopting it means creating `.github/workflows/`, which is team-owned.

## Why

Compiled `.js` is gitignored (correctly — build artifacts cause conflicts the
source never had), so GitHub Pages cannot serve `main` as-is. A tiny build
workflow gives every product a real URL at
`https://gymsley.github.io/app/...` on every push to `main`, with zero
changes to how anyone works.

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
