# ADR-0025: A frame's place is its worst cell, and the sort says what it cost

## Status

**Accepted.** Date: 2026-09-15.

## Context

Issue #17 asks for the author's view: **frames** ranked by how badly the book is doing, not
readers ranked by anything. It is specific about two things, and about why it is being
specific rather than leaving them to design.

Every number on it carries its interval. And _"a wide interval reads as **early, not wrong** —
in those words, on the screen. Not as a tooltip, not in a legend the author scrolls past:
beside the number, where a reader of the screen cannot take the rank seriously without also
taking the uncertainty seriously."_ The reason is given: _"A ranked list invites being read as
a verdict, and the frames at the top of an early list are the ones with three attempts rather
than the ones that are worst. An author who acts on that rewrites a frame that was fine and
leaves one that is not."_

[ADR-0024](0024-a-rate-and-its-interval-are-one-value-over-one-cell.md) settles what a rate
is and what it is computed over, and names this problem in its own Consequences: _"Ranking
cells and reading the top one is a multiple-comparison problem … It is named here so the
author's view does not rediscover the problem, and deliberately not implemented here, because
an arithmetic with no caller is an arithmetic nobody has watched being right."_ The caller has
arrived.

## Decision

### 1. The ranking's unit is the FRAME; the arithmetic's unit is the CELL

They are different on purpose, and the difference is the whole design.

ADR-0024 §2 allows a rate over one `(frame, check, attempt)` cell and no coarser, because
pooling across checks or attempts pools observations that share a reader and this service has
no identifier with which to correct for it. But the thing an author can act on is a **frame**:
you rewrite a frame, you do not rewrite a check at attempt 3.

So **a frame's place in the ranking is decided by its worst cell**, and the frame carries
every one of its cells with that cell's own interval. There is no frame-level rate anywhere in
the product, because there is no frame-level rate anyone could defend.

The alternative — average a frame's cells — was rejected on the shape rather than on taste.
An average needs an interval, the interval has to come from somewhere, and the only place is
a pooled rate ADR-0024 refuses. `ranking.test.ts` › _a frame's place is decided by its WORST
cell, not by an average of them_ pins it with a frame that an average would rank differently.

### 2. `erf` is written here, and the gate is Program P27's own assertions

.NET has none. **Measured rather than assumed**: `Math.Erf` and `double.Erf` both fail to
compile on this SDK with `CS0117`, with `Math.Sqrt` compiling in the same probe as the
control. A `strings` sweep of the shared framework does find `erf`; that is native libm and
is not reachable from C#.

`AbOvo.Api/Instrument/Normal.cs` supplies `Erf`, `Cdf`, `Pdf`, `TwoSidedQuantile` and
`ExpectedMaxOfStandardNormals` — the last two being P27's own `z_for` and
`expected_max_normal`, structure for structure. `NormalGatesTests` reads
`figures/values/p27.tex` and requires `p27.z.bonf`, `p27.bonf.cost`, `p27.emax` and
`p27.lb.margin` to come back, **with the operands read from the same file** so the gate moves
with the book rather than needing to be told when the book moves. It also carries the book's
own two closed-form self-checks, at the book's own `1e-9`.

**The first implementation was refuted by that gate, and not where it was expected to be.**
Abramowitz and Stegun 7.1.26 was chosen on the argument that the page prints `emax` to two
decimals and `z.bonf` to three, so its published `1.5e-7` is far more accuracy than anything
here can see. Run against the gate it reproduced **both committed figures at printed
precision** and failed the book's two self-checks: `z_for(0.05)` by `1.181e-6`, and `erf(0)`
by `1e-9` — that approximation's five coefficients sum to `0.999999999` and not to `1`, so it
is not odd at the origin.

One prediction made while replacing it was also wrong, and it is the more useful of the two.
`E[max of 2]` was expected to fail, because its integrand carries `F(x)` directly. It passed.
The errors of an oscillating approximation largely cancel under an integral — which is exactly
the shape that lets an inadequate routine look adequate, and is why **the gate is the book's
own assertions at the book's own strength** rather than a tolerance chosen to suit whatever
this service happens to carry. What is in the tree instead is the positive-term series, exact
to the last bit within `|x| < 6` and saturating beyond it, where `erfc(6)` is `2.2e-17` and
`1.0` is the correctly rounded answer in binary64.

### 3. The selection margin is a property of the LIST, and it rides the envelope

`SelectionMargin` carries `ranked`, `standardErrors` (`E[max of ranked]`) and `points` (that,
at the extreme cell's own standard error). It is on `UnitRates` and never on `CellRate`: a row
in the middle of a ranking was not selected for, so the same number beside every row would be
a wrong number that renders.

**Computed by the API even though the API does not rank.** The margin is not a property of the
sort, it is a property of how many noisy numbers a sort had to choose from, and that is the
same for every ordering of the same cells. Leaving it to the client would put P27's arithmetic
in a second place and only one of the two would be gated against the book.

**Absent when there are no cells; present, as zero, when there is exactly one.** The first is
ADR-0024 §3's reasoning one field over: there is no list, so _"this ranking overstates by
nothing"_ is a sentence about something that does not exist, and it would render beside an
empty table as _this ranking is trustworthy_. The second is a fact rather than a placeholder —
selecting the extreme of one thing selects for nothing — and it is a closed form the book
itself asserts.

**The endpoint takes `Math.Abs` of the quadrature, and that is a guard rather than a clamp.**
At `m = 1` the integrand is odd, so what Simpson returns is a floating-point residual —
measured at `2.4e-17` on this machine — and **its sign belongs to the summation order and the
machine**. A negative one reaches `SelectionMargin.Of`, which refuses negatives for a good
reason, and a unit with exactly one cell would then answer 500 on some machines and 200 on
others. `Normal` itself is deliberately not clamped, because a routine that clamped would pass
`NormalGatesTests` while returning `-0.5`.

### 4. _early, not wrong_ is decided by separation from the NEXT row

A row's position asserts exactly one comparison: that it is worse than the row below it. So
`RankedFrame.separated` is `true` when the two intervals are **strictly** disjoint, `false`
when they overlap or merely touch, and `null` for the last row, whose position asserts no
comparison and so cannot be early or late about one. The screen prints the sentence wherever
it is `false`.

Judged against the next row and never against a distant one: the claim that row 1 is worse
than row 3 is transitive, so reading it off whichever pair happens to be clear would report a
comparison the ranking did not make on evidence it does not have.

On thin data nothing separates and every row carries the sentence. That is correct, and it is
what an early list is.

**The words are a constant, `EARLY_NOT_WRONG`, pinned character for character.** Not because a
constant is tidier but because the acceptance suite cannot reach the view (§5), so a literal
buried in JSX would be a requirement nothing checks. As a constant it is tested, and the only
thing left uncovered is the one interpolation that renders it.

### 5. The view is private, and the suite says what it could not reach

`/instrument` is in neither `PUBLIC_PATHS` nor `PUBLIC_PREFIXES`, so the middleware demands a
session; the API gates the data separately and is the authority. The client component asks and
reports what it is told rather than deciding for itself whether the caller may look.

**Issue #17 asks for the author's view's own version of `landing.spec.ts` › _offers no
leaderboard, ranking or score affordance anywhere on the page_. That test is not in the tree,
and the reason is reported rather than implied away.** A session means a token the acceptance
job cannot obtain — `token.ts` answers `unverifiable` with no JWKS endpoint configured, and the
job configures none — so a spec asserting the ranking's contents would be asserting them
against `/login`.

Two ways round it were considered and rejected. Making the page public so Playwright could
reach it would be letting a test decide the product's gate. Fulfilling the navigation with
fixture HTML would assert Playwright's own fixture. **Issue #29 is the identity fixture that
closes this.** What is asserted meanwhile is the half this environment can establish: that the
view is gated at all, on the index and on the deep link separately, and that no reader-facing
page links to a ranking of any kind.

## Consequences

**There is no frame-level rate in this product, and there will not be one without a reader
identifier.** Every number on the author's view is a cell's. A future request for "how is
frame 7 doing" has to be answered with a list, or with a change to ADR-0024 §2.

**The margin is reported and the ranking is not corrected by it.** Adjusting each row silently
would be a second statistic nobody asked for, and the author would be reading numbers that are
neither the measurement nor the correction. The screen shows both and says which is which.

**A narrow interval on three observations is still the shape to watch for.** ADR-0024's
Consequences named it and this ADR does not fix it: `p(1-p)` is zero at both ends, so a check
nobody has failed reports 100% ± 0 and sorts to the bottom looking certain. _early, not wrong_
is about a **wide** interval and has nothing to say about that one. It is the first thing to
reconsider if the view ever misleads in practice.

**A test that could not fail passed for a week's worth of commits.** The first version of
`The_margin_in_points_is_taken_at_the_worst_cell_s_standard_error` made its worst cell a single
failed observation — a rate of 0%, whose half-width is exactly zero under this formula — so
every quantity in the assertion was zero and `0 == 0` held whatever the handler did. Deleting
`/ Proportion.Z` from `RateEndpoints` left all ninety-three tests green while the margin came
out 1.96 times too large. **Mutation testing is what said so**, and the rewritten test asserts
its own arrangement first so that it cannot go vacuous again silently.

**`Normal` is now a piece of numerical code in a product that had none**, and its only
justification is the gate. If a caller ever needs the tail below `1e-16` the file is what to
replace, and `NormalGatesTests` is what will say whether the replacement is right.
