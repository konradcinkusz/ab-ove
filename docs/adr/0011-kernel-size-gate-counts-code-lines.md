# ADR-0011: The kernel size gate counts code lines, and prints the raw count beside them

## Status

**Accepted.** Date: 2026-09-14.

## Context

P2 caps the shared kernel at roughly 800 lines, and the cap is mechanical rather than
advisory because prose has already failed twice in this estate — a `.Core` library that began
as shared plumbing and ended as a shared domain, with entities, pricing constants and
user-facing strings in it.

The constitution's figure is a count of the **reference** kernel's `.cs` lines, written in a
house style that comments sparingly.

This kernel is not written in that style, and it is not an accident. P14 asks that a block
cite the principle it exists to satisfy, and `src/AbOvo.ServiceDefaults` does, on nearly
every block: why the issuer is validated as a bare string, why the audience check is exact,
why `.flycast` is rewritten to `.internal`, why health probes are exempt from rate limiting,
why an unconfigured identity provider registers a scheme that authenticates nobody.

Counting raw lines sets the two principles against each other. Every citation P14 asks for
spends a line of the budget P2 sets, and the only way to satisfy both is to delete the
reasoning — which is the one part of a kernel that cannot be recovered by reading the code.

## Decision

`.github/workflows/ci.yml`'s `kernel-size` job counts **non-blank, non-comment lines of C#**
under `src/AbOvo.ServiceDefaults`, against a ceiling of **800**, and **prints the raw line
count beside it** in the job summary, per file and in total.

"Non-blank, non-comment" is defined mechanically: after trimming leading whitespace the line
is empty, or begins with `//`, `/*`, `*` or `*/`. That last case is load-bearing — it is
every continuation line of the doc comments P14 asks for.

**The raw count is reported and never gated.** The moment it is gated, P14 becomes expensive
again.

Raising the ceiling is a decision, and it is a decision that has to be made **in a diff to
that workflow file**, where a reviewer sees it.

## Consequences

**The gate is a proxy, and not the check that matters.** What it actually protects against is
a kernel that has started to carry domain, and the thing that catches that directly is
`tests/AbOvo.Api.Tests/ArchitectureTests.cs`: the kernel may not reference `AbOvo.Api` or
`AbOvo.Contracts`, may not declare a `DbContext`, and may not export a public unsealed class
to inherit from. Neither one alone is the gate, and this ADR is not a licence to treat the
size number as the rule.

**The divergence from the constitution's own figure stays visible**, on every run, rather
than being hidden by the gate that permits it. That is what the raw column is for, and it is
why this deviation needs no exit condition: nothing is being concealed, so nothing has to be
restored.

**Measured on 2026-09-14: 594 code lines against 898 raw**, over ten files. Do not quote that
pair — re-derive it. The job prints the full per-file table into every run's summary, and the
same `awk` runs locally in about a second. A count in a document is stale the moment the next
commit lands, and this repository already treats a stale document as a review finding.

Recorded as a deviation in
[`docs/architecture/00-ARCHITECTURE.md`](../architecture/00-ARCHITECTURE.md). The job's own
comment block carries the same reasoning at the point it is enforced, which is where somebody
about to raise the ceiling will be standing.
