# Where the studio's shape comes from

The generator invents a studio. **What it invents is calibrated against a
published, CC0, SIMULATED gym dataset** — not against observation of a real
gym. Its rhythms are borrowed from somebody else's model, none of its people
are real.

> **Corrected 2026-08-22.** This page said "calibrated against published
> real-gym data" from the day it was written, and that was wrong. The source
> is a dataset whose own card calls itself *"A Synthetic Dataset for EDA and
> Machine Learning"*, describing a simulated gym membership database. It is
> published, it is CC0, and its column summaries are real summaries — of
> simulated rows. Calling that "real-gym data" claimed evidence this project
> does not have, on the one page whose job is to say where the shape came
> from. The constants did not change; the story about them did.

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
sentence is *"calibrated against a 2024 snapshot of a published, openly
licensed gym dataset."* Not "real-gym data" — see the correction at the top.

## What was actually taken

From **Gym Membership Dataset** by Tarek Adam, CC0 Public Domain —
<https://www.kaggle.com/datasets/ka66ledata/gym-membership-dataset> — the
only one of the four in our domain (members, visit frequency, class
preference, check-in time) and the only one free of licensing friction.
Nothing was downloaded and no rows were copied: the figures below are the
**published column summaries on the dataset's own page**, used as targets.

**Two of the three transcribed faithfully; the third cannot be reproduced.**
Re-read on 2026-08-22 against the live page:

- `visit_per_week` buckets 1–5 peaking at 3.0–3.4 (312 of 1000) — matches.
- `attend_group_lesson` true 503 / false 497 — matches "about half".
- `avg_time_check_in` **has no readable summary on that page.** Kaggle parses
  the column as a datetime, so its ten histogram buckets all carry the same
  label, `10/14/2024 - 10/14/2024`, with counts 96, 121, 108, 92, 88, 103,
  91, 110, 92, 99. Which bucket is which hour is not stated anywhere on the
  page. So the row below — a morning peak and a *bigger* evening peak, with
  mid-afternoon quietest — **cannot be derived by the method this page says
  was used.** Individual rows do show morning and evening clustering
  (08:29, 09:54, 17:19, 17:45, 19:31, 19:46 among the first nine), which is
  consistent with it, but that is reading rows, not summaries, and nine rows
  is not a distribution.

  **The constant stays and the claim goes.** `SLOT_PRIORITY` is still a
  better choice than what it replaced — clock order gave a studio with
  nothing after 4pm, which is backwards for a boutique gym however you
  justify it. What it is NOT is a measured finding, and it should not be
  presented as one until somebody derives it from a source that supports it.

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
- **Daily Gym Attendance and Workout Activity Data (Jaykumar Joshi, CC0)** —
  <https://www.kaggle.com/datasets/jayjoshi37/daily-gym-attendance-and-workout-activity-data>
  — suggested 2026-08-22 and NOT used. Licensing is not the problem; the data
  is. Its own card says "synthetic" four times, so calibrating this generator
  against it would be one invented distribution validating another. Two
  measured reasons on top of that: 50 check-in hours sampled from its data
  card spread flat across 05:00–22:00 with 14:00 among the busiest, which is
  the opposite of the mid-afternoon lull the slot order encodes; and
  `attendance_status` reads Absent on 52% of rows that nonetheless carry a
  check-in time, so a row can be both absent and checked in at 20:04. **Do
  not import it.** A larger sample might soften the first reason; neither of
  the other two moves.

- **No rows from any dataset ship in this repo.** Only distribution shapes
  informed constants. Every member here is still invented by the seed, so
  the "everyone is fictional" law is untouched — and no real person's gym
  record is in a public repo.

## Re-checking this later

Open each dataset page, read *Last updated* against its claimed cadence,
and update the table above. If one ever does start refreshing, that still
does not make this engine live — it would make our **snapshot stale**, and
the honest move is to re-derive the constants and say when.
