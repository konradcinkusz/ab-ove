# ADR-0023: A tally is a count against a frame, not a record of a run

## Status

**Accepted.** Date: 2026-09-15.

## Context

Issue #15 is the instrument's storage and its client: _"outcome recording with no reader
identifier on any row."_ Two things were already settled elsewhere and are not re-litigated
here.

**What may be recorded** is ADR-0009 §1: an outcome against a _frame in a bundle version_,
an _attempt_, and a _check run_ — with the reader's identity absent, _"not a column, not a
foreign key, not a pseudonymous hash, and not a join away."_

**Whether it may be recorded at all** is ADR-0022: consent is local, versioned, three-valued
and default off, and `mayContribute` is the one door.

METRIC-ETHICS.md §5 is what phase 4 is measured against: _the useful question this
instrument answers is where is this book wasting the reader's time — not which reader is
worst._ Everything below follows from taking that literally.

## Decision

### 1. The row is a COUNT, and there is no row about a run

`FrameOutcome` is keyed on `(BundleTag, Track, Unit, Step, Check, Attempt, Passed)` and
carries exactly one other column: `Count`. A report increments; it does not insert.

**The alternative — one row per check run — was rejected, and not because of the disk.** A
per-run table has a row per event, and an event has a time. Even with no identifier at all,
a few dozen rows whose timestamps run consecutively over one program's frames reconstruct a
session: the reader who did P01 frames 7 to 33 between 21:04 and 21:41 is one person, and
the table says so without naming them. METRIC-ETHICS.md §1 is about what a store makes
POSSIBLE rather than what a query currently does, and a counts table makes that
reconstruction impossible rather than merely unattempted.

**So there is no timestamp**, which is the part that looks like an oversight and is the
decision. The cost is stated under Consequences.

### 2. Every key and every index leads with the bundle tag

A frame that was reworded is a different frame for the instrument's purposes. Keying on the
tag is what stops a rewrite inheriting the old wording's failures — and leading every index
with it is what stops the cheapest aggregate in the schema being _"this frame, across every
version"_, which is the query that would make the ledger lie about a frame that has already
been fixed.

### 3. The attempt number is the client's, is reported, and cannot be verified

Issue #18's counter-metric is FIRST-ATTEMPT correctness, so a tally has to know which
attempt it came from. The service cannot work that out: every row it holds is shared by
everybody and none carries an identifier, so a server-side attempt counter would need
exactly the column this design exists not to have.

The number is therefore counted in the reader's own browser and sent. **A client that always
said 1 would report every attempt as a first attempt, and nothing here could tell.** That is
a real limitation of an anonymous instrument rather than an oversight, and it is written
into `lib/instrument/attempts.ts` at the top so that the next person to read the counter
meets it before they trust it.

The local counter holds a small integer per frame and nothing else — no time, no outcome, no
history — for the reason in §1 one artefact over: a per-frame count of goes is a per-reader
measure wherever it is stored, and ADR-0017 already holds the reader's own storage to the
same rule.

### 4. `todo` is not a third state

`check.py` prints `ok`, `FAIL` and `todo`, and `Passed` is a boolean. A failure and a
not-yet-written exercise are both `false`.

Recording `todo` apart would make the store a record of **how far through the exercises
people have got**, which is a per-reader measure wearing a per-frame name — and it is the
measure a product optimises for the moment it has it. What the book needs to know is which
frames leave a reader unable to do the exercise, and a `todo` is one of the ways that
happens.

### 5. The endpoint is anonymous, and that is a fourth group rather than a fourth tier

SERVICE-API-PATTERNS.md §2's triad is about AUTHORIZATION, and `POST /api/v1/outcomes` has
`publicApi`'s: none. An instrument that required a token would measure the book as
experienced by account-holders and call it the book — and ADR-0004 requires the reader loop
to work with no account at all.

What it does **not** share with `publicApi` is the rate limit. That group carries none
because its members are health and service-info, which a probe reads; a probe that gets 429d
takes a machine out of rotation. This group WRITES, anonymously, so it takes the same
explicit policy the authenticated group does, in a `MapGroup` of its own.

### 6. The parser refuses rather than guesses

`lib/instrument/parse.ts` reads two formats that belong to another repository — the runner's
printed lines, and the book's own docstrings, which name the frames each check rests on. P11
says anti-corruption at the edge, and the direction is chosen: **a line it cannot read
contributes nothing, and a docstring whose frames it cannot read contributes nothing.**

An instrument that records the wrong frame is worse than one that records nothing, because
a wrong tally is indistinguishable from a real one and will be read as evidence about a
frame that was fine. The narrowest instance is in the book today: one check's docstring ends
`frames 20--24 and 32` and the next says `frame 33 and Further problem 3`. The first names
six frames; the second names one, and the `3` after its `and` is a further problem. The rule
is `and` followed immediately by digits, and it was chosen by measuring both.

### 7. Consent is asked before the report is assembled

`reportRun` calls `mayContribute` in its first statement. A report that is built and then
discarded is a report somebody will later "optimise" into one that is built and then sent —
and building one spends an attempt number, which is a write to the reader's storage on
behalf of a reader who declined.

## Consequences

**There is no time series, and there cannot be one retroactively.** Nobody can ask whether a
frame got worse after a rewrite — only how the two versions compare in total, which is what
the bundle tag in the key buys. Adding a timestamp later would be a new decision and a new
ADR, and it would have to answer §1.

**A frame's tally mixes every lab version.** `BundleTag` pins the frame's wording, and the
lab engine is pinned separately (`web/content/book.lock.json`), so a changed check under an
unchanged frame is drift the key does not separate. It is bounded — the check's NAME is in
the key, so a renamed check starts a new tally — and the real fix is the content bundle
carrying the lab, which is book issue #239's destination.

**The attempt number is trusted.** See §3. Issue #18's counter-metric inherits that, and its
own write-up has to say so rather than presenting first-attempt correctness as measured.

**A run that says nothing is recorded as nothing.** An import-time traceback produces no
verdict line, so no tally moves and no attempt is spent — which is right, and means the
ledger under-counts exactly the readers whose Python did not compile. That is a real blind
spot in the one population most likely to be stuck.

**The reader never learns any of this exists.** Every failure — no network, a 400, a 429, an
unpinned track — is swallowed. The cost is a lost tally, which is the book's and not the
reader's; the alternative is an error about telemetry over a lab somebody is in the middle
of, which would be the product putting its own measurement above the thing it is measuring.
