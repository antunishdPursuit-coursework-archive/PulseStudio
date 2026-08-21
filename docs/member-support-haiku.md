# Member support with Haiku — local setup and safe context

Product C can use Claude Haiku when Pulse Studio runs through the local Node
server. GitHub Pages remains static and has no safe place for the Anthropic API
key, so the deployed chatbot reports that conversational support is unavailable
until the team chooses a hosted backend.

From the repository root:

```bash
cp .env.example .env
npm run start:haiku
```

Put the Anthropic key after `ANTHROPIC_API_KEY=` in `.env`, then open
`http://localhost:4173/products/c-chatbot/`. Git ignores `.env`; never commit
its contents. `ANTHROPIC_MODEL` can override the pinned default model when the
team intentionally upgrades Haiku.

The server reads the marked section below on every request, so edits take
effect after the next question without rebuilding. Only member-safe guidance
belongs between the markers.

<!-- MEMBER_CONTEXT_START -->
Pulse Studio member support answers questions about current class schedules,
instructors, class levels, spaces available, and current studio policies.
Space counts can include reservations and cancellations made in this browser.
For private account help or information that is not present in the supplied
studio data, direct the member to Pulse Studio staff.
<!-- MEMBER_CONTEXT_END -->

The local server also reads the five public story beats from
`app/shared/storytold.html` on every request. They provide studio background,
but the member-facing answer must not discuss product letters, builders, or
implementation work.
