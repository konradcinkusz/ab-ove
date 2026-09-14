# ADR-0001: Record architecture decisions in this repository

## Status

**Accepted.** Date: 2026-09-14.

## Context

P14 requires that documentation live in the repository and record **reasoning**, not just
steps. The failure it exists to prevent is specific and this estate has had it: a decision
gets taken in a conversation, the code carries the result, and six months later nobody can
tell a considered trade-off from an accident — so the next person either re-litigates it or,
worse, "fixes" it.

Three decisions in this repository were already being cited by file before any record of
them existed. `flyio/*.fly.toml` says `# ADR-0002` beside `primary_region`,
`.github/workflows/flyio.yml` says `ADR-0003 — GHCR`, and both `.github/dependabot.yml` and
`SECURITY.md` point at ADR-0006 by number. The citations were written first because the
reasoning belongs beside the code; the records are what those citations point at.

## Decision

Architecture decisions are recorded as numbered files under `docs/adr/`, one per decision,
using [`0000-template.md`](0000-template.md) — **Status / Context / Decision /
Consequences**.

- Numbers are allocated in order and never reused.
- A decision that is reversed is **superseded**, never deleted: the new ADR names the old
  one and the old one names the new. A deleted ADR takes its reasoning with it and leaves
  the code looking arbitrary.
- Every rule-shaped line cites the principle or guide section behind it.
- An ADR is short. It is a record, not an essay.
- Code cites an ADR **by number, at the point the decision shows up** — as `flyio/*.fly.toml`
  and `flyio.yml` already do. A citation is what makes the record findable from the thing it
  explains.

An ADR and a deviation-register row are different artifacts. The ADR says why a decision was
taken and what it cost; a row in
[`docs/architecture/00-ARCHITECTURE.md`](../architecture/00-ARCHITECTURE.md) says what this
tree does that the constitution does not, and under what condition it stops.

## Consequences

Every non-obvious decision now costs a file, which is a real tax on small ones. The
mitigation is the template's brevity rather than a threshold, because a threshold ("only
record important decisions") is applied by the person who already decided.

The records can go stale, and a stale ADR is worse than none — it reads as current. The
defence is the Status line: an ADR that is no longer live says so at the top, in the first
thing anybody reads.
