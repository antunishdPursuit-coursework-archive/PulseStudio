#!/bin/sh
# Rebuild product-d-sources.md — the single-file bundle handed to an outside
# reviewer. Run it from anywhere; it derives every path from its own location,
# so it works from a clean clone on any machine.
#
#   sh scripts/bundle-product-d.sh
#
# WHY IT LIVES IN scripts/ AND NOT BESIDE THE PRODUCT. It used to sit at
# app/products/d-reengagement/bundle.sh, and app/ IS the website — the Pages
# workflow publishes it with `path: app`, so this script was being served at a
# public URL. That is the exact mistake the filing law was written for, and the
# second time this product has made it: two of its internal documents were
# public until they moved to docs/ on 2026-08-21. Tooling a human runs, that
# ships to nobody, belongs here.
#
# WHY THE FILE LIST IS DERIVED AND NOT TYPED OUT. It used to be a hand-written
# list, and it had silently fallen two files behind: outreach.ts (the entire
# outreach discipline — once per lapse, do-not-contact, the consent window, the
# closed loop) and live-studio.ts (the live trail) were both missing. The
# bundle still stamped HEAD, so the staleness check a reviewer is told to
# perform passed while they held an incomplete product. A list maintained by
# memory drifts; `git ls-files` cannot.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/.." && pwd)
PRODUCT="app/products/d-reengagement"
OUT="$ROOT/$PRODUCT/product-d-sources.md"
cd "$ROOT"

# Every tracked source in the product, in a stable order a reviewer can
# follow: the portability seam first, then the engine, then the surface.
PRODUCT_FILES=$(git ls-files "$PRODUCT" | grep -E '\.(ts|css|html)$' | sort)

# The team-owned context the product imports through deps.ts. Read-only for a
# reviewer, so it is listed explicitly rather than swept in — app/shared is
# large and most of it is not this product's business.
SHARED_FILES="app/shared/contract.ts
app/shared/data.ts
app/shared/fixtures.json
app/shared/theme.css"

{
  echo "# Product D source bundle"
  echo
  echo "Commit: $(git rev-parse HEAD)"
  echo
  echo "This bundle is a COPY of files that already live in git, so it goes"
  echo "stale the moment any of them changes. The commit stamped above is how"
  echo "you tell: if it is not HEAD, regenerate with"
  echo "\`sh scripts/bundle-product-d.sh\`."
  echo
  echo "Files under $PRODUCT/ (Product D — editable by the reviewer),"
  echo "then app/shared/* (TEAM-OWNED — read-only context, imported via deps.ts)."
  echo
  echo "The product file list is derived from \`git ls-files\` at build time, so"
  echo "it cannot fall behind the way a typed-out list did."
  for f in $PRODUCT_FILES $SHARED_FILES
  do
    echo
    echo "## $f"
    echo
    echo '```'
    cat "$f"
    echo '```'
  done
} > "$OUT"

PRODUCT_COUNT=$(printf '%s\n' "$PRODUCT_FILES" | grep -c .)
SHARED_COUNT=$(printf '%s\n' "$SHARED_FILES" | grep -c .)
echo "wrote $OUT — $PRODUCT_COUNT product files, $SHARED_COUNT shared files, $(wc -l < "$OUT") lines"
