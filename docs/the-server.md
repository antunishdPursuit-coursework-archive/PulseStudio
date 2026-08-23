# The studio's server — local, and hosted

One Node process, `scripts/start-haiku.mjs`, does three jobs: it serves
`app/`, it answers `POST /api/chat` for the member support assistant, and it
guards the staff door at `/api/staff/*`. `npm start` runs it. **The key lives in that process's environment
and nowhere else.** It is never in the repository, never in a build, never
in the page. A browser gets an answer; it never gets the key.

The static site on GitHub Pages has no process to hold a key in, so the
deployed assistant there reports that it is unavailable. That is not a
defect to route around — any key a static page can read, every visitor can
read — it is the reason this service exists as a separate process.

## Local

From the repository root:

```bash
cp .env.example .env
npm run start:haiku
```

Put the key after `ANTHROPIC_API_KEY=` in `.env`, then open
`http://localhost:4173/products/c-chatbot/`. Git ignores `.env`; never
commit its contents. The server binds to loopback by default, so a
key-holding process on a laptop never answers the whole LAN by accident.

## Hosted

Run the same script on whatever host the team has chosen, with the key in
its environment. The repository names no host, on purpose: it is the same
file on every machine, and a provider's name in a source file is a fact
that goes stale the day the provider changes.

Three environment variables are the whole configuration:

| Variable | What it does | Default |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | The key. Set it in the host's runtime configuration — never in a file this repository tracks. | unset → `/api/chat` answers 503 and the page says so |
| `STAFF_PASSPHRASE` | The staff door. Unset → the dashboard and the re-engagement tool show a closed door saying nobody can sign in yet. They never fail open. | unset → staff surfaces stay shut |
| `HOST` | The interface to listen on. A host that fronts this with its own reverse proxy sets its container's interface. | `127.0.0.1` |
| `PORT` | The port. | `4173` |
| `ALLOWED_ORIGINS` | Comma-separated page origins allowed to call `/api/chat` from a **different** origin. Only needed when the static pages are served from one origin and this from another. | unset → same-origin only |

The simplest hosted shape is the one the script already is: let it serve
`app/` itself, so the pages and `/api/chat` share an origin and
`ALLOWED_ORIGINS` stays unset. A wildcard is never accepted; an origin not
on the list gets no CORS header and the browser refuses the call.

## What the server decides, and what it trusts

- **Who is asking.** The page states a placement (`member-facing` or
  `staff-facing`) and an actor. The server applies the same asymmetry the
  browser-side guard in `app/shared/assistant-audience.ts` encodes:
  placement can only narrow. A request claiming `staff` from a
  member-facing page is answered as a member. There is no signed session to
  verify on a static site — the privacy page says so to the reader — so
  "staff" means "the staff dashboard asked", and what it unlocks is
  vocabulary (capacity, fill, attention) over records that dashboard already
  shows on screen. It never unlocks a member's name on a member page.
- **What reaches the model.** Only the fields the allow-list in
  `safeContext()` names: scheduled class sessions and current policies,
  capped at twenty each. Anything else in the request body is dropped
  before the prompt is built. The question is bounded at 1000 characters
  and the body at 100 KB.
- **What comes back.** The answer is returned with the `audience` the
  server decided, so the page can run its own outbound guard
  (`answerProblems()` in the shared module) against the right policy
  before a word is shown.

The browser also refuses private-member questions before any network
request is made; that guard is Product C's and lives in its folder.


## The staff door, and why a static host cannot open it

`data/staff-records.json` holds every record that names a person — members,
memberships, reservations, attendance. It sits OUTSIDE `app/` on purpose.
Everything under `app/` is served at a URL, so while those records lived in
`app/shared/fixtures.json` anyone could read them by typing the path, and a
sign-in screen on the dashboard would only have hidden the view.

Now the only route to them is `GET /api/staff/records`, and this process
refuses it without a session it signed itself:

- `POST /api/staff/session` takes a passphrase, compares it through
  fixed-length digests so timing leaks nothing, and sets a `__Host-` prefixed
  cookie carrying an HMAC-signed expiry. The signing key is generated per
  process, so a restart revokes everyone and there is no key to store.
- `__Host-` requires `Secure`, which means sign-in works over HTTPS or on
  localhost and refuses anywhere else. A deployment on plain HTTP should fail
  to sign in rather than hand out a session anyone on the wire can copy.
- `app/shared/auth/staff-gate.ts` mounts the door on both staff surfaces.
  Neither draws anything until the server says yes.

**A static host publishes `app/` and runs no process.** There, `/api/staff/*`
does not exist, the door reports exactly that, and the staff surfaces stay
shut. That is the correct outcome, not a defect: without a process there is
nowhere to keep a secret, so there is no honest way to open that door.

The member-facing site — the timetable, booking, the front page — works fine
on a static host. Staff surfaces need this process.

## What a host has to give it

The run contract is three lines and names no provider, because a provider's
name in a repository is a fact that goes stale the day it changes:

```bash
npm ci
npm run build
npm start
```

Then set `ANTHROPIC_API_KEY`, `STAFF_PASSPHRASE`, `HOST` and `PORT` in that
host's own environment, and terminate TLS in front of it. Any host that can
run a Node process and hold environment variables can run this.
