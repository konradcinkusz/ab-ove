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

**Something has since argued with it, and the decision above survived the argument.**
[ADR-0036](0036-the-landing-page-is-the-index-and-the-argument-is-a-page.md) made the index
the landing page and gave it an edition switch — the toggle this file refused. What makes
the two compatible is that the switch has a third position and the page a reader ARRIVES at
is that one: both editions, each title its own link, nothing chosen. The refusal here is of
a *default*, not of a control, and the test that tells them apart is whether a reader who
has touched nothing is being shown somebody's pick. Drop the third position and this file is
being contradicted rather than extended.
