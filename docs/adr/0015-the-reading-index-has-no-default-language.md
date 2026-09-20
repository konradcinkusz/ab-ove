# ADR-0015: The reading index has no default language

## Status

**Superseded by [ADR-0049](0049-one-language-control-remembered-and-english-by-default.md).**
Date: 2026-09-14. Superseded: 2026-09-20.

The refusal recorded here held for six days and produced the artefact it was written to
prevent the *other* failure of: with no default anywhere, every screen had to ask, so the
product grew four language switches and an index that printed ninety-four titles for
forty-seven programmes — and none of them remembered the answer. ADR-0049 reverses the
decision below and keeps two of its clauses verbatim: `Accept-Language` is still not read,
and the editions are still listed in the bundle's own declared order.

Read on for the argument, which is still the best statement of what a default costs.

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

**The chrome was still English on a Polish page**, and this ADR recorded it as a gap rather
than settling it — the repository is English by ground rule and the *content* is bilingual,
and nothing had decided which side the reading controls sit on. **Settled since, in
[ADR-0016](0016-the-reading-controls-follow-the-readers-edition.md): the controls follow the
reader's edition.** The index's own furniture stays English, which is not in tension with
the decision above — that one refuses to pick an edition of the *book*, and there is no
reader language on this page to follow.

**A later "remember my language" feature has to argue with this file.** It is not forbidden
— a reader who has chosen twice may reasonably be offered a shortcut — but the default for
a reader with no history is settled here, and phase 3's progress work is where a *chosen*
language could legitimately be remembered per account.

**It argued, and it won:
[ADR-0049](0049-one-language-control-remembered-and-english-by-default.md).** The shortcut
this paragraph left room for turned out to be the whole feature: once the choice is kept —
in the browser, and on the account when there is one — the four switches this file's refusal
made necessary collapse into one control, and a default the reader can change in a single
press stops being the invisible imposition argued against above.

**Something argued with it and the decision survived once, then did not.**
[ADR-0036](0036-the-landing-page-is-the-index-and-the-argument-is-a-page.md) made the index
the landing page and gave it an edition switch — the toggle this file refused. What made the
two compatible was that the switch had a third position and the page a reader ARRIVED at was
that one: both editions, each title its own link, nothing chosen. The refusal here was of a
*default*, not of a control, and the test that told them apart was whether a reader who had
touched nothing was being shown somebody's pick. ADR-0036 named the change that would break
that — "a later change that drops *both*, remembers the last choice in a cookie … would be a
decision needing its own file". That file is
[ADR-0049](0049-one-language-control-remembered-and-english-by-default.md), which drops the
third position and does remember the choice. It replaces the test above with a different one:
not "is the reader being shown somebody's pick" but "can a reader who dislikes the pick change
it once and never see it again".
