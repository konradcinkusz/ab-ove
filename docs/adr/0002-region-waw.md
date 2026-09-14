# ADR-0002: Every Fly app runs in `waw`

## Status

**Accepted.** Date: 2026-09-14.

## Context

FLY-IO-DEPLOYMENT §3 requires the region to be a recorded decision rather than whatever
`fly launch` guessed from the laptop that ran it — because `fly launch` picks a region from
the machine's location, and that region then lives in a file nobody reviewed.

Two facts decide it here. The readership is the book's readership, which is Polish and
English-speaking European; and the database has no public listener (P7), so every query
crosses the 6PN mesh **inside one region**. A service one region away from its database pays
that latency on every query, and the only free way to avoid it is to put everything in one
region.

## Decision

`primary_region = "waw"` — Warsaw — in every `fly.toml` in `flyio/`, and `FLY_REGION: waw`
in `.github/workflows/flyio.yml`.

There is no multi-region topology and none is planned. When one is wanted it is a new ADR,
not a second value in one of these files.

## Consequences

Readers outside Europe pay the round trip. That is accepted: this is a single-region system
serving a European readership, and a read-replica topology costs more to operate than the
latency costs to tolerate.

The region now appears in five places — four `fly.toml` files and one workflow. Each carries
`# ADR-0002` beside it so the set is greppable, which is the only defence against one of
them drifting.

`ab-ovo-postgres` is a single machine in a single region, so a region-wide Fly incident is a
full outage with no failover. Correct for a system with no users and no availability
commitment; the day that changes it is a new decision with a real cost attached, not a
config edit.
