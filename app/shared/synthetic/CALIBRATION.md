# Where the studio's shape comes from

The generator invents a studio. **What it invents is calibrated against
published real-gym data** so the invented studio behaves like a real one —
its rhythms are borrowed, none of its people are.

## It is a SNAPSHOT, not a live feed. Say snapshot.

Checked 2026-08-21, and this is the honest status:

| Dataset | Last updated | Its stated cadence | Actually observed |
| --- | --- | --- | --- |
| Gym Membership (ka66ledata) | 2 years ago | **"Never"** | never |
| Gym Members Exercise (valakhorasani) | 2 years ago | "Quarterly" | **no update in 2 years** |
| Gym customers & churn (adrianvinueza) | 2 years ago | "Annually" | **no update in 2 years** |
| Gym Exercise Data (niharika41298) | **4 years ago** | "Quarterly" | **no update in 4 years** |

Three of the four *advertise* a refresh cadence they have not kept for
years. The label is metadata somebody typed once; the behaviour is the
fact. **Trust the behaviour.**

And even a dataset that did update could not make this engine live:

- the engine is **deterministic by construction** — same config in, same
  studio out, byte for byte. That is the property every proof in
  `tests.html` rests on;
- its own proof suite **greps the shipped source and fails** if it finds
  `fetch(`, `XMLHttpRequest`, `WebSocket`, `Date.now(` or `new Date()`. A
  live feed is not something we forgot to add — it is something the suite
  actively forbids;
- the site is static: GitHub Pages has no server to poll anything, and
  Kaggle downloads need an account.

So: **nothing here is live, and no surface may say it is.** The honest
sentence is *"calibrated against a 2024 snapshot of published gym data."*

## What was actually taken

From **Gym Membership (ka66ledata), CC0 Public Domain** — the only one of
the four in our domain (members, visit frequency, class preference,
check-in time) and the only one free of licensing friction. Nothing was
downloaded and no rows were copied: the figures below are the **published
column summaries on the dataset's own page**, used as targets.

| What it showed | What changed here |
| --- | --- |
| Check-in times cluster in a **morning peak and a bigger evening peak**, with mid-afternoon the quietest hour | `SLOT_PRIORITY` in `schedule.ts`. A studio that opens only some of its slots now opens **the most-used ones** — 17:30 and 08:00 first — instead of the earliest ones on the clock |
| Members visit **1–5 times a week, clustering at 2–3** | Confirmed the existing cohort cadences already sit in that band; no change needed |
| About **half** of members attend group classes | Confirmed against the existing attendance mix; no change needed |

### The defect this found

Slots used to be opened in clock order, so a 60-member studio ran
**06:30, 08:00, 09:30, 12:00, 16:00 — and nothing after 4pm.** A boutique
studio with no evening classes is backwards; evening is when a gym fills.
It now runs **08:00, 09:30, 12:00, 17:30, 19:00**. Every product inherits
the fix: real evening classes to book, a dashboard week that looks like a
week, and believable "usual time" evidence in re-engagement.

## What was deliberately NOT used

- **Gym customers & churn — `CC BY-NC-SA 4.0`.** NonCommercial. This
  project is shown to real studios as something they could buy, and
  ShareAlike would also reach for our own licensing. Closest to Product D's
  subject and still the one we must leave alone. **Do not import it.**
- **Gym Members Exercise (Apache 2.0)** and **Gym Exercise Data (CC0)**
  are usable licence-wise but are about workouts — heart rate, calories,
  exercise catalogues. This studio models *bookings and attendance*, so
  they had nothing to calibrate.
- **No rows from any dataset ship in this repo.** Only distribution shapes
  informed constants. Every member here is still invented by the seed, so
  the "everyone is fictional" law is untouched — and no real person's gym
  record is in a public repo.

## Re-checking this later

Open each dataset page, read *Last updated* against its claimed cadence,
and update the table above. If one ever does start refreshing, that still
does not make this engine live — it would make our **snapshot stale**, and
the honest move is to re-derive the constants and say when.
