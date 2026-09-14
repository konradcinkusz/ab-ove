# ADR-0015: The reading index has no default language

## Status

**Accepted.** Date: 2026-09-14.

## Context

Every page below the index is addressed by a language —
`/read/<track>/<unit>/<lang>/<n>` — which is what makes a deep link survive a reload with
no session ([ADR-0004](0004-identity-authservice-and-anonymous-reader.md): the reader loop
works with no account). The index at `/read` has no such segment, because it is where a
reader who has not chosen yet arrives.

So the index has to render *something*, and the obvious shapes all pick for the reader:

- one title, in a default language, with a toggle;
- one title, in a language guessed from `Accept-Language`;
- the English title, with "also available in Polish" beside it.

The book has **two editions and no primary one**. Its own tooling gates them frame for
frame — the parity checks compare structural tokens, maths spans and numeric literals in
order, and a divergence in either direction fails the build — and its conventions are
explicit that the two are the same book rather than a translation of one. A platform that
served one by default would be making an editorial claim about a book that has spent
forty-seven programs refusing to make it.

It is also the one page where that could happen *quietly*. A default is invisible to the
reader who shares the language it defaulted to, and the resulting page looks tidier than
the honest one.

## Decision

**`/read` renders a title per edition, each in its own language, and each title is the link
into that edition.** No flag, no toggle, no "also available in", and no `Accept-Language`
sniffing.

The order the titles appear in is `track.languages` — the bundle's own declaration, read
and not sorted. A vertical list has an order whether or not anyone chooses one; what this
avoids is the *application* inventing it, and the bundle is the artefact entitled to say
which edition its track lists first.

The rule is about the **index** specifically. Below it a language is in the URL, so a
contents page and a frame render one edition and say which by `lang` attribute.

## Consequences

**A reader who cannot read either title is not served by this page**, and that is the
honest failure: they are not served by the book either. A third edition costs nothing here
— the index iterates `track.languages`.

**It costs a line per edition on every entry**, so at 47 programs the index is 94 titles.
That is a contents page and it is meant to be long; if it ever needs splitting, a per-track
`/read/<track>` is an addition rather than a restructure, because the deep links below it
do not move.

**The chrome is still English on a Polish page.** "Reveal the answer", "Previous", "Start
at frame 1" are English wherever a reader is. That is a real gap rather than a deviation
this ADR settles: the repository is English by ground rule and the *content* is bilingual,
and nothing has yet decided which side the reading controls sit on. Recorded against issue
#6, which owns the EN/PL switch, so that whoever takes it decides rather than inherits.

**A later "remember my language" feature has to argue with this file.** It is not forbidden
— a reader who has chosen twice may reasonably be offered a shortcut — but the default for
a reader with no history is settled here, and phase 3's progress work is where a *chosen*
language could legitimately be remembered per account.
