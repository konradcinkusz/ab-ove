# ADR-0019: Furthest-frame-wins, and the account is a copy

## Status

**Accepted.** Date: 2026-09-15. Amended on 2026-09-25 (#157): the rule is applied to each
program's furthest frame, which the browser now keeps apart from the frame it last showed, and
the notice is raised only for reading done elsewhere — see *Amendment 2026-09-25*. The rule, the
tie, the pointer and the sentence *the furthest frame wins* are unchanged.

Amended on 2026-09-26 by
[ADR-0068](0068-the-account-adopts-the-places-read-without-it-at-sign-in-and-the-browser-sends-it-none.md)
(#176): the browser sends the account no place. What the web app puts on the account comes from
`AbOvo.Api`'s own writes — a signed-in reveal, and the adoption of the places read without an
account when a session begins — and the API applies this rule there. `web/mcp` still raises the
account through `PUT` until #171, which is the deviation register's row in
[`00-ARCHITECTURE.md`](../architecture/00-ARCHITECTURE.md#deviation-register). Where this record
says the browser pushes, and where the amendment below names `settle`, that is what the browser
did until then. The forget reaches the anonymous cursor this browser reads under as well, because
adoption would copy it back into the account (ADR-0068 §5). The rule, the tie, the pointer and
the notice are unchanged.

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

(Reworded by the amendment below; the rule half is unchanged.)

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

> Since 2026-09-26 the API holds another copy away from the browser: the anonymous cursor the
> browser reads under, which the account adopts at every sign-in. The forget reaches it too, and
> a forget still owed is retried whether or not the reader is signed in, because that adoption
> happens on the server, where the marker cannot stop it
> ([ADR-0068](0068-the-account-adopts-the-places-read-without-it-at-sign-in-and-the-browser-sends-it-none.md)
> §5).

This also answers the question [`resume.tsx`](../../web/app/src/components/read/resume.tsx)
left open: the argument for having no confirmation on that control was "what is destroyed is
rebuilt by reading one frame", and that stopped being true here. The answer at the time was
still no confirmation, for a changed reason — this is now the only control that makes the
product forget a reader, and a destructive control behind a modal is a privacy control that
is measurably less used. That reason is about a modal, and
[ADR-0047](0047-forgetting-is-two-presses-because-it-reaches-the-account.md) keeps it while
making the control two presses: a renaming control under the pointer, not a dialog.

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

## Amendment 2026-09-25

Issue #157, reproduced before anything changed, against the acceptance suite's identity
deployment and a real `AbOvo.Api`: a freshly registered reader read F01 to frame 3, the
account held 3, and they went back to frame 2 — on this machine. The next sync rewrote the
browser's record to 3 and put *"F01 moved to frame 3, read on another device. The furthest
frame wins."* over frame 2. The browser's record held one frame per program, the one last
shown, so going back wrote 2 over 3; the account's 3 then won the merge, and a return to where
the reader had just been was reported as reading done somewhere else. The same run showed the
two neighbouring faults the issue names: with no account, going back made the index offer
*Continue at frame 2*; and after signing out, *Continue at frame 3* led to *Not there yet — the
furthest read frame in this program is 1*, with no reason given.

- **The record keeps the furthest frame beside the frame last shown.** Each program's position
  in `lib/progress/store.ts` is now the furthest frame reached, here or on the account, in the
  edition it was reached in, and it only moves forward; `last` is the frame this browser last
  showed. The stored shape is unchanged. The rule above is applied to the furthest, tie and
  all — it is what the account copy always was — so re-reading an earlier frame sends nothing
  lower and raises nothing. The price paragraph above now reads differently: a reader who goes
  back to work up to frame 31 again is still offered 40, because *Continue* offers the
  furthest; nothing undoes their going back, because nothing records it as a position.
- **Every control that offers a place offers the furthest** — the index's *Continue*, the
  contents page's, and a tile's `at frame N` — each through `positionIn`, so they cannot
  disagree. `last` says which program, and which frame only for a record that holds no
  furthest there; its frame is also how the notice below tells this browser's own reveal from
  reading done elsewhere. The sync no longer rewrites it, except to give a browser with none
  the program the account touched last, as before.
- **The notice is for a raise this browser did not cause.** A sync is several round trips, and
  a signed-in reveal moves the account as it goes. `settle` in `reconcile.ts` merges the
  cycle's result into the record as it stands when the cycle lands — writing the cycle's
  record back whole used to put this browser's furthest back where the cycle started — and
  drops a raise this browser reached on its own meanwhile. A reveal also moves the account a
  page load before its page records itself, and a cycle that pulls in between sees a raise to
  the frame right after the one this browser last showed; nothing in the pull tells that from
  another machine's reading, so a raise of that shape is held for three seconds and told only
  if this browser has not shown the frame at any moment of them (`couldBeOwnReveal`,
  `stillNews`) — a reader who lands and goes straight back, which is what
  [the tutorial](../tutorials/02-read-a-program.md) tells a reader who did not follow an
  answer to do, has shown it. A line already on the screen goes when it stops being
  news — its frame shown here, its program forgotten or raised again. What this costs, and is
  accepted: a real one-frame raise from elsewhere is told three seconds late, and this
  browser's own reveal is still told as reading done elsewhere where nothing in a pull tells it
  apart — when its page never loads (the tab closed or left in between), which leaves the
  account a frame ahead of a browser that never showed it; when its page takes longer than the
  hold, until it lands; and when another tab has since recorded a different frame, because
  `last` is the browser's and not a tab's, until the reveal's page records itself.
- **The notice says it as a fact and goes there**: *You had read F01 to frame 40 elsewhere.
  The furthest frame wins.*, with *Go to frame 40* under it, which also acknowledges that
  line. It wears the rule and the raised paper and no longer a drop shadow.
- **Signing out still leaves the record intact**, and that has a cost this ADR did not name:
  the record then offers a frame read on the account, and the API gates a signed-out reader on
  the anonymous cursor ([ADR-0061](0061-an-anonymous-readers-cursor-is-an-opaque-cookie-not-a-token.md)),
  which has not reached it. The refusal now says why — *You read this while signed in.* — with
  *Sign in to continue* returning the reader to the frame (`components/read/signed-out-hint.tsx`).
  It can be wrong for a reader who never signed in and whose cookie was cleared while their
  `localStorage` was not; nothing on this origin can tell that reader apart.
- **A forget pressed while a sync is on the wire stays a forget.** The marker in *Forgetting
  reaches both copies* stops the next pull, not one already sent: that pull answered with the
  account's copy from before the `DELETE`, and writing it back put the forgotten place back on
  the screen under *You had read … elsewhere*. A cycle that finds the marker set after any of
  its round trips now writes nothing and sends nothing more, and the `DELETE` waits for that
  cycle to end (`forgetEverywhere` in `lib/progress/sync.ts`). From the tab that pressed it,
  the resurrection is unreachable, as that section says; a forget pressed in another tab is
  seen only while its `DELETE` is still on its way.

Asserted in `store.test.ts` and `reconcile.test.ts`, and end to end, against the identity
fixture and a real `AbOvo.Api`, in
[`furthest-frame.spec.ts`](../../tests/e2e/specs/furthest-frame.spec.ts); the forget, with the
pull held until Forget has been pressed, in
[`sync.spec.ts`](../../tests/e2e/specs/sync.spec.ts).

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
- **Not covered by any suite when this was decided: this app's BFF proxy carrying a real
  bearer to a real service.** The browser tier stubs the account at the network and the
  service tier runs the real pipeline with a test authentication scheme; joining them needs a
  token, which needs an issuer. Issue #29 is open for the CI identity fixture. Stated here and
  in [`sync.spec.ts`](../../tests/e2e/specs/sync.spec.ts) so it is not implied to have passed.
  Covered since: [`bearer-hop.spec.ts`](../../tests/e2e/specs/bearer-hop.spec.ts) drives that
  hop, and [`furthest-frame.spec.ts`](../../tests/e2e/specs/furthest-frame.spec.ts) drives the
  sync over it, with a real account on the identity fixture (#157).

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
