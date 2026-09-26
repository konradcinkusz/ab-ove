# Start here

The front door to this repository's documentation.

There is a lot of it, and it is not all the same kind of thing. This page tells you which kind
you need and sends you there. If you read one page before any other, read this one.

> **Wersja polska:** [`START-HERE.pl.md`](START-HERE.pl.md)

## What is this repository?

**ab-ovo is a learning platform for programmed-learning courses** — each course a sequence
of programs of Stroud frames, in every edition it is published in, together with its computer
exercises. The one course pinned today is *Mathematics from Zero for the AI Engineer*: 47
programs, in English and Polish.

It exists because a book built that way rests on a mechanism a PDF cannot enforce:

> A frame asks you for something **before** it tells you anything, and the next frame opens
> with the answer you were supposed to have written. The reader who skims gets nothing, and
> paper has no way to notice.

Here, the answer to the frame you are on is **absent from the page** rather than hidden on it.
The reveal is a navigation, so nothing in the document, on the wire or in a prefetch carries
it. That one property is what the rest of this repository is arranged around.

**Nothing is deployed.** No instance of ab-ovo runs at any address, for anybody. What exists
is the reading surface over the whole book, an API, a Playwright acceptance suite, four
`fly.toml` files describing a topology that has never been applied, and the gates that would
catch a regression in any of it.

## Four kinds of document, and which one you want

This documentation follows [Diátaxis](https://diataxis.fr/), which observes that documentation
serves four distinct needs and that a page trying to serve two of them serves neither well.
The four are split by two questions: *are you working or studying?* and *do you need action or
knowledge?*

| | **Practical** — action | **Theoretical** — knowledge |
| --- | --- | --- |
| **Studying** (acquiring skill) | 📘 **Tutorials** — lessons that take you through doing something for the first time | 💡 **Explanation** — background, context, and why things are the way they are |
| **Working** (applying skill) | 🔧 **How-to guides** — recipes for a task you already understand | 📇 **Reference** — dry, exhaustive description of the machinery |

Pick the row by what you are doing right now, not by how much you know.

### 📘 Tutorials — "I have never run this before"

Learning-oriented. You follow along, everything works, and you finish having seen the thing
with your own eyes. No decisions to make, no theory. **Every tutorial exists in both
languages.**

1. [**Your first run**](tutorials/01-first-run.md) — clone it, start it, open a frame, and
   watch the product refuse to tell you the answer. About twenty minutes, no credentials, no
   accounts.
2. [**Read a program the way it was meant to be read**](tutorials/02-read-a-program.md) — one
   program of the book, worked properly. About forty minutes, and it is the only way to
   understand why this exists.
3. [**Contribute a change**](tutorials/03-contribute-a-change.md) — run every gate, then watch
   two of them refuse something. About thirty minutes.

### 🔧 How-to guides — "I know what I want; how do I do it?"

Task-oriented. Each one assumes you already understand the surrounding ideas and gets straight
to the steps. **All of them exist in both languages.**

- [Run the tests](how-to/run-the-tests.md) — every tier, and one at a time
- [Refresh the content bundle](how-to/refresh-the-content-bundle.md) — fetch the book, verify
  it, move the pin
- [Add a diagram](how-to/add-a-diagram.md) — the three places it has to land, and the Mermaid
  traps worth knowing first
- [Capture the screenshots](how-to/capture-the-screenshots.md) — retaking the pictures in the
  tour
- [Build the documentation](how-to/build-the-documentation.md) — the checks, the PDFs, and
  what CI does with each
- [Translate a document](how-to/translate-a-document.md) — what is bilingual, and the
  vocabulary to match

### 📇 Reference — "what exactly is the name of that thing?"

Information-oriented. Look things up; do not read start to finish.

| Document | What it describes |
| --- | --- |
| [`architecture/00-ARCHITECTURE.md`](architecture/00-ARCHITECTURE.md) | This repository walked against the constitution, P1 to P15, with its deviation register and known gaps |
| [`adr/`](adr/) | Every decision, with the alternatives that were rejected. Status / Context / Decision / Consequences |
| [`ux/UI-UX.md`](ux/UI-UX.md) | Every screen, what it needs, the design tokens as built, and the ranked backlog |
| [`../flyio/README.md`](../flyio/README.md) | Which address reaches what, in a topology that does not exist yet |
| [`../flyio/SECRETS.md`](../flyio/SECRETS.md) | Every secret, and what degrades without it |
| [`../secrets.env.example`](../secrets.env.example) | The authoritative list of every variable, by tier, with no values |
| [`../scripts/README.md`](../scripts/README.md) | Every script, and a troubleshooting table keyed on the literal exception text |
| [`../tests/e2e/README.md`](../tests/e2e/README.md) | The acceptance suite: its layers, its fixtures, and what each one proves |

### 💡 Explanation — "why is it built this way?"

Understanding-oriented. Read these when you want the reasoning rather than the steps.

| Document | What it explains |
| --- | --- |
| [`DIAGRAMS.md`](DIAGRAMS.md) 🇬🇧 / [`DIAGRAMS.pl.md`](DIAGRAMS.pl.md) 🇵🇱 | The whole system as diagrams, in four parts — architecture, the reader loop, the instrument, delivery |
| [`SCREENSHOTS.md`](SCREENSHOTS.md) 🇬🇧 / [`SCREENSHOTS.pl.md`](SCREENSHOTS.pl.md) 🇵🇱 | What the product looks like, screen by screen, from a real build |
| [`../README.md`](../README.md) | What ab-ovo is, what it deliberately is not, and the anti-goals as claims about the code |
| [`../AGENTS.md`](../AGENTS.md) | The nine things most likely to be got wrong, for an automated contributor |
| [`../CONTRIBUTING.md`](../CONTRIBUTING.md) | The same ground, for a human |
| [`papers/ab-ovo-overview.tex`](papers/ab-ovo-overview.tex) 🇬🇧 / [`papers/ab-ovo-overview.pl.tex`](papers/ab-ovo-overview.pl.tex) 🇵🇱 | The project overview, typeset — a presentation of the markdown above, introducing no fact of its own |

## The one idea worth having before anything else

**ab-ovo measures the book, never the reader.**

> The useful question this instrument answers is *where is this book wasting the reader's
> time* — not *which reader is worst*.

That is not a policy, and it is not an intention. It is a set of claims about the code, each
one false the moment somebody ships the thing it denies:

- There is **no per-reader view**, and adding one is not planned. No route, page or component
  is keyed by a reader; no leaderboard, no ranking, no per-reader score, no per-author sort
  control.
- There is **no per-reader API surface**. No endpoint names a person in its route or its query
  parameters.
- There is **no table from which a per-reader score could be built**. An outcome is recorded
  against a *frame*, an *attempt* and a *check run* — the artifact, never the person — and it
  carries no timestamp either.

Three mechanical things hold the last one, and each was watched refusing something before it
was believed: closed column lists, every key and index leading with the bundle tag, and a
query that spans texts refused before EF compiles it. [`DIAGRAMS.md`](DIAGRAMS.md) §A5 and §C4
draw them.

And the reader is told what that costs them, which is the half an architectural absence cannot
deliver on its own: because an outcome carries no reader, **deleting an account cannot retract
a contribution already folded into a rate**. The deletion screen tells the reader so in plain
words.

## Everything on one page

```text
docs/
├── START-HERE.md / .pl.md      you are here
├── DIAGRAMS.md / .pl.md        the system as pictures, four parts
├── SCREENSHOTS.md / .pl.md     the product as screens
├── tutorials/                  bilingual, learning-oriented
├── how-to/                     bilingual, task-oriented
├── adr/                        the decision log, English
├── architecture/               the constitution walk and the deviation register, English
├── ux/                         the screens and the ranked backlog, English
├── diagrams/                   one Mermaid diagram per file, in both languages
├── assets/screenshots/         the pictures the tour shows
└── papers/                     the LaTeX overview, both editions
```
