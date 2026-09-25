# ADR-0016: The reading controls follow the reader's edition

## Status

**Accepted.** Date: 2026-09-14.

## Context

[ADR-0015](0015-the-reading-index-has-no-default-language.md) settled the index and recorded
what it did not settle: *"Reveal the answer", "Previous", "Start at frame 1" are English
wherever a reader is … nothing has yet decided which side the reading controls sit on.* It
named issue #6 as the owner, which is this change.

The repository's ground rule is **English for everything needed to build or deploy; the
content is bilingual, the repository is not.** Reading controls are neither build tooling
nor content, so the rule does not reach them, and the current state is the result of nobody
having decided rather than of anybody choosing.

Two answers, both defensible:

1. **Chrome stays English.** The audience is AI engineers who read English by construction —
   the book itself keeps its listing comments in English and says why. A language switch
   would then change the frame and not the page around it, which is arguably clearer.
2. **Chrome follows the edition.**

## Decision

**The controls are written in the reader's edition**, and the string table lives in this
application.

The argument that decides it is about the *method* rather than about the audience. The
book's frames work by having the reader commit before they reveal; "Reveal the answer" is
not a caption, it is the instruction the mechanic runs on, and it arrives at the exact
moment the method needs no friction. And the book's second edition is an expensive,
deliberate artefact — forty-seven programs and a parity tool that gates the two frame for
frame — so a platform that renders it inside English furniture undercuts the reason that
edition exists. Option 1's premise is right about code comments, which is where the book
applies it, and it does not carry to a button the reader must act on.

### The table is in the application, never in the bundle

`web/app/src/lib/i18n/chrome.ts`. `content-schema.v1.json` deliberately knows nothing about
a reading UI ([ADR-0014](0014-the-content-schema-is-json-schema-and-knows-nothing-about-frames.md)),
and labels in a content bundle would make every track's compiler responsible for this
application's chrome. The book compiles frames; it does not compile the word for "Contents".

### The content's languages and the chrome's languages are two different sets

`track.languages` is what the **content** was written in — the bundle's claim, the
compiler's to make. The table above is what this application's **controls** were written
in. They are equal today for `en` and `pl` and there is no reason they must stay equal: a
track may publish an edition this repository has no word for.

So `chromeFor()` falls back to English **and reports the language it used**, and the
components put that on a `lang` attribute. A page whose content is German and whose controls
are English then says exactly that, and a screen reader reads each in the right voice.
Refusing to serve the content would be the worse answer; claiming the buttons are German
would be the quieter one.

### Counts go through `Intl.PluralRules`, and the table is gated for completeness

English needs two forms and Polish needs four: `ramka` at 1, `ramki` at 2–4, `ramek` at
5–21, `ramki` again at 22–24 — a rule with a modulo and an exception band. Hand-rolling it
produces "5 ramki" on a page nobody reviews in Polish. `Intl.PluralRules` is the platform's
implementation of the CLDR rule and is correct for a language this repository has never
heard of.

A unit test asserts that every entry covers every category
`new Intl.PluralRules(language).resolvedOptions().pluralCategories` reports for **its own**
language, which is the authoritative list rather than a sample of numbers. It was watched
going red with Polish's `many` removed.

### A language is named in its own language

`Intl.DisplayNames`, so there is no hand-maintained list to fall out of date — "English",
"polski", "Deutsch". The reader reaching for the switch may be the reader who cannot read
the page they are on, so labelling the Polish link "Polish" would put the one word they need
in the language they are trying to leave. `polski` really is lower case: Polish does not
capitalise the names of languages.

## Consequences

**A third edition costs a table entry, not a design.** Everything iterates
`track.languages`, and a language with no entry degrades to English controls that admit it.

**The acceptance suite could no longer find the reveal control by its words.** It located it
as `getByRole('link', { name: /reveal|next frame/i })`, which broke the moment the label
became Polish. It is located by `href` now — the link to step n + 1, of which there is
exactly one — which says what the control *is* rather than what it currently reads, and is
stronger than the name matcher was. Matching the Polish too would have been a second copy of
a string that has a source.

**The chrome assertions in the suite are relational, not copies.** "The two editions render
different control text and each declares its own language" needs no string from this table
and goes red the day the controls stop following the edition. A spec asserting
"Pokaż odpowiedź" would drift the first time somebody reworded it.

**The index was English, and the exception is now gone.** This ADR used to carry a caveat:
the index had no reader language for the chrome to follow, because
[ADR-0015](0015-the-reading-index-has-no-default-language.md) refused to pick an edition of
the *book* for the reader, so the furniture there was English whatever the reader read in.
[ADR-0052](0052-one-language-control-remembered-and-english-by-default.md) gave the index a
reader edition — English by default, remembered once chosen — so the rule below is
unconditional and there is no page left that has nothing to follow. The index moved to `/`
with ADR-0036; `/read` is a 308 to it.

**The Polish strings have had no native review.** They are written to the book's own
vocabulary where it has one (`ramka` for a frame, and the book's `Kolejna ramka.` for the
cue) and they are one person's Polish everywhere else. That is a real gap and it is cheap to
close: the strings are eleven entries in one file, and nothing else in the repository needs
touching to fix one.

**Two Polish strings chose a gender for every reader, and now choose none.** A
second-person past tense in Polish cannot be written without one — *Zapisałeś* is a man
who wrote, *Zapisałaś* a woman — so the reveal's label and the deletion screen's password
hint were addressing half the readers as the other half. Neither chooses one now: the
password hint is impersonal (*hasło nigdy nie zostało ustawione*), which is the register
Polish interfaces use for exactly this reason, and the reveal's label is a noun phrase,
*Twoja odpowiedź*. It was the impersonal *Zapisano* first, which kept the rule and read as a
save confirmation — "Saved: 42" — in front of what the reader wrote (issue #152). The
sketch's plain background is *Bez tła* rather than an adverb. The strings have still had no
native review.
