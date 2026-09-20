# ADR-0017: Progress is local first, and holds nothing worth scoring

## Status

**Accepted.** Date: 2026-09-14.

## Context

[ADR-0004](0004-identity-authservice-and-anonymous-reader.md) has two halves that collapse
into one very easily: identity is *adopted* rather than built, **and** the reader loop works
with no account at all. Building sign-in first and progress second produces a product whose
anonymous path is the degraded one, which is the opposite of the second half.

[ADR-0009](0009-the-instrument-measures-the-book.md) §1 constrains what a record of a reader
may become: the instrument measures the book, never the reader. Issue #12 states the
consequence as a gate — *no aggregate query touches the progress store* — and the cheapest
moment to honour it is before there is a store to query.

## Decision

### Local before an account, and the account adds nothing to the loop

Position lives in the reader's browser. No request, no cookie, no row. The acceptance suite
asserts both halves: the reader comes back to their frame, **and** `document.cookie` is
empty afterwards — a test that only checked the link would pass against a product that had
quietly started a session to store it.

### One versioned key, and everything read back is untrusted

`ab-ovo:progress:v1`, holding one document rather than a key per program: a reader clearing
this should clear all of it, and phase 3.3 (#11) will want to ship the whole record in one
request.

`localStorage` is a text field a reader can edit, a place an older version of this
application wrote a different shape, and a surface another script on the origin can touch.
So `read()` validates **per entry** and returns an empty record rather than throwing: one
corrupt program does not lose the others, and nothing downstream ever receives a frame
number that is a string. A browser that refuses storage — a private window, a quota error,
storage switched off — costs a reader their place and nothing else.

### The record holds nothing that can be aggregated, and that is asserted

One position per program (`language`, `step`) and which program was last. **No timestamp,
no counter, no streak, no percentage.** The clause in ADR-0009 §1 is easy to honour today
and easy to violate by accident later, so there is a unit test that reads the stored JSON
and asserts its key set. Adding `readAt: Date.now()` — the innocuous-looking change, and the
one a "continue where you left off, 3 days ago" feature would reach for — turns exactly that
test red and nothing else. Watched, in both directions.

The cheapest way to keep a record from becoming a score is for it to hold nothing worth
scoring.

### It is read with `useSyncExternalStore`, because the linter was right

The first draft used `useState` + `useEffect` and the React compiler rejected it: *"Calling
setState synchronously within an effect can trigger cascading renders."* The objection is
not stylistic — `localStorage` is an external store and React has an API for exactly that.
Using it bought three things the effect version did not have: one server snapshot, so
hydration does not mismatch; a stable reference, so a re-render does not loop; and **the
other tab**, because the `storage` event is a subscription this shape can carry. Forgetting
in one tab now empties the controls in the other.

`lib/progress/store.ts` stays pure and knows nothing about React or `window`;
`lib/progress/client.ts` is the only file that touches either.

### The controls live at the end of a line that already exists

The record is in the browser, so the resume and forget controls cannot exist in the first
paint. A block of their own would mean either a reserved empty band on every first visit or
a page that jumps once the record is read — and #7 had just finished asserting that
revealing an answer shifts nothing. Extending the crumb row moves nothing, and the
layout-shift bound is asserted on `/read` as well now.

### Forget is one click, with no confirmation

What it destroys is one integer and one language tag per program. A reader who hits it by
accident restores their place in a program by reading one frame of it, so a modal would cost
every reader a click to guard against something that repairs itself.

**That argument is about the current record and stops holding the moment the record holds
anything a reader cannot trivially rebuild** — which is #11's synchronisation and #13's
deletion. Whoever widens the record reopens this question; it is recorded here so that is a
decision rather than an oversight.

## Consequences

**Phase 3.2 (#10) can be built as an addition rather than as a foundation.** Sign-in has a
working loop to join, and the conflict rule #11 needs is between two copies of a shape that
already exists.

**A place survives a reload and not a machine.** That is the whole of what an account will
buy — "progress that follows you between machines" — and it is now the *only* thing it buys,
which is the shape ADR-0004 asked for.

**The record now decides which control is filled, on two pages.** The index's resume link
and the contents page's *Start at frame 1* were both written for a first visit: the returning
reader's way back was a small link beside a filled control pointing at frame 1. The index's
resume control is now its one filled control, and the contents page's filled control reads
the record — *Continue at frame N* with a place, *Start at frame 1* without — swapping label
and href in place after hydration. Both still arrive after the first paint, into a line or
an element that already has its size, so the constraint above holds and `progress.spec.ts`
measures it on both pages.

**A program that is unpinned or renamed produces no control rather than a 404.** The index
is handed the length of every program it lists, so a stored place past the end of a
shortened program is clamped and a place in a program no longer listed is dropped.

**The store is one more thing #12 has to check is not queried.** It is in the browser, so no
server query can reach it — which makes that gate trivially true today and is the reason to
write the gate now rather than when a server copy exists.
