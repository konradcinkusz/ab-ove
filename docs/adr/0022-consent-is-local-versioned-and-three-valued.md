# ADR-0022: Consent is local, versioned, and three-valued

## Status

**Accepted.** Date: 2026-09-15.

## Context

Issue #14 asks for consent to contribute to the instrument: **opt-in, versioned, default
off**, and — the clause that shapes everything below — _"Declining changes nothing a reader
can perceive except the contribution itself. No degraded feature, no nag, no second ask on
the next page, no 'are you sure'."_

Three constraints were already decided elsewhere and are not re-litigated here.

**What the instrument may record is settled.** ADR-0009 §1: an outcome against a _frame in a
bundle version_, an _attempt_ and a _check run_, with the reader's identity absent — _"not a
column, not a foreign key, not a pseudonymous hash, and not a join away"_. So the invitation
can describe what is being agreed to concretely rather than as "usage data".

**The reader loop works with no account** (ADR-0004), so an anonymous reader must be able to
consent. Issue #14 says so directly: _"consent is not an account."_

**The instrument is not built.** `AbOvoDbContext` declares one entity and it is the progress
store. There is nothing yet to contribute to.

METRIC-ETHICS.md §5 is what the whole of phase 4 is measured against: _the useful question
this instrument answers is where is this book wasting the reader's time — not which reader
is worst._ A consent default that harvested by inertia would produce a larger sample and a
dishonest product.

## Decision

**Consent lives in `localStorage`, beside progress, and is not synchronised to an account.**

That is a decision rather than the easy path. An account copy would spare a two-device
reader a second question — and an answer that arrived on a machine the reader never gave it
on is not consent, it is a setting that followed them. The cost is stated under
Consequences and is accepted.

**Three states, not a boolean:** `undecided`, `granted`, `declined`. The first and third
contribute identically, so a boolean would decide correctly what to _send_. It could not
decide whether to _invite_ — and with one bit you cannot tell somebody who has never been
asked from somebody who said no, so you ask everybody, on every page, for ever. The "no
nag" clause is unimplementable without the third state.

**The version lives inside the record, not in the key.** `progress/store.ts` versions by key
(`ab-ovo:progress:v1`), which is right there: a shape change orphans the old document and
nobody wants it back. Here the rule is stronger — _a previous version's answer does not carry
over_ — and a key suffix would make that true only by accident, because two different key
strings do not collide. A test written against it would assert that `…:v1` and `…:v2` differ,
which proves nothing about consent. Inside the record it is an explicit comparison that a
test can pin, and the version is compared **before** the answer is read, so a stale `granted`
reads as `undecided` rather than as `granted`.

**Bump the version when WHAT IS RECORDED changes, and never for wording, layout or storage
shape.** Bumping for a typo re-asks every reader for nothing and teaches them the question is
noise; not bumping when a field starts being recorded carries an answer to a question nobody
was asked.

**Every failure resolves to `undecided`.** Absent, unparseable, wrong version, wrong type,
storage switched off, no slot at all. There is no input to the store that yields `granted`
by accident: the failure mode of a consent record is silence, and that is the only safe
direction for it to fail in.

**The invitation ships now, before there is anything to contribute to**, and says so. That
is what versioned consent is _for_: a reader agrees to a described shape, and if the shape
changes the version changes and they are asked again. Waiting until #15 lands would mean
building the recording path first and the gate afterwards, which is the order that produces
a gate somebody has to remember to call.

**The decline has the same tag, type size, weight, padding and opacity as the accept**, and
an acceptance test compares the computed values. A decline that is smaller, greyer or a text
link is an opt-in in wording and a nudge in fact.

**`mayContribute()` is the one door.** Issue #15's recording path asks it and nothing else,
so there is exactly one place in the product that decides whether an outcome may be sent.

## Consequences

**A reader with two devices is asked twice.** That is the cost of not syncing, and it is
paid deliberately. It is not a nag: the "no second ask" clause is about the same browser,
and a new machine asking once is the same question being put to a reader who has not
answered it _there_.

**Withdrawing does not retract anything already counted**, and the control says so while
contributing. It is the deletion screen's sentence (ADR-0021) arriving from the other end of
the same property: an outcome carries no reader, so nothing can find the ones that were
yours, so stopping stops the next one and retracts none.

**An answer is lost if a reader clears their browser storage**, and they are then invited
again. Acceptable, and it fails in the safe direction: what they lose is that they are
contributing, not that they are contributing unknowingly.

**`store.forget` has no caller.** It exists because returning a reader to
never-having-been-asked is a real operation and the store is where primitives live; the
obvious caller is the wrong one, since _Forget where I am_ clears a reader's **place**, and
clearing consent with it would bring the invitation back — a nag arriving through a door
marked something else. The absence is recorded in `consent/client.ts` so the next person does
not wire it up on the strength of finding it unused.

**One sentence has an expiry date.** _"Nothing is recorded yet — the instrument is not
built"_ is now on two screens (this invitation and the deletion screen) in both editions, and
the .NET test `The_instrument_is_not_built_and_the_deletion_screen_says_so` names all of them
in its failure message. Whoever builds #15 gets a red build and a list.

**An acceptance test was written vacuous and is recorded rather than replaced quietly.** The
first version of the equal-weight check compared the two buttons' rendered heights; rewriting
the decline as a 0.75rem borderless link left it passing, because the row is a flex container
and flex stretches its items to equal height. It was measuring the container. Found by
mutating the stylesheet and watching the test not fail — which is the only way that class of
defect is ever found.

**The invitation is made on two pages, and it is still one ask.** It sat below the index's
forty-seven tiles, where almost nobody scrolls, and nowhere else; it is also on a program's
summary now, where a reader has just worked the frames the instrument is about. Same
component, same three states, same record — so an answer given on either page is the answer
on both, and `specs/consent.spec.ts` asserts that declining on the summary leaves the index
silent. The no-nag rule above is unchanged: a second page is not a second ask, because the
record is read before anything renders.
