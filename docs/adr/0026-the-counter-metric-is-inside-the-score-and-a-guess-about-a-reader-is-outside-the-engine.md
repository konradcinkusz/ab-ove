# ADR-0026: The counter-metric is inside the score, and a guess about a reader is outside the engine

## Status

**Accepted.** Date: 2026-09-15.

## Context

Issue #18 is two requirements and says they are one design constraint seen from two sides:
_"what goes **into** the score, and what may not."_

§4.5 asks that first-attempt correctness and downstream success go into **one weighted
component**, done when _"there is no panel a reviewer can decline to look at, and the weights
are data in one place."_ The failure it prevents is named: _"Optimising a frame for immediate
correctness at the cost of whether the reader can use it three programs later is a real and
easy win, and the only defence that survives contact is arithmetic that cannot be skipped."_

§4.6 asks that anything guessing at a reader's state be _"absent from the weights table
entirely, not present at zero"_, done when _"a reviewer can check the placement without reading
the arithmetic."_ It is emphatic about the distinction: _"A zero weight is a wire that somebody
can set to 0.05 in a one-line diff that reads as a tuning change; an absent row is a wire that
has to be built, which is a conversation."_

METRIC-ETHICS.md §2 and §4 are the standards behind both.
[ADR-0024](0024-a-rate-and-its-interval-are-one-value-over-one-cell.md) settles what a rate is
and what it may be computed over;
[ADR-0025](0025-a-frames-place-is-its-worst-cell-and-the-sort-says-what-it-cost.md) settles the
ranking this now feeds.

## Decision

### 1. The downstream measure is the book's own structure, and it was measured before it was designed

A check's docstring names the frames it rests on, and `report.ts` fans one run's outcome to
every one of them — so a check appearing under several steps is a check that needs all of those
frames at once. **A check whose highest step is beyond this frame is a check that carries this
frame forward**, and whether it passes is evidence about whether the frame survived to where it
is used.

That needs no reader identifier, which is the constraint every other candidate failed. A cohort
measure — _did the readers of frame 7 go on to pass frame 20_ — is uncomputable here by
construction (ADR-0023), and the content bundle's own `Route` edges live on the web side because
the service holds no bundle.

**Measured first, because a counter-metric with no data behind it is a weight that would sit
wherever it was set for ever.** Of Lab P1's thirteen checks, **eight rest on more than one
frame**, and `test_6_store_rounds_to_the_format` rests on frames 20 to 24 **and 32**. The book
already encodes "can the reader still use this later"; this reads it rather than inventing it.

### 2. One component, and there is no API that produces half of it

`Teaching.Of(firstAttempt, downstream)` is the only function in this product that returns a
`Score`, and it takes both measures. `FrameScore` carries the blend and both components on one
record with all three non-nullable, so there is no response in which a score arrives and its
counter-metric does not.

The components are on the row so an author can see **which way** a score moved — a frame whose
first-attempt is high and whose downstream is low is a frame that gives its answer away. That is
diagnosis, not a second score, and it is inside the row rather than on a panel, so there is
nothing to close.

**The pressurable measure carries the smaller share**, 0.35 against 0.65. METRIC-ETHICS.md §2
asks for a modest weight and offers a fifth as the illustration; a fifth is wrong here because
there are only two measures, so it would leave the counter-metric doing almost all the work and
make the score insensitive to the thing an author most directly controls. What is asserted is
the **property** rather than the constant — the pressurable measure carries less than half —
because the property is what makes the giveaway test hold, and the constant is a judgement this
paragraph records.

### 3. The blend's interval is a bound, and deliberately wider than the truth

The two measures are computed over overlapping observations — the downstream checks are a subset
of the frame's checks — so their errors are positively correlated, and the exact variance needs a
covariance this service has no reader identifier to compute. `Teaching.Of` takes
`w₁·hw₁ + w₂·hw₂`, which is what perfect correlation would give and is an upper bound under any
correlation at all.

A bound that is too wide reads as _early, not wrong_ (ADR-0025 §4); one that is too narrow reads
as certainty nobody has. METRIC-ETHICS.md §3 requires the confidence to travel with the number,
and a blend without one would be the single quantity on the page that looked certain.

### 4. No downstream is no score, never a score computed from half its definition

A frame whose checks are used nowhere later — the last frame of a unit always, and any frame
whose checks are local to it — has nothing to say about whether it survived. Those frames carry
**no teaching score at all**, and their cells are still reported.

Blending in a zero would read as _readers could not use this frame later_, which is the opposite
of _nobody has asked_ — and it would sort them to the top of a list an author acts on. It is the
same decision `Rate.Of` takes for a total of zero and `SelectionMargin` for an empty list.

**They are not a second panel**, because there is no score on them to decline to look at. The
view lists them with their evidence and says why the ranking is not about them.

### 5. The ranking's key moved from the worst cell to the blend

ADR-0025 §1 ranked a frame by its worst cell. §4.5 requires the counter-metric to be inside the
number an author acts on, so the key is the teaching score. **A frame can no longer reach the top
of the list by owning one check that happens to fail**; it reaches the top by teaching badly,
which is what the list claims to be about. The cells remain, underneath, as the evidence to read
before acting.

`separated` — which decides where _early, not wrong_ appears — now compares teaching intervals
rather than cell intervals, for the same reason.

### 6. `Measure` is a closed enum, and that is where §4.6's conversation happens

A weight cannot be added by editing a dictionary literal: the member has to exist first, in
`Weights.cs`, beside the note that justifies it. `CounterMetricIsBlendedTests` asserts over the
**enum** rather than over the dictionary, so a member added and left unweighted fails too —
present-at-zero wearing a different hat — and asserts the table is total over the enum, so
"absent from the table" and "absent from the enum" are one statement.

**Demonstrated rather than claimed**: adding `Measure.Frustration` with a weight of `0.0` fails
two tests. That is the requirement — _absent, not present at zero_ — as something that happens
rather than something written down.

A NetArchTest holds the placement: `Teaching` and `Weights` may not depend on `Persistence`,
where a future column would live, or on `Endpoints`, where a request carrying a reader would
arrive.

### 7. `weights.json` is the document a reviewer reads instead of the code

Generated from `Weights.Teaching` and asserted to match it, so §4.6's _"check the placement
without reading the arithmetic"_ is true rather than aspirational. Each row carries its weight,
whether it is pressurable, and **a sentence** — the degenerate strategy for the pressurable
measure, what it catches for the counter-metric. METRIC-ETHICS.md §2 requires the strategy to be
named, and a name in a code comment is not in the document anybody reads.

**Compiled, not configured.** P5 puts configuration in the environment, and a weight settable
there would be a scoring policy one deploy away from changing with nobody reviewing it as a
policy. The whole force of §4.6 is that the shape of this table is a conversation; an environment
variable would make it a deployment detail.

## Consequences

**`Pooled` exists, and ADR-0024 §2 forbids pooling — so the difference is stated rather than
left to be noticed.** That rule refuses pooling across checks or attempts for a rate reported
*as a rate*, because those observations share a reader and the interval's arithmetic assumes
they do not. The attempt is held fixed here; the checks are not. The consequence is carried
rather than hidden: the pooled interval is narrower than the truth, so the blend takes a bound
rather than a variance, and the result is reported as a **score to rank by** rather than as a
rate to quote. A frame's rate, as a rate, still does not exist anywhere in this product.

**The downstream measure is about checks that span frames, not about a cohort of readers.** It
says whether the checks needing this frame later passed — aggregated over everybody, since there
is no identifier to form a cohort with. That is weaker than the cohort measure and it is the
strongest thing this schema supports, which is the trade ADR-0023 made deliberately.

**A unit whose checks all rest on one frame each would have no scores at all.** Lab P1 does not
look like that — eight of thirteen span — but a future lab could, and it would rank nothing while
reporting every cell. That is the honest outcome and it is visible rather than silent.

**First-attempt correctness has exactly one source today, and it is a lab check run.**
`ScoresOver` reads `Attempt == 1` over `FrameOutcome` rows, and those rows have one way in:
`reportRun` in `web/app/src/lib/instrument/report.ts` posts a run's verdicts to
`POST /api/v1/outcomes`, and `OutcomeEndpoints` is the only writer of that table. So the
measure this ADR weights at 0.35 is *whether this frame's checks passed on the run the browser
counted as first* — over the frames a check's docstring names, never over the book's frames
generally. A frame that no lab reaches has no first-attempt cell at all, for the same
structural reason §4 gives for a frame no check carries forward, and the two absences compose:
the scored set is the frames a lab both **reaches** and **carries forward**. ADR-0023's own
consequences asked this write-up to say one more thing and it is said here: the attempt number
is the client's and the service cannot verify it, so first-attempt correctness is reported
rather than measured in the strict sense.

**The counter-measure that would pair with a reveal is unmeasurable here, not merely
unmeasured.** The pairing rule wants the pressurable measure caught by something its
degenerate strategy cannot also move ([ADR-0009](0009-the-instrument-measures-the-book.md)
§3), and for a reading surface the obvious candidate is a reveal ratio: `docs/ux/UI-UX.md`
carries it as planned work under the name *the counter-metric: revealed without answering*,
and [ADR-0012](0012-solutions-are-never-served-to-the-browser.md) says of the lab-shaped twin
that such a row "cannot arrive by accident". `frame-view.tsx` renders the `\dotline` row
`aria-hidden="true"` and with no input, and says that is _"a decision rather than an
omission"_ — ADR-0009 puts the instrument on the book and never on the reader, and a text box
there would be the first place a per-reader record could come from. With no affordance for
answering, every reveal is a reveal without answering: the ratio is 1 by construction and
separates nothing, whatever the book does. That is why the measure is not in `Measure` at all
— and the reason is worth keeping distinct from §6's. §6 keeps a **guess about a reader** out
of the table on principle; this one is out because there is nothing to put in it. Whether the
reading surface should take an answer is argued at #58 and is not decided here or by this
paragraph.

**The weights are now a shape, so changing them is expensive.** The issue says so: _"cheap now
and expensive once the weights table has a shape."_ This is the moment it stops being cheap, and
that is the intended cost of both requirements.
