# Product C: Member Support Chatbot

**Owner:** Dennis
**Phase:** First release
**Evidence level:** Implemented locally

## First user and outcome

The first user is a Pulse Studio member with a question about an upcoming
class or a current studio policy. The outcome is a concise answer grounded in
the same shared records the other products use.

## Behavior contract

The chatbot answers from upcoming scheduled `class_session` records and current
`studio_policy` records only. It refuses questions about a member's account,
bookings, attendance, membership, reservations, or visit history before any
question reaches the conversational service.

The local server can use Claude Haiku to phrase an answer. GitHub Pages cannot
run that conversation until the team provides a hosted endpoint that keeps the
Anthropic key secret. Local setup and server behavior are documented in
`docs/the-server.md`.

## Golden path

1. A member asks about the schedule or a studio policy.
2. The browser refuses the question if it asks for private member data.
3. Product C loads the shared fixture through `loadFixtures()`.
4. Only upcoming scheduled sessions and current policies become model context.
5. The member receives a grounded answer or a stated miss.

## Shared data use

Reads `class_session` fields `session_id`, `class_type`, `level`, `starts_at`,
`ends_at`, and `session_status`. Reads all `studio_policy` fields so the model
can identify the record, verify `is_current`, and preserve its answer.

Product C reads the fixture timezone envelope to interpret the current studio
date. It creates or updates no shared records. Policies remain read-only.

## Privacy boundary

Product C never reads member, membership, instructor, reservation, attendance,
risk, ranking, or outreach records. It never reads another product's browser
storage. It therefore cannot answer member-specific questions, instructor
questions, roster questions, or live space counts.

Product C reads the shared session only to choose member-facing wording. It
does not use that session as access control and writes no browser storage.
Server-side member-name checking remains pending with the coordinated
public/staff data split.

## Acceptance checks

- "Did Maria come last week?" is refused before a network request.
- "How late can I cancel?" returns `pol_001`'s 12-hour rule.
- A policy question with no current matching record states that no current
  policy exists and directs the member to studio staff.
- The model request contains only fixture timezone, current date, scheduled
  `class_session` fields, and current `studio_policy` fields.
- Product C writes no shared data or browser storage; its only browser-storage
  read is the shared session used for member-facing wording.

## Open decision

Choose a hosted backend service for `/api/chat` so conversational support can
work on the deployed GitHub Pages site without exposing the Anthropic key.
