# `@ab-ovo/mcp` — the book, through an MCP host

An MCP server that serves the book's programs one step at a time to a reader working inside
Claude, ChatGPT or any other MCP host, instead of inside the reading surface.

**Nothing is deployed** (AGENTS.md #2). This runs over stdio against a checkout. The design,
what it deliberately does not do, and what a deployed shape would need are in
[`docs/architecture/MCP-SERVER-SKETCH.md`](../../docs/architecture/MCP-SERVER-SKETCH.md).

## The one thing to understand before reading the code

The answer to a step is not stored on that step. It is **the opening of the next step** —
that is the book's own mechanic and the content schema's definition of the `answer` field.
So the server does not filter answers out of responses; it declines to select a step the
reader has not reached, and the answer is absent because the object carrying it was never
chosen.

That is `src/reveal.ts`, and it is the whole product. Everything else here is transport.

## Running it

Three things have to be true, and the launcher says which one is not rather than failing on
a line of TypeScript:

- **Node 22.18 or later.** The server is TypeScript that Node runs directly by stripping the
  types itself, and an older Node fails on the first `import type` with a message that says
  nothing about versions. `bin/ab-ovo-mcp.mjs` is plain JavaScript that checks first and
  then hands over — a check inside `src/server.ts` could not run on the Node that needs it.
- **The workspace installed**: `pnpm --dir web install`.
- **The book compiled**: `bash scripts/fetch-book-content.sh`, once per clone. Without it
  the server starts and answers every call with what fixes it: the path it looked at, the
  checkout to run the script in, and the override below. `bundleFor()` refuses to fall back
  to a fixture, because silently substituting a four-frame fixture for the
  forty-seven-program book is the "looks finished and is not" failure this repository
  refuses everywhere. The *tests* need none of it — they inject the committed fixture.

```bash
bash scripts/fetch-book-content.sh
pnpm --dir web install
node web/mcp/bin/ab-ovo-mcp.mjs        # or: pnpm --dir web/mcp start
```

**The working directory does not matter.** The server looks for the book in the checkout
it is part of — `web/content/bundle/bundle.json`, found from its own place on disk — so it
starts the same from the repository root, from `web/mcp` or from `/`, with or without `CI`
set. A book compiled somewhere else is named with `AB_OVO_CONTENT_BUNDLE`, the path of the
`bundle.json` file itself. It is tried first and the checkout's own book second, so an
override that names no file still serves the checkout's book when there is one. When
neither is there, the server names both paths and says the override named nothing, rather
than telling you to fetch a book you already have. An empty value counts as unset.

## Pointing a host at it

A host starts the command from a working directory of its own choosing, so the path to the
launcher has to be absolute — a relative one is the first thing that goes wrong. Where the
host starts it does not change where the book is found: that is the launcher's own checkout.
From the repository root:

```bash
claude mcp add ab-ovo -- node "$PWD/web/mcp/bin/ab-ovo-mcp.mjs"
```

or, in a host's own configuration file, with the path written out:

```json
{
  "mcpServers": {
    "ab-ovo": {
      "command": "node",
      "args": ["/absolute/path/to/ab-ovo/web/mcp/bin/ab-ovo-mcp.mjs"]
    }
  }
}
```

For a book compiled outside this checkout, add
`"env": { "AB_OVO_CONTENT_BUNDLE": "/absolute/path/to/bundle.json" }` beside `args`.

In a host that lists a server's prompts, **`read`** is the way in: pick it, name a program
or leave it out, and the host's model is told the method before it is told a step. Its
`program` argument completes to the ids as you type. A `language` given with no program is
also the edition the list is asked for in, so the titles a reader chooses from are in it. The tools carry their annotations, so
a host that reads them stops asking permission for a re-read: `list_programs`,
`current_step` and `review_step` are read-only; `open_program` and `submit_answer` write a
place and never destroy one, and calling either again changes nothing more.

## Where the reader's place is kept

With `AB_OVO_API_URL` and `AB_OVO_READER_TOKEN` set, the reader's place is kept in
`ReaderProgress` through `AbOvo.Api` — the same row the reading surface writes, so a
program opened here resumes where the browser left it. With either missing it is kept in
memory and forgotten at restart. The process says so on stderr, and **the first result of a
session says so too**, because a reader of an MCP host sees results and never the log. It
is said once, at the end of the first result that is not an error, and the data of every
result that is not an error carries it as `placeIsEphemeral`.

When the place cannot be reached, the call answers with a result, not a protocol error. It
says that nothing is lost, because the place is on the account. A write that failed may
still have been recorded, since a 5xx or a dropped connection can come after the service
committed it, so the result says only that it may not have been — and that the same call is
safe to make again, because it will not move the reader twice. It also says what fixes it:

- a 401 or 403 needs a fresh `AB_OVO_READER_TOKEN`;
- no answer, a 5xx, a 408 or a 429 needs a moment: *try again shortly*;
- any other answer, such as a 404 or a body that is not a JSON object, means
  `AB_OVO_API_URL` is not the API;
- an `AB_OVO_API_URL` that is not an http or https address, such as `localhost:8180`, is
  said to be one, and nothing is sent.

The result carries `isError`, because the call did not do what it was asked. The gate's own
refusals do not, and nothing about them changes.

## The first three calls

1. `list_programs` — what the reader can open, in a few lines: by title, every program they
   have a place in and how far they are, every one open to them now, and the one that opens
   next. Each run of shut programs after that is folded into one line, and `all: true` names
   every one. Titles are in the reader's edition, or English until they have one;
   `language` gives the other.
2. `open_program` — start one, or resume it; the step the reader is on comes back, and every
   step opens with where it is: program, title, section, step *n* of *N*. The edition
   (`language`) is asked once per reader, not once per program. A program resumes in the
   edition it was read in. A new one starts in the edition the reader already reads in: the
   one chosen on the website, or else that of their most recent place — with no account, the
   most recent place alone. Only when no edition is known does it ask. That is an ordinary
   result, not an error; on a host that supports elicitation, the reader picks from the
   track's editions directly. Naming a different edition switches, at the same step.
3. `submit_answer` — the reader's own words, verbatim, with the number of the step they
   answer; the next step comes back, and it opens with the book's answer to the one just
   done. A step that asks nothing says so, and goes on with no answer. On the last step it
   is the hand-off: the book's Summary and *Can you?* for the program, and the next
   program with the call that opens it — the reading surface's summary screen, here.

`track` can be left out: this server carries one. A program id is matched in any case.

What a refusal looks like: ask `review_step` for a step past the furthest and the answer is a
sentence saying the method is working — an ordinary result, not an error, and the host shows
it as one. So is a submit for a step the reader is no longer on: nothing is recorded, and the
step they are on comes back, which is what makes a retried call safe. A step number the
program does not have is an error, because it names nothing.

## The tools

`list_programs`, `open_program`, `current_step`, `submit_answer`, `review_step` — and one
prompt, `read`, whose `program` argument completes.

Only `submit_answer` moves the reader forward, and on a step that asks for one it requires
the reader's own answer as free text. Nothing grades it: the next step opens with the book's
answer and the comparison is the reader's to make (ADR-0010).

## What a result carries

Every result is text, and a host that reads only text shows it as it always has. A result
that is not an error also carries the same thing as data — MCP `structuredContent`, which
each tool describes in its `outputSchema` — so an agent reads fields rather than prose:

- **a step**, as `step`: `{ track, unit, step, total, asks, language, answersStep? }`. The
  number is what `submit_answer` names, `asks` says whether it needs the reader's answer,
  and `answersStep` is there when the step opens with the book's answer to the one before;
- **the list**, as `programs`: `{ track, id, title, total, open, place, after? }` for each
  program the text names, and `folded` when a run of shut programs was left out, as it is
  from the text;
- **a refusal**, as `refusal`, with its `kind`: `not-open` with `after`, the program that
  opens it, `not-reached`, `already-answered` or `declined`;
- **the end of a program**, as `finished`, with the `next` program;
- **the edition question**, as `question`, with the editions `offered`.

**The words are in the data too**, as `text`. Claude Code gives its model the data and not
the text beside it when a result carries both; without `text`, a reader there would get a
step's number and none of its words. A host that forwards both reads the words twice. An
error carries its text alone, so every host forwards it as before.

**The data carries no answer.** `answersStep` says that a step opens with one; the answer
itself is only in the words, in the step after the one it answers, where the gate put it.

## In the reader's edition

A step arrives in the reader's edition, and so does everything the server says to the reader
around it. That covers the place line (`ramka 5 z 48` in Polish), the banners around the
book's answer, the closing line, the refusals and the hand-off at the end of a program. It
also covers the notes about the reader's place, the group headings of the list and the form a
host shows to confirm an answer. The words are in `src/framing.ts`, a table on the reading
surface's `chrome.ts` pattern and in its vocabulary
([`translate-a-document.md`](../../docs/how-to/translate-a-document.md)).

What is said to the assistant stays English in every edition: the tool descriptions, the
server instructions, the output schemas and the prompt. So do the lines of a result that tell
the model about its call, such as `Starting "P01".`, the answer it recorded, and the
`open_program` call that opens a program. The list of programs is the model's menu, so only its
titles and group headings follow the edition. The edition question is asked because no edition
is known, and is English. When the reader's place cannot be reached, the note says so in the
edition the call named, or else in the one the session last spoke in. An edition with no
sentences in the table is framed in English.

## Tests

```bash
pnpm --dir web/mcp test
pnpm --dir web/mcp typecheck
```

CI needs no rung of its own: `web/pnpm-workspace.yaml` lists this package and the `web` job
runs `pnpm -r`. There is deliberately no `lint` script — see the sketch, section 7.
