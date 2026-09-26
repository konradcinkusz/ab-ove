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
 * is the divergence this estate keeps paying to avoid. The same holds for the output
 * contract (#164), with one thing given up: `McpServer` checks a result against its tool's
 * `outputSchema` before sending it, and `Server` does not. `server.test.ts` does, with the
 * validator the SDK's own client uses.
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
import type { EditionOffered, EditionOutcome, ElicitOutcome, Session } from './tools.ts';

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

  /*
    ASK THE READER DIRECTLY, WHEN THE HOST WILL LET US — MCP elicitation, checked at call
    time rather than assumed from what the client declared at `initialize`: a client can
    say `elicitation: {}` and mean only URL-mode, or the call can fail for a reason that has
    nothing to do with support (a closed tab, a timeout). Either way `tools.ts` only needs
    to know whether the reader actually confirmed something, so every failure path here
    collapses to `unavailable` and `submit_answer` falls back to trusting the argument —
    exactly what it already does for a host with no elicitation at all.
  */
  const elicitAnswer = async (step: number, proposed: string): Promise<ElicitOutcome> => {
    if (!server.getClientCapabilities()?.elicitation?.form) return { kind: 'unavailable' };
    try {
      const result = await server.elicitInput({
        message:
          `Step ${step}: check this before it is recorded as your answer.` +
          (proposed ? '' : ' Type what you wrote — the assistant sent nothing.'),
        requestedSchema: {
          type: 'object',
          properties: {
            answer: {
              type: 'string',
              title: 'Your answer',
              description: 'Edit this if it is not what you wrote, then confirm.',
              ...(proposed ? { default: proposed } : {}),
            },
          },
        },
      });
      if (result.action !== 'accept') return { kind: 'declined' };
      const value = result.content?.answer;
      return { kind: 'confirmed', answer: typeof value === 'string' ? value : '' };
    } catch {
      return { kind: 'unavailable' };
    }
  };

  /*
    WHICH EDITION, ASKED OF THE READER RATHER THAN OF THE MODEL — the same elicitation, for
    the one question `open_program` still asks (#144), and only when no edition is known for
    the reader at all. The editions are an enum, so the host offers exactly what the track
    has and the reader cannot type one it does not; each is described by the track's own
    title in it, which says what the choice is in the language it is a choice of. Every
    failure collapses to `unavailable`, and `open_program` then asks in its result.
  */
  const chooseEdition = async (unit: string, offered: readonly EditionOffered[]): Promise<EditionOutcome> => {
    if (!server.getClientCapabilities()?.elicitation?.form || offered.length === 0) return { kind: 'unavailable' };
    try {
      const result = await server.elicitInput({
        message:
          `Which edition would you like to read ${unit} in? You are asked once: the programs you ` +
          'open after it start in the same edition, and you can switch at any step.',
        requestedSchema: {
          type: 'object',
          properties: {
            edition: {
              type: 'string',
              title: 'Edition',
              description: offered.map((edition) => `${edition.language}: ${edition.title}`).join('; '),
              enum: offered.map((edition) => edition.language),
            },
          },
          required: ['edition'],
        },
      });
      if (result.action !== 'accept') return { kind: 'declined' };
      const value = result.content?.edition;
      return typeof value === 'string' ? { kind: 'chosen', language: value } : { kind: 'declined' };
    } catch {
      return { kind: 'unavailable' };
    }
  };

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      // What every result that is not an error carries as data beside its text (#164).
      // Declared, a client may hold the server to it: the SDK's own client validates each
      // result against it, and refuses one that has none.
      outputSchema: tool.outputSchema,
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

  // What this session has said already: one per server, so one per connection over stdio.
  // The in-memory note is said once per session, and this is where "once" is kept (#164).
  const session: Session = { ephemeralNoteSaid: false };

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await handle(
      request.params.name,
      (request.params.arguments ?? {}) as Record<string, unknown>,
      {
        cursors,
        bundles: bundles(),
        elicit: elicitAnswer,
        chooseEdition,
        session,
        ...(options.placeIsEphemeral ? { placeIsEphemeral: true } : {}),
      },
    );

    const content = [{ type: 'text' as const, text: result.text }];
    // An error is its text alone; anything else carries the same result as data, words and
    // all, because a host may give its model only this half (tools.ts says which host).
    return result.isError ? { content, isError: true } : { content, structuredContent: { ...result.structured } };
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
 * the server; the `ephemeral` flag reaches the READER, through the results — `tools.ts`
 * says it in the text of the first one and as data on every one — because an MCP host
 * shows a reader the results and never the log.
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
