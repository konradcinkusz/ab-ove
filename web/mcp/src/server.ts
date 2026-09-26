/**
 * The MCP wiring, and nothing else. Every decision worth testing is in tools.ts, api.ts and
 * identity.ts, and the gate is `AbOvo.Api`'s; this file turns those into a protocol and is
 * deliberately thin enough that reading it tells you nothing you would want to assert.
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

import { AbOvoApi } from './api.ts';
import { framingFor } from './framing.ts';
import { originOf, readerIdFor, stateDirectory } from './identity.ts';
import type { HeldIn } from './identity.ts';
import { PROMPTS, completeArgument, promptMessages } from './prompts.ts';
import { SERVER_INSTRUCTIONS, TOOLS, handle } from './tools.ts';
import type { EditionOffered, EditionOutcome, ElicitOutcome, Session } from './tools.ts';

/**
 * A server over one reader's `AbOvo.Api` — the book and the place both (`api.ts`). The unit
 * tier hands it one whose `fetch` is a stub API; `main()` hands it the one the environment
 * names (`apiFromEnvironment`).
 */
export function createServer(api: AbOvoApi): Server {
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

  /*
    ASK THE READER DIRECTLY, WHEN THE HOST WILL LET US — MCP elicitation, checked at call
    time rather than assumed from what the client declared at `initialize`: a client can
    say `elicitation: {}` and mean only URL-mode, or the call can fail for a reason that has
    nothing to do with support (a closed tab, a timeout). Either way `tools.ts` only needs
    to know whether the reader actually confirmed something, so every failure path here
    collapses to `unavailable` and `submit_answer` falls back to trusting the argument —
    exactly what it already does for a host with no elicitation at all.

    IN THE STEP'S EDITION (#167). The host puts this form in front of the reader with no
    model in between to translate it, so its words are `framing.ts`'s, in the edition of the
    step it confirms. The edition question below stays English: it is asked because no
    edition is known, and each edition is offered by the track's own title in it.
  */
  const elicitAnswer = async (step: number, proposed: string, language: string): Promise<ElicitOutcome> => {
    if (!server.getClientCapabilities()?.elicitation?.form) return { kind: 'unavailable' };
    const framing = framingFor(language);
    try {
      const result = await server.elicitInput({
        message: framing.confirmAnswer(step) + (proposed ? '' : ` ${framing.nothingSent}`),
        requestedSchema: {
          type: 'object',
          properties: {
            answer: {
              type: 'string',
              title: framing.answerLabel,
              description: framing.answerHint,
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
    const values = ref.type === 'ref/prompt' ? await completeArgument(api, ref.name, argument) : [];
    return { completion: { values: [...values], total: values.length, hasMore: false } };
  });

  // What this session has said already: one per server, so one per connection over stdio.
  // The in-memory note is said once per session, and this is where "once" is kept (#164).
  const session: Session = { ephemeralNoteSaid: false };

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await handle(
      request.params.name,
      (request.params.arguments ?? {}) as Record<string, unknown>,
      { api, elicit: elicitAnswer, chooseEdition, session },
    );

    const content = [{ type: 'text' as const, text: result.text }];
    // An error is its text alone; anything else carries the same result as data, words and
    // all, because a host may give its model only this half (tools.ts says which host).
    return result.isError ? { content, isError: true } : { content, structuredContent: { ...result.structured } };
  });

  return server;
}

/**
 * The API this process reads from, and who it reads as — from the environment a host starts
 * it with (`web/mcp/README.md` has the host configuration).
 *
 * - `AB_OVO_API_URL` is where the book and the reader's place both are. Unset, there is
 *   nothing to serve: every call says so, with the fix (`tools.ts`'s `noBookNote`), and so
 *   does stderr, once.
 * - `AB_OVO_READER_TOKEN`, when set, is a bearer, and it wins — the order
 *   `ReaderIdentity.Resolve` reads in. It is the developer's way to an account's place, for as
 *   long as the token lives; nothing refreshes it (ADR-0066 §2).
 * - Otherwise the reader is anonymous, under an opaque id kept in the user's state directory,
 *   one per API origin (`identity.ts`). It is looked for, or minted, the first time a call
 *   needs it — ADR-0066 §2's "the first time it needs a place" — and when it cannot be kept
 *   the process holds it in memory and says so: stderr names the file and the error, for
 *   whoever runs the server, and the results tell the reader their place lasts only as long
 *   as this process (P8). Stderr never carries the id.
 */
export function apiFromEnvironment(
  env: NodeJS.ProcessEnv,
  options: {
    readonly warn?: (line: string) => void;
    readonly platform?: NodeJS.Platform;
    readonly home?: string;
    /** The `fetch` requests go through; the unit tier's is a stub API. */
    readonly fetch?: typeof fetch;
  } = {},
): AbOvoApi {
  const warn = options.warn ?? ((line: string) => void process.stderr.write(line));
  const baseUrl = env['AB_OVO_API_URL']?.trim() || undefined;
  const token = env['AB_OVO_READER_TOKEN']?.trim() || undefined;
  const through = options.fetch === undefined ? {} : { fetch: options.fetch };

  if (baseUrl === undefined) {
    warn(
      'ab-ovo MCP: AB_OVO_API_URL is not set. This server reads the book, and keeps the ' +
        "reader's place, through the ab-ovo API, so it has nothing to serve; every call will say " +
        'so. Set AB_OVO_API_URL to the API\'s address.\n',
    );
    return new AbOvoApi({ baseUrl, reader: { kind: 'nobody' }, ...through });
  }
  if (token !== undefined) return new AbOvoApi({ baseUrl, reader: { kind: 'account', bearer: token }, ...through });

  // An address with no http or https origin keys no id, and nothing is sent to it: every call
  // is refused before a request, with the fix (`api.ts`).
  const origin = originOf(baseUrl);
  if (origin === undefined) return new AbOvoApi({ baseUrl, reader: { kind: 'nobody' }, ...through });

  const hold = (): HeldIn => {
    const held = readerIdFor(origin, stateDirectory(env, options.platform, options.home));
    if (!held.kept) {
      warn(
        `ab-ovo MCP: the reader id for ${origin} could not be kept in ${held.file} ` +
          `(${held.why ?? 'unknown'}), so this process holds it in memory: the API keeps the ` +
          "reader's place under an id only this process knows, and a restart begins every " +
          'program again. The results say so to the reader.\n',
      );
    }
    return held;
  };
  return new AbOvoApi({ baseUrl, reader: { kind: 'anonymous', hold }, ...through });
}

/** Start serving over stdio. Exported so `bin/ab-ovo-mcp.mjs` can call it after its own checks. */
export async function main(): Promise<void> {
  const server = createServer(apiFromEnvironment(process.env));
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
