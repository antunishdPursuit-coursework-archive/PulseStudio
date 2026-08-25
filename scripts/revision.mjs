#!/usr/bin/env node
/* Pulse Studio — the one definition of "a real revision". TEAM-OWNED.
 *
 * WHY THIS IS ITS OWN FILE: `scripts/stamp-revision.mjs` (the write side,
 * run once at build time) and `scripts/start-haiku.mjs` (the read side, run
 * every time the server answers `GET /api/chat`) both have to agree on what
 * counts as a real revision. Writing the same regex twice is exactly the
 * shape of bug this repo has already paid for more than once — `color.ts`,
 * `today.ts` and `storage.ts` all exist because two copies of one rule
 * drifted apart while nothing compared them. One copy here, imported by
 * both, so the write side and the read side cannot quietly disagree.
 *
 * A full git commit SHA-1 is exactly 40 lowercase hex characters — nothing
 * shorter (a short SHA, which git itself will print when asked to
 * abbreviate), nothing longer, and no upper case (`git rev-parse HEAD`
 * always prints lowercase, so upper-case hex is someone's guess or a hand
 * edit, not a real commit). Anything looser would accept "unknown", "dev",
 * a blank string, or an HTML error page a proxy handed back instead of the
 * value this was supposed to read — and each of those has actually shown up
 * in the wild in place of a stamped build value, which is the whole reason
 * this file exists rather than a bare truthiness check.
 */

const FULL_SHA = /^[0-9a-f]{40}$/;

/** True only for a full, lowercase, 40-character git commit SHA. Anything
 *  else — blank, short, "dev", "unknown", mixed case, or a fragment of some
 *  other document entirely — is not a revision this server may report. */
export function isValidRevision(value) {
  return typeof value === "string" && FULL_SHA.test(value);
}
