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
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { ApiCursorStore, MemoryCursorStore } from './cursor.ts';
import type { CursorStore } from './cursor.ts';
import { SERVER_INSTRUCTIONS, TOOLS, handle } from './tools.ts';

export function createServer(cursors: CursorStore): Server {
  const server = new Server(
    { name: 'ab-ovo', version: '0.1.0' },
    {
      capabilities: { tools: {} },
      // The host shows these to the model before any tool is called. The method has to
      // arrive before the first step does, or the first thing that happens is an assistant
      // helpfully working frame 1.
      instructions: SERVER_INSTRUCTIONS,
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await handle(
      request.params.name,
      (request.params.arguments ?? {}) as Record<string, unknown>,
      { cursors },
    );

    return {
      content: [{ type: 'text' as const, text: result.text }],
      ...(result.isError ? { isError: true } : {}),
    };
  });

  return server;
}

/**
 * Which store the process runs against.
 *
 * The in-memory one is offered ONLY when there is no API to talk to, and it says so on
 * stderr rather than degrading quietly: a reader whose place is forgotten at every restart
 * has lost the one thing an account buys, and finding that out by losing their place is
 * the worst available way to be told (P8 — degrade visibly).
 */
export function storeFromEnvironment(env: NodeJS.ProcessEnv): CursorStore {
  const api = env.AB_OVO_API_URL;
  const token = env.AB_OVO_READER_TOKEN;

  if (api && token) return new ApiCursorStore(api, () => token);

  process.stderr.write(
    'ab-ovo MCP: AB_OVO_API_URL and AB_OVO_READER_TOKEN are not both set, so this process ' +
      'keeps the reader\'s place IN MEMORY and forgets it on restart. Fine for trying the ' +
      'server out; not a deployment.\n',
  );
  return new MemoryCursorStore();
}

async function main(): Promise<void> {
  const server = createServer(storeFromEnvironment(process.env));
  await server.connect(new StdioServerTransport());
}

// Run only when this file is the entry point, so the unit tier can import createServer.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`ab-ovo MCP failed to start: ${String(error)}\n`);
    process.exitCode = 1;
  });
}
