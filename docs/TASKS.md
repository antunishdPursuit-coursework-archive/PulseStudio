# What each of us has to do, and the exact line to do it with

**TEAM-OWNED.** One file, four short lists. Everything here is already built
in `app/shared/` — nobody has to design anything, and nobody has to touch
anybody else's folder. Each item is a line to add or a function to call.

It lives in `docs/` and not in `app/shared/` for one reason: everything under
`app/` gets a public URL. This file names four people and the work each of
them has not finished, and `check-published` refused it the moment it was
staged there. That gate exists because two of Product D's internal documents
were served at a public address until 2026-08-21. The CODE all of this calls
is in `app/shared/`, where it belongs.

Nothing here adds a gate. These are not new rules; they are the work the
existing gates and audits already named, gathered in one place with the code
already written so the job is a paste rather than a project.

**Every one of these is inside your own folder.** If an item seems to need a
change in `app/shared/`, it does not — say so and it gets built here instead.

---

## Everyone — one line, and it is the same line

Four pages ask a browser for an icon that does not exist. The site ships
`app/favicon.svg`; a browser only finds it when the page points at it.

In each page's `<head>`:

```html
<link rel="icon" href="../../favicon.svg" type="image/svg+xml">
```

| Page | Owner |
| --- | --- |
| `app/products/a-booking/index.html` | Kerrian |
| `app/products/b-dashboard/index.html` | Manny |
| `app/products/b-dashboard/staff-dashboard.html` | Manny |
| `app/products/c-chatbot/index.html` | Dennis |

Check it: open the page and look at the console. A 404 for `/favicon.ico`
means the line is missing or the path is wrong.

---

## Kerrian — Product A

**1. The icon line above.**

**2. Your accent is unreadable as text on the light theme.** `#3b82f6` on
white is 3.68:1, and text needs 4.5:1. It sits in
`docs/contrast-baseline.json` so the gate reports it instead of failing you,
but the list only shrinks.

The shared theme already has the shape for the fix — a companion token that
keeps your identity hue for fills and gives you a readable one for text.
Product D did it and `app/shared/theme.css` shows how. Define
`--kerrian-strong` for the light theme, use it wherever your blue is TEXT,
and delete your lines from the baseline in the same commit.

**3. Three lines in your brief describe code you no longer have.** See
`docs/REQUESTFOR-A-B-C.md` — the colour law summary is out of date, your
product brief still says "Evidence level: Planned", and waitlists are listed
as out of scope in a product that ships them.

---

## Manny — Product B

**1. The icon line above, on both pages.**

**2. Your staff pages carry no `robots` tag.** The re-engagement tool has
one; the dashboard does not, and it shows rosters and attendance. In the
`<head>` of both `index.html` and `staff-dashboard.html`:

```html
<meta name="robots" content="noindex, nofollow">
```

`app/robots.txt` is the weaker fallback and, on a project site, is served at
a path crawlers do not read for this repository — the file says so itself.
The tag is the part that works.

**3. Your accent is the least readable of the four.** `#f59e0b` on white is
2.15:1. Same fix as Kerrian's, same baseline, same one-commit rule.

**4. Six lines in your brief describe behaviour your code does not have** —
including "no persistence of any kind" when `staff-dashboard.js` writes
`pulse-schedule-b`. `docs/REQUESTFOR-A-B-C.md` has the list and a prompt
written for your assistant, because a brief that is wrong is worse than no
brief: an assistant reads it first and believes it.

---

## Dennis — Product C

**1. The icon line above.**

**2. The assistant has to know who it is talking to, and that is built.**
`app/shared/assistant-audience.ts`. It holds no key, makes no network call,
and never learns your endpoint exists — it decides who is asking and what may
be said back, and hands you that as data.

```ts
import { audiencePolicy, answerProblems } from "../../shared/assistant-audience.js";
import { readPulseSession } from "../../shared/auth/session.js";

// Set this per page. A member-facing page stays member-facing even when a
// staff person is signed in on it — the screen may be turned toward a member.
const PLACEMENT = "member-facing";

const session = readPulseSession();
const policy = audiencePolicy(session?.actor_type ?? null, PLACEMENT, firstName);

// policy.greeting  — the opening line, in that audience's voice
// policy.scope     — what this assistant will answer, stated to the reader
// policy.refusal   — what it says when a question falls outside that
// policy.mayUseStaffRecords / policy.mayNameOtherMembers

// LAST, on the text itself, before anything is shown:
const problems = answerProblems(answer, policy, otherMemberNames);
if (problems.length > 0) {
  // Show policy.refusal instead of the answer, and say nothing about why.
}
```

Run `answerProblems` on the way OUT, on the finished text, every time. The
audience decision is the easy half; the failure this prevents is an answer
composed with staff records reaching a member's screen after that decision
was made. Seventeen checks in `app/shared/auth/tests.html` cover both halves,
including a member on a staff page and a staff person on a member page.

**3. Serving both audiences means two placements, not two products.** When
the studio runs it at the front desk, that page passes `"staff-facing"` and
staff answers become possible; the same assistant embedded anywhere a member
reads passes `"member-facing"` and they never are. The API you are given
sits behind both — the audience decides what may be asked of it and what may
come back, and that decision is not the model's to make.

**4. One line in your brief points at code that says something else** —
`CLAUDE.md:32` cites `main.ts:69-71`, which is inside `studioDate()`.

---

## Rensley — Product D

**1. Nothing on the list above.** D declares its icon, carries its `robots`
tag, and was fixed rather than baselined on contrast.

**2. Get a qualified person to approve routine content.** All three routines
ship as `draft`, so the panel reads "0 approved routines. Nothing to include
yet." That is correct and it is not finished.

**3. Verify Enter and Space on the routine controls by hand.** Automation
could not deliver the activation, so it is unverified rather than passing.

---

## Already done for you, in shared

Nothing below needs a call. It is here so nobody rebuilds it.

- **Settings is a named door now.** The appearance control was a bare `◐`
  with its words only in a `title` attribute — undiscoverable on a phone,
  which cannot hover. It reads **Settings** on every page, with Appearance as
  a section inside it, and every page got that without changing a line.
- **The studio's name reaches every header** from `app/shared/brand.ts`, and
  a gate fails the build if a page shows the name but is not wired to receive
  it.
- **Sign-in, the session, and the actor** are shared and already on your
  pages. Read the actor with `readPulseSession()`; never gate a route on it.
- **`counted(n, singular)`** turns a number into a phrase. Use it rather than
  writing `n === 1 ? "class" : "classes"` — that rule lives in one place so it
  is right in one place.
