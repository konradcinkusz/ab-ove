# `@ab-ovo/mcp` — the book, through an MCP host

An MCP server that serves the book's programs one step at a time to a reader working inside
Claude, ChatGPT or any other MCP host, instead of inside the reading surface.

**Nothing is deployed** (AGENTS.md #2). This runs over stdio from a checkout, as a client of an
ab-ovo API somebody runs. The design, what it deliberately does not do, and what a deployed
shape would need are in
[`docs/architecture/MCP-SERVER-SKETCH.md`](../../docs/architecture/MCP-SERVER-SKETCH.md).

## The one thing to understand before reading the code

The answer to a step is not stored on that step. It is **the opening of the next step** —
that is the book's own mechanic and the content schema's definition of the `answer` field.
So nothing filters answers out of responses; the reveal gate declines to serve a step the
reader has not reached, and the answer is absent because the object carrying it was never
sent.

**That gate is `AbOvo.Api`'s, and so is the book** (ADR-0066 §1). This server keeps nothing of
its own: no bundle on disk, no copy of the gate, no store of the reader's place. It asks the
API for each step — `GET /api/v1/content/**` — and moves the reader only through
`POST …/advance`, the way the reading surface does. `src/api.ts` is the client; everything else
here is what a reader is told.

## Running it

What has to be true, and the server says which is not rather than failing on a line of
TypeScript:

- **Node 22.18 or later.** The server is TypeScript that Node runs directly by stripping the
  types itself, and an older Node fails on the first `import type` with a message that says
  nothing about versions. `bin/ab-ovo-mcp.mjs` is plain JavaScript that checks first and
  then hands over — a check inside `src/server.ts` could not run on the Node that needs it.
- **The workspace installed**: `pnpm --dir web install`.
- **An ab-ovo API to read from**, named by `AB_OVO_API_URL`, holding the book: the content is
  ingested into the API (`docs/tutorials/01-first-run.md` says how), not fetched into this
  package. Without the variable the server starts and answers every call with what to set;
  with an API that holds no book for the track, every call says so and what fixes it.

```bash
pnpm --dir web install
AB_OVO_API_URL=http://localhost:<port> node web/mcp/bin/ab-ovo-mcp.mjs   # or: pnpm --dir web/mcp start
```

`<port>` is the one the API answers on; the Aspire dashboard shows it when the AppHost runs
the API.

**The working directory does not matter.** Nothing here looks at it: the book is the API's,
and the reader's id is in the user's state directory (below). The server starts the same from
the repository root, from `web/mcp` or from `/`, with or without `CI` set.

## Pointing a host at it

A host starts the command from a working directory of its own choosing, so the path to the
launcher has to be absolute — a relative one is the first thing that goes wrong. From the
repository root:

```bash
claude mcp add ab-ovo -e AB_OVO_API_URL=http://localhost:<port> -- node "$PWD/web/mcp/bin/ab-ovo-mcp.mjs"
```

or, in a host's own configuration file, with the path written out:

```json
{
  "mcpServers": {
    "ab-ovo": {
      "command": "node",
      "args": ["/absolute/path/to/ab-ovo/web/mcp/bin/ab-ovo-mcp.mjs"],
      "env": { "AB_OVO_API_URL": "http://localhost:<port>" }
    }
  }
}
```

In a host that lists a server's prompts, **`read`** is the way in: pick it, name a program
or leave it out, and the host's model is told the method before it is told a step. Its
`program` argument completes to the ids as you type. A `language` given with no program is
also the edition the list is asked for in, so the titles a reader chooses from are in it. The tools carry their annotations, so
a host that reads them stops asking permission for a re-read: `list_programs`,
`current_step` and `review_step` are read-only; `open_program` and `submit_answer` write a
place and never destroy one, and calling either again changes nothing more.

## Configuration

What a host sets in the environment it starts the server with:

- **`AB_OVO_API_URL`** — the ab-ovo API's address, such as `http://localhost:<port>`. Required:
  the book and the reader's place are both there. An address that is not an http or https one,
  such as `localhost:8180`, is said to be one, and nothing is sent.
- **`AB_OVO_READER_TOKEN`** — optional: an access token for an account, which the server sends
  as a bearer. When it is set it wins, as it does for the API itself, and the reader's place is
  the account's — the one the reading surface shows once that reader signs in. It is read once
  and nothing refreshes it, so it works for as long as the token lives. It is for a developer
  reaching an account's place; a reader does not need one.

**Without a token the reader is anonymous**, and needs no account (ADR-0060). The server mints
the reader an opaque id — a GUID from a CSPRNG, ADR-0061's pattern — the first time a call needs
one, sends it as `X-Ab-Ovo-Reader-Id`, and the API keeps the place under it. The id is kept in
**the state file**, so a restart, and every host started by the same user on the same machine,
reads as the same reader:

- **Where:** `reader-ids` in `$XDG_STATE_HOME/ab-ovo`, else `~/.local/state/ab-ovo`;
  `~/Library/Application Support/ab-ovo` on macOS, `%LOCALAPPDATA%\ab-ovo` on Windows.
- **What it holds:** one line per API origin, the origin and the id minted for it, under a
  comment saying what the file is. The id is sent to the origin on its line and to nothing
  else, and a redirect is not followed. It is never said in a result or on stderr.
- **Who can read it:** the user alone. The file is 0600 in a 0700 directory, and a file
  someone widened is narrowed again when it is next read.
- **Treat it as a credential.** Holding an id is holding that reader's place: keep the file out
  of bug reports and dotfile repositories. Deleting it starts a new reader; the old place stays
  on the API under an id nobody holds.

An anonymous reader of this server and an anonymous reader of the website are two readers, and
nothing joins them: an account is the way to one place on both (ADR-0066 §2).

**When the state file cannot be written** — a sandbox with no lasting home, a directory that is
not writable — the id is held in this process's memory. The API keeps the place for as long as
the process runs, and a restart begins every program again. The process says why on stderr,
naming the file and the error, and **the first result of a session says so too**, because a
reader of an MCP host sees results and never the log. It is said once, at the end of the first
result that is not an error, and the data of every result carries it as `placeIsEphemeral`.

When the API cannot be reached, the call answers with a result, not a protocol error. It says
that nothing is lost, because the API keeps the place. A write that failed may still have been
recorded, since a 5xx or a dropped connection can come after the service committed it, so the
result says only that it may not have been — and that the same call is safe to make again,
because it will not move the reader twice. It also says what fixes it:

- a 401 or 403 needs a fresh `AB_OVO_READER_TOKEN`, when there is one; with none, it means
  what answered is not the ab-ovo API;
- no answer, a 5xx, a 408 or a 429 needs a moment: *try again shortly*;
- any other answer, such as a 404, a redirect or a body that is not what the API sends, means
  `AB_OVO_API_URL` is not the API;
- an `AB_OVO_API_URL` that is not an http or https address is said to be one, and nothing is
  sent.

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

`track` can be left out: this server carries one, the track this checkout pins. A program id
is matched in any case.

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
edition the call named if the track is published in it, or else in the one the session last
spoke in. An edition with no sentences in the table is framed in English.

## Tests

```bash
pnpm --dir web/mcp test
pnpm --dir web/mcp typecheck
```

The unit tier needs no API, no book and no network: it runs against a stub of `AbOvo.Api`
(`src/testing/stub-api.ts`) that serves the committed fixture and answers as the API does, gate
and all. `src/restart.test.ts` starts the launcher itself, twice, as a host does — from a scratch
directory, with `CI` set — against that stub over HTTP, and finds the anonymous reader where the
first process left them. What the API does is `tests/AbOvo.Api.Tests`'s to assert.

CI needs no rung of its own: `web/pnpm-workspace.yaml` lists this package and the `web` job
runs `pnpm -r`. There is deliberately no `lint` script — see the sketch, section 7.
