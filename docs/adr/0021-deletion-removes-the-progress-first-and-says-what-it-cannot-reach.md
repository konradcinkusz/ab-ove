# ADR-0021: Deletion removes the progress first, and says what it cannot reach

## Status

**Accepted.** Date: 2026-09-15.

## Context

Issue #13 asks for account deletion that removes the account **and the progress**, and adds
a second clause that is the harder half: it must _"say plainly that it cannot retract an
anonymous outcome already folded into a rate."_

Three facts about this estate force the shape of the answer, and none of them is a
preference.

**The two things being deleted live in different services.** The account is authservice's;
the progress is `AbOvo.Api`'s, in `apidb` (P3 — a database per service). There is no
transaction over the pair, so one of them happens first and the other can fail after it.

**authservice's deletion is a soft delete, and its response says nothing about that.** Read
at the pinned image's tag, `AuthController.DeleteAccount` sets `IsDeleted`, `DeletedAt` and
`ScheduledPermanentDeletionAt`, revokes the refresh tokens, and answers `200 { message }`.
The schedule is computed from a constant in its own assembly; the body this caller receives
carries neither the date nor the period. So this application knows a retention window
exists and cannot know how long it is.

**The instrument does not exist.** ADR-0009 §1 decided that an outcome carries no reader —
_"not a column, not a foreign key, not a pseudonymous hash, and not a join away"_ — which
is exactly why a deletion cannot retract one. But phase 4 is unbuilt: `AbOvoDbContext`
declares one entity and it is the progress store. A screen saying _"we cannot remove your
outcomes"_ today would describe a design correctly and imply a collection that is empty.

METRIC-ETHICS.md §1 governs the third: _"An anti-goal that only exists as prose is a
request; an anti-goal the architecture cannot express is a rule."_ The property is a rule
already. What is at stake here is only whether the screen describes it honestly.

## Decision

**Remove the stored progress first, then the account, then the cookies.**

The order is chosen on the shape of the two failures rather than on which is the bigger
object.

- _Progress first._ The likely failure is a mistyped password, and it lands after the
  synced rows are gone. The reader keeps their account, keeps their session, and — because
  signing out leaves local progress intact (ADR-0019) — their browser still holds every
  position it held a second earlier. The next sync finds an empty remote and pushes the lot
  back. The loss is zero and it repairs itself.
- _Account first._ The same typo costs nothing, which is better. But anything going wrong
  between the two calls leaves the account gone and rows in `apidb` under a subject that
  can never sign in again: unreachable by any reader, unremovable by any request, produced
  by the feature whose purpose is removing rows.

One order's worst case repairs itself and the other's is permanent. **That recoverability
is inherited from ADR-0019 and is not a property of this file**; reverse that decision and
this ordering becomes the wrong one.

**Clear the session cookies last, and only on success.** authservice revokes only the
_refresh_ tokens; the access token stays valid until its own `exp`, and nothing in this
deployment consults authservice per request. Until this origin drops its own cookies the
reader is signed in as an account that no longer exists.

**Say four things on the screen, in the reader's own edition, before the button.** What
goes; what stays and why that is not an oversight; what no deletion can reach; and that the
account is marked and scheduled rather than erased. The third and fourth are the ones a
reader would otherwise discover afterwards, which is the worst moment to discover either.

**Do not name the retention period.** authservice does not tell us, and copying `30` out of
another repository's source would be a figure nothing here can check, in a repository that
does not depend on the one that owns it, going stale silently the day it changed. The
screen says a period exists and whose it is to state.

**Gate the one sentence that is true only today.** _"Nothing of that kind is recorded yet:
the instrument is not built"_ is a claim about a state, not a design.
`The_instrument_is_not_built_and_the_deletion_screen_says_so` fails the build when a second
entity appears in the model, and its message names the string, both pages, and what to
delete.

**Leave the reader's local progress alone.** Deleting an account is not burning the
reader's book. `Forget where I am` on the reading page is the control for that, and the
deletion screen points at it.

## Consequences

**A reader who mistypes their password loses the synced copy of their progress.** It comes
back on the next sync from the browser that submitted the form — but a reader who submits
from one device and then opens a _different_ one before that sync has run sees an empty
account. Accepted, because the alternative is the permanent orphan above.

**The screen is bilingual where `/login` is English-only, which is a deviation from that
page's own recorded reasoning.** `/login` argues it has no language to follow and declines
to guess; this page is reached from a link in the reading chrome that already knows the
edition, and — unlike a sign-in form, where a reader can guess at "email" and "password" —
its four paragraphs _are_ the deliverable. A reader who cannot read them has not been told,
which is the thing issue #13 asks for. No deviation-register row: this is a decision about
one page, not a departure from a reference-architecture rule.

**`/account/deleted` is a second page, and public.** `/account?deleted=1` cannot work: the
route's last act ends the session, so the middleware would bounce the reader to a sign-in
form for the account they had just deleted. Nothing warns — the route answers 303 and
succeeds, the page renders for anyone who still has a session, and the defect lives
entirely in the interaction between a redirect and a gate.

**The route is `POST`, not `DELETE`.** A plain HTML form cannot issue `DELETE`, and the
reading surface and the sign-in form both work with script disabled; a deletion that
required JavaScript would demand a working browser of a reader who has decided to leave.
The path carries what the verb cannot, and it is `/account/delete` rather than `/account`
so that a later creative `POST` cannot collide with it silently.

**Nothing here is proved end to end in CI.** No identity service runs there, so the
deleting path is pinned at the layer with the logic (P13) — including the order, which is
asserted by recording the calls — and the acceptance suite asserts only invariants that
hold in a configured deployment and an unconfigured one alike. The translation table was
written against authservice's source and **not** against a running one; issue #29 is open
for the fixture that would change that.

**The three 400s from authservice are separated only by English prose in its source.** They
are matched positively and loosely, and anything unrecognised becomes `unavailable` rather
than the most likely guess: report a wrong confirmation as a wrong password and the reader
retypes a password that was right, for ever. If that prose changes, the reader sees "could
not be reached" instead of the specific message — degraded, and never wrong.
