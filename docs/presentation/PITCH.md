# Pulse Studio — the pitch

Five beats (role → problem → value → solution → watch-it-happen) —
because that structure works for any product with a real user and a real
moment where the thing visibly fires. Content below is pulled from
`app/shared/storytold.html`, the actual page the site ships (open it live
rather than re-deriving this from memory).

## 1 · Role

Dana runs the front desk of a 60-member boutique fitness studio. Every
morning, before the 9am rush, she needs two answers: which classes will
fill today, and which members have quietly stopped coming.

## 2 · Problem

She can't answer either from one screen. Every booking, roster, member
question, and absence lives in a different tool, and none of them hand
their records to the next one.

## 3 · Value

When the records flow instead: a spot booked at 9:02 moves her capacity
board the same minute, and a member 15 days quiet gets a personal draft
before they become 60 days gone — a member never quietly slips away
unnoticed.

## 4 · Solution — one flow, four products, one team

| | Product | Who built it | What it does |
| --- | --- | --- | --- |
| A | Booking | Kerrian | a member reserves a spot |
| B | Dashboard | Manny | staff run the week, see capacity |
| C | Support | Dennis | answers members from the same live schedule |
| D | Re-engagement | Rensley | reads the whole attendance trail, flags who's gone quiet |

One shared studio, one shared session, one shared brand — four people, one
repo, and (by construction — see `scripts/check-lanes.mjs`) merge conflicts
that are structurally impossible because nobody edits outside their own
folder.

## 5 · Watch it happen

Open **[storytold](../../app/shared/storytold.html)** live and scroll it —
this is the actual site, not a slide recreation of it. Every green road on
that map has a small light pulsing along it; that light is real, not
decorative — it only appears on a hand-off that fires on the live site
today. Red dashed roads are the honest remainder: built as a plan, not yet
as code.

What's green today, worth narrating out loud:
- A member books on **A** → **B**'s capacity board moves the same minute
  (fixed 2026-08-24 — the Dashboard used to generate its own disconnected
  studio; a real booking used to just vanish).
- **C** answers real questions through a real hosted assistant at
  [pulse.githat.io](https://pulse.githat.io/products/c-chatbot/) — the
  static GitHub Pages copy honestly says this is unavailable there, because
  a static host has no process to hold the API key in.
- **D** reads the *live* attendance trail (not a stale fixture) and never
  nags a member who already quietly rebooked.

If asked "what's still red": the honest answer is on
[the readiness board](https://antunishdpursuit.github.io/PulseStudio/shared/ready.html)
— point there rather than guessing from memory, since it's the one place
this repo's own gates keep it truthful.

---

See `STATUS.md` in this folder for exactly what's live, merged, and still
in flight as of this session — the "mission control" view, for questions
about current state rather than the pitch itself.
