/**
 * The protocol, driven end to end over an in-memory transport.
 *
 * Everything worth asserting about the gate and the tool surface is asserted at the layer
 * with the logic (P13) in reveal.test.ts and tools.test.ts. What only this file can say is
 * that the wiring in server.ts exposes it: the annotations and the output schemas reach a
 * client's `listTools`, every result a client receives matches its tool's output schema,
 * the prompt is listed and renders, and a completion answers with ids. A capability
 * declared wrongly throws at registration, which is the one failure this catches before a
 * host does.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';

import { MemoryCursorStore } from './cursor.ts';
import { fixtureBundles } from './content.ts';
import type { Bundle, BundleSource, Unit } from './content.ts';
import { createServer } from './server.ts';

/**
 * A client of a server whose place is kept in memory. `declines` makes it a host that can
 * ask the reader directly, and a reader who declines whatever is asked.
 */
async function connected(
  bundles: BundleSource = fixtureBundles(),
  options: { readonly declines?: boolean } = {},
): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const server = createServer(new MemoryCursorStore(), { bundles, placeIsEphemeral: true });
  await server.connect(serverSide);
  const client = options.declines
    ? new Client({ name: 'server.test', version: '0.0.0' }, { capabilities: { elicitation: { form: {} } } })
    : new Client({ name: 'server.test', version: '0.0.0' });
  if (options.declines) client.setRequestHandler(ElicitRequestSchema, async () => ({ action: 'decline' as const }));
  await client.connect(clientSide);
  return client;
}

/**
 * Three programs from the fixture's one, so the reading order has a program to refuse and
 * the hand-off has a next program to name. `tools.test.ts`'s `sequence()`, one file over.
 */
function threePrograms(): BundleSource {
  const bundle = fixtureBundles().all()[0]!;
  const bare: { -readonly [K in keyof Unit]?: Unit[K] } = { ...bundle.units[0]! };
  delete bare.part;
  const three: Bundle = { ...bundle, units: ['F01', 'F02', 'F03'].map((id) => ({ ...(bare as Unit), id })) };
  return { for: (track) => (track === three.track.id ? three : undefined), all: () => [three] };
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

  // #164: once per session in the words, and on every result in the data.
  const opened = await client.callTool({ name: 'open_program', arguments: { unit: 'P01', language: 'en' } });
  assert.doesNotMatch(text(opened), /kept for this session only/);
  for (const result of [listed, opened]) {
    assert.equal((result.structuredContent as { placeIsEphemeral?: boolean }).placeIsEphemeral, true);
  }
  await client.close();
});

/** A result as a client receives it, read loosely: `callTool` may also answer a legacy shape. */
interface Received {
  readonly content?: readonly { readonly type: string; readonly text?: string }[];
  readonly structuredContent?: Record<string, unknown>;
  readonly isError?: boolean;
}

test("every result a client receives validates against its tool's output schema, and carries the text's words", async () => {
  /*
    #164's first done-when. The SDK's client already validates a result against the schema
    `listTools` gave it, and throws on a mismatch; this asks the same validator itself, so the
    assertion is this file's rather than a default of the SDK's that a later version could
    change. The walk goes through every shape a tool can answer with — and then checks it
    did, member by member, so it validates the schemas and not one corner of them.
  */
  const client = await connected(threePrograms());
  const { tools } = await client.listTools();
  const validator = new AjvJsonSchemaValidator();
  const validate = new Map(
    tools.map((tool) => {
      assert.equal(tool.outputSchema?.type, 'object', `${tool.name} declares no output schema`);
      return [tool.name, validator.getValidator(tool.outputSchema!)] as const;
    }),
  );
  const sent = new Map(tools.map((tool) => [tool.name, new Set<string>()] as const));
  const kinds = new Set<string>();

  const call = async (name: string, args: Record<string, unknown> = {}, through: Client = client): Promise<void> => {
    const result = (await through.callTool({ name, arguments: args })) as Received;
    const where = `${name} ${JSON.stringify(args)}`;
    const words = (result.content ?? []).map((part) => part.text ?? '').join('');
    if (result.isError) {
      assert.equal(result.structuredContent, undefined, `${where}: an error carries its text alone`);
      return;
    }
    const data = result.structuredContent;
    assert.ok(data, `${where} answered with no structured content`);
    const verdict = validate.get(name)!(data);
    assert.ok(verdict.valid, `${where}: ${verdict.errorMessage}\n${JSON.stringify(data)}`);
    assert.equal(data['text'], words, `${where}: the data does not carry the text's words`);
    for (const member of Object.keys(data)) sent.get(name)!.add(member);
    const refusal = data['refusal'] as { readonly kind: string } | undefined;
    if (refusal) kinds.add(refusal.kind);
  };

  // A new reader: the list, a program the order keeps shut, and a first opening's question.
  await call('list_programs');
  await call('list_programs', { all: true });
  await call('list_programs', { language: 'pl' });
  await call('open_program', { unit: 'F02' });
  await call('current_step', { unit: 'F02' });
  await call('review_step', { unit: 'F02', step: 1 });
  await call('submit_answer', { unit: 'F02', step: 1 });
  await call('open_program', { unit: 'F01' });
  // Through F01, with a re-read, a retry, a submit ahead and a switch of edition on the way.
  await call('open_program', { unit: 'F01', language: 'en' });
  await call('current_step', { unit: 'F01' });
  await call('review_step', { unit: 'F01', step: 3 });
  await call('review_step', { unit: 'F01', step: 900 });
  await call('submit_answer', { unit: 'F01', step: 1 });
  await call('submit_answer', { unit: 'F01', step: 1, answer: 'again' });
  await call('submit_answer', { unit: 'F01', step: 4, answer: 'ahead' });
  await call('submit_answer', { unit: 'F01', step: 2, answer: 'the reader wrote this' });
  await call('review_step', { unit: 'F01', step: 2 });
  await call('open_program', { unit: 'F01', language: 'pl' });
  await call('submit_answer', { unit: 'F01', step: 3, answer: 'and this' });
  // The end of a program, and the program it opens.
  await call('submit_answer', { unit: 'F01', step: 4 });
  await call('open_program', { unit: 'F01' });
  await call('open_program', { unit: 'F02' });
  await call('submit_answer', { unit: 'F02' });
  await call('list_programs');
  await client.close();

  // A reader who declines what the host asks them directly: the edition, then an answer.
  const declining = await connected(threePrograms(), { declines: true });
  await call('open_program', { unit: 'F01' }, declining);
  await call('open_program', { unit: 'F01', language: 'en' }, declining);
  await call('submit_answer', { unit: 'F01', step: 1 }, declining);
  await call('submit_answer', { unit: 'F01', step: 2, answer: 'x' }, declining);
  await declining.close();

  for (const tool of tools) {
    assert.deepEqual(
      [...sent.get(tool.name)!].sort(),
      Object.keys(tool.outputSchema!.properties ?? {}).sort(),
      `${tool.name}: a member its schema declares was never sent, so never validated`,
    );
  }
  assert.deepEqual([...kinds].sort(), ['already-answered', 'declined', 'not-open', 'not-reached']);
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
  assert.match(open.type === 'text' ? open.text : '', /Call list_programs and show me/);

  // An edition with no program: the list is asked for in it, so the titles chosen from are.
  const inPolish = await client.getPrompt({ name: 'read', arguments: { language: 'pl' } });
  const listed = inPolish.messages[0]!.content;
  assert.match(listed.type === 'text' ? listed.text : '', /Call list_programs with "language": "pl"/);
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
