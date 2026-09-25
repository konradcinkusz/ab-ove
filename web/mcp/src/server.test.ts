/**
 * The protocol, driven end to end over an in-memory transport.
 *
 * Everything worth asserting about the gate and the tool surface is asserted at the layer
 * with the logic (P13) in reveal.test.ts and tools.test.ts. What only this file can say is
 * that the wiring in server.ts exposes it: the annotations reach a client's `listTools`,
 * the prompt is listed and renders, and a completion answers with ids. A capability
 * declared wrongly throws at registration, which is the one failure this catches before a
 * host does.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { MemoryCursorStore } from './cursor.ts';
import { fixtureBundles } from './content.ts';
import { createServer } from './server.ts';

async function connected(): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const server = createServer(new MemoryCursorStore(), { bundles: fixtureBundles(), placeIsEphemeral: true });
  await server.connect(serverSide);
  const client = new Client({ name: 'server.test', version: '0.0.0' });
  await client.connect(clientSide);
  return client;
}

// `callTool` may answer the legacy `toolResult` shape as well as `content`; only the latter is read.
const text = (result: Awaited<ReturnType<Client['callTool']>>): string =>
  (((result as { content?: unknown }).content ?? []) as { type: string; text?: string }[])
    .map((part) => part.text ?? '')
    .join('');

test('the tools are listed with their annotations, and a re-read is marked read-only', async () => {
  const client = await connected();
  const { tools } = await client.listTools();
  const byName = new Map(tools.map((tool) => [tool.name, tool]));

  for (const name of ['list_programs', 'current_step', 'review_step']) {
    assert.equal(byName.get(name)?.annotations?.readOnlyHint, true, `${name} is not marked read-only`);
  }
  for (const name of ['open_program', 'submit_answer']) {
    assert.equal(byName.get(name)?.annotations?.readOnlyHint, false, `${name} claims to be read-only`);
    assert.equal(byName.get(name)?.annotations?.destructiveHint, false, `${name} claims to destroy`);
  }
  assert.equal(byName.get('submit_answer')?.annotations?.idempotentHint, true, 'a retried submit is a no-op and should say so');
  for (const tool of tools) {
    assert.equal(tool.annotations?.openWorldHint, false, `${tool.name} reaches no open world`);
  }
  await client.close();
});

test('a tool call answers through the same wiring', async () => {
  const client = await connected();
  const listed = await client.callTool({ name: 'list_programs', arguments: {} });
  assert.match(text(listed), /P01 · How a computer stores a number/);
  assert.match(text(listed), /kept for this session only/);
  await client.close();
});

test('a host that can elicit is asked for the edition with the track\'s editions as the choices', async () => {
  // #144, through the real protocol: the SDK validates the reader's answer against the
  // schema this server sends, so a schema a host could not render would fail here first.
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const server = createServer(new MemoryCursorStore(), { bundles: fixtureBundles() });
  await server.connect(serverSide);
  const client = new Client({ name: 'server.test', version: '0.0.0' }, { capabilities: { elicitation: { form: {} } } });

  const asked: unknown[] = [];
  client.setRequestHandler(ElicitRequestSchema, async (request) => {
    asked.push(request.params);
    return { action: 'accept', content: { edition: 'pl' } };
  });
  await client.connect(clientSide);

  const opened = await client.callTool({ name: 'open_program', arguments: { unit: 'P01' } });
  assert.equal((opened as { isError?: boolean }).isError, undefined, text(opened));
  assert.match(text(opened), /Starting "P01" in the "pl" edition, chosen directly by the reader/);

  assert.equal(asked.length, 1);
  const schema = (asked[0] as { requestedSchema: { properties: { edition: { enum: string[] } }; required: string[] } })
    .requestedSchema;
  assert.deepEqual(schema.properties.edition.enum, ['en', 'pl']);
  assert.deepEqual(schema.required, ['edition']);

  // Asked once: reopening resumes in the edition chosen. (The fixture carries one program;
  // a second program starting in it is tools.test.ts's, over a longer track.)
  await client.callTool({ name: 'open_program', arguments: { unit: 'P01' } });
  assert.equal(asked.length, 1, 'the reader was asked again');
  await client.close();
});

test('the prompt is listed, and renders the method before it asks for a step', async () => {
  const client = await connected();
  const { prompts } = await client.listPrompts();
  assert.deepEqual(prompts.map((prompt) => prompt.name), ['read']);
  assert.deepEqual(prompts[0]?.arguments?.map((argument) => argument.name), ['program', 'language']);

  const named = await client.getPrompt({ name: 'read', arguments: { program: 'P01', language: 'pl' } });
  const message = named.messages[0]!;
  assert.equal(message.role, 'user');
  const said = message.content.type === 'text' ? message.content.text : '';
  assert.match(said, /Do not answer the step for me/);
  assert.match(said, /Open P01 with open_program in the "pl" edition/);

  const unnamed = await client.getPrompt({ name: 'read', arguments: {} });
  const open = unnamed.messages[0]!.content;
  assert.match(open.type === 'text' ? open.text : '', /Call list_programs/);
  await client.close();
});

test('the program argument completes to the ids, from what was typed', async () => {
  const client = await connected();
  const all = await client.complete({ ref: { type: 'ref/prompt', name: 'read' }, argument: { name: 'program', value: '' } });
  assert.deepEqual(all.completion.values, ['P01']);

  const lower = await client.complete({ ref: { type: 'ref/prompt', name: 'read' }, argument: { name: 'program', value: 'p' } });
  assert.deepEqual(lower.completion.values, ['P01']);

  const none = await client.complete({ ref: { type: 'ref/prompt', name: 'read' }, argument: { name: 'program', value: 'F' } });
  assert.deepEqual(none.completion.values, []);

  const languages = await client.complete({ ref: { type: 'ref/prompt', name: 'read' }, argument: { name: 'language', value: '' } });
  assert.deepEqual(languages.completion.values, ['en', 'pl']);
  await client.close();
});
