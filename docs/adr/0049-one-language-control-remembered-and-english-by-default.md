# ADR-0049: One language control, remembered, and English by default

## Status

**Accepted.** Date: 2026-09-20.

Supersedes [ADR-0015](0015-the-reading-index-has-no-default-language.md) and the edition
switch [ADR-0036](0036-the-landing-page-is-the-index-and-the-argument-is-a-page.md) added.
ADR-0016 is untouched and is easier to satisfy than before — see Consequences.

**On the number.** This was written as 0048 and renumbered on the merge: two other changes
took that number while it was in flight, and both landed first —
[the courses page](0048-the-courses-are-a-page-and-the-index-narrows-to-one.md) and
[the theme switch](0048-the-theme-is-a-choice-and-the-system-is-a-position.md). Those two
share 0048 between them, which ADR-0001's "ids are never reused" says they should not; that
collision is theirs to resolve and renumbering somebody else's accepted decision is not this
change's to make. 0049 is the next free number and this file takes it.

## Context

The owner's report, in full: *the language choice should be only and exclusively once at the
top of the page, there are too many of these choices everywhere, fix it, and English should
always be the default; we remember the language in the browser, and in the user's account
when they are signed in.*

There were **four** language controls, and a fifth thing that behaved like one:

1. the edition switch above the programme grid (ADR-0036), with three positions — English,
   Polish, and *Both editions*;
2. a switch on every programme's contents page, on a line of its own;
3. a switch on every summary screen, likewise;
4. a switch in every frame's place row;
5. and, because the index refused to choose an edition, **every tile carried its title
   twice** — once per edition, each half a link into a different one. Forty-seven programmes,
   ninety-four titles.

None of them remembered anything. A reader who picked Polish on the index met the question
again on the contents page, again on the summary and again on every frame — and the index
they came back to the next day had forgotten. The choice was *offered* five times and
*kept* zero.

That is the direct consequence of [ADR-0015](0015-the-reading-index-has-no-default-language.md),
which refused a default edition on the ground that *the book has two editions and no primary
one*, and that a default is invisible to the reader who happens to share it. The reasoning
was sound and the artefact it produced was not: refusing to pick meant every screen had to
ask, and a question asked on every screen is a worse imposition on the reader than a default
they can change in one press.

ADR-0015 anticipated this exact argument and left the door open in as many words:

> **A later "remember my language" feature has to argue with this file.** It is not
> forbidden — a reader who has chosen twice may reasonably be offered a shortcut — but the
> default for a reader with no history is settled here, and phase 3's progress work is where
> a *chosen* language could legitimately be remembered per account.

And ADR-0036 named the precise change that would contradict it:

> A later change that drops *both*, remembers the last choice in a cookie, or reads
> `Accept-Language` reintroduces exactly the silent editorial pick both ADRs refuse — and
> would be a decision needing its own file, not a convenience.

This is that file. It drops *both* and it does remember the choice in a cookie. It does
**not** read `Accept-Language`, and the distinction is the hinge of the argument below.

The governing constraints are unchanged: the reader loop must work with no account and no
backend ([ADR-0004](0004-identity-authservice-and-anonymous-reader.md)); nothing may become
a per-reader measurement ([ADR-0009](0009-the-instrument-measures-the-book.md) §1); the
browser talks to this origin and nothing else (FRONTEND-BFF.md §1); and P3 keeps the
account's copy in the service that owns `apidb`.

## Decision

**There is exactly one language control per screen, it is in the top row of that screen, and
it is the same component everywhere** — `components/language/language-choice.tsx`. The four
switches and the doubled tile titles are gone.

**The edition defaults to English.** `chosenEdition` and `resolvedEdition` always return a
language. The precedence, written once in `lib/language/store.ts`:

1. what the **URL** asks for, where it names an edition the content publishes;
2. what this **browser remembers** of the reader's own choice;
3. **English**;
4. failing all of those — content that publishes no English edition — the track's own first
   declared one.

**The choice is remembered in the browser**, in `localStorage` (the record, which carries
*when* it was made) and mirrored to a non-HttpOnly cookie (the same answer in the one form a
server can read, so the index's first paint is already right).

**And on the account, when there is one.** `AbOvo.Api` grows a third entity,
`ReaderPreference` — one row per reader, holding a subject, a language and a timestamp —
behind `GET`/`PUT`/`DELETE /api/v1/preferences/language`. The browser's record stays the one
every page renders from; the account is a copy, on exactly the terms
[ADR-0017](0017-progress-is-local-first-and-holds-nothing-worth-scoring.md) sets for
progress.

**The tie-break is most-recent-wins, and the timestamp is the choosing machine's.** Not
furthest-wins ([ADR-0019](0019-furthest-frame-wins.md)): a preference has no "further",
because neither edition contains the other. The only rule a reader can predict is *whatever
you last chose, wherever you last chose it*, and the machine that knows when they chose is
the one they chose on. A caller's clock is clamped to five minutes ahead of the service's,
so a browser set to 2099 cannot pin a choice no honest later write could dislodge.

**`Accept-Language` is still not read, anywhere.** That refusal is ADR-0015's and it
survives intact.

## Consequences

**A reader who has chosen nothing is shown English, and ADR-0015's objection to that is
real.** A default is invisible to the reader who shares it: an English-speaking reader will
never notice that the product picked for them. What makes it acceptable here and not there
is that the pick is now **one press from being undone and then permanent**. ADR-0015's
default would have been invisible *and* unfixable — the reader would have had to re-assert
it on every screen, for ever. The test that tells the two apart is no longer "is a reader who
has touched nothing being shown somebody's pick" but "can a reader who dislikes the pick
change it once and never see it again".

**`Accept-Language` remains refused, and that is not inconsistency.** A default the reader
can see, in a control they can reach, is a different object from a guess made about them from
a header they did not know they sent. The first is a starting position; the second is the
product claiming to know something about the reader. Nothing here reads that header and
nothing may start to.

**The book still has no primary edition, and this product now has a default one.** That is
the real cost and it should be stated plainly rather than argued away: a Polish reader
arriving for the first time sees an English index. The book's own tooling still gates the two
editions frame for frame and this repository still makes no claim that either is the
original. What it now has is a starting language, which is a property of the *application*.

**The index lost its third position, so a reader can no longer see both editions at once.**
Nothing replaces it. The state it served — comparing the two titles of one programme — was a
by-product of refusing to choose rather than a feature anybody asked for, and it cost every
reader ninety-four titles on the first screen.

**One `<p>` became a `<div>` on two screens**, because the control is a `<nav>` and `<p>`
cannot contain one. `place-row.tsx`'s header records what that mistake costs when it is made:
a hydration mismatch that looks like nothing and regenerates the whole client tree.

**The index is no longer statically renderable**, because it reads a cookie. It already was
not — `searchParams` had made it dynamic under ADR-0036 — so this changes nothing that was
not already paid for, and the guarantee that used to ride on the prerender lives in
`lib/content/bundle.test.ts`.

**A third entity, against AGENTS.md's standing rule.** "The domain model is two entities and
it stays that size until a ticket says otherwise": this is the ticket, and `ReaderPreference`
arrives with its own migration like the two before it. AGENTS.md is updated in the same
change, because a rule stated against a fact that has moved is a rule nobody can follow.

**`ReaderScopedQueries` widened to cover it.** "How many readers chose Polish" is a
preference rather than a measurement, and it is still a fact arrived at by counting readers —
so the interceptor that refuses an unscoped query over `ReaderProgress` refuses one over
`ReaderPreferences` too. Without that, the new table would have been the first place in this
service where ADR-0009 §1 could be quietly broken by a `GroupBy`.

**Account deletion grew a second call, and it is before the account rather than after.** The
ordering argument in `account-deletion.ts` is about the *subject*: once authservice has
marked an account deleted, nobody can sign in as that subject again, so anything still filed
under it in `apidb` is unreachable by any reader for ever. That was true of the progress rows
and is now true of the preference row. Both failures report the same outcome to the reader,
because the instruction to them is identical, and the two deletion sentences were reworded in
both editions to say "what your account had stored" rather than naming only the reading
position.

**With script disabled the control still switches edition and no longer remembers.** Every
position is a real URL, so the reading loop is unaffected; the remembering is an `onClick`
enhancement on top of it. That is the one part of this feature that genuinely needs a browser.

**ADR-0016 is easier to satisfy, not harder.** "The reading controls follow the reader's
edition" used to have an exception — the index, which had no reader edition to follow and
was therefore English. It always has one now, so the rule is unconditional.

**The courses page came under the same rule, and lost its second title.**
[ADR-0048](0048-the-courses-are-a-page-and-the-index-narrows-to-one.md) added `/courses`
while this was in flight, with one anchor per course carrying *every* title it had —
explicitly "ADR-0015's refusal held at one more door", so that choosing a course did not
make a reader choose an edition on the way. That door is now the same as every other one:
the page has the one control at the top, reads the remembered edition from the same cookie
the index does, and shows one title per course. What still tells a reader looking at an
English title that the course exists in Polish is the `· English · polski` on its meta line,
which is the course's own property and is listed whatever the reader chose.

**The edition control and the theme switch diverged, and the divergence is deliberate.**
[ADR-0048](0048-the-theme-is-a-choice-and-the-system-is-a-position.md) gave the theme three
positions on ADR-0015's own reasoning — *System* is there so that no default is applied to a
reader who has not chosen. This file removes the edition's equivalent, and the two are not
in tension, because the third positions are not the same object. *System* is a real answer
about a real signal the browser sends; there is no signal that says which edition of a book
somebody wants, so the edition's third position was not a preference but the *absence* of
one, rendered as ninety-four titles. Where a reader's own machine can answer, ask it; where
nothing can, pick one and make it a press to change.

Not a deviation from the reference architecture; no register row.
