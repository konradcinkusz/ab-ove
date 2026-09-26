# ADR-0068: The account adopts the places read without it at sign-in, and the browser sends it none

## Status

**Accepted.** Date: 2026-09-26. Decided for #176 (order 685 in
[`docs/ux/UI-UX.md`](../ux/UI-UX.md#the-order)).

It amends [ADR-0019](0019-furthest-frame-wins.md), whose rule is unchanged: the browser no
longer sends the account a place. It takes away the reason
[ADR-0021](0021-deletion-removes-the-progress-first-and-says-what-it-cannot-reach.md) gave
first for its order, and keeps the order. It changes the Reason and the Exit of one row in
the deviation register ([`00-ARCHITECTURE.md`](../architecture/00-ARCHITECTURE.md)): "`PUT
/api/v1/progress/{track}/{unit}` can still name a step it did not earn".

Constrained by these, and amends none of them:

- [ADR-0009](0009-the-instrument-measures-the-book.md) and
  [ADR-0020](0020-no-aggregate-touches-the-progress-store.md) (no aggregate, every read pinned
  to one reader);
- [ADR-0041](0041-the-reading-surface-shows-position-and-never-progress.md) (position, never
  progress);
- [ADR-0060](0060-content-is-served-live-by-the-api-and-the-reader-stays-anonymous.md) (the
  gate is the API's, and the browser's record is a resume hint);
- [ADR-0061](0061-an-anonymous-readers-cursor-is-an-opaque-cookie-not-a-token.md) (the
  anonymous cursor, and possession as its only credential);
- [ADR-0066](0066-the-mcp-server-is-a-typescript-client-of-the-api-installed-before-it-is-hosted.md),
  whose Consequences named this change and left one trade to it.

## Context

- **`PUT /api/v1/progress/{track}/{unit}` can raise `Step`**, and the reveal gate then serves
  whatever it says. It had two callers that raised it: `web/mcp`, which #171 moves to
  `POST …/advance`, and `web/app`'s sync.
- **The sync sent the browser's own number.** `reconcile.ts` listed every program this browser
  was further on than the account, and `sync.ts` sent each one: frame 40 here and frame 12 on
  the account sent 40. No gate had seen that 40 earned.
- **That push was how an account learned a place read without one.** While a reader is signed
  in the gate asks the account's cursor. So if `PUT` were narrowed first, a reader who read
  anonymously to frame 40 and then signed in to an account at frame 12 would be refused frames
  13 to 40.
- **The API already holds that place.** An anonymous reader's cursor is the `anon:<id>` rows
  (ADR-0061), and the only write that moves one is `POST …/advance`, behind the gate.
- **ADR-0066 named one mechanism** — at sign-in the API adopts the steps of the reader's
  `anon:<id>` rows, the furthest frame winning, and the sync then sends nothing the API does
  not already hold — and said that a place only this browser's `localStorage` holds would
  then not reach the account: "That trade is for the change to decide."

## Decision

### 1. At sign-in, the account adopts the anonymous cursor's places

- **`POST /api/v1/progress/adopt`**, in `authApi`. The bearer names the account and the
  `X-Ab-Ovo-Reader-Id` header names the anonymous cursor, whose id is its credential
  (ADR-0061). Nothing in the route or the body names either reader, and no step arrives.
- **Per program the furthest frame wins**, its edition travels with it, and a tie keeps the
  account's copy whole — ADR-0019, as `PUT`, the advance and the browser's merge apply it.
- **Two reads, each pinned to one `Subject` by an equality** (`ReaderScopedQueries`, ADR-0020),
  and writes to the account's rows only. It answers with the account's rows as they now stand,
  as `PUT` answers with its row.
- **`web/app` calls it from its own server, in `establishSession`**
  (`web/app/src/lib/server/session.ts`), with the bearer it has just been handed and the
  `ab_ovo_rid` cookie the browser sent. Every way a session begins passes there — a password,
  a second factor, a new account, a handed-over token — so every one adopts. Registering is the
  one that matters most: a reader who read without an account and then made one.
- **A failure does not fail the sign-in.** It is logged on the server, and the session stands.

### 2. The anonymous rows are left as they were

Adoption copies. It never moves or deletes:

- signing in has no more claim over the cookie's place than signing out does (ADR-0061);
- a reader who signs out again still reads, under the same cookie, what they read without an
  account;
- a second adoption changes nothing, so a sign-in whose adoption failed is repaired by the
  next one;
- an adoption that deleted would let anyone holding a leaked id erase that reader's place.

### 3. The sync sends no place

`web/app/src/lib/progress/sync.ts` pulls the account's copy, merges it in by the same rule,
tells the reader what moved, and forgets both copies when asked. It never calls `PUT`, and it
sends nothing the API does not already hold. `reconcile.ts` no longer lists anything to send.
Its `settle` went with the pushes: it put a cycle's merge back over the record as it stood
when the cycle landed, and a cycle that sends nothing merges and writes with nothing awaited in
between.

`PUT` itself is left as it is here. `web/mcp` still raises `Step` through it until #171, and
narrowing it is #171's.

### 4. A place only this browser holds stays here, and never reaches the account

A place past both the account's cursor and the anonymous one stays in `localStorage` as the
resume hint ADR-0060 made it. The index's *Continue* still offers it. The gate answers for the
frame, and its *Not there yet* offers the furthest frame it will serve. Such a place arises
from:

- a record written before ADR-0060, when the browser was the record;
- a cookie cleared while `localStorage` was not;
- a place merged in while a different account was signed in on this browser;
- a place forgotten on another machine, whose forget reached the account;
- a sign-in whose adoption did not arrive.

**Not sent**, because sending this browser's own number is exactly the raise being retired.
**Not dropped**, because the browser's merge never lowers a record (ADR-0019, as amended for
#157), and a hint that is wrong costs a click.

## Consequences

- **The register row changes.** `web/app` no longer raises `Step` through `PUT`, so #171,
  which lands second, narrows `PUT` with its test in `AbOvo.Api.Tests` and discharges the row.
- **A forget on one machine now stays forgotten on the account.** Before, another signed-in
  machine's next sync sent its own copy back. That machine keeps its hint until it is
  forgotten there too.
- **One account's places no longer reach another account signed in on the same browser.** The
  push sent every place the record held further than the account, and the record keeps places
  merged in from earlier accounts. Adoption takes only the anonymous cursor's. On a shared
  browser every account signed in there adopts that cursor's places, as every account used to
  receive the push.
- **The race between the sync's first `PUT` and the first reveal is gone.** The sync's first
  `PUT` for a program and the first reveal's advance each found no row and inserted one, and
  the loser got a 500. `furthest-frame.spec.ts` no longer waits for it.
- **ADR-0021's order no longer repairs itself.** It deletes the progress first, and a mistyped
  password used to cost nothing: the next sync pushed the browser's copy back. Now it costs
  the account's copy of the reader's places. The browser keeps its hint, and what the reader
  read without an account is adopted again at their next sign-in. The order stands, because
  the other order's failure leaves rows nobody can remove, and the reader was deleting the
  account. Whether it should now be reversed is a decision of its own, not taken here.
- **A program opened on one machine and not answered there is not on the account.** Opening
  writes nothing to the API (ADR-0066 §2), so the account hears of the program at its first
  reveal. Until then another machine's program gate (ADR-0051) opens the next program one
  click later. #171's opening write is the fix, if a request per opened program is worth it.
- **Where adoption fails at a sign-in, the gate refuses the frames read without an account**
  until the next sign-in adopts them. The server log says so. The reader is not told, for the
  reason ADR-0019 gives for a failed sync.
- **A sign-in waits for one more call to `AbOvo.Api`**, with the budgets
  `web/app/src/lib/server/content.ts` gives a page load.
- **The anonymous rows are copied, not moved**, so ADR-0061's retention job still has to cover
  them, as it did before.
- **This is not a new deviation.** It changes one row's Reason and Exit and adds none.

Asserted in `ProgressAdoptionTests` (the rule, whose rows move, what is left, and a frame read
without an account served to the account after adoption), `adopt-places.test.ts` (what the
server sends, and the ladder), `reconcile.test.ts`, and end to end in
[`adopt-at-sign-in.spec.ts`](../../tests/e2e/specs/adopt-at-sign-in.spec.ts) and
[`sync.spec.ts`](../../tests/e2e/specs/sync.spec.ts).
