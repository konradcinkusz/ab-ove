/**
 * The server as a host starts it — the launcher, as a process of its own, from a directory of
 * the host's choosing, with `CI` set — against a stub of the API served over real HTTP (#171).
 *
 * What only a process can show:
 *
 * - that an anonymous reader's place survives a restart: the id the first process kept in the
 *   state directory is the one the next process reads back, and the API holds the place under
 *   it (ADR-0066 §2);
 * - that a place whose id could not be kept is said to be kept for the session, and is gone
 *   after a restart, as it says (P8);
 * - that the id reaches neither a result nor stderr;
 * - and that nothing in the launcher's import graph looks at the working directory or stops
 *   under CI — the failure #136 was, when a test-only module reached the server's graph and
 *   exited it before it could look for anything.
 */
import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';

import { StubApi, fixtureBundle } from './testing/stub-api.ts';

/** The file an MCP host is pointed at — the whole start-up path, not `main()` alone. */
const LAUNCHER = fileURLToPath(new URL('../bin/ab-ovo-mcp.mjs', import.meta.url));

/**
 * Every server process a test started, closed after it whether it passed or not. A failed
 * assertion leaves the rest of its test unrun, `client.close()` with it, and a child process
 * still attached to this one holds the run open: without this, a place lost on restart read as
 * a run that never finished rather than as the failure it is (watched, #171).
 */
const running: Client[] = [];
afterEach(async () => {
  for (const client of running.splice(0)) await client.close().catch(() => undefined);
});

/** A server process started as a host starts one, and what it has said on stderr so far. */
async function started(api: string, state: string): Promise<{ client: Client; stderr: () => string }> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [LAUNCHER],
    cwd: mkdtempSync(join(tmpdir(), 'ab-ovo-host-')),
    // Only what the SDK passes on by default, the API, the state directory and CI: no token,
    // so the reader is anonymous, and nothing that points at a book.
    env: { ...getDefaultEnvironment(), CI: '1', AB_OVO_API_URL: api, XDG_STATE_HOME: state },
    stderr: 'pipe',
  });
  let stderr = '';
  transport.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const client = new Client({ name: 'restart.test', version: '0.0.0' });
  running.push(client);
  await client.connect(transport).catch((error: unknown) => {
    throw new Error(`the server did not start: ${String(error)}\n${stderr}`);
  });
  return { client, stderr: () => stderr };
}

/** Everything a result says: its words, and its data as the host receives it. */
function said(result: Awaited<ReturnType<Client['callTool']>>): string {
  const content = ((result as { content?: unknown }).content ?? []) as { type: string; text?: string }[];
  return content.map((part) => part.text ?? '').join('') + JSON.stringify(result.structuredContent ?? {});
}

test("an anonymous reader's place survives a restart of the process", { timeout: 120_000 }, async () => {
  const stub = new StubApi([fixtureBundle()]);
  const api = await stub.listen();
  const state = mkdtempSync(join(tmpdir(), 'ab-ovo-state-'));
  const results: string[] = [];
  try {
    const first = await started(api.url, state);
    results.push(said(await first.client.callTool({ name: 'list_programs', arguments: {} })));
    results.push(said(await first.client.callTool({ name: 'open_program', arguments: { unit: 'P01', language: 'pl' } })));
    results.push(said(await first.client.callTool({ name: 'submit_answer', arguments: { unit: 'P01', step: 1 } })));
    results.push(said(await first.client.callTool({ name: 'submit_answer', arguments: { unit: 'P01', step: 2, answer: 'x' } })));
    assert.match(results.at(-1)!, /ramka 3 z 4/, 'the first process did not reach step 3');
    await first.client.close();

    // A new process, as a host that was restarted starts one: the same reader, where they were.
    const second = await started(api.url, state);
    const resumed = said(await second.client.callTool({ name: 'current_step', arguments: { unit: 'P01' } }));
    results.push(resumed);
    assert.match(resumed, /ramka 3 z 4/, `the place did not survive the restart: ${resumed}`);
    const reopened = said(await second.client.callTool({ name: 'open_program', arguments: { unit: 'P01' } }));
    results.push(reopened);
    assert.match(reopened, /Resuming "P01" at step 3\./);
    assert.doesNotMatch(reopened, /kept for this session only/, 'a place that was kept was said not to be');
    await second.client.close();

    // One reader: one id, kept once for this API's origin, sent by both processes.
    const ids = new Set(stub.calls.map((call) => call.readerId));
    assert.equal(ids.size, 1, `the processes read as ${ids.size} readers`);
    const [id] = [...ids];
    assert.ok(id, 'no reader id was sent');
    const kept = readFileSync(join(state, 'ab-ovo', 'reader-ids'), 'utf8');
    // The line compared whole, not through a pattern built from the URL.
    assert.ok(kept.split('\n').includes(`${api.url} ${id}`), `no line "${api.url} <id>" in the file`);

    // And said nowhere: not in a result, not on stderr.
    for (const words of [...results, first.stderr(), second.stderr()]) {
      assert.ok(!words.includes(id), `the reader id was said: ${words}`);
    }
    assert.ok(!stub.calls.some((call) => call.method === 'PUT'), 'the server sent a PUT');
  } finally {
    await api.close();
  }
});

test('a place whose id cannot be kept is said to last the session, and a restart begins again', { timeout: 120_000 }, async () => {
  const stub = new StubApi([fixtureBundle()]);
  const api = await stub.listen();
  const root = mkdtempSync(join(tmpdir(), 'ab-ovo-state-'));
  // A file stands where the state directory would be made, so nothing can be kept there.
  const state = join(root, 'in-the-way');
  writeFileSync(state, '');
  try {
    const first = await started(api.url, state);
    const opened = said(await first.client.callTool({ name: 'open_program', arguments: { unit: 'P01', language: 'en' } }));
    assert.match(opened, /kept for this session only/);
    assert.match(opened, /"placeIsEphemeral":true/);
    await first.client.callTool({ name: 'submit_answer', arguments: { unit: 'P01', step: 1 } });
    assert.match(first.stderr(), /could not be kept in/);
    await first.client.close();

    const second = await started(api.url, state);
    const after = said(await second.client.callTool({ name: 'current_step', arguments: { unit: 'P01' } }));
    assert.match(after, /has not opened "P01" yet/, 'a place said to last the session outlived it');
    await second.client.close();

    const ids = [...new Set(stub.calls.map((call) => call.readerId))];
    assert.equal(ids.length, 2, 'each process held its own id in memory');
    for (const id of ids) assert.ok(id && !first.stderr().includes(id) && !second.stderr().includes(id));
  } finally {
    await api.close();
  }
});
