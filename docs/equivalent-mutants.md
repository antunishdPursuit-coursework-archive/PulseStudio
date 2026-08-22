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

**A heuristic where any answer works.**

- `generate.ts` — the two `attendedHere < s.capacity - 1` helpers, and the
  filter picking a "victim" attendance row in edge-cases mode. These choose
  WHICH session or row to plant a defect in. Changing the choice changes
  which one is picked, and edge-cases mode still reconciles exactly —
  every declared defect found, nothing undeclared — because that promise is
  about the reconciliation, not about which victim was chosen. Loosening
  the capacity helper to `<=` still cannot exceed capacity: it leaves one
  seat and fills it.

**A boundary that LOOKS unreachable and is not.** Worth its own heading,
because it is the one that gets waved away. `generate.ts` clamps a
member's visits to the day they joined with `day < joinedDay`. Tightening
it to `<=` throws away a class attended ON the join date, which is an
ordinary first class, and the mutation survived. The tempting reading is
"nobody joins and attends the same day". Measured: 17 do, across twenty
seeds — but only ONE at seed 7, and none at the other two seeds the
checks were using. A three-seed check would have passed while the code
was broken. Sweep the boundary before calling it unreachable; the cost
here was 21ms for twenty studios.

**A boundary nothing lands on.**

- `schedule.ts`, `validate.ts`, `generate.ts` — the `<` deciding whether
  back-to-back classes overlap. No two sessions in this schedule ever end
  exactly as another starts, so the boundary is unreachable.
- `validate.ts` — `day >= asOfDay`, skipping today as evidence. No attended
  record is ever dated on the as-of date. **This one is worth knowing about
  anyway**: Product D counts a class attended today, the engine does not, and
  if the generator ever fills today's classes those two definitions start
  disagreeing. See [../app/shared/CLAUDE.md](../app/shared/CLAUDE.md).

**The gates can be measured too, and one of them had a real gap.**
`--judge` makes a gate's own `--self-test` the judge, so the question every
gate asks of the code — would anything notice if this were wrong? — can be
asked of the gate. `check-secrets.mjs` answered 45%.

The survivor that mattered was its definition of a credential-shaped
value: it required the value to mix digits with letters. That missed a
password whose value is a run of lowercase words, an api key of twenty
letters, and a secret of twenty digits — and a passphrase is the ordinary
way people write a password down.

The old rule's comment said all-letters is "prose, a path, or a CSS
token". Prose was never being excluded by the mixing test: the pattern
needs sixteen characters with NO WHITESPACE, which is what keeps
`password: this is not set here` out. Mixing was doing less work than it
looked like. Twenty unbroken characters on a credential-named field now
qualifies on length alone — checked against all 154 tracked files first,
zero newly flagged.

The rest of that gate's survivors are in its `run()` rather than its rule,
which the self-test does not exercise. They are not worth chasing: an
inverted pass/fail there makes the gate fail on a clean repo, which the
next CI run says immediately.

**The judge does not have to be a suite.** `npm run mutate` routed every
module to one of the three browser suites, so anything they cannot reach
reported "no suite covers this" and stopped. `app/shared/color.ts` was in
that position — the module that decides whether a person's chosen
background and text are readable enough to accept, checked only by
`check-contrast.mjs --self-test`. `--judge="<command>"` judges by exit
code instead:

    node scripts/mutate-suite.mjs app/shared/color.js \
      --judge="node scripts/check-contrast.mjs --self-test"

First measurement of that module: 59% caught. The gates' own rule
functions are reachable the same way.

**What it found there**, and why the rest of its survivors are not
findings:

- The range guard in `nearestReadable` could be turned off entirely and
  every check still passed. It is load-bearing on almost every call — the
  search walks lightness outward by up to a hundred steps, so from a
  mid-grey it reaches -49 and 150, and `hslToHex` given those does not
  fail. It returns MALFORMED TEXT: `"#-33-99-cc"` and `"#113109104"`.
  `isHexColor` rejects both, but nothing inside that function asks
  `isHexColor` — it hands them to `contrast`, which computes a number
  quite happily, including a negative luminance. Checked as a contract
  over a sweep now, because one candidate says nothing about a search that
  moves.
- Excluding lightness exactly 0 and 100 from that guard survives, and is
  equivalent: swept 12,600 candidates across five targets, 8,710 of which
  move, and NONE lands on either extreme. The walk stops at the first
  qualifying lightness, so it reaches an edge only if nothing else
  qualifies — and then it returns the candidate unchanged instead.
- The sRGB linearisation threshold `channel <= 0.03928`. A channel is
  n/255 and 0.03928 x 255 is 10.0164, so no 8-bit channel lands on it.
- The five HSL sector boundaries `hue < 60`, `< 120` and so on. At exactly
  60 the secondary term equals chroma, so both branches produce the same
  triple. True at every sector edge, by the arithmetic rather than by the
  data.

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
- `color.ts` — `contrast(...) >= 4.5` in `themeToApply`. No 8-bit colour
  lands exactly on 4.5 — every grey was searched — so `>=` and `>` cannot be
  told apart by anything a person can pick. The pair either side of the line
  is what the checks use instead: `#767676` at 4.5422 and `#777777` at
  4.4781, with a third check asserting they really do straddle it.
- `color.ts` — the saturation denominator in `hexToHsl`. It is zero only
  when lightness is 0 or 1, and either forces max and min equal, which the
  `delta === 0` test above it has already caught. Safe by construction, not
  by luck.
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
- `outreach.ts` — `isIsoDate`'s `typeof value !== "string" || !regex.test(value)`.
  Making it `&&` only differs for a non-string whose coercion matches a date,
  which means an object with a date-shaped `toString` — and this input comes
  from `JSON.parse` of a browser key, which never produces one.
- `outreach.ts` — the `isFinite` half of the future-row filter. An unreadable
  date is `NaN`, and every later comparison against `NaN` is false, so
  letting one through changes no answer.
- `identity.ts` — `nameKind === "shared" && sharedNameGroup !== null`.
  `scenarios.ts` sets both together and only for that cohort, so they can
  never disagree.
- Several loop bounds guarded by `if (!x) continue` on the next line.

**A substring assertion that let three guards keep failing.** `logic.ts` asks
"was this actually recorded?" in five places as
`value !== NOT_RECORDED && value.trim() !== ""`. All five `&&` survived,
because the second half only matters for a value that is blank WITHOUT
being the marker — spaces or a tab — and no door produces one: the CSV
import trims, and the other two studios use real names. The guard is still
right, so the records were handed to the functions directly.

The first attempt closed two of the five and looked finished. The check
asserted the evidence line CONTAINED "the import recorded no", and three
mutations kept that substring while corrupting the rest of the line —
printing "a class with    on August 1", or appending a "usually …" clause
with nothing in it. Pinning the whole line closed all five. **A substring
notices something missing; only a whole line notices something arriving
that should not be there at all.**

**A guard whose boundary needs two of something.** `csv.ts` — the identity
heuristic counts only rows where BOTH the id and the name are present, and
turning that `||` into `&&` survived. The reason it looked equivalent is
that ONE blank cell changes nothing: the empty string is still distinct
from every other id, so the verdict does not move. It takes TWO blanks
before the empty string reads as a repeated id and the ambiguity notice
goes silent — leaving five records from a three-person file with nothing on
the page to explain them. Measured before it could be pinned, and worth
remembering as a shape: a mutation that survives the obvious case is not
equivalent, it is under-tested at a boundary that needs more than one of
something to reach.

**Covered, but only by luck.** Not equivalent — genuinely detectable, just
not reliably.

- `schedule.ts` — whether a class on the as-of date can be marked canceled.
  The check above it *would* catch it, but only when the 2% cancellation draw
  fires: five sessions that day, roughly one seed in ten. Probabilistic
  coverage is not deterministic coverage.

## Bug classes swept whole

Three families turned up more than once, so each was searched for
exhaustively rather than waited for. Worth knowing which, because the sweep
is the durable part — the individual fixes are just where it landed.

- **`typeof null === "object"`.** Every typeof-object guard in the repo,
  checked wherever it reads untrusted input. Found in `serialize.ts`,
  `outreach.ts` and `session.ts`; `live-studio.ts` was already covered.
- **`JSON.parse` as a trust boundary.** Every parse site. All were covered
  except `theme-boot.ts`, and following it turned up the duplicated WCAG
  formula that became `color.ts`.
- **Formula injection in anything a spreadsheet opens.** Both producers —
  Product D's outreach log and the synthetic attendance export. The log was
  escaping one column of six; the exporter escaped all of them but had no
  check that it still called the escaper.
- **Counts written into sentences without a plural.** Every `${n} things`
  phrase in Product D and in shared. Several were reachable with the shipped
  thresholds — "1 classes in the prior 60 days" on the line staff judge a
  flag by — and two existing checks were pinning the wrong grammar as the
  expected answer.
- **Arithmetic that can reach a screen as Infinity or NaN.** Every division
  in a display or decision path, in Product D and in shared. `weeklyCadence`
  divided by a configurable window with no guard, so a zero-day window
  printed "≈Infinity/week" on the line staff judge a flag by. Most of the
  rest divide by constants. Two do not and are contained rather than
  guarded: `theme-boot` divides by an element width, which is zero before
  layout, and the resulting `"#NaNNaNNaN"` is rejected by `isHexColor` at
  every consumer — so a bad value degrades to the readable default instead
  of one layer silently repairing it into a third colour nobody chose.
- **Module-level caches that could go stale or disagree.** Swept and came
  back clean, which is worth recording so nobody re-derives it.
  `auth/studio.ts` caches the generated studio and `auth/session.ts` caches
  the member ids that validate a session; both are set once with `??=` and
  never invalidated, and the second is built from the first, so they cannot
  disagree. Across a midnight rollover they go stale TOGETHER — consistently
  stale is the safe failure, and signing out a member whose id vanished is
  the documented behaviour rather than a bug. The rest of the module-level
  state is page-local or a once-flag.
- **Comparators that return 0 and leave the rest to input order.** Three
  instances, all in something a person reads: the synthetic CSV export, the
  flagged ranking, and which class counts as "last attended" when a sign-in
  sheet recorded no times. Each meant the same records in a different order
  gave a different answer.

  **The position-derived key came back a second time, one tie-break along**
  (2026-08-22). The correction above moved the "last attended" tie off
  `session_id` and onto class type, then instructor_ID — and the CSV door
  mints instructor ids from row position too: `csv_i_1_ana` / `csv_i_2_kim`
  reverse to `csv_i_1_kim` / `csv_i_2_ana`, and the leading number decides
  the comparison. Two yoga classes on one day with different teachers still
  answered "Ana" or "Kim" depending which row came first, through the front
  door with an ordinary file. It compares the instructor's NAME now.

  **And a third time, in the flagged ranking.** Its tie-break was
  `member_id`, and the CSV door mints those from row position too
  (`csv_m_1_ada_reyes`), so re-exporting the same data in a different order
  changed who a staff member reads first — which is precisely what that
  comparator's own comment said it existed to prevent. It compares the
  display name now.

  The check there could never have failed. It reversed the members ARRAY,
  and ids are minted by the door before that array exists, so shuffling it
  afterwards cannot move a tie-break that reads them. **Reversing a
  derived collection is not reversing the input.** Reverse the thing the
  door actually reads.

  Why the existing check missed it is the part worth keeping: that check
  ties on DIFFERENT class types, so the class comparison decides and the
  next tie-break is never reached. **A tie-break chain needs a case per
  link.** Proving link one is sound says nothing about link two, and
  mutation is what said so — three survivors sat on that comparator.

  Two things that sweep taught, both cheap to repeat. A tie-break has to be
  on CONTENT — breaking the "last attended" tie on `session_id` changed
  nothing, because that door mints ids from row position, so reversing the
  rows reversed the ids too. And a stability check needs the tie to EXIST:
  two of these passed while the code was broken, because the fixture never
  produced a tie at all. Assert the tie is there before relying on it, and
  confirm by deleting the tie-break rather than by reading the check.
- **In-band markers a real value can equal.** "The records did not say" was
  encoded as the words `"class"` and `"the team"`, both of which a studio can
  genuinely have in its own export. A file naming both produced "the import
  recorded no class type and no instructor", which is a page asserting a
  negative that is false — worse than the doubled word it replaced, because
  it reads correctly. The marker is the empty string now: the one value no
  real class and no real person can be called.

  **The sweep was not finished, and finishing it took a second pass on
  2026-08-22.** Choosing an uncollidable marker only fixes the places that
  COMPARE it. `suggestedSession` was READING it: it prefers a member's
  usual instructor by asking a name-keyed map for `usualInstructorName`,
  which is the marker when the records never said who taught the class —
  so it asked which instructor is called nothing. Planted an instructor
  with an empty display name and the member was offered a class six days
  later than the soonest, because that instructor won the preference. No
  door can produce an empty instructor name today, so it is unreachable
  rather than correct, and the note above already explains why that
  distinction is the whole point.

  Worth keeping the distinction that sweep needed, because the two look
  identical in code. `?? "all levels"` for a class with no level is a
  **default** — a reasonable name for the thing, which nothing reads to
  decide whether the records spoke. `?? "class"` was a **marker**, read to
  decide exactly that. Only markers must be uncollidable.

- **A branch that no screen can reach.** Not a guard — OUTPUT. Product D's
  `generate.ts` scored lowest of its modules, and one survivor was
  `session_status: day <= today ? "completed" : "scheduled"`: the
  "scheduled" half could not be told from the "completed" half because
  that door built a session only where somebody had already attended one,
  so every session it made was in the past. Following it found the real
  defect underneath. Drafts come in two shapes — name the upcoming class,
  or make an open offer — and through the button whose stated purpose is
  letting the drafts "be seen doing their job", 8 members were flagged and
  0 had a class to be invited to. Half the job, invisible, on the screen
  built to show it.

  The correction has its own trap, which is the durable part. Giving that
  door a schedule flipped it to 8 concrete and 0 open offers — the same
  blind spot mirrored. The temptation then is to shrink capacity until a
  class fills and both shapes appear on one screen; that is a fixture bent
  until it shows a chosen answer, and it proves nothing. The honest
  finding was that the fallback already has a door: an attendance export
  is history, so the CSV door cannot name an upcoming class and every
  draft there makes the open offer. Both halves are pinned now, on
  different screens. **Measure where a branch is reachable before
  arranging for it to be reachable where you happen to be looking.**

## What is genuinely uncovered

`app/shared/synthetic/page.ts` scores zero, and no check in the suite can
reach it — it is the reporting UI's entry module, loaded only by
`synthetic/index.html` in a browser. Proven by breaking the compiled file
syntactically and watching every synthetic check pass. `tsc` still compiles
it, so type and syntax errors are caught at the gate; its runtime behaviour
is not. Same shape as Product D's `main.ts`, and the same remedy: anything in
it that becomes a rule rather than markup should move to a module a check can
load.
