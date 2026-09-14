# ADR-0009: The instrument measures the book, never the reader

## Status

**Accepted.** Date: 2026-09-14. Written before this repository has users, which is the only
time this decision is free to make.

## Context

ab-ovo will collect outcomes: a reader answers a frame, an exercise check runs, one of them
fails. Those outcomes are the most valuable thing the product produces, because the book has
never been read by anybody and its own documentation says so — the 80/80 standard it was
written against is recorded as **not established**, and the author cannot know which frames
are wrong.

Every system that measures learning drifts towards measuring the learner, because that is
the easier number to produce and the one that looks like progress. METRIC-ETHICS.md is the
record of what that drift costs and of the five decisions that prevent it. Each of the five
is a decision somebody has to make and record, not a principle to agree with, so this ADR
makes all five, concretely, against this product.

## Decision

> The useful question this instrument answers is **where is this book wasting the reader's
> time** — not *which reader is worst*. (METRIC-ETHICS.md §5)

### 1. The anti-goals are enforced by an absent table

The anti-goals are stated at the top of `README.md`, above the features, in the checkable
form — a claim about the code that a `grep` can falsify, not an intention
(METRIC-ETHICS.md §1). At least one of them is enforced by an **architectural absence**, and
in this product that absence is a **table**:

**There is no table from which a per-reader score could be built.** The aggregate store
records an outcome against a *frame in a bundle version*, an *attempt* and a *check run*.
The reader's identity is absent from it: not a column, not a foreign key, not a
pseudonymous hash, and not a join away.

That is stronger than "there is no per-reader view", and deliberately so. A view is one pull
request away from existing; a table that was never written cannot be selected from. A view
built on a person column is the per-person report arriving through the data model rather than
through a page (METRIC-ETHICS.md §5).

Today the absence is total — `AbOvoDbContext` declares no entity at all — so the rule that has
to survive the first migration is written here rather than inferred from the current
emptiness:

- no reader, user or author identifier on a score or outcome row;
- no foreign key from one to an account;
- no aggregation, grouping, ordering or filter whose key is a person — no `ORDER BY reader`,
  no per-reader time series;
- no endpoint whose route or query parameter names a person, and no `groupBy: reader`.

`grep -rn "ReaderId\|UserId\|AuthorId" src/AbOvo.Api/Persistence` returns nothing, and is
meant to keep returning nothing.

The synchronisation an account buys is a **different store with a different shape**: the
reader's own place in the book, owned by that reader, readable by that reader, and never an
input to an aggregate. Progress is state; it is not evidence.

### 2. Every rate carries its interval, in the same payload

A frame's failure rate of 90% from four readers and 70% from four hundred are different
claims, and a bare number cannot tell them apart (METRIC-ETHICS.md §3).

**The arithmetic is the book's own.** Program P27 derives the standard error of a
proportion, `sqrt(p(1-p)/n)`, and states the property that decides how these numbers read:
`p(1-p)` is largest at one half, so a frame near 50% failure carries the **widest** interval
it can have, and a frame near 0% or 100% carries a narrow one. The instrument uses that
derivation rather than a second one, so the book and the product cannot disagree about what
an interval means.

The pairing is **structural, not optional**: the rate and its interval are one value. The
C# record cannot be constructed without both, the field is required and non-nullable on the
generated TypeScript type, and **no component renders a rate without rendering its
interval** — one component taking one object, never two props a caller can pass separately.
An optional field is a field somebody omits, and a separable pair is one somebody separates.

**How to read the pair**, stated here because it means nothing to somebody who has not been
told: a **wide interval means *early, not wrong*.** It says this frame has not been read
enough times yet, not that the frame is fine.

### 3. The pressurable metric, its degenerate strategy, and the counter-metric blended into it

The number somebody will push on is **first-attempt correctness on a frame**. The degenerate
strategy has a name and it is written beside the metric's definition in code as well as here:
*push on it and you reward making frames more leading.* A frame that hands the reader its
own answer scores perfectly and teaches nothing — which is precisely the defect the book's
own review passes keep finding, under the name *a figure that answers the frame that follows
it*.

The counter-metric is **downstream success**: how readers who passed this frame do on the
frames that depend on it. Making a frame leading raises the first number and lowers the
second.

The counter-metric is **blended into the same composite component**, never reported beside it
(METRIC-ETHICS.md §2). Reported beside, it is a panel somebody can decline to look at; folded
into one weighted term, the pressurable number cannot move without it. That is the difference
between a warning and a constraint. The weights live as data in one place in the engine, so
the blend is reviewable as a single artifact, and the pressurable component's weight in any
composite stays modest — around one fifth — because a number that is one fifth of a composite
is a poor target.

### 4. Heuristics about people are report-only, and live outside the engine

Anything that guesses at a reader's **state** — frustration, effort, engagement, whether a
long pause means thinking or a coffee — is a lexical or behavioural guess with a real error
rate. Such a heuristic may be looked at. It may not enter a composite, a ranking, an alert, a
threshold or any automated action.

It lives in a **separate namespace from the scoring engine**, and the reason is stated at the
exclusion point in the analyzer's own file header rather than only here: heuristics about
human states do not belong in a number someone might act on.

**It is not implemented as a zero weight in the composite.** A zero weight is one
configuration change away from being non-zero, and nobody reviews that change as the ethical
decision it is (METRIC-ETHICS.md §4). The heuristic does not appear in the weights table at
all.

### 5. The unit of evaluation is the artifact

Outcomes are keyed by **frame (in a bundle version)**, **attempt** and **check run**. Never
by a person. This is the rule the other four protect: once a number is attached to a person
it acquires a use nobody designed it for.

The bundle version is part of the key rather than metadata on it, because a revised frame is a
**different frame** — evidence gathered against frame 22 of P05 at bundle v3 says nothing
about frame 22 of P05 at bundle v4, and a key that cannot express that would silently
average two different questions together
([ADR-0008](0008-content-is-a-versioned-bundle.md)).

### 6. Consent is opt-in and versioned

No outcome is recorded without the reader having opted in. The default is off, and the reader
loop is **unchanged** by the choice: every frame, every reveal and every exercise works
identically whether consent was given or withheld, because none of them needs a server
([ADR-0007](0007-exercise-checks-are-python-in-the-browser.md)). There is nothing to
withhold by declining except the contribution itself.

The consent record is **versioned**: it names the version of the text that was agreed to.
When what is collected changes, the text changes, the version changes, and consent is asked
again — consent to an earlier text is not consent to a later one. And because the aggregate
store holds no reader identity, withdrawal is honest about what it can and cannot do: it
stops future contribution, and it cannot retract an anonymous outcome already folded into a
rate, which is a property of the anonymity rather than a limitation of the implementation. It
is said that way to the reader, in those words, at the point of asking.

## Consequences

**The instrument cannot answer several questions somebody will eventually ask** — how a named
reader is progressing, which readers are struggling, how two cohorts compare by person. Those
are not gaps to be filled later. Answering them requires the table §1 says does not exist,
and shipping that table makes `README.md` false.

**If a stakeholder asks for *who is worst*, the answer is that the product does not do
that** — and §1 is what makes that answer true rather than merely principled. An anti-goal
that exists only as prose is a request; one the architecture cannot express is a rule.

**The engine has a shape before it has code**, which is the point of recording this now:
`Quality/` (or whatever the engine is called) holds the composite and the weights, and the
human-state analyzers sit beside it, not inside it. A reviewer can check placement without
reading the arithmetic.

**Every pull request that adds a metric is reviewed against METRIC-ETHICS.md's eight-item
checklist.** It is in the pull-request template's scope for that reason: the failure modes
are all instances of one of the eight items having been skipped, and the cheapest moment to
catch one is before the column exists.

**[ADR-0004](0004-identity-authservice-and-anonymous-reader.md) makes this cheap to hold.**
The reader is anonymous by default, so for most readers there is no identity to attach an
outcome to even if somebody wanted to. Reversing that decision would put pressure on this
one, and whoever reverses it owes this ADR a re-reading.
