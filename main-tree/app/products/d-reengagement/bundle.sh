#!/bin/sh
# Rebuild product-d-sources.md — the single-file bundle handed to an outside
# reviewer. Run it from anywhere; it always writes beside itself.
#
# The bundle is a COPY of files that already live in git, so it goes stale the
# moment any of them changes. It stamps the commit it was built from, which is
# how a reviewer can tell: if the stamped hash is not HEAD, regenerate.
#
#   sh app/products/d-reengagement/bundle.sh
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../../.." && pwd)
OUT="$HERE/product-d-sources.md"
cd "$ROOT"
{
  echo "# Product D source bundle"
  echo
  echo "Commit: $(git rev-parse HEAD)"
  echo
  echo "Files under app/products/d-reengagement/ (Product D — editable by the reviewer),"
  echo "then app/shared/* (TEAM-OWNED — read-only context, imported via deps.ts)."
  for f in \
    app/products/d-reengagement/deps.ts \
    app/products/d-reengagement/config.ts \
    app/products/d-reengagement/logic.ts \
    app/products/d-reengagement/csv.ts \
    app/products/d-reengagement/generate.ts \
    app/products/d-reengagement/main.ts \
    app/products/d-reengagement/tests.ts \
    app/products/d-reengagement/index.html \
    app/products/d-reengagement/tests.html \
    app/products/d-reengagement/styles.css \
    app/shared/contract.ts \
    app/shared/data.ts \
    app/shared/fixtures.json \
    app/shared/theme.css
  do
    echo
    echo "## $f"
    echo
    echo '```'
    cat "$f"
    echo '```'
  done
} > "$OUT"
echo "wrote $OUT ($(wc -l < "$OUT") lines)"
