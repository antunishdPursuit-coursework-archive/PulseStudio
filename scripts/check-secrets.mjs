#!/usr/bin/env node
/* Pulse Studio — the secrets gate. TEAM-OWNED.
 *
 * WHY THIS EXISTS: the git law ends "This repo is PUBLIC: no secrets, no
 * keys, no real member data." It is the only law here whose breach cannot
 * be taken back. A style slip is edited; a key pushed to a public
 * repository is harvested within minutes, and rewriting history does not
 * unpublish it — the commit stays reachable by SHA on GitHub long after
 * the branch is gone. The only real fix is to rotate the key.
 *
 * It stopped being hypothetical on 2026-08-21, when Product C gained a
 * local Haiku server that reads ANTHROPIC_API_KEY from a .env file. Before
 * that this repo had no reason to hold a credential at all. `.gitignore`
 * covers every env file, which stops the obvious mistake; it does nothing
 * about a key pasted into a document, a comment, a test, or a commit made
 * with `git add -f`.
 *
 * MENTION IS NOT USE, the same rule check-language.mjs runs on. A document
 * that says `ANTHROPIC_API_KEY=` is telling a reader where to put their own
 * key and must pass. What fails is a NAME followed by a VALUE.
 *
 * HONEST LIMITS, because a checker that oversells itself is worse than
 * none:
 *
 *  - It reads tracked files at their CURRENT contents. It does not walk
 *    history, so a key committed and later deleted is invisible here. If
 *    you think that happened, this gate cannot tell you — rotate the key.
 *  - It knows the shapes it was taught. A credential in a format nobody
 *    listed sails through, and a long random-looking string assigned to a
 *    variable called something else is not flagged.
 *  - "No real member data" is NOT checked. Every person in the fixtures is
 *    fictional by construction and the synthetic validator scans generated
 *    records for identifier-shaped runs, but no script can look at a name
 *    and know whether a real person answers to it.
 *
 * Run: node scripts/check-secrets.mjs   (also runs inside `npm run check`)
 * Prove it still works: node scripts/check-secrets.mjs --self-test
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const IS_COMMAND =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/* Files whose bytes are not prose. Stated rather than silently skipped. */
const BINARY_EXTENSIONS = [
  ".woff2", ".woff", ".ttf", ".otf", ".webp", ".png", ".jpg", ".jpeg",
  ".gif", ".ico", ".pdf", ".zip", ".mp4", ".webm",
];

/* The shapes, each with the vendor it belongs to so a failure tells you
 * WHICH key to rotate — the only action that actually helps. Every pattern
 * requires enough trailing characters that the regex source cannot match
 * itself; this file is scanned like any other. */
const SECRET_PATTERNS = [
  { code: "anthropic-key", vendor: "Anthropic", re: /\bsk-ant-[A-Za-z0-9_-]{24,}/ },
  { code: "openai-key", vendor: "OpenAI", re: /\bsk-[A-Za-z0-9]{32,}/ },
  { code: "github-token", vendor: "GitHub", re: /\b(?:ghp|gho|ghs|ghu)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{30,}/ },
  { code: "aws-access-key", vendor: "AWS", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { code: "google-api-key", vendor: "Google", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { code: "slack-token", vendor: "Slack", re: /\bxox[baprs]-[A-Za-z0-9-]{12,}/ },
  { code: "private-key-block", vendor: "whoever issued it", re: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/ },
];

/* A named credential handed an actual value. The name alone is fine —
 * that is what every setup document writes. */
const ASSIGNED = /\b(api[_-]?key|apikey|secret|access[_-]?token|auth[_-]?token|password|passwd)\b\s*[:=]\s*["'`]?([^\s"'`,;]{16,})["'`]?/i;

/* Values that look like a credential but are telling you to supply one.
 * Without these the gate fails every honest setup document it reads. */
const PLACEHOLDER = /^(your|my|the|put|insert|replace|add|paste|xxx|<|\$|\{|%|todo|changeme|placeholder|redacted|removed|example|fixture|none|null|empty)/i;

/* ---------- the rule, as a pure function ---------- */

export function secretHits(line) {
  const hits = [];
  for (const { code, vendor, re } of SECRET_PATTERNS) {
    if (re.test(line)) hits.push({ code, vendor });
  }
  const assigned = line.match(ASSIGNED);
  if (assigned !== null) {
    const value = assigned[2] ?? "";
    /* A value has to look random to be a credential. All-one-case letters
     * with no digits is prose, a path, or a CSS token — the thing that
     * makes a key a key is that it mixes. */
    const mixes = /[0-9]/.test(value) && /[A-Za-z]/.test(value);
    if (mixes && !PLACEHOLDER.test(value)) {
      hits.push({ code: "assigned-credential", vendor: "unknown" });
    }
  }
  return hits;
}

/* ---------- the self-test ---------- */

function selfTest() {
  /* Planted keys are ASSEMBLED so this file does not carry a key shape of
   * its own. check-language.mjs learned the same lesson: a gate that trips
   * on its own test data fails every run and teaches people to skip it. */
  const antKey = `sk-` + `ant-` + "A".repeat(30);
  const awsKey = `AKIA` + "ABCDEFGHIJKLMNOP";
  const ghToken = `ghp_` + "a1b2c3d4e5".repeat(3) + "abcdef";
  const beginKey = `-----BEGIN ` + `PRIVATE KEY-----`;

  const planted = [
    { label: "an Anthropic key fails", input: `ANTHROPIC_API_KEY=${antKey}`, want: true },
    { label: "an AWS access key fails", input: `aws_access_key_id = ${awsKey}`, want: true },
    { label: "a GitHub token fails", input: `token: ${ghToken}`, want: true },
    { label: "a private key block fails", input: beginKey, want: true },
    { label: "the variable NAME alone passes", input: "Put the Anthropic key after `ANTHROPIC_API_KEY=` in `.env`", want: false },
    { label: "an empty env template passes", input: "ANTHROPIC_API_KEY=", want: false },
    { label: "a told-you-so placeholder passes", input: 'api_key = "YOUR_KEY_HERE_1234"', want: false },
    { label: "a model name assigned to a variable passes", input: "ANTHROPIC_MODEL=claude-haiku-4-5-20251001", want: false },
    { label: "prose about secrets passes", input: "This repo is PUBLIC: no secrets, no keys, no real member data.", want: false },
    { label: "a long random value on a credential name fails", input: 'password: "hunter2Zx9Qw8Er7Ty6Ui5Op"', want: true },
    { label: "a css custom property is not a credential", input: "--accent-strong: #743df5;", want: false },
    { label: "a lockfile integrity hash is not a credential", input: '"integrity": "sha512-abc123DEF456ghi789JKL012mno345PQR678stu901"', want: false },
  ];

  let failed = 0;
  for (const c of planted) {
    const got = secretHits(c.input).length > 0;
    if (got !== c.want) {
      failed += 1;
      console.error(
        `  self-test MISS — ${c.label}: wanted ${c.want ? "a hit" : "no hit"}, got ${got ? "a hit" : "no hit"}`,
      );
    }
  }
  console.log(
    `self-test: ${planted.length} planted cases, ${planted.length - failed} behaved, ${failed} did not.`,
  );
  console.log(
    failed === 0
      ? "self-test PASSED — the gate can still fail. (Says nothing about history; see the limits above.)"
      : "self-test FAILED — the gate is blind.",
  );
  process.exit(failed === 0 ? 0 : 1);
}

/* ---------- the gate ---------- */

function run() {
  const tracked = execFileSync("git", ["-C", ROOT, "ls-files"], {
    encoding: "utf8",
  })
    .split("\n").map((f) => f.trim()).filter((f) => f !== "");

  const failures = [];
  let scanned = 0;
  let skipped = 0;

  for (const file of tracked) {
    if (BINARY_EXTENSIONS.some((ext) => file.toLowerCase().endsWith(ext))) {
      skipped += 1;
      continue;
    }
    let text;
    try {
      text = readFileSync(join(ROOT, file), "utf8");
    } catch {
      /* A tracked file we cannot read is a FAILURE, never a silent skip. */
      failures.push({ file, line: 0, code: "unreadable", vendor: "n/a" });
      continue;
    }
    scanned += 1;
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      for (const hit of secretHits(lines[i] ?? "")) {
        failures.push({ file, line: i + 1, ...hit });
      }
    }
  }

  console.log(
    `check-secrets: ${scanned} tracked text files scanned for ${SECRET_PATTERNS.length} credential shapes ` +
      `and named-value assignment; ${skipped} binary files skipped.`,
  );

  if (failures.length === 0) {
    console.log("check-secrets: no credential material in any tracked file. PASS");
    return;
  }
  for (const f of failures) {
    console.error(
      `  ${f.code} · ${f.file}:${f.line} · this looks like a credential issued by ${f.vendor}. ` +
        "Removing the line is NOT enough — a public commit stays reachable by SHA. Rotate the key first, then remove it.",
    );
  }
  console.error(
    `check-secrets: ${failures.length} possible credential${failures.length === 1 ? "" : "s"} in tracked files. FAIL`,
  );
  process.exit(1);
}

if (IS_COMMAND) {
  if (process.argv.includes("--self-test")) selfTest();
  else run();
}
