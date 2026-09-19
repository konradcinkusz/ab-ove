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

```bash
pnpm --dir web install
node web/mcp/src/server.ts
```

With `AB_OVO_API_URL` and `AB_OVO_READER_TOKEN` set, the reader's place is kept in
`ReaderProgress` through `AbOvo.Api`. With either missing it is kept in memory and forgotten
at restart — the process says so on stderr rather than degrading quietly.

To point an MCP host at it, give the host the command above. A host config looks like:

```json
{
  "mcpServers": {
    "ab-ovo": { "command": "node", "args": ["web/mcp/src/server.ts"] }
  }
}
```

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
