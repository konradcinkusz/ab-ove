# ADR-0045: A worksheet answer is one cell, a blank fails it, and the tally is re-consented

## Status

**Accepted.** Date: 2026-09-19.

Amends [ADR-0022](0022-consent-is-local-versioned-and-three-valued.md) (the version bump),
[ADR-0023](0023-a-tally-is-a-count-against-a-frame-not-a-record-of-a-run.md) (a second kind of
contributor) and [ADR-0026](0026-the-counter-metric-is-inside-the-score-and-a-guess-about-a-reader-is-outside-the-engine.md)
(what the blend does with a measure that carries nothing forward). None is superseded; each
keeps its decision and gains a case it did not have.

## Context

[ADR-0039](0039-a-frame-accepts-the-readers-answer-as-a-commitment.md) gave every eliciting
frame an answer line and, where the book's whole answer is one printed number, the sentence
*matches the book* and never anything else. That is what the reader sees. Issues #60–#62 ask
what the **author** may learn from the same event.

Until now one instrument fed the tally: a lab check, run by a reader who pressed Check in
Program P1. Its shape is in ADR-0023 — `(bundle tag, unit, frame, attempt, check, passed)`,
with no reader anywhere in it — and ADR-0026 blends two measures out of it, first-attempt
correctness against downstream success, precisely so the pressurable one carries the smaller
share.

A worksheet answer is a second instrument and it does not have the same shape.

## Decision

### 1. The consent version is 2, because what is collected changed

ADR-0022 requires three things together when the contribution changes: a new version, a
rewritten invitation naming what is sent, and a previous answer that does not carry over. All
three are done. The invitation now says, in both editions, that what is recorded for a frame
you answer is *which version of the book it was in, which attempt this was, and whether your
answer matched the book's own* — and that the answer itself stays in the browser.

A reader who agreed to the lab tally is therefore **asked again**, which `consent.spec.ts`
asserts, and the instrument suite seeds `CONSENT_VERSION` rather than a literal `2`: the store
reads a stale version as never-answered, so a literal would not fail loudly on the next bump,
it would quietly re-invite and every seeded reader would count as undecided.

> That import crosses a package boundary, and typechecking it proved the wrong thing. The
> value is used inside `page.addInitScript`, whose callback is **serialised and run in the
> browser**, where nothing the spec module imported exists. A Node-side constant referenced
> there is `ReferenceError: not defined` in the page, which surfaced as six unrelated-looking
> `@core` failures. It is passed as an argument now. A check that a symbol resolves in Node
> says nothing about whether it resolves where it is used.

### 2. One check name per frame, and the frame is in it

`answer-<n>`. The frame number is not decoration — it is what stops the teaching score
collapsing into the measure it exists to counterbalance.

`RateEndpoints.ScoresOver` computes downstream as `lastFrameOf[check] > frame`, on the model
of a lab check whose docstring names several frames: a check still in use later is evidence
that this frame survived to where it is needed. File every worksheet answer under a shared
`answer` and the name stops identifying anything — `lastFrameOf["answer"]` becomes the last
frame anybody answered in the unit, frame 3 looks carried by frame 12, `carrying` selects
frame 3's own cell, and

```text
Teaching = 0.35·r + 0.65·r = r
```

a score that is entirely the pressurable measure while presenting as a blend.

With the frame in the name, `lastFrameOf["answer-3"]` is 3, `3 > 3` is false, `carrying` is
empty, and `if (carrying.Count == 0) continue;` does the right thing **with no change to the
service**: no downstream, therefore no teaching score, cells still reported. That refusal was
written for a lab check local to one frame and it catches this by the same reasoning.

### 3. A blank reveal fails `answer-<n>`; it does not get a cell of its own

A draft filed it under `revealed-blank-<n>`, on the argument that a frame many readers work at
and give up on is more interesting than one they get wrong. That argument is right and the
cell was wrong, for two measured reasons.

**Its rate was 0% by construction.** Every report under that name carried `passed: false`, so
the number could not come out any other way — a count wearing a rate's clothes, and the
denominator was the only informative half. The rates endpoint has no shape for a bare count.

**And it would have polluted the score.** `Pooled(frame)` pools every attempt-1 cell into
`FirstAttempt`. Lab checks and worksheet answers collide on **eleven frames of P01**: the
lab's docstrings rest on 7–11, 13, 14, 16–24, 32 and 33, P01's cue frames are 1, 2, 4, 7, 8,
10, 11, 13, 16, 18, 20, 22, 23, 25, 27, 30, 31 and 32, and the two meet at 7, 8, 10, 11, 13,
16, 18, 20, 22, 23 and 32. A permanent 0% cell on any of those drags that frame's first-attempt
measure down because a reader declined to type — which is exactly what ADR-0026 §4.6 forbids:
a signal about a reader's state must be *absent* from the weights, "not present at zero".

The service could not be asked to drop it. `OutcomeEndpoints` validates a check name against a
pattern and holds no allow-list, deliberately; teaching it to special-case a prefix the web
invented would make the instrument know the web's vocabulary.

So a blank is a **fail on the same cell a wrong answer fails**, and the cell means *of the
readers who engaged with this frame's worksheet, how many produced the book's number*. All
three outcomes are reachable, so the rate is a real proportion over a real denominator.

### 4. Only on a frame whose whole answer is one printed number

85 frames of 1 036. Elsewhere `matchesBook` returns `false` for "the reader is wrong" and for
"there is nothing to compare" alike — deliberately, since ADR-0039 forbids a negative verdict —
so a report from there would file the second as the first. And a blank reported there would
recreate §3's defect under another name: `matched` is unreachable, so the cell could only ever
fail.

**What that costs is stated rather than hidden.** The other 951 cue frames contribute nothing.
Telling "worked at it and gave up" from "answered and missed" is a real signal and this schema
cannot carry it without putting engagement inside a number the author's view labels *right
first time*. It wants a field of its own, outside the score — schema v2, or an endpoint that
counts rather than rates. Recorded as owed.

### 5. Four refusals in the reporting effect

No count of them is written in the code, because a tally in a comment is a claim nothing can
check and this one has already changed once.

- **No sheet here.** A frame passed without touching the worksheet is the method the book
  prescribes — *write it down, on paper* — and counting it would measure the reader's habit
  rather than the book. It is also the one case that cannot be deduplicated: `revealed` is
  written by a patch that creates nothing, so a frame with no record has nowhere to remember
  having been counted and every re-read would report again.
- **Already revealed.** A second report is a second attempt at a question answered once, and
  the attempt number is what the first-attempt rate is built on.
- **Not a one-number answer.** §4.
- **Consent.** Asked by `reportAnswer` before anything is assembled, same door as `reportRun`.

### 6. The author's view tells the two instruments apart

Three changes, each forced by something this decision made false.

**The index was driven by `LABS`**, and its own justification was *"a check exists because a
lab does, so the units with rates are exactly the units with labs"*. A worksheet answer is
reported from any program's reveal, so that is false: the index would have offered one link
and silently withheld forty-six units' data. It is the pinned bundle's units now. Most lead to
an empty table today, which is answered on the page rather than by hiding rows — an author who
cannot tell "nothing here" from "not measured here" is worse off than one reading a zero.

**A cell says which instrument produced it**, as a word rather than a colour, because on those
eleven frames both arrive and they do not measure the same thing. The match is
`/^answer-\d+$/`, read on the web side, which is the only place that convention may live.

**The "no teaching score" section says why, twice.** Its sentence was written for a lab check
local to one frame, where more data can change the answer. A worksheet frame will sit there
for ever: an answer written before a reveal belongs to that frame and is never used at a later
one, so it is structurally unscorable rather than thinly measured. An author reading the old
sentence alone would wait for data that cannot arrive. Those rows carry their counts, which
the ranked list had and this one did not.

## Consequences

- The blend keeps its meaning: the pressurable measure cannot become the whole score by a
  naming choice, and no reader-state signal sits in the weights at zero.
- `AbOvo.Api` is unchanged. Every property above is a consequence of decisions already in it.
- The book learns about 85 frames honestly instead of 1 036 frames dubiously.
- What the reader sees does not change at all. A blank and a miss are one row in the tally and
  the same silence on the page: the answer box says what they wrote, and says *matches* or says
  nothing.

## Alternatives refused

- **Pass rows only** (the plan's default). A tally that can only contain passes has a
  first-attempt rate of 100% by construction — §3's defect with the sign flipped.
- **A second check name for blanks.** §3.
- **Reporting engagement as `answered-<n>`** on non-verdict-able frames. It is non-vacuous, but
  it pools into a number the view labels *right first time*, and engagement is not correctness.
- **Filtering by prefix in the API.** §3.
