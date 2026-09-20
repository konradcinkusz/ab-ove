# ADR-0044: A test that skips for want of its input is a failure, not a pass

## Status

**Accepted.** Date: 2026-09-19.

## Context

[ADR-0037](0037-the-books-prose-is-rendered-not-interpolated.md)'s render guarantee is a unit
test that puts **every** body, answer and label of the pinned bundle through the Markdown and
KaTeX path in both editions. It is the only thing standing between a KaTeX bump, or a bundle
bump, and a reader meeting a blank where a formula should be.

It cannot run without the bundle on disk, and the bundle is gitignored and fetched. So it —
and two other suites over the book — carried a skip guard: no bundle, no assertion, and the
test reports itself skipped rather than failing.

**In CI the fetch step ran AFTER `pnpm test`.** The consequence was measured by moving the
bundle aside locally and re-running: 330 tests and 0 failures became 321 tests, 1 failure and
**8 skips**. So the render guarantee had never executed in CI. The job was green, the tick
next to it said `web lint + build: success`, and the guarantee it was standing for had never
been checked once.

This is a shape this estate has met before and it is worth naming rather than fixing
quietly: **a green tick over a check that did not run is worse than a red one**, because a
red tick gets investigated.

## Decision

**Fetch the book's content before the unit tier, not after it**, and say in the workflow that
the order is load-bearing rather than incidental.

**And do not rely on the order.** `lib/content/have-bundle.ts` resolves the pin once and
**throws at module load** when the bundle is absent and `CI` is set. A skip guard cannot be
the gate for its own absence — the skip is the failure mode — so the gate is a module that
refuses to import, and its message names the workflow step whose ordering is the cause.

It throws at load rather than inside `skip:`, which was tried: a throw there surfaces as *a
resource generated asynchronous activity after the test ended*, once per importing file,
which names neither the bundle nor the ordering.

**Outside CI the skip is kept.** A contributor who has not run the fetch script should get a
readable skip and a sentence telling them which script to run, not a wall of failures on a
fresh clone.

## Consequences

**Three drifting copies of the skip guard became one.** They had already diverged in their
wording, which is how the condition was easy to read past.

**The unit tier now depends on the network in CI.** That is a real cost and it is the right
one: the alternative is a tier that silently covers less than it claims, and the fetch script
already retries, including on a connection reset.

**This does not generalise to a rule that no test may skip.** A test that skips because the
platform it is for is absent is honest. A test that skips because its *fixture* is missing,
in an environment that is supposed to provide it, is a check reporting success about work it
did not do.
