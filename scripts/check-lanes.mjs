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
import { existsSync, readFileSync } from "node:fs";
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

/* ---------- proposal branches: the one way across a lane line ----------
 *
 * The lane law has no answer for "here is what your folder could look
 * like", and that is a normal thing for one developer to offer another.
 * The only honest way to offer it is as code somebody can read, run and
 * decide about — which means a branch where the lane line is crossed
 * deliberately, and never merged.
 *
 * THIS IS THE ONLY PLACE THAT PERMISSION EXISTS, and it is deliberately
 * hard to use by accident:
 *
 *   - the branch must be NAMED in docs/proposal-branches.json, with a
 *     reason and the exact lanes it may reach into
 *   - a lane it did not declare still fails
 *   - `main` can never be declared; the gate refuses the whole file if it
 *     ever appears there, because a proposal that reached main would be
 *     the trespass this law exists to stop, wearing a permission slip
 *   - every proposed file is PRINTED on every run. The point is not to
 *     make the crossing quiet; it is to make it legible.
 *
 * What it does NOT do is change who wrote anything. Authorship is never
 * forged: each commit is attributed to whoever actually made it, and the
 * lane it reached into is named.
 */
export const PROPOSALS_FILE = "docs/proposal-branches.json";

/** The declaration covering `branch`, or null. Pure so the self-test can
 *  hand it a table without touching the repository. */
export function proposalFor(branch, table) {
  if (typeof branch !== "string" || branch === "") return null;
  const rows = Array.isArray(table?.branches) ? table.branches : [];
  return rows.find((row) => row.branch === branch) ?? null;
}

/** Everything wrong with the declaration table itself. A table naming main
 *  is not a mistake to route around — it is refused outright. */
export function proposalTableProblems(table) {
  const problems = [];
  const rows = Array.isArray(table?.branches) ? table.branches : null;
  if (rows === null) return ["docs/proposal-branches.json has no `branches` array"];
  for (const row of rows) {
    if (row.branch === "main") {
      problems.push(
        "main is declared as a proposal branch. It cannot be: a cross-lane change that " +
          "reached main is exactly the trespass this law exists to stop.",
      );
    }
    if (typeof row.why !== "string" || row.why.trim().length < 20) {
      problems.push(`${row.branch}: no reason given, and a permission without a reason is just an exception`);
    }
    for (const lane of row.lanes ?? []) {
      if (!(lane in LANES)) problems.push(`${row.branch}: declares lane "${lane}", which is not one of the four`);
    }
  }
  return problems;
}

/** Split the trespasses this branch made into the ones it declared and the
 *  ones it did not. With no declaration, everything is unexpected — which
 *  is the ordinary behaviour of this gate. */
export function splitTrespasses(trespasses, declaration) {
  const allowed = new Set(declaration?.lanes ?? []);
  const proposed = [];
  const unexpected = [];
  for (const t of trespasses) (allowed.has(t.owner) ? proposed : unexpected).push(t);
  return { proposed, unexpected };
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

  /* THE PROPOSAL PERMISSION HAS TO BE PROVABLY NARROW. A widening this gate
   * cannot fail on is a widening that has quietly removed the law. Each of
   * these plants a way the permission could leak and checks it does not. */
  const table = {
    branches: [
      { branch: "b", why: "a reason long enough to actually be a reason", lanes: ["manny"], neverMerge: true },
    ],
  };
  const trespasses = [
    { file: "app/products/b-dashboard/main.ts", owner: "manny" },
    { file: "app/products/a-booking/main.ts", owner: "kerrian" },
  ];
  const proposalCases = [
    {
      label: "an undeclared branch gets no permission at all",
      run: () => splitTrespasses(trespasses, proposalFor("feat/whatever", table)).unexpected.length,
      want: 2,
    },
    {
      label: "a declared branch's OWN lane is proposed, not failed",
      run: () => splitTrespasses(trespasses, proposalFor("b", table)).proposed.length,
      want: 1,
    },
    {
      label: "...and a lane it did not declare still fails",
      run: () => splitTrespasses(trespasses, proposalFor("b", table)).unexpected.length,
      want: 1,
    },
    {
      label: "a detached HEAD matches nothing, so it fails safe",
      run: () => splitTrespasses(trespasses, proposalFor("HEAD", table)).unexpected.length,
      want: 2,
    },
    {
      label: "an empty branch name matches nothing either",
      run: () => splitTrespasses(trespasses, proposalFor("", table)).unexpected.length,
      want: 2,
    },
    {
      label: "no table at all means no permission",
      run: () => splitTrespasses(trespasses, proposalFor("b", null)).unexpected.length,
      want: 2,
    },
    {
      label: "main can never be declared a proposal branch",
      run: () => proposalTableProblems({ branches: [{ branch: "main", why: "x".repeat(30), lanes: ["manny"] }] }).length,
      want: 1,
    },
    {
      label: "a permission with no reason is refused",
      run: () => proposalTableProblems({ branches: [{ branch: "b", why: "why not", lanes: ["manny"] }] }).length,
      want: 1,
    },
    {
      label: "a lane that is not one of the four is refused",
      run: () => proposalTableProblems({ branches: [{ branch: "b", why: "x".repeat(30), lanes: ["nobody"] }] }).length,
      want: 1,
    },
    {
      label: "the table this repository actually ships is accepted",
      run: () => existsSync(join(ROOT, PROPOSALS_FILE))
        ? proposalTableProblems(JSON.parse(readFileSync(join(ROOT, PROPOSALS_FILE), "utf8"))).length
        : 0,
      want: 0,
    },
  ];
  for (const c of proposalCases) {
    const got = c.run();
    if (got !== c.want) {
      failed += 1;
      console.error(`  self-test MISS — ${c.label}: wanted ${c.want}, got ${got}`);
    }
  }

  console.log(
    `self-test: ${planted.length + proposalCases.length} planted cases, ` +
      `${planted.length + proposalCases.length - failed} behaved, ${failed} did not.`,
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

  /* WHICH BRANCH IS THIS. On CI the checkout is detached, so `git
   * rev-parse --abbrev-ref HEAD` answers "HEAD" — which matches no
   * declaration and therefore fails safe. GITHUB_REF_NAME is the name CI
   * knows even then, and is read first for that reason. */
  const branch = (process.env["GITHUB_REF_NAME"] ?? "").trim() ||
    (() => { try { return git(["rev-parse", "--abbrev-ref", "HEAD"]).trim(); } catch { return ""; } })();

  let table = null;
  if (existsSync(join(ROOT, PROPOSALS_FILE))) {
    try {
      table = JSON.parse(readFileSync(join(ROOT, PROPOSALS_FILE), "utf8"));
    } catch (error) {
      console.error(`check-lanes: ${PROPOSALS_FILE} is not readable JSON — ${error.message}. FAIL`);
      process.exit(1);
    }
    const problems = proposalTableProblems(table);
    if (problems.length > 0) {
      for (const p of problems) console.error(`  ${PROPOSALS_FILE} · ${p}`);
      console.error("check-lanes: the proposal table itself is not allowed to say that. FAIL");
      process.exit(1);
    }
  }
  const declaration = proposalFor(branch, table);

  const failures = [];
  const proposals = [];
  const unknown = new Set();
  let teamOwnedTotal = 0;
  const laneCounts = new Map();

  for (const { sha, author, files } of commits) {
    const { lane, trespasses, teamOwned } = laneViolations(author, files);
    teamOwnedTotal += teamOwned;
    if (lane === null) unknown.add(author);
    else laneCounts.set(lane, (laneCounts.get(lane) ?? 0) + 1);
    const { proposed, unexpected } = splitTrespasses(trespasses, declaration);
    for (const t of proposed) {
      proposals.push({ sha: sha.slice(0, 7), author, file: t.file, owner: t.owner });
    }
    for (const t of unexpected) {
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

  /* THE CROSSING IS PRINTED, ALWAYS. A declared proposal branch does not
   * get to be quiet about what it reached into — it gets to not fail. Every
   * file is named, grouped by whose lane it is, so the owner reading this
   * branch can see the whole of what is being offered to them. */
  if (declaration !== null) {
    const byOwner = new Map();
    for (const p of proposals) {
      if (!byOwner.has(p.owner)) byOwner.set(p.owner, new Set());
      byOwner.get(p.owner).add(p.file);
    }
    const total = [...byOwner.values()].reduce((n, s) => n + s.size, 0);
    console.log(
      `check-lanes: branch "${branch}" is a declared PROPOSAL (${PROPOSALS_FILE}) — ` +
        `${total} file${total === 1 ? "" : "s"} across ${byOwner.size} lane${byOwner.size === 1 ? "" : "s"} ` +
        "changed on purpose, and reported rather than failed.",
    );
    console.log(`  why · ${declaration.why}`);
    for (const [owner, files] of [...byOwner].sort()) {
      console.log(`  proposed to ${owner} · ${[...files].sort().join(", ")}`);
    }
    if (declaration.neverMerge === true) {
      console.log(
        "  this branch is declared never-merge. Nothing here reaches main; each owner " +
          "takes what they want from their own folder.",
      );
    }
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
