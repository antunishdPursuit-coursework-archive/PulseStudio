# Member support with Haiku — local setup

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

The browser refuses private-member questions before any network request. The
server accepts only scheduled `class_session` records and current read-only
`studio_policy` records, then passes those records and the member's question
to Haiku.
