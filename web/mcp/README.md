# `@ab-ovo/mcp` — the book, through an MCP host

An MCP server that serves the book's programs one step at a time to a reader working inside
Claude, ChatGPT or any other MCP host, instead of inside the reading surface.

**Nothing is deployed** (AGENTS.md #2). This runs over stdio, as a client of an ab-ovo API that
somebody runs; there is no public one yet. It starts from a package with one command, from a
tarball CI built, or from a checkout, and every one of them reads the book from that API. The
design, what it deliberately does not do, and what a deployed shape would need are in
[`docs/architecture/MCP-SERVER-SKETCH.md`](../../docs/architecture/MCP-SERVER-SKETCH.md).

## Connect an agent: one command, no checkout

What has to be true is short: **Node 22.18 or later**, and **the address of an ab-ovo API**
that holds the book. The package carries no book and needs no checkout, no pnpm and no
compiler, and nothing is fetched at start-up but the API's answers.

```bash
claude mcp add ab-ovo -e AB_OVO_API_URL=http://localhost:<port> -- npx -y <package-name>
```

or, in a host's own configuration file:

```json
{
  "mcpServers": {
    "ab-ovo": {
      "command": "npx",
      "args": ["-y", "<package-name>"],
      "env": { "AB_OVO_API_URL": "http://localhost:<port>" }
    }
  }
}
```

> **`<package-name>` is a placeholder, and the package is not on npm yet.** Publishing it is the
> owner's manual step, under a name they choose, and that name is `name` in
> [`package.json`](package.json), the one place it is set. When they have published, write the
> name they chose where the placeholder is.
> [`publish-the-mcp-package.md`](../../docs/how-to/publish-the-mcp-package.md) is their checklist.
> `<port>` is the one the API answers on; the Aspire dashboard shows it when the AppHost runs
> the API ([`01-first-run.md`](../../docs/tutorials/01-first-run.md) says how to run one).

The host's model is told the method, and whose book it is (**the book's credit**, below), before
it is told a step. `list_programs` is where a reader chooses what to read: every program, how far
they have got, and the one that opens next.

**Before the package is published,** the same command runs the tarball CI built. Download the
artifact of a run of
[`mcp-package.yml`](../../.github/workflows/mcp-package.yml), unzip it, and point the host at the
file by its absolute path:

```bash
claude mcp add ab-ovo -e AB_OVO_API_URL=http://localhost:<port> -- \
  npx -y --package=/absolute/path/to/<tarball>.tgz ab-ovo-mcp
```

`ab-ovo-mcp` there is the command the package declares (`bin` in `package.json`), and it is not
the package's name. To check a tarball before trusting it, see
[Checking a tarball](#checking-a-tarball).

**The working directory does not matter.** Nothing here looks at it: the book is the API's, and
the reader's id is in the user's state directory (below). The server starts the same from the
repository root, from `web/mcp` or from `/`, with or without `CI` set.

## From a checkout

For working on the server, or before there is a tarball. The server is TypeScript that Node runs
directly by stripping the types itself, which needs **Node 22.18 or later**; an older Node fails
on the first `import type` with a message that says nothing about versions, so
`bin/ab-ovo-mcp.mjs` is plain JavaScript that checks first and then hands over. The launcher
runs `src/` wherever it is present, and the compiled `dist/` only where it is not, which is the
package: a `dist/` a build left behind is never run under a developer.

```bash
pnpm --dir web install
AB_OVO_API_URL=http://localhost:<port> node web/mcp/bin/ab-ovo-mcp.mjs   # or: pnpm --dir web/mcp start
```

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

The API has to hold the book: the content is ingested into the API
(`docs/tutorials/01-first-run.md` says how), not fetched into this package. Without
`AB_OVO_API_URL` the server starts and answers every call with what to set; with an API that
holds no book for the track, every call says so and what fixes it.

## Using it in a host

In a host that lists a server's prompts, **`read`** is the way in: pick it, name a program
or leave it out, and the host's model is told the method before it is told a step. Its
`program` argument completes to the ids as you type. A `language` given with no program is
also the edition the list is asked for in, so the titles a reader chooses from are in it. The
tools carry their annotations, so a host that reads them stops asking permission for a re-read:
`list_programs`,
`current_step` and `review_step` are read-only; `open_program` and `submit_answer` write a
place and never destroy one, and calling either again changes nothing more.

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

## The book's credit

The book's prose is CC BY-NC-SA 4.0, and this server puts it into a conversation in somebody
else's host, so **every place its prose reaches a reader credits it**
([ADR-0066](../../docs/adr/0066-the-mcp-server-is-a-typescript-client-of-the-api-installed-before-it-is-hosted.md)
§4):

- **the server's instructions,** which the host gives its model before any tool is called, tell
  it whose words the steps are and to pass the credit on, never to present a step as its own;
- **`list_programs`,** under each track, in the edition the list is in and as data in
  `credits`: the book's title, its author, the copyright notice as the book's
  `LICENSE-CONTENT` states it, the licence with its link, a note that it is offered as it is,
  and where the book itself is.

The table is [`src/credit.ts`](src/credit.ts), kept beside the code because the content bundle
carries no author and no licence, and `src/credit.test.ts` fails on a pinned track with no entry.
The notice is the book's own line, read at the pinned revision, and nothing checks it: a
relicense is an edit somebody makes, and
[ADR-0033](../../docs/adr/0033-the-content-is-the-books-to-licence-and-noncommercial-is-the-binding-term.md)'s
relicense table names this file. The package carries **no part of the book**: it is MIT code, and
the book stays on the API (ADR-0066 §4).

### Before the package is pointed at a deployed instance

None exists yet. When one does, what has to be true first:

- **The credit is shown,** which a run of `scripts/verify-tarball.ts` with `--api` against that
  instance checks (below), and which this package does by itself.
- **The instance serves the book free.** NonCommercial binds the deployment: no charge for
  access to it, no paid tier and no advertising against the content (ADR-0033).
- **The reading surface credits the book too.** It does not yet; ADR-0066's Consequences give
  that to the first deploy (#71), and it is not this package's to do.
- **Anonymous readers' rows are retained on a rule.** Each machine that configures the package
  is one reader of each instance it is pointed at, and ADR-0061's retention job has to cover
  those rows (ADR-0066's Consequences).

## Checking a tarball

`scripts/verify-tarball.ts` checks a packed file as a reader will receive it, and CI runs it on
every tarball it uploads. The owner runs it on the download before they publish. From a checkout
with the workspace installed:

```bash
node web/mcp/scripts/verify-tarball.ts path/to/<tarball>.tgz
node web/mcp/scripts/verify-tarball.ts path/to/<tarball>.tgz --api http://localhost:<port>
node web/mcp/scripts/verify-tarball.ts path/to/<tarball>.tgz --for-publish
```

It reads the file: nothing but the launcher, JavaScript, the schemas and the pin, the licence and
the README, with no TypeScript, no copy of the book and no test code. It installs it with the
`npm` that ships with Node into an empty directory outside the checkout, starts it as a host
does, and has a client list the programs, finding the credit in the instructions and in the list.
With `--api` the list is read from an API somebody runs, and with none from a stub of it. With
`--for-publish` it also refuses a package that is still `private`, which npm will not publish.
It does not say that the name is free on npm, or that this version has not been published
already.

To make a tarball by hand, from the same source, and look at what it carries:

```bash
pnpm --dir web install
pnpm --dir web/mcp pack --pack-destination <directory>   # runs the build first
```

`pnpm --dir web/mcp build` alone writes the compiled `dist/` and the `LICENSE` beside it, and
says where each file came from. Both are output and are gitignored. The build is
[`scripts/build.ts`](scripts/build.ts): it strips the types with Node's own stripper, rewrites
the imports to the compiled files and carries the modules of `@ab-ovo/web-kit` the server runs
beside the server's own, with no bundler. It refuses, with the sentence that says why, to carry
anything under `web/content/` but the pin, or any test code.

## Configuration

What a host sets in the environment it starts the server with (`-e` in `claude mcp add`, `env` in
a host's JSON). **The server takes no arguments:** `--version` and `--help` are for a person at a
terminal, and any other argument is refused with a sentence that does not repeat it, because a
configuration that puts the address where an argument goes has put a password, if the address has
one, where a log would show it. A variable that is missing or malformed is said once on stderr,
which is where the host's log has it, and in every result, with what fixes it.

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
  `~/Library/Application Support/ab-ovo` on macOS, `%LOCALAPPDATA%\ab-ovo` on Windows. An
  `XDG_STATE_HOME` set to an absolute path wins on every platform, and then no home directory
  is needed.
- **What it holds:** one line per API origin, the origin and the id minted for it, under a
  comment saying what the file is. The id is sent to the origin on its line and to nothing
  else, and a redirect is not followed. It is never said in a result or on stderr.
- **Who can read it:** the user alone. The file is 0600 in a 0700 directory, and a file or a
  directory someone widened is narrowed again when the file is next read.
- **Treat it as a credential.** Holding an id is holding that reader's place: keep the file out
  of bug reports and dotfile repositories. Deleting it starts a new reader; the old place stays
  on the API under an id nobody holds.

An anonymous reader of this server and an anonymous reader of the website are two readers, and
nothing joins them: an account is the way to one place on both (ADR-0066 §2).

**When the state file cannot be written** — a sandbox with no lasting home, a directory that is
not writable, or no state directory to be found at all (no home directory, as in a container
run under a user ID the system has no entry for, and no `XDG_STATE_HOME`) — the id is held in
this process's memory. The API keeps the place for as long as the process runs, and a restart
begins every program again. The process says why on stderr: the file and the error, or that no
state directory was found and that `XDG_STATE_HOME`, set to an absolute path, names one. **The
first result of a session says so too**, because a reader of an MCP host sees results and never
the log. It is said once, at the end of the first result that is not an error, and the data of
every result carries it as `placeIsEphemeral`.

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

`track` can be left out: this server carries one, the track the book's pin names
(`web/content/book.lock.json`). A program id is matched in any case.

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
first process left them. `src/package.test.ts` builds the compiled server into a scratch
directory with no `src/` beside it, starts it the same way, and shows each refusal of the build
and of the tarball check firing. What the API does is `tests/AbOvo.Api.Tests`'s to assert.

CI needs no rung of its own for the unit tier: `web/pnpm-workspace.yaml` lists this package and
the `web` job runs `pnpm -r`. The package has one of its own,
[`mcp-package.yml`](../../.github/workflows/mcp-package.yml), which packs the tarball, checks it,
installs it into an empty directory and starts it, on the oldest Node `engines` allows and on
the next long-term-support line, and uploads it. It publishes nothing and holds no npm token
([ADR-0070](../../docs/adr/0070-the-mcp-package-is-built-and-checked-in-ci-and-published-by-its-owner.md)).
There is deliberately no `lint` script — see the sketch, section 7.
