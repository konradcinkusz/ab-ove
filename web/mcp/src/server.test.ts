/**
 * The protocol, driven end to end over an in-memory transport, against a stub of the API.
 *
 * Everything worth asserting about the tool surface is asserted at the layer with the logic
 * (P13) in tools.test.ts, api.test.ts and identity.test.ts, and the gate is the API's. What
 * only this file can say is that the wiring in server.ts exposes it: the annotations and the
 * output schemas reach a client's `listTools`, every result a client receives matches its
 * tool's output schema, the prompt is listed and renders, and a completion answers with ids.
 * A capability declared wrongly throws at registration, which is the one failure this catches
 * before a host does. And two things about the whole package: that the environment a host
 * starts it with is read as README.md says, and that none of its modules reads a book.
 */
import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import type { Bundle, Unit } from '@ab-ovo/web-kit';

import { AbOvoApi } from './api.ts';
import { apiFromEnvironment, createServer } from './server.ts';
import { handle } from './tools.ts';
import { STUB_API, StubApi, fixtureBundle } from './testing/stub-api.ts';

const READER_ID = '2a7e5c1b-3d4f-4a6b-9c8d-7e6f5a4b3c2d';

/** A server over a stub API serving `books`, whose reader's id could not be kept — so the in-memory note is said. */
function serverOver(books: readonly Bundle[]) {
  const stub = new StubApi(books);
  const api = new AbOvoApi({
    baseUrl: STUB_API,
    reader: { kind: 'anonymous', hold: () => ({ id: READER_ID, kept: false }) },
    tracks: books.map((book) => book.track.id),
    fetch: stub.fetch,
  });
  return createServer(api);
}

/**
 * A client of such a server. `declines` makes it a host that can ask the reader directly,
 * and a reader who declines whatever is asked.
 */
async function connected(
  books: readonly Bundle[] = [fixtureBundle()],
  options: { readonly declines?: boolean } = {},
): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const server = serverOver(books);
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
function threePrograms(): Bundle[] {
  const bundle = fixtureBundle();
  const bare: { -readonly [K in keyof Unit]?: Unit[K] } = { ...bundle.units[0]! };
  delete bare.part;
  return [{ ...bundle, units: ['F01', 'F02', 'F03'].map((id) => ({ ...(bare as Unit), id })) }];
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
  const server = serverOver([fixtureBundle()]);
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

test('a host that can elicit shows the reader the answer form in the edition of the step', async () => {
  // #167: a host shows the form to the reader with no model in between to translate it, so a
  // Polish step is confirmed in Polish.
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const server = serverOver([fixtureBundle()]);
  await server.connect(serverSide);
  const client = new Client({ name: 'server.test', version: '0.0.0' }, { capabilities: { elicitation: { form: {} } } });

  const asked: unknown[] = [];
  client.setRequestHandler(ElicitRequestSchema, async (request) => {
    asked.push(request.params);
    return { action: 'accept', content: { answer: 'mantysa' } };
  });
  await client.connect(clientSide);

  await client.callTool({ name: 'open_program', arguments: { unit: 'P01', language: 'pl' } });
  await client.callTool({ name: 'submit_answer', arguments: { unit: 'P01', step: 1 } });
  const moved = await client.callTool({ name: 'submit_answer', arguments: { unit: 'P01', step: 2 } });
  assert.match(text(moved), /"mantysa"/, 'what the reader confirmed is what was recorded');

  assert.equal(asked.length, 1);
  const form = asked[0] as {
    message: string;
    requestedSchema: { properties: { answer: { title: string; description: string } } };
  };
  assert.equal(
    form.message,
    'Ramka 2: sprawdź to, zanim zostanie zapisane jako twoja odpowiedź. Wpisz swoją odpowiedź — asystent nic nie przesłał.',
  );
  assert.equal(form.requestedSchema.properties.answer.title, 'Twoja odpowiedź');
  assert.equal(form.requestedSchema.properties.answer.description, 'Popraw, jeśli to nie jest twoja odpowiedź, a potem potwierdź.');
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

test('with no AB_OVO_API_URL, stderr says so once and every call says what to set', async () => {
  const said: string[] = [];
  const api = apiFromEnvironment({}, { warn: (line) => said.push(line) });
  assert.equal(said.length, 1);
  assert.match(said[0]!, /AB_OVO_API_URL is not set/);
  const listed = await handle('list_programs', {}, { api });
  assert.ok(listed.isError);
  assert.match(listed.text, /AB_OVO_API_URL is not set/);
});

test('AB_OVO_READER_TOKEN, when set, is the reader: a bearer, and no id is minted or sent', async () => {
  const stub = new StubApi([fixtureBundle()]);
  const state = mkdtempSync(join(tmpdir(), 'ab-ovo-state-'));
  const api = apiFromEnvironment(
    { AB_OVO_API_URL: STUB_API, AB_OVO_READER_TOKEN: 'the-token', XDG_STATE_HOME: state },
    { fetch: stub.fetch, warn: () => assert.fail('nothing is wrong, so nothing is said') },
  );
  await handle('list_programs', {}, { api });
  assert.ok(stub.calls.length > 0);
  for (const call of stub.calls) {
    assert.equal(call.authorization, 'Bearer the-token');
    assert.equal(call.readerId, undefined);
  }
  assert.deepEqual(readdirSync(state), [], 'a reader with a token had an id minted for them');
});

test('without a token the reader is anonymous, under an id kept in the state directory for this origin', async () => {
  const stub = new StubApi([fixtureBundle()]);
  const state = mkdtempSync(join(tmpdir(), 'ab-ovo-state-'));
  const env = { AB_OVO_API_URL: `${STUB_API}/`, XDG_STATE_HOME: state };
  const api = apiFromEnvironment(env, { fetch: stub.fetch, warn: () => assert.fail('the id was kept, so nothing is said') });
  assert.deepEqual(readdirSync(state), [], 'an id was minted before anything needed one');

  await handle('open_program', { unit: 'P01', language: 'en' }, { api });
  const file = readFileSync(join(state, 'ab-ovo', 'reader-ids'), 'utf8');
  const id = stub.calls[0]!.readerId!;
  assert.ok(file.includes(`${STUB_API} ${id}`), 'the id sent is not the one kept for this origin');
  assert.equal(api.placeIsEphemeral, false);

  // A second process started the same way reads as the same reader.
  const again = apiFromEnvironment(env, { fetch: stub.fetch });
  await again.places();
  assert.equal(stub.calls.at(-1)!.readerId, id);
});

test('an id that cannot be kept is held in memory, and stderr says where and why without saying the id', async () => {
  const stub = new StubApi([fixtureBundle()]);
  const root = mkdtempSync(join(tmpdir(), 'ab-ovo-state-'));
  writeFileSync(join(root, 'in-the-way'), '');
  const said: string[] = [];
  const api = apiFromEnvironment(
    { AB_OVO_API_URL: STUB_API, XDG_STATE_HOME: join(root, 'in-the-way') },
    { fetch: stub.fetch, warn: (line) => said.push(line) },
  );
  const listed = await handle('list_programs', {}, { api, session: { ephemeralNoteSaid: false } });
  assert.ok(!listed.isError, listed.text);
  assert.equal(listed.structured?.placeIsEphemeral, true);
  assert.match(listed.text, /kept for this session only/);

  assert.equal(said.length, 1);
  assert.match(said[0]!, /could not be kept in .*in-the-way.*reader-ids/);
  const id = stub.calls[0]!.readerId!;
  assert.ok(!said[0]!.includes(id), 'stderr said the id');
});

test('the server keeps no book and no gate: none of its modules reads a bundle', () => {
  /*
    #171's first done-when, held from the source's side. The book is the API's and so is the
    gate (ADR-0066 §1): a module of this package that loaded a bundle, or took the fixture, would
    be the server keeping a copy of the content again, quietly. The stub API under `testing/`
    serves the fixture to the unit tier and is nothing the server imports.
  */
  const source = fileURLToPath(new URL('.', import.meta.url));
  const modules = readdirSync(source).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'));
  assert.ok(modules.includes('tools.ts'), 'this looked in the wrong directory');
  let statements = 0;
  for (const name of modules) {
    const text = readFileSync(join(source, name), 'utf8');
    for (const [statement] of text.matchAll(/^import\b[\s\S]*?from\s+'[^']+';/gm)) {
      statements += 1;
      assert.doesNotMatch(
        statement,
        /\b(bundleFor|allBundles|validateBundle)\b|\/fixtures\/|have-bundle|\/testing\//,
        `${name} reads a book: ${statement}`,
      );
    }
  }
  assert.ok(statements > 0, 'no import was read, so nothing was checked');
});
