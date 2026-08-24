/* Pulse Studio — which unit suites exist. The ONE place that knows.
 *
 * WHY THIS IS ITS OWN FILE, and it is not tidiness.
 *
 * The list of suites has now gone stale twice, in two different files, for
 * the same reason: it was written down by hand somewhere and nothing made
 * it agree with the repo.
 *
 *   1. `run-suites.mjs` held a hand-written array of three. Three more
 *      suites were written and committed — booking, the dashboard, the
 *      chatbot — and run by nothing at all, so `npm run check` reported a
 *      confident green over checks that never executed. Fixed by SEARCHING
 *      for suites instead of remembering them, which is what this file does.
 *   2. That fix then broke `mutate-suite.mjs`, which kept its own copy of
 *      the suite KEYS. The search names a suite after its folder, so
 *      "reengagement" became "d-reengagement" and every mutation survey of
 *      Product D died on `unknown suite "reengagement"` — while the error
 *      it printed blamed a stale build and told you to run `npm run build`,
 *      which was the wrong thing to go and check.
 *
 * One list, imported by both, so the second failure cannot recur: a suite
 * added to the repo is a suite both tools see, and neither can hold an
 * opinion about suite names that the folders disagree with.
 *
 * Importing this file runs NOTHING. That is the point — `run-suites.mjs`
 * executes every suite at module load, so a tool that only wants to know
 * what exists cannot import it without running all of them.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

/* The only thing kept by hand is the label a person reads in the output.
 * A suite with no label is a hard ERROR, never a skip: naming it costs one
 * line, and skipping it silently costs a green that means nothing. */
export const SUITE_LABELS = {
  "app/shared/synthetic": "synthetic studio engine",
  "app/shared/auth": "session contract",
  "app/products/a-booking": "class booking",
  "app/products/b-dashboard": "staff dashboard",
  "app/products/c-chatbot": "member support",
  "app/products/d-reengagement": "member re-engagement",
};

/** Every folder under app/ holding a tests.html, with the key both tools
 *  address it by. The key is the FOLDER NAME — the one identifier that
 *  cannot drift from the thing it names. */
export function discoverSuites(root) {
  const found = [];
  for (const area of ["app/products", "app/shared"]) {
    const base = join(root, area);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = `${area}/${entry.name}`;
      if (!existsSync(join(root, dir, "tests.html"))) continue;
      const label = SUITE_LABELS[dir];
      if (label === undefined) {
        throw new Error(
          `A suite at ${dir}/tests.html has no label. Add "${dir}" to ` +
            "SUITE_LABELS in scripts/suites.mjs. A suite the tools cannot " +
            "name is a suite nobody reads the result of.",
        );
      }
      found.push({ key: entry.name, dir, label });
    }
  }
  return found.sort((a, b) => a.dir.localeCompare(b.dir));
}
