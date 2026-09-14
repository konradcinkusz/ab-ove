# ADR-0000: <short present-tense phrase naming the decision>

<!--
  Copy this file to docs/adr/NNNN-kebab-case-title.md, keep the four headings, delete the
  comments, and write it SHORT. An ADR nobody finishes reading records nothing.

  Four headings, and each answers a different question:

    Status         is this live, and what replaced it if not
    Context        what was true that forced a choice — the constraint, not the preference
    Decision       what was chosen, in the present tense, as an instruction
    Consequences   what it cost, including what got worse

  The one heading people skip is Consequences, and it is the one that makes the record
  worth keeping: a decision with no cost listed was not a decision, it was a preference.

  Every rule-shaped line cites the principle or guide section behind it — P1..P15 from
  docs/architecture/00-REFERENCE-ARCHITECTURE.md in konradcinkusz/architecture-standards,
  or a named guide section (REPO-BASELINE.md §1, FRONTEND-BFF.md §5). A rule with no
  citation is somebody's taste, and the next person cannot tell the two apart (P14).
-->

## Status

Proposed | **Accepted** | Superseded by `ADR-NNNN` (link it) | Discharged YYYY-MM-DD

Date: YYYY-MM-DD

## Context

What was true before the decision. The constraint that forced a choice, the alternatives
that were live, and — where it applies — the failure this estate has already had.

Cite the principle or guide section that governs it.

## Decision

The decision, in the present tense, as an instruction to whoever reads the code next.

## Consequences

What follows, including what got worse. If the decision is a deviation from the reference
architecture, say so here and add a row to the deviation register in
[`docs/architecture/00-ARCHITECTURE.md`](../architecture/00-ARCHITECTURE.md) with a date, a
reason and an **exit condition**.
