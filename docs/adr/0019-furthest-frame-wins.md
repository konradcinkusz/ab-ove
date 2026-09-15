# ADR-0019: Furthest-frame-wins, and the account is a copy

## Status

**Accepted.** Date: 2026-09-15.

## Context

[ADR-0017](0017-progress-is-local-first-and-holds-nothing-worth-scoring.md) put the reader's
position in their own browser and said the account would come later. Later is #11, and the
ticket's requirement is not the obvious one:

> "Predictable" is a stronger requirement than "correct". Last-write-wins is correct and
> unpredictable — a reader who read ahead on a phone and then opened a laptop cannot tell
> which will survive. Furthest-frame-wins is predictable and occasionally wrong, and a
> reader can reason about it. **Pick one and say which**, rather than shipping whichever the
> merge code happened to do.

Two machines with no coordination between them will disagree. What is being chosen is not
how to avoid that but what a reader is entitled to assume when it happens.

## Decision

### The rule is furthest-frame-wins, and the sentence is "the furthest frame wins"

Per program, the larger `step` survives. Order does not matter, because a maximum is
commutative: the same two writes in either order leave the same record, which is what makes
"two machines converge" a property rather than an example. Asserted both ways — as the rule
in [`reconcile.test.ts`](../../web/app/src/lib/progress/reconcile.test.ts) and against the
real service in [`ProgressEndpointTests`](../../tests/AbOvo.Api.Tests/ProgressEndpointTests.cs),
where the same maximum is applied server-side.

**It is occasionally wrong in exactly one direction, and that is the price.** A reader who
deliberately goes *back* — because frame 31 did not land and they want to work up to it
again — has that undone by another machine's 40. It costs one click, because the frame is a
link. Last-write-wins fails the other way: it discards reading a reader actually did, and
gives them no way to tell which of two machines will be believed.

### The rule is applied on the SERVICE, not only in the browser

`PUT /api/v1/progress/{track}/{unit}` moves a record only when the step is strictly greater,
and **answers with what it holds rather than an echo of what was sent**. So convergence does
not depend on every client agreeing to behave: a browser that is behind is told the truth
and adopts it, and a client that had the rule wrong could not move a record backwards
anyway. The browser's copy of the rule exists to decide what to *send* and what to *tell the
reader*, not to be the only place it is enforced.

### A tie on the frame adopts the account's edition

"Frame 40, in Polish" is one fact and not two, so a record that wins the merge brings its
language with it. On a tie the account's copy is adopted whole. Keeping the local language
instead is stable without being convergent: the service's own rule means neither machine
would ever move the other, and both would sit on their own edition for ever. The reader is
not told, because no frame moved.

### `last` is a pointer and is not governed by this rule

Which program to offer on the index is a fact about this browser. It is read from the local
record, and the account is consulted **only when the browser has none** — a second machine's
first visit — in which case the row the account touched most recently is offered. There is
never a local value competing with a remote one, so nothing is overwritten and there is no
second conflict rule. `updatedAt` appears there and nowhere else; using it in the merge
would be last-write-wins wearing a different name.

### The sentence is on the screen where the conflict happened

The ticket requires the rule to be "on the screen where the conflict happens rather than in a
doc". A conflict does not happen on a page a reader navigates to — it happens when a sync
lands, on whatever page they are looking at — so the notice renders from the root layout and
says both halves: what happened, and the rule that will decide the next one.

> P01 moved to frame 40, read on another device. **The furthest frame wins.**

It is `position: fixed`, because it arrives after a network round trip and anything in the
flow would push the page down under a reader mid-frame — the shift
[`reading.spec.ts`](../../tests/e2e/specs/reading.spec.ts) bounds. Each line is in its own
edition's language, taken from the position that moved rather than from the page.

### Signing out leaves local progress intact

> A sign-out that wipes the reader's place is a punishment for using an account.

`signOut()` clears the two cookies and nothing else. The enforcement is an absence:
[`lib/session/client.ts`](../../web/app/src/lib/session/client.ts) does not import the
progress store, so there is no line that could clear it and none can appear without the
import showing up in a diff.

### Forgetting reaches both copies, or it is not finished

A forget that clears one of the two is a forget the next sync undoes, and a control that lies
is worse than no control. The local record goes immediately — it is the reader's and clearing
it always works — and a marker in its own key records that the account has not been told yet.
**While that marker is set the sync will not pull**: it retries the `DELETE` and does nothing
else. The resurrection is therefore unreachable rather than unlikely.

This also answers the question [`resume.tsx`](../../web/app/src/components/read/resume.tsx)
left open: the argument for having no confirmation on that control was "what is destroyed is
rebuilt by reading one frame", and that stopped being true here. The answer is still no
confirmation and the reason has changed — this is now the only control that makes the product
forget a reader, and a destructive control behind a modal is a privacy control that is
measurably less used.

### A failed sync is not surfaced

The browser's record is what every page renders from; the account is a copy. Nothing waits
on the network and nothing renders differently while a sync is in flight, so the cost of a
failure is that *another* machine has not seen this one's position yet — which the next cycle
repairs and which the reader cannot act on. A banner for a condition that repairs itself
teaches readers to ignore banners.

**What would reopen this**: the day the account copy becomes the source of truth rather than a
copy, a failure costs something visible and needs a surface.

### When it runs: arrival, a local change (debounced), and the tab becoming visible

No polling interval. A timer spends a request every period on a record nobody changed, and
those three edges cover every moment a reader could notice the difference. The debounce is
3 s, which collapses a run of frame turns into one exchange without losing a reader who
closes the tab after a page or two.

## Consequences

- **The browser and the service hold the same rule in two languages.** They are asserted
  separately and neither test suite claims the other's ground; a change to one without the
  other shows up as a merge that pushes writes the service refuses.
- **A frame the notice names and a frame the resume control offers can differ**, when a
  program has been shortened under a reader: the controls clamp to the content and the notice
  reports the account. Recorded in
  [`progress-sync.tsx`](../../web/app/src/components/sync/progress-sync.tsx) rather than
  fixed, because handing the root layout a limits table for every program in the book buys a
  consistency nobody is looking at.
- **Not covered by any suite: this app's BFF proxy carrying a real bearer to a real
  service.** The browser tier stubs the account at the network and the service tier runs the
  real pipeline with a test authentication scheme; joining them needs a token, which needs an
  issuer. Issue #29 is open for the CI identity fixture. Stated here and in
  [`sync.spec.ts`](../../tests/e2e/specs/sync.spec.ts) so it is not implied to have passed.

## References

- Issue #11; [ADR-0004](0004-identity-authservice-and-anonymous-reader.md),
  [ADR-0009](0009-the-instrument-measures-the-book.md) §1,
  [ADR-0017](0017-progress-is-local-first-and-holds-nothing-worth-scoring.md),
  [ADR-0018](0018-password-sign-in-happens-server-side.md).
- Constitution **P3** (database per service — the sync goes through `AbOvo.Api`, which owns
  `apidb`), **P4** (schema by `MigrateAsync` after the listener is up), **P8** (an identity
  service that cannot be reached is a supported state), **P11** (anti-corruption at the
  edge — every row that crosses the network is validated before it is merged),
  **P13** (test at the layer with the logic).
- `FRONTEND-BFF.md` §1, §3, §5; `SERVICE-API-PATTERNS.md` §1–§4;
  `TESTING-STRATEGY.md` §4, §5; `E2E-ACCEPTANCE-TESTING.md` §2.
