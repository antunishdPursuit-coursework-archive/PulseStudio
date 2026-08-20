# app/shared — the team-owned ground, mapped

Start with **[storytold.html](./storytold.html)** — the five-beat story of
how the records flow (A → B → C → D over the shared rail), with the live
map of which hand-offs fire today (green, pulsing) and which are still to
build (red, dark). When a hand-off ships, its owner flips one class in that
file and the segment starts firing.

| Doc | What it covers |
| --- | --- |
| [storytold.html](./storytold.html) | The story and the status map — green fires, red waits |
| [components/README.md](./components/README.md) | The shared components (brand header, logo, sign-in control) and the four-file clone/rebrand checklist |
| [auth/README.md](./auth/README.md) | The session contract: test persona today, the Postgres design for the hosted version |
| [CLAUDE.md](./CLAUDE.md) / [AGENTS.md](./AGENTS.md) | The working rules for any AI on this ground (Claude dialect / Codex + general dialect) |

One law above all here: everything in this folder is TEAM-OWNED — changes
are stated in the commit and the PR, and shared identifiers never get
renamed.
