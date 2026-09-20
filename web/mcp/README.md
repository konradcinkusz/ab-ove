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
  the server starts and answers every call with the one line that fixes it. `bundleFor()`
  refuses to fall back to a fixture, because silently substituting a four-frame fixture for
  the forty-seven-program book is the "looks finished and is not" failure this repository
  refuses everywhere. The *tests* need none of it — they inject the committed fixture.

```bash
bash scripts/fetch-book-content.sh
pnpm --dir web install
node web/mcp/bin/ab-ovo-mcp.mjs        # or: pnpm --dir web/mcp start
```

## Pointing a host at it

A host starts the command from a working directory of its own choosing, so the path has to
be absolute — a relative one is the first thing that goes wrong. From the repository root:

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

## Where the reader's place is kept

With `AB_OVO_API_URL` and `AB_OVO_READER_TOKEN` set, the reader's place is kept in
`ReaderProgress` through `AbOvo.Api` — the same row the reading surface writes, so a
program opened here resumes where the browser left it. With either missing it is kept in
memory and forgotten at restart. The process says so on stderr, and **every result that
shows a place says so too**, because a reader of an MCP host sees results and never the log.

## The first three calls

1. `list_programs` — every program the server carries and how far the reader is in each.
2. `open_program` — start one, or resume it; the step the reader is on comes back.
3. `submit_answer` — the reader's own words, verbatim; the next step comes back, and it
   opens with the book's answer to the one just done.

What a refusal looks like: ask `review_step` for a step past the furthest and the answer is a
sentence saying the method is working — an ordinary result, not an error, and the host shows
it as one. A step number the program does not have is an error, because it names nothing.

## The tools

`list_programs`, `open_program`, `current_step`, `submit_answer`, `review_step`.

Only `submit_answer` moves the reader forward, and it requires the reader's own answer as
free text. Nothing grades it: the next step opens with the book's answer and the comparison
is the reader's to make (ADR-0010).

## Tests

```bash
pnpm --dir web/mcp test
pnpm --dir web/mcp typecheck
```

CI needs no rung of its own: `web/pnpm-workspace.yaml` lists this package and the `web` job
runs `pnpm -r`. There is deliberately no `lint` script — see the sketch, section 7.
