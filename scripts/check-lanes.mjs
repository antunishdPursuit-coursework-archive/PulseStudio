#!/usr/bin/env node
/* Pulse Studio — the lane gate. TEAM-OWNED.
 *
 * WHY THIS EXISTS: the lane law is the load-bearing one. Every other rule
 * here is about quality; this one is about whether four people can work at
 * once without fighting over the same file. The root brief states the
 * mechanism plainly — "two branches can never touch the same file — that is
 * what makes merge conflicts structurally impossible" — and until this
 * script landed, nothing checked it. It was the only law of its importance
 * enforced entirely by good manners.
 *
 * It was not always kept. On 2026-08-20 one developer's commits edited
 * three other people's product folders (`feat(products-a-d): add branded
 * home links to product headers`, `style(products-c-d): align dashboard
 * headers`). Nothing was hidden — the scope is right there in the subject
 * line — and the intent was good, aligning headers everywhere at once.
 * That is exactly the shape of the problem: the edit that feels most
 * helpful to make across all four folders is the edit the law forbids,
 * and prose alone did not stop it.
 *
 * IT DOES NOT PUNISH THE PAST. It reads only the commits this branch adds
 * on top of origin/main. On main itself that range is empty and the gate
 * says so rather than inventing work. History is not re-judged, because a
 * gate that fails on commits nobody can now change is a gate people learn
 * to skip.
 *
 * IT SKIPS MERGE COMMITS, on purpose and not as an oversight. Merging main
 * into a branch legitimately brings every other lane's files with it; the
 * author of the merge did not write them. This was not a hypothetical when
 * the gate was written — the merge directly before it carried a teammate's
 * whole feature. Judging a merge by its file list would fail every honest
 * one.
 *
 * HONEST LIMITS, because a checker that oversells itself is worse than
 * none:
 *
 *  - It cannot verify AGREEMENT. The law allows team-owned files to change
 *    when the team has agreed and the PR says so. No script can read a
 *    conversation, so team-owned changes are COUNTED and printed, never
 *    failed. The count is there so a reviewer notices when a branch quietly
 *    edits shared ground, and so the PR description can be checked against
 *    it by a human.
 *  - It judges by git author, so a commit made on someone's behalf is
 *    attributed to whoever the commit says wrote it.
 *  - An author it does not recognise is REPORTED, not failed. Failing an
 *    unknown name would block a new teammate on their first commit; passing
 *    silently would leave a hole. Saying so loudly is the honest third
 *    option.
 *
 * Run: node scripts/check-lanes.mjs   (also runs inside `npm run check`)
 * Prove it still works: node scripts/check-lanes.mjs --self-test
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isCommand } from "./is-command.mjs";

/* Importing this file must never RUN the gate — the self-test and any
 * future check import the pure functions directly. */
/* Ten gates carried their own copy of this test and all ten were wrong the
 * same way: reached through a symlink the guard went false and the gate
 * exited 0 having checked nothing. See scripts/is-command.mjs. */
const IS_COMMAND = isCommand(import.meta.url);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/* The four lanes, exactly as the root brief's table states them. */
const LANES = {
  kerrian: "app/products/a-booking/",
  manny: "app/products/b-dashboard/",
  dennis: "app/products/c-chatbot/",
  rensley: "app/products/d-reengagement/",
};

/* Git identities, taken from the real history rather than guessed. People
 * commit from more than one machine and more than one address, and one of
 * these is malformed on purpose: a `git config` command once ended up
 * INSIDE the email field, and those commits are real and permanent. A gate
 * that only knew the tidy address would call that author unknown. */
const IDENTITIES = [
  { lane: "kerrian", matches: ["kerriangordon", "kerrian gordon", "kerrian.gordon@", "kerrian-gordon"] },
  { lane: "manny", matches: ["emmanuel de jesus", "emmanuel.dejesus@"] },
  { lane: "dennis", matches: ["antunishdpursuit"] },
  { lane: "rensley", matches: ["rensley", "ranly196@", "doble196", "rensley@nfteria.cc"] },
];

/* ---------- the rule, as a pure function ---------- */

/** Which lane an author belongs to, or null when nobody recognises them. */
export function laneOf(authorText) {
  const hay = authorText.toLowerCase();
  for (const { lane, matches } of IDENTITIES) {
    if (matches.some((m) => hay.includes(m))) return lane;
  }
  return null;
}

/** Which lane a path belongs to, or null when it is not a product file. */
export function laneOfPath(file) {
  for (const [lane, prefix] of Object.entries(LANES)) {
    if (file.startsWith(prefix)) return lane;
  }
  return null;
}

/**
 * The whole rule. Given one commit's author and the files it changed,
 * return the files that belong to somebody else, plus the team-owned count.
 *
 * A file inside a product folder belongs to that product's developer —
 * every file, not only source. The law says "create and edit files ONLY
 * inside your developer's product folder", with no carve-out for a README
 * or a brief, and treating docs as exempt is how a folder slowly acquires
 * four authors.
 */
export function laneViolations(author, files) {
  const lane = laneOf(author);
  const trespasses = [];
  let teamOwned = 0;
  for (const file of files) {
    const owner = laneOfPath(file);
    if (owner === null) {
      teamOwned += 1;
      continue;
    }
    if (lane !== null && owner !== lane) trespasses.push({ file, owner });
  }
  return { lane, trespasses, teamOwned };
}

/* ---------- reading git ---------- */

function git(args) {
  return execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8" });
}

/** The commits this branch adds on top of origin/main, merges excluded. */
function newCommits() {
  let base;
  try {
    /* stderr is discarded because this call is EXPECTED to fail on a
     * shallow CI checkout, where actions/checkout fetches one commit and
     * no origin/main ref. Letting git print "fatal: Not a valid object
     * name" there makes a green run look broken to whoever reads the log. */
    base = execFileSync("git", ["-C", ROOT, "merge-base", "origin/main", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return { base: null, commits: [] };
  }
  const raw = git([
    "log", "--no-merges", "--format=%H%x1f%an <%ae>", `${base}..HEAD`,
  ]).trim();
  if (raw === "") return { base, commits: [] };
  const commits = raw.split("\n").map((line) => {
    const [sha, author] = line.split("\x1f");
    const files = git(["show", "--name-only", "--format=", sha])
      .split("\n").map((f) => f.trim()).filter((f) => f !== "");
    return { sha, author, files };
  });
  return { base, commits };
}

/* ---------- the self-test ---------- */

function selfTest() {
  const planted = [
    {
      label: "a developer in their own lane passes",
      author: "Rensley <ranly196@gmail.com>",
      files: ["app/products/d-reengagement/logic.ts"],
      wantTrespasses: 0,
    },
    {
      label: "a developer in someone else's lane fails",
      author: "Rensley <ranly196@gmail.com>",
      files: ["app/products/a-booking/main.ts"],
      wantTrespasses: 1,
    },
    {
      label: "the real cross-lane commit from 2026-08-20 would have failed",
      author: "Emmanuel De Jesus <emmanuel.dejesus@pursuit.org>",
      files: [
        "app/products/a-booking/index.html",
        "app/products/c-chatbot/index.html",
        "app/products/d-reengagement/index.html",
      ],
      wantTrespasses: 3,
    },
    {
      label: "a brief is not exempt just because it is a document",
      author: "Rensley <ranly196@gmail.com>",
      files: ["app/products/c-chatbot/CLAUDE.md"],
      wantTrespasses: 1,
    },
    {
      label: "team-owned ground is counted, never failed",
      author: "Rensley <ranly196@gmail.com>",
      files: ["app/shared/theme.css", "package.json", "docs/README.md"],
      wantTrespasses: 0,
      wantTeamOwned: 3,
    },
    {
      label: "the malformed email in real history is still recognised",
      author:
        "kerriangordon <kerrian.gordon@pursuit.orggit config --global user.email kerrian.gordon@pursuit.org>",
      files: ["app/products/a-booking/styles.css"],
      wantTrespasses: 0,
    },
    {
      label: "an unrecognised author is reported, not judged",
      author: "Someone New <new@pursuit.org>",
      files: ["app/products/a-booking/main.ts"],
      wantTrespasses: 0,
      wantLane: null,
    },
  ];

  let failed = 0;
  for (const c of planted) {
    const got = laneViolations(c.author, c.files);
    const okT = got.trespasses.length === c.wantTrespasses;
    const okO =
      c.wantTeamOwned === undefined || got.teamOwned === c.wantTeamOwned;
    const okL = !("wantLane" in c) || got.lane === c.wantLane;
    if (!okT || !okO || !okL) {
      failed += 1;
      console.error(
        `  self-test MISS — ${c.label}: wanted ${c.wantTrespasses} trespass(es), got ${got.trespasses.length}`,
      );
    }
  }
  console.log(
    `self-test: ${planted.length} planted cases, ${planted.length - failed} behaved, ${failed} did not.`,
  );
  console.log(
    failed === 0
      ? "self-test PASSED — the gate can still fail. (Says nothing about which commits it reads; see the limits above.)"
      : "self-test FAILED — the gate is blind.",
  );
  process.exit(failed === 0 ? 0 : 1);
}

/* ---------- the gate ---------- */

function run() {
  const { base, commits } = newCommits();
  if (base === null) {
    console.log(
      "check-lanes: no origin/main to compare against, so there is no range to read. " +
        "SKIPPED — stated rather than counted as a pass.",
    );
    return;
  }
  if (commits.length === 0) {
    console.log(
      "check-lanes: 0 commits on top of origin/main, so nothing to check. PASS",
    );
    return;
  }

  const failures = [];
  const unknown = new Set();
  let teamOwnedTotal = 0;
  const laneCounts = new Map();

  for (const { sha, author, files } of commits) {
    const { lane, trespasses, teamOwned } = laneViolations(author, files);
    teamOwnedTotal += teamOwned;
    if (lane === null) unknown.add(author);
    else laneCounts.set(lane, (laneCounts.get(lane) ?? 0) + 1);
    for (const t of trespasses) {
      failures.push({ sha: sha.slice(0, 7), author, file: t.file, owner: t.owner });
    }
  }

  const who = [...laneCounts.entries()]
    .map(([lane, n]) => `${lane} ${n}`)
    .join(", ");
  console.log(
    `check-lanes: ${commits.length} commit${commits.length === 1 ? "" : "s"} on top of origin/main ` +
      `read for lane trespass (merges excluded)${who ? ` — ${who}` : ""}.`,
  );
  console.log(
    `check-lanes: ${teamOwnedTotal} change${teamOwnedTotal === 1 ? "" : "s"} to team-owned ground, ` +
      "which this gate counts but cannot judge — the law asks for agreement, and the PR has to state it.",
  );
  for (const author of unknown) {
    console.log(
      `  unrecognised author · ${author} · not judged. Add them to IDENTITIES in this script.`,
    );
  }

  if (failures.length === 0) {
    console.log("check-lanes: every commit stayed in its own lane. PASS");
    return;
  }
  for (const f of failures) {
    console.error(
      `  trespass · ${f.sha} · ${f.author} changed ${f.file}, which belongs to ${f.owner}.`,
    );
  }
  console.error(
    `check-lanes: ${failures.length} file${failures.length === 1 ? "" : "s"} changed outside their author's lane. FAIL`,
  );
  process.exit(1);
}

if (IS_COMMAND) {
  if (process.argv.includes("--self-test")) selfTest();
  else run();
}
