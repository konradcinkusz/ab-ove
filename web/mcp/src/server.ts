/**
 * The MCP wiring, and nothing else. Every decision worth testing is in reveal.ts, cursor.ts
 * and tools.ts; this file turns those into a protocol and is deliberately thin enough that
 * reading it tells you nothing you would want to assert.
 *
 * TRANSPORT: stdio today, which is the one a reader can run locally against a checkout and
 * the one this package can be exercised on without a deployment. The shape a stranger using
 * claude.ai or ChatGPT would connect to is Streamable HTTP with OAuth, and it is NOT here —
 * see MCP-SERVER-SKETCH.md §4, which says what it needs and why it is a second commit
 * rather than a flag on this one. Nothing is deployed (AGENTS.md #2).
 *
 * The low-level `Server` is used rather than `McpServer` because TOOLS already carries JSON
 * Schema — the same dialect the content bundle is validated with — and the high-level
 * helper would want those schemas re-expressed in zod. Two spellings of one input contract
 * is the divergence this estate keeps paying to avoid.
 */
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  CompleteRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { ApiCursorStore, MemoryCursorStore } from './cursor.ts';
import type { CursorStore } from './cursor.ts';
import { liveBundles } from './content.ts';
import type { BundleSource } from './content.ts';
import { PROMPTS, completeArgument, promptMessages } from './prompts.ts';
import { SERVER_INSTRUCTIONS, TOOLS, handle } from './tools.ts';

export interface ServerOptions {
  /** Where the content comes from; the live loader unless a test injects the fixture. */
  readonly bundles?: BundleSource;
  /** Whether the place is kept in memory only, so the results can say so to the reader. */
  readonly placeIsEphemeral?: boolean;
}

export function createServer(cursors: CursorStore, options: ServerOptions = {}): Server {
  const server = new Server(
    { name: 'ab-ovo', version: '0.1.0' },
    {
      /*
        Declared, or the registrations below throw at start-up: the SDK checks a handler's
        method against the capabilities the server announced. `prompts` is the reader's way
        in from a host's menu; `completions` is what fills the prompt's `program` argument
        with the ids.
      */
      capabilities: { tools: {}, prompts: {}, completions: {} },
      // The host shows these to the model before any tool is called. The method has to
      // arrive before the first step does, or the first thing that happens is an assistant
      // helpfully working frame 1.
      instructions: SERVER_INSTRUCTIONS,
    },
  );

  const bundles = (): BundleSource => options.bundles ?? liveBundles;

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      // Read-only, idempotent, closed-world: what a host reads to stop asking the reader's
      // permission for a re-read. tools.ts says which is which and why.
      annotations: tool.annotations,
    })),
  }));

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: PROMPTS.map((prompt) => ({
      name: prompt.name,
      title: prompt.title,
      description: prompt.description,
      arguments: prompt.arguments.map((argument) => ({ ...argument })),
    })),
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const found = promptMessages(request.params.name, request.params.arguments ?? {});
    if (!found) throw new Error(`No such prompt: ${request.params.name}`);
    return { description: found.description, messages: found.messages.map((message) => ({ ...message })) };
  });

  server.setRequestHandler(CompleteRequestSchema, async (request) => {
    const { ref, argument } = request.params;
    const values =
      ref.type === 'ref/prompt' ? completeArgument(bundles(), ref.name, argument) : [];
    return { completion: { values: [...values], total: values.length, hasMore: false } };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await handle(
      request.params.name,
      (request.params.arguments ?? {}) as Record<string, unknown>,
      {
        cursors,
        bundles: bundles(),
        ...(options.placeIsEphemeral ? { placeIsEphemeral: true } : {}),
      },
    );

    return {
      content: [{ type: 'text' as const, text: result.text }],
      ...(result.isError ? { isError: true } : {}),
    };
  });

  return server;
}

/**
 * Which store the process runs against, and whether it forgets.
 *
 * The in-memory one is offered ONLY when there is no API to talk to, and it says so on
 * stderr rather than degrading quietly: a reader whose place is forgotten at every restart
 * has lost the one thing an account buys, and finding that out by losing their place is
 * the worst available way to be told (P8 — degrade visibly). Stderr reaches whoever runs
 * the server; the `ephemeral` flag reaches the READER, through the results `tools.ts`
 * appends the same fact to — because an MCP host shows a reader the results and never the
 * log.
 */
export function storeFromEnvironment(env: NodeJS.ProcessEnv): {
  readonly store: CursorStore;
  readonly ephemeral: boolean;
} {
  const api = env.AB_OVO_API_URL;
  const token = env.AB_OVO_READER_TOKEN;

  if (api && token) return { store: new ApiCursorStore(api, () => token), ephemeral: false };

  process.stderr.write(
    'ab-ovo MCP: AB_OVO_API_URL and AB_OVO_READER_TOKEN are not both set, so this process ' +
      'keeps the reader\'s place IN MEMORY and forgets it on restart. Fine for trying the ' +
      'server out; not a deployment.\n',
  );
  return { store: new MemoryCursorStore(), ephemeral: true };
}

/** Start serving over stdio. Exported so `bin/ab-ovo-mcp.mjs` can call it after its own checks. */
export async function main(): Promise<void> {
  const { store, ephemeral } = storeFromEnvironment(process.env);
  const server = createServer(store, { placeIsEphemeral: ephemeral });
  await server.connect(new StdioServerTransport());
}

/*
  Run only when this file is the entry point, so the unit tier and the launcher can import
  it. The comparison is on REAL paths: a `bin` entry installed by a package manager is a
  symlink, and `process.argv[1]` then names the link while `import.meta.url` names the
  target, so the naive comparison never matched under a shim and the server started as a
  module that did nothing.
*/
const entry = process.argv[1] ? pathToFileURL(realpathSync(process.argv[1])).href : undefined;
if (entry !== undefined && import.meta.url === entry) {
  main().catch((error: unknown) => {
    process.stderr.write(`ab-ovo MCP failed to start: ${String(error)}\n`);
    process.exitCode = 1;
  });
}
