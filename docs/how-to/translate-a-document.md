# How to translate a document

Which documents are bilingual, what the Polish half owes the English one, and what the check
can and cannot verify.

> **Wersja polska:** [`translate-a-document.pl.md`](translate-a-document.pl.md)

## What is bilingual, and what is not

| Bilingual | English only |
| --- | --- |
| [`../START-HERE.md`](../START-HERE.md) | [`../adr/`](../adr/) — the decision log |
| [`../DIAGRAMS.md`](../DIAGRAMS.md) and every `.mmd` | [`../architecture/`](../architecture/) — the register |
| [`../SCREENSHOTS.md`](../SCREENSHOTS.md) | [`../ux/UI-UX.md`](../ux/UI-UX.md) — the plan |
| [`../tutorials/`](../tutorials/) — the whole directory | `README.md`, `AGENTS.md`, `CONTRIBUTING.md` |
| [`../how-to/`](../how-to/) — the whole directory | [`../../flyio/`](../../flyio/), [`../../scripts/`](../../scripts/) |

The rule behind that split: **what a reader or a first-time contributor reaches first is
bilingual; a record of reasoning aimed at whoever maintains the code is not.** The decision
log moves constantly, and a half-maintained translation of it is a second decision log that
disagrees with the first.

The authoritative list is in
[`../../scripts/check-doc-parity.mjs`](../../scripts/check-doc-parity.mjs), and adding a
directory to the `BILINGUAL` array there is how you opt a new area in.

## The naming rule

`<name>.md` beside `<name>.pl.md`. Same directory, same build, one visible difference in the
name. Diagrams use the same suffix on `.mmd`. The LaTeX editions use it on `.tex`.

## Translate against the vocabulary that already exists

This product already speaks Polish. `web/app/src/lib/i18n/chrome.ts` holds every string the
reading surface shows a Polish reader. The MCP server's own sentences to that reader are a
table of their own, `web/mcp/src/framing.ts` (#167), built on `chrome.ts`'s pattern. They
include the words around a step, the refusals and the hand-off at the end of a program.
**Match them rather than inventing your own**, or one concept acquires two names inside one
estate.

The words the reading surface and the MCP server share are **copied** into `framing.ts`, not
imported, because the MCP server takes nothing from the web app
([ADR-0053](../adr/0053-the-web-kit-package-is-extracted-on-its-own-exit-condition.md)).
Nothing checks one copy against the other, so **a word changed in one table is changed in the
other in the same commit**.

| English | Polish, as the product says it |
| --- | --- |
| frame | ramka |
| step (the MCP server's word for a frame) | ramka |
| section | sekcja |
| program | program |
| course (a whole work; a *track* in the schema) | kurs |
| answer | odpowiedź |
| reader | czytelnik |
| the reader's place in the book | pozycja w lekturze |
| edition | edycja |
| rate | wskaźnik |
| outcome | wynik |
| identity service | serwis tożsamości |

Leave code identifiers alone in both editions — route paths, class names, column names,
endpoint names, workflow filenames. Those are the real names and a document has to be
greppable.

## The two rules the check enforces

1. **Structural** — every bilingual document has both halves. A stray `.pl.md` with no English
   original fails the same way a missing one does.
2. **Coupling** — a commit that edits one half must edit the other. CI passes `origin/main` as
   a base ref; locally:

   ```bash
   node scripts/check-doc-parity.mjs origin/main
   ```

**The second rule cannot verify that a translation is correct; no script can.** It verifies
that somebody looked. That is the failure that actually bites: a wrong command fixed in one
language and left wrong in the other, with nothing going red.

If a change genuinely did not need the other half to move — a typo in an English-only quotation,
say — say so in the pull request rather than working around the check.

## Starting a new bilingual document

```bash
npm run lint:parity    # names exactly which half is missing
```

Write the English half first, then the Polish. A Polish half that is a machine translation of
a document nobody has read in English is two documents that are both wrong.

**A translation is not a transliteration.** Where the English says something in an idiom that
has no Polish equivalent, say the thing rather than the idiom. The rule these documents are
held to is that the two halves make the same claims and give the same commands — not that they
have the same sentences.

## See also

- [`build-the-documentation.md`](build-the-documentation.md)
- [`../START-HERE.md`](../START-HERE.md)
