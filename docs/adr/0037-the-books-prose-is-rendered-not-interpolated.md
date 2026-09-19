# ADR-0037: The book's prose is rendered from Markdown and KaTeX, and no bundle text becomes raw HTML

## Status

**Accepted.** Date: 2026-09-19.

## Context

The application rendered a frame's body as one plain `<p>`. The book's bodies are Markdown
with `$…$` maths in them, so a reader met `The *natural numbers*: $0, 1, 2, 3, \dots$` as
those characters, asterisks and dollars included. Measured against the served bundle: 21 714
maths spans, 105 frames with GFM tables, six code fences, and 424 blockquotes opening with a
bold title that the book uses as its admonition boxes — traps, warnings, notes, *where this
shows up in AI*, *what we are not proving*, notation.

Three facts constrained how this could be fixed.

- **906 maths spans contain `_` and 163 contain `<` or `>`.** A Markdown parser reading
  `$x_1 < y$` turns the underscore into emphasis and the angle bracket into a tag. So the
  maths has to come out of the text before any parser sees it, and go back after.
- **P11 — this repository does not parse the book's source.** It renders a compiled
  artefact. That rules out reading LaTeX and rules in reading the `Text` the compiler emits.
- **A renderer that accepts anything accepts anything.** The bundle is content from another
  repository. `dangerouslySetInnerHTML` over it would make every future change to the book a
  change to this application's attack surface.

## Decision

**Lift the maths first, lex second, map third, render the maths last.** `lib/content/maths.ts`
replaces each span with a private-use sentinel using the book's own pattern; `marked` is used
as a **lexer only** — never `marked.parse`, which emits an HTML string; `rich-text.tsx` maps
an allow-list of token kinds to React elements and **throws** on html, heading, link, image
or anything it does not know; each sentinel is then replaced by `katex.renderToString`.

**KaTeX is the only `dangerouslySetInnerHTML` in the application**, called with the book's
own CI options — `strict: true, throwOnError: true, trust: false`. It refuses rather than
degrades, which is the same choice the book makes about its own build.

**KaTeX is pinned exactly.** The book installs it unpinned, so the two can drift; a unit test
renders **every** body, answer and label of the pinned bundle through these functions in both
editions, which turns either side's drift into a failing test rather than a broken page.

**A blockquote whose first paragraph opens with a single bold run naming one of the six
admonition titles, in either edition, becomes an `<aside>`** with the kind as a data
attribute. That is pattern-matching on the book's own convention rather than on a schema
field, and it is recorded here as the thing schema v2 replaces.

## Consequences

**The renderer is a gate, and a bundle bump can now fail the build.** That is the point and
it is also the cost: a book that starts using a Markdown feature this allow-list does not
know stops rendering until somebody adds it. The alternative — rendering unknown tokens as
their raw text — is the failure mode where a reader meets `| --- |` in the middle of a
sentence and nobody notices for a month.

**The Polish decimal comma needed a rewrite with an exclusion list, not a regex.** `(\d),(\d)`
inside a span becomes `$1{,}$2` so the comma gets no punctuation space — except inside a
bracketed integer pair, because 34 spans in the book are intervals or points (`$(0,1)$` in
F07 is the open interval) where the rewrite would tell a Polish reader the softmax lies in
"0,1". The exclusion is a hand-reviewed list and the test fails when a bundle bump brings a
pair that is on neither side of it, so a person decides each time rather than a pattern.

**Two dependencies and a build-time one arrived**, each with a justification block: `marked`
(MIT, lexer only), `katex` (MIT, pinned, which brings `commander`), and `server-only`, which
is zero bytes at run time and a build-time poison pill.

**The fonts are served from this origin**, copied into `public/katex/` by the prepare script,
and `/katex/` is in the middleware's public prefixes — without which every font request from
a reader with no session redirects to `/login` and KaTeX's system-font fallback hides the
break.
