# What ab-ovo asks a content compiler to emit for schema 2

A note for the book's tracker, written in ab-ovo because the schema is ab-ovo's: a content
compiler targets it, and this repository reads the book and never modifies it.

**Nothing here is urgent and nothing breaks without it.** `content-schema.v1.json` is
unchanged and a v1 bundle validates exactly as it did; the application reads both versions.
What v2 buys is two surfaces that cannot be built at all from a v1 bundle.

The schema is `web/app/src/lib/content/content-schema.v2.json`, the reasoning is
[ADR-0046](../adr/0046-schema-2-carries-the-books-third-stage.md), and there is a worked
fixture at `web/app/src/lib/content/fixtures/book-p01.v2.bundle.json`.

## Why: two things the reader cannot reach

Measured on the served bundle at `dev-e24a4919026e`:

| | count | carries its text |
|---|---|---|
| summary routes | 763 | yes |
| outcome routes | 279 | yes |
| **quiz routes** | **370** | **no** |

So the Quiz — the instrument the book asks a reader to use *before* reading a program — is
370 frame ranges with no questions attached. The compiler already parses `\teachesat` and
`\teachesatone` into `from`/`to`; it drops the item's body and its `\answerto`.

And the book's third stage has no representation at all, so the application's summary screen
names it in one apologetic sentence. Counted in the book's own source: **395 Test exercises
and 376 Further problems per edition, identical in English and Polish, and every one of the
1141 items including the Quiz carries an `\answerto`.**

## What to emit

### 1. `schemaVersion: 2`

A bundle declaring 2 is checked against the v2 document. Relabelling a v1 bundle does not
upgrade it — the quiz rules below refuse it, and the refusal names the missing field.

### 2. On a quiz route: `labels` and `answer`

Both are `Text` (a string per language in `track.languages`), both **required** when
`kind` is `"quiz"`, and both come from the `\item` the `\teachesat` already sits in:

```latex
\item Simplify $2^{6} \times 2^{-2}$. \teachesat{9--13}
  \answerto{$2^{4} = 16$.}
```

→ `labels` is the item's body without the route and the answer; `answer` is the `\answerto`.

Outcome and summary routes are unchanged: they carry `labels` today and no `answer`.

### 3. On a unit: `exercises[]`

```jsonc
{ "kind": "test" | "further", "n": 1, "body": {…}, "answer": {…} }
```

From `\begin{testexercises}` and `\begin{furtherproblems}`, one entry per `\item`, in source
order. **`answer` is required** — all 771 per edition have one. `n` ascends within a kind and
the two kinds are numbered from 1 independently, which is what the book does.

The application will keep a Test exercise's answer off the question's own page by putting it
behind a route, exactly as it does for a frame's answer. **Please emit it anyway**: that is
the same arrangement `step.answer` already has, and it is the route rather than the bundle
that holds the absence property.

### 4. On a unit: `part` (optional)

`{ "id": "II", "titles": {…} }`, from `tools/programs.json`. No step range — a part's span is
the units that name it, and a second source for one fact is the defect `--parts` exists to
catch.

## What NOT to emit, and why

These were each proposed and refused; `additionalProperties: false` means emitting one makes
the bundle invalid rather than being ignored.

- **A frame range on an exercise.** Zero exercise blocks in the 47 programs carry
  `\teachesat`. A field no producer can fill is a field every reader of the schema wonders
  about.
- **A classification of what a frame asks for** (`number` / `expression` / `prose` /
  `sketch`). The book carries no such marker, so only a heuristic could fill it — and the
  heuristic was measured here: matching the imperative and the noun fires on **99 English
  frames and 28 Polish ones**, for a book whose editions are frame-for-frame identical,
  largely by matching *graph* in the graph-theory program. Moving an unreliable classifier
  upstream does not make it reliable. **If the book ever marks this explicitly — an optional
  argument on the frame, say — the field is one line and it is worth having.**
- **Figures and transcripts.** Counted (150 `\mermaidfig` and 44 `\transcript` per edition)
  and left, because what is missing is the placement model rather than the count, and the
  book's own record spends pages on where a figure lands in four builds and on the rule that
  a figure may not answer the frame beside it. Specifying the easy half would settle nothing.

## Checking it

`node --test` over `web/app/src/lib/content/validate.test.ts` validates both fixtures and
every refusal above. The validator implements a subset of JSON Schema and refuses a document
using a keyword outside it, so the conditional rules — a quiz route's two required fields,
the exercises' ascent — live in `checkStructure` rather than in the document. A rule written
in `if`/`then` would be ignored silently, which is why neither file uses it.
