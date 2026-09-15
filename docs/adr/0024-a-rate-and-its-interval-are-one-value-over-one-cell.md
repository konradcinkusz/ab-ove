# ADR-0024: A rate and its interval are one value, over one cell

## Status

**Accepted.** Date: 2026-09-15.

## Context

Issue #16 asks for rates with intervals, and is specific about two things. The shape: _"the
rate and its interval are one non-nullable value … Not two fields where the second is
optional: an optional interval is an interval that will be absent on the screen where it
matters."_ And the source of the arithmetic: _"Get the arithmetic from the book rather than
from memory."_

Two decisions are already made elsewhere and are not re-litigated here.
[ADR-0023](0023-a-tally-is-a-count-against-a-frame-not-a-record-of-a-run.md) settles what the
store holds — a count keyed on `(BundleTag, Track, Unit, Step, Check, Attempt, Passed)`, with
no reader identifier and no timestamp.
[ADR-0009](0009-the-instrument-measures-the-book.md) §1 settles that the instrument measures
the book.

METRIC-ETHICS.md §5 is what phase 4 is measured against. §1's rule is the one that binds
here: a store is judged by what it makes **possible**, not by what a query currently does.

## Decision

### 1. The arithmetic is Program P27's, and the gate is across repositories

`Proportion.HalfWidth` is transcribed from `code/p27_inference.py` — `100 z √(p(1-p)/n)`,
with `z = 1.96` as a **constant** there rather than a computed quantile.

`RatesCarryTheirIntervalTests` reads the book's own committed values out of
`web/content/book/figures/values/p27.tex` — pinned in `web/content/book.lock.json` and
digest-verified by `scripts/fetch-book-content.sh`, so an edited copy cannot pass for a
fetched one — and requires this service to reproduce four of them. **Nothing in that gate is
typed here: not the operands, not the answers.** A test asserting `HalfWidth(0.714, 200) ==
6.3` would be this repository remembering a number the book computes, and would keep passing
on the day the book's figures moved.

The four are chosen so they fail apart rather than together. `p27.hw.200` and
`p27.closed.lo`/`.hi` cover the half-width and its arrangement into an interval; `p27.lb.se`
is the standard error **without** `z`, so a wrong `z` fails the first three and passes the
fourth while a wrong square root fails all four. Measured: substituting the true quantile
`1.959963985` for the book's `1.96` fails exactly two tests and not the standard-error one.

### 2. A rate is computed over ONE CELL, and the cell is `(frame, check, attempt)`

This is the question issue #16 says to decide before writing the formula, and it is not a
choice of granularity. It is the only cell over which the formula's independence assumption
holds.

P27 measures what getting it wrong costs. Rows that share a user are _"one observation
wearing several labels"_, and an interval over `r` rows per user is too narrow by `√r` — its
`p27.clust.factor` is that figure at five rows each. In this store the observations are check
runs, and one press of _Check_ contributes one to **every** check of **every** frame the run
touched.

- **Within one `(step, check, attempt)` cell the items are independent**, and that falls out
  of the attempt counter rather than being assumed: a browser takes each attempt number for
  each frame exactly once (`lib/instrument/attempts.ts`), so it contributes at most one
  observation to a cell.
- **Pooling across checks, or across attempts, is clustered by reader.** The correction
  factor is `√(observations per reader)` and **this service cannot compute it**, because it
  holds no reader identifier and by ADR-0023 never will.

So the API reports per cell and leaves any pooling to a caller that has to say out loud what
it is assuming. That is a real limit rather than an oversight: it is the price of the
anti-goal being architectural rather than a policy, and it is the second thing ADR-0023's
design costs after the absent time series.

It also makes issue #18's counter-metric a **cell** rather than a filter applied afterwards:
first-attempt correctness is `attempt = 1`, which is a row, not a subset of one.

### 3. `Rate` is one value, and it is produce-only

There is no public constructor and no settable property. `Rate.Of(passed, total, halfWidth)`
is the only way to obtain one and it computes every field.

**A total of zero is refused rather than reported as 0%.** With no observations there is no
proportion, and the honest rendering of "nobody has run this check" is an absent measurement.
A rate of 0% with a wide interval reads as _every reader failed_, which is the worst
available misreading and the one a ranked list puts at the top. The endpoint omits the cell.

**It follows that a `Rate` cannot be deserialised, and that is deliberate.** The obvious fix
for the build error that produces — `[JsonConstructor]` — compiles and silently undoes the
point: a deserialiser fills absent fields with their default, so a payload carrying only
`passed`, `total` and `percent` arrives as a rate whose interval is zero points wide. **A
fake interval is worse than a missing one**, because it renders, it sorts, and it says there
is no uncertainty. The four tests that surfaced this were rewritten to read the response as a
JSON document, which is what every real client does anyway.

`HalfWidth` is carried as well as both ends, and is **unclamped** where the ends are clamped
to `[0, 100]`. It is the quantity that says how much evidence there is; clamping it would
make two cells with very different evidence look alike near the ceiling, which is where a
ranked list puts things.

### 4. "Generated TypeScript type" — there is no generator, and this is what stands in

The issue asks for the guarantee _"on the C# record and on the generated TypeScript type"_.
**This repository has no code generator**; the web app's types are hand-written. Saying so
rather than letting the word be read into the work is the point of this section.

What carries the guarantee instead is a document both sides read:
`src/AbOvo.Contracts/rates.contract.json`, a serialised `UnitRates` produced by the real
records. The C# suite asserts the records serialise to exactly it; `rates.test.ts` asserts
`readRates` consumes exactly it. Neither side can add, rename or drop a field alone.

And on the TypeScript side the type alone guarantees nothing, because an interface is erased
at run time: `JSON.parse(body) as UnitRates` promises exactly nothing about `halfWidth`. So
the type is paired with `readRates`, which refuses — every field required, every number
finite, and one unreadable cell costs the whole document rather than shortening the list.
That is ADR-0014's rule for a content bundle applied one artefact over: **refuse rather than
degrade**, because a ranking with rows silently missing reads as a shorter ranking.

### 5. A query that spans bundle tags is refused, like one that spans readers

`BundlePinnedQueries` is `ReaderScopedQueries`' mirror over the other table: a query over
`FrameOutcome` without an equality on `BundleTag` throws before EF compiles it.

ADR-0023 §2 already keys and indexes every row on the tag, which makes the wrong query
expensive. It does not make it look wrong: `GroupBy(o => new { o.Unit, o.Step })` compiles,
runs, and returns a rate averaged over two wordings of a frame — which is precisely how a
rewrite that fixed a frame gets reported as a frame that was always fine.

**It is not the reader rule wearing a different column.** That one refuses a query that spans
readers, because a per-reader score is being made unbuildable. This one refuses a query that
spans texts, because the average over two texts is meaningless rather than forbidden. Two
rules, two reasons, one mechanism.

It was watched refusing before it was believed, and it refused something nobody planted:
three of issue #15's own tests read the store without pinning a tag. Only one tag is ever
written in that file, so pinning it changes nothing they assert — what it changes is that
they now say so.

### 6. The read is on `adminApi`, and that is not a privacy decision

Nothing in `FrameOutcome` is about a reader — there is no column that could be — so there is
no confidentiality argument for a gate, and publishing these numbers is eventually the point
(book issue #239 §4: _"the first honest sentence the book can print about itself"_).

What argues for the gate now is that the data is thin, and issue #17 records what a thin
ranked list does to its reader: _"the frames at the top of an early list are the ones with
three attempts rather than the ones that are worst."_ The author's view carries the sentence
that says so; a public JSON endpoint carries nothing. Publishing is a later decision this
does not foreclose — what would have to be true first is a view that carries the caveat with
the number, which is issue #17.

It also gives the triad's admin group its first endpoint, which `Program.cs` had declared
empty on the argument that a group which does not exist cannot be seen to be missing.

### 7. The bundle tag is a required query parameter

Omitting it would have to mean one of two things: pick a tag silently, or pool them.
`BundlePinnedQueries` refuses the second one layer down, but a 500 from a guard is a worse
answer to a missing query parameter than a 400 that names it — so the endpoint refuses it
first, with a message written for whoever called the API rather than for whoever wrote the
query.

## Consequences

**Every rate this service reports is about one check at one attempt.** A frame's headline
number does not exist here, and cannot be computed from what is returned without assuming
something the data cannot support. Issue #17 has to decide what to show, and this ADR is the
constraint it decides under.

**The selection correction is P27's too, and it is #17's to spend.** Ranking cells and
reading the top one is a multiple-comparison problem: the best of `m` observed rates sits
above the truth by the expected maximum of `m` standard normals, times the standard error.
P27 computes exactly that — `expected_max_normal`, committed as `p27.emax`, and applied as
`p27.lb.margin` — and it needs `erf`, which .NET does not have. It is named here so the
author's view does not rediscover the problem, and deliberately not implemented here, because
an arithmetic with no caller is an arithmetic nobody has watched being right.

**A check nobody has failed has a zero-width interval.** `p(1-p)` is zero at both ends, so
ten passes out of ten reports 100% ± 0. That is the formula's own worst-known weakness and it
is stated rather than papered over: a continuity correction or an interval that does not
collapse at the ends (Wilson, Jeffreys) is a different formula from the book's, and using one
here would break the cross-repository gate that makes this arithmetic checkable at all.
Issue #17's _"a wide interval reads as early, not wrong"_ has nothing to say about a
**narrow** interval on three observations, and that is the shape to watch for first.

**`figures/values/p27.tex` is now fetched and therefore served.** It reaches `public/book/`
because the lock file is the served set; it is published book content, the same class as
`p01.tex` which is already served for the lab to read, and Lab P27 is on the book's own
roadmap (book issue #239 §5). It is two kilobytes and nothing reads it in the browser today.

**A second contract document is a second thing to keep true.** `rates.contract.json` is
generated from the real records rather than typed — the commit records the throwaway program
that wrote it — but regenerating it is a manual step, and the two tests that read it are what
make a stale copy fail rather than drift.
