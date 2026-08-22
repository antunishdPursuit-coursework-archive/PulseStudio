# Survivors already explained — read this before chasing one

`npm run mutate <compiled-module>` changes one token, reruns a suite, and
puts the file back. Anything the suite still passes is a **survivor**: a way
that module could be wrong that no check would notice.

Most survivors are worth closing. Some cannot be closed by anybody, because
the mutation cannot change what the program does. This page is the list of
the second kind, so the next person does not spend an afternoon rediscovering
them.

**There are no percentages here on purpose.** A score moves every time a
check is added, so a number written down is wrong within the week — the
standard in [README.md](./README.md) says where a number matters, say where
to read it live. Run the tool.

## The instrument was wrong three times first

Every one of these inflated a score that had already been reported, so treat
a fresh number as provisional until a survivor has been read.

| What it did | Why it lied |
| --- | --- |
| Fixed 20-second timeout, counted as "caught" | The synthetic suite takes 16–18s. As it grew past 300 checks, mutations that merely ran slower were killed and scored as detections. `schedule.ts` read 100% and was really 54%. `page.ts` read 80% and is really 0%. |
| Line comments stripped, block comments not | Prose inside `/* … */` was being mutated, producing survivors on comment text that no check could ever catch. |
| Angle brackets swapped blind | `h >>> 0` became `h >>>= 0` — valid, same value, survives forever. From the other side `=>` became `=>=`, a syntax error counted as caught. 19 of `random.ts`'s 24 sites were this. |

The clock is now derived from a clean run (5×, floor 30s) and a run that
still hits it is reported separately, never folded into "caught".

## Survivors that cannot be closed

**A guard the data never reaches.** The commonest kind. The code is correct
and defensive; the generated corpus simply never produces the input.

- `generate.ts` — `overlapsAttended` refuses an attended class overlapping
  one the member already attended. Disabling it entirely still produces zero
  overlaps, because something upstream stops a member being offered two
  classes in one slot. Keep it; a scheduling change could make it
  load-bearing.
- `generate.ts` — `if (!type || !instructor) continue`. Both come from modulo
  lookups, so zero sessions in a whole schedule lack either.
- `validate.ts`, `csv-export.ts` — skip guards for a missing or unreadable
  session. Generated data has none.
- `session.ts` — the guard-shaped block in `writePulseSession` is
  comment-only. The brief already says "read the comment before fixing";
  mutation confirms the block is inert, which is evidence *for* that note.

**A boundary nothing lands on.**

- `schedule.ts`, `validate.ts`, `generate.ts` — the `<` deciding whether
  back-to-back classes overlap. No two sessions in this schedule ever end
  exactly as another starts, so the boundary is unreachable.
- `validate.ts` — `day >= asOfDay`, skipping today as evidence. No attended
  record is ever dated on the as-of date. **This one is worth knowing about
  anyway**: Product D counts a class attended today, the engine does not, and
  if the generator ever fills today's classes those two definitions start
  disagreeing. See [../app/shared/CLAUDE.md](../app/shared/CLAUDE.md).

**Arithmetic that cannot differ.**

- `logic.ts` — the three guards in `dayNumberFromIso`. Each is masked by the
  one after it: an impossible month falls through to `d > daysInMonth(y, m)`,
  where a missing month length is `0` and any day exceeds it. One of them is
  unreachable outright and exists only to satisfy `noUncheckedIndexedAccess`.
- `csv.ts` — the range guard `m < 1 || m > 12 || d < 1 || d > 31` in
  `isRealYmd`, and the second round-trip in `normalizeDate`. Both are belt
  and braces: disabling the range guard entirely still rejects 2026-13-01,
  2026-02-30, 2026-08-00 and 2026-08-32, because `Date.UTC` rolls over and
  the round-trip after it notices.
- `csv.ts` — the CRLF skip OUTSIDE quotes. Dropping it leaves a stray `\n`
  that `endRow()` discards as an empty row, so the parsed cells are
  identical. The same skip INSIDE quotes is NOT equivalent — it eats the
  next character of a name — and has a check.
- `random.ts` — `next() < probability`. `<` and `<=` differ only when a draw
  lands exactly on the boundary: about one in four billion for a float built
  from a 32-bit integer.
- `logic.ts` — `if (held > 0) taken.set(...)` in the seat memo. Storing a
  zero is identical to not storing it, because every consumer reads the map
  with `?? 0`.
- `logic.ts` — the sort comparator's `<` on `session_id`, and `date < prior`
  when picking the earliest. Ids are unique and equal dates order the same
  either way.
- `logic.ts` — `day > lastRecordedDay` and the `isFinite` half of the guard
  beside it: an unreadable date is `NaN`, and every comparison against `NaN`
  is false, so letting it through changes nothing.
- `identity.ts` — `nameKind === "shared" && sharedNameGroup !== null`.
  `scenarios.ts` sets both together and only for that cohort, so they can
  never disagree.
- Several loop bounds guarded by `if (!x) continue` on the next line.

**Covered, but only by luck.** Not equivalent — genuinely detectable, just
not reliably.

- `schedule.ts` — whether a class on the as-of date can be marked canceled.
  The check above it *would* catch it, but only when the 2% cancellation draw
  fires: five sessions that day, roughly one seed in ten. Probabilistic
  coverage is not deterministic coverage.

## What is genuinely uncovered

`app/shared/synthetic/page.ts` scores zero, and no check in the suite can
reach it — it is the reporting UI's entry module, loaded only by
`synthetic/index.html` in a browser. Proven by breaking the compiled file
syntactically and watching every synthetic check pass. `tsc` still compiles
it, so type and syntax errors are caught at the gate; its runtime behaviour
is not. Same shape as Product D's `main.ts`, and the same remedy: anything in
it that becomes a rule rather than markup should move to a module a check can
load.
