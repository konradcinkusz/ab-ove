# ADR-0020: No aggregate touches the progress store, and three things say so

## Status

**Accepted.** Date: 2026-09-15.

## Context

[ADR-0009](0009-the-instrument-measures-the-book.md) §1: the instrument measures the book,
never the reader. The README states that as an anti-goal in the product's own voice — no
leaderboard, no ranking, no per-reader score — and `METRIC-ETHICS.md` §1 says what that is
worth on its own:

> An anti-goal that only exists as prose is a **request**; an anti-goal the architecture
> cannot express is a **rule**.

Which frames this decision exactly, and unkindly: the architecture here *can* express the
thing. The table exists and it is keyed by the reader. So what follows is not the rule §1
prefers; it is the best available stand-in for it, and the ADR says which is which rather
than claiming the stronger one.

Until [#11](https://github.com/konradcinkusz/ab-ove/issues/11) the third bullet was true for
a reason that was about to expire. `docs/architecture/00-ARCHITECTURE.md` said so in as many
words: the claim held *because there are no tables*, and *"it becomes a rule somebody has to
keep the day the first migration lands."* `ReaderProgress` is that migration, and it carries
the reader's identity in its key, because an account that keeps your place has to know whose
place it is.

Issue #12 asks for the day-after: **no aggregate query touches the progress store, and
something other than a promise says so.** It also states the preference — *"a rule enforced
by a schema that cannot express the thing is stronger than a rule enforced by a test that can
be deleted"* — and the discipline: *"watch it fail first. A rule nobody has seen fire is a
comment."*

## Decision

### A perfect absence is not available here, and saying so is the first honest step

The issue prefers the absence, and the absence cannot be total:

- the table has to exist, because synchronisation needs it;
- `Step` is an integer, and an integer can be averaged;
- `DbContext.Set<T>()` is public on the base class, so no amount of hiding a `DbSet` property
  puts the rows out of reach of code inside the same assembly.

So the answer is not one enforcement but **three, covering different shapes, none of them
sufficient alone.** Each was watched refusing something before it was believed.

### 1. A query that spans readers is refused at run time

`ReaderScopedQueries`, an `IQueryExpressionInterceptor` registered in the composition root.
It inspects the LINQ tree before EF compiles it: if the tree touches `ReaderProgress` and
carries no **equality** on `Subject`, it throws, naming the rule.

**This is the layer that matters, because it is not a test.** An aggregate over the progress
store fails on the first run, in development, whether or not anybody ran the suite — and it
fails loudly rather than returning a number nobody should have.

An **equality**, not a mention, and the distinction is the whole design:
`GroupBy(p => p.Subject)` names the column and is precisely the per-reader score being
refused; `Where(p => cohort.Contains(p.Subject))` names a set of readers rather than a
reader. Neither carries an `Equal` node, and both are refused.

The kernel gained a `configure` delegate on `AddDatabaseContext` to make this registrable.
A delegate rather than anything the kernel understands: P10, and the architecture test that
fails the build if the kernel names a service type. The seam carries the capability without
the knowledge.

### 2. The column list is closed

Six columns — `Subject`, `Track`, `Unit`, `Step`, `Language`, `UpdatedAt`. Every one of them
answers **where a reader is**; none answers **how they did**.

This is as near as the design gets to the absent table ADR-0009 prefers, and it guards the
realistic failure: an outcome, a score, a duration, a streak, a count of attempts or a
first-seen date, each arriving as a small and reasonable-looking commit. The test makes such
a commit stop and argue, and its failure message is addressed to whoever is writing it.

### 3. Every key and index leads with the reader

The composite key is `(Subject, Track, Unit)`. An index on `(Track, Step)` or `(Unit)` has
exactly one purpose — to make a cross-reader question fast — so its arrival is the arrival of
the intent, months before the query that would use it. The interceptor refuses the query;
this refuses the preparation, which is earlier and cheaper.

### What each one does NOT see, measured rather than assumed

A NetArchTest rule limits which types may reference the entity at all, and its limit had to be
measured before it could be described:

- it **catches** an ordinary class built to read the table — watched catching two, one
  referencing the entity in a signature and one only inside a lambda body;
- it is **blind to a new Minimal API endpoint group**. `ProgressEndpoints` does not appear in
  its results, because the access happens inside endpoint delegates that the compiler emits
  into a closure class NetArchTest filters out as generated. A reporting *endpoint* written in
  the same style would be invisible to it, and is refused at run time by (1) instead.

The first draft of that test carried `ProgressEndpoints` on its allow-list, allowing a name
the rule never sees. It now carries only names that are actually there, and asserts that it
found something at all — a rule looking at nothing passes for ever and looks exactly like a
rule finding nothing wrong.

### The browser's copy is out of scope, and for a reason rather than by omission

`localStorage` holds one reader's own record on their own machine. There is no cross-reader
aggregate to be computed from it, because there is no second reader in it. The rule is about
the store where readers meet.

### The instrument's own store is not this table

Phase 4 will want rates over **outcomes** — a frame most readers answer wrongly is evidence
about the frame. That is a different store, it does not exist yet, and ADR-0009 §1 already
says what shape it has to be: outcomes recorded against a frame, an attempt and a check run,
never against a person. Nothing in this ADR licenses joining it to this table.

## Consequences

- **A legitimate future need will hit this**, and that is intended. Somebody will want "how
  many readers are past frame 20 of P01", and the answer is that this product does not answer
  it. If the answer ever changes, it changes in an ADR and in three tests, not in a query.
- **The interceptor costs an expression walk per query compilation**, not per execution — EF
  caches compiled queries. It is registered as one shared instance, which is not a style
  choice: a fresh instance per context makes EF build a new internal service provider per
  request, which EF itself reports as `ManyServiceProvidersCreatedWarning` at the twentieth.
  It surfaced as a test failure because the suite builds contexts in a loop; in production it
  would have been a slow leak. The constructor is private so it cannot recur.
- **The README's old check was retired rather than widened.** It grepped
  `src/AbOvo.Api/Persistence` for `ReaderId|UserId|AuthorId` and was "meant to keep returning
  nothing". It still returns nothing and has stopped meaning anything, because the column
  holding a reader's identity is called `Subject`. A check that passes because it is looking
  for the wrong thing is worse than no check.
- **A refactor of `ProgressEndpoints` away from lambdas will fail the reachability test.**
  That is the test working: adding the name is a decision, and it happens in a diff.

## References

- Issue #12; [ADR-0009](0009-the-instrument-measures-the-book.md) §1,
  [ADR-0017](0017-progress-is-local-first-and-holds-nothing-worth-scoring.md),
  [ADR-0019](0019-furthest-frame-wins.md).
- Constitution **P2**/**P10** (the kernel exports a delegate, not knowledge of a service
  entity), **P4**, **P13** (test at the layer with the logic).
- `METRIC-ETHICS.md` §1 (anti-goals are written so they can be falsified), §5 (outcomes are
  recorded against the artifact, never the person); `TESTING-STRATEGY.md` §4, §5;
  `E2E-ACCEPTANCE-TESTING.md` §2 (a rule that cannot fail is not a rule).
