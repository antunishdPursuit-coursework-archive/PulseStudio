# Status — mission control, as of this session

One-glance state for questions that come up mid-presentation. Format
borrowed from a "war room" mission-control briefing: what's live, what's
mid-flight, what's next — read top to bottom, most-settled first.

## Live now

- **GitHub Pages** (static): <https://antunishdpursuit.github.io/PulseStudio/>
  — all four products work; the support assistant and both staff doors
  honestly report themselves closed, because a static host has no process
  to hold a key or check a passphrase in.
- **pulse.githat.io** (server-backed, `scripts/start-haiku.mjs`): the
  member support assistant answers for real there. Staff sign-in via
  GitHat OAuth is deployed and wired, with the token-exchange fix below
  landing shortly — check `GET https://pulse.githat.io/api/chat` for the
  `revision` field if asked "which commit is this" live.

## Merged to `main` this session

- **PR #86** — Pulse's GitHat OAuth client stopped verifying an OIDC
  `id_token` GitHat never mints (a bug that would have silently rejected
  every real sign-in); rewrote it to trust the direct server-to-server
  token-exchange response instead. Also closed a real revocation bug an
  adversarial review caught: a removed staff member's session used to
  keep working across a restart.
- **PR #87** (Manny) — Product B dashboard navigation panel.

## In flight — do not claim these are done

- **PR #88** — `fix/githat-oauth-match-fleet-pattern`. Real sign-in
  attempts against GitHat still failed after #86, because Pulse was
  sending OAuth-standard params + PKCE that **no other fleet app actually
  uses**. Rewritten to match the wire contract every other working
  consumer (SebasTN, Quantl) sends: `app` + `redirect_url` + `state` on
  the authorize leg, bare JSON `{code}` on the token leg — no PKCE. Gate
  green locally (15 gates, 1701 checks); GitHub Actions CI on this PR was
  unusually slow to pick up and was still queued when this was written —
  **check its actual state before telling anyone it merged.**
- **Fleet PR #160** (`doble196/fleet`, GitHat's own dashboard) — fixes the
  dashboard never actually showing which email you're signed in as (the
  comparison guarding it compared a value against itself). Small,
  low-risk, parked for the GitHat team's own review — not something this
  session merges unilaterally, same as every other change to shared fleet
  infrastructure serving other paying apps.

## Known, deliberately not fixed this session

- **GitHat's own Google/Dynamic sign-in** still hits a required-fields
  wall for any brand-new identity — a real platform limitation in the SDK
  GitHat uses, not something patchable from Pulse's side. Native
  email+code sign-in works and is the supported path today.
- **The full `pulse.githat.io` owner bootstrap** needs one more real
  step: after PR #88 deploys, sign in with GitHat for real once — the
  denial page prints your GitHat account id, and that value goes into
  `OWNER_GITHAT_SUBJECT` (already staged as a placeholder secret; swap it
  and restart `pulse.service`).

## If asked live "is it actually working"

Don't answer from this file — it ages the moment CI finishes or someone
merges something. Run the same probes this session used:

```bash
curl -s https://pulse.githat.io/api/chat
curl -s -o /dev/null -w '%{http_code}\n' https://pulse.githat.io/auth/githat/start
gh pr view 88 --json state,mergeable,statusCheckRollup
```
