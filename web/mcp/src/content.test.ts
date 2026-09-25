/**
 * Where the live source looks for the book — the one thing in content.ts that is not
 * re-exported from `@ab-ovo/web-kit`, and the one the working directory used to decide.
 *
 * `@ab-ovo/web-kit`'s bundle.test.ts asserts the loader's half against the committed
 * fixture, from a scratch directory: a named `web/` is found from anywhere and replaces the
 * guesses. What only this file can say is that THIS package names the right `web/` — and,
 * by starting the launcher the way a host does, that nothing else in its import graph
 * looks at the working directory first.
 */
import { strict as assert } from 'node:assert';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { skipWithoutBundle } from '@ab-ovo/web-kit/have-bundle';

import { REPOSITORY_ROOT, WEB_DIR, liveBundles } from './content.ts';

/** The file an MCP host is pointed at — the whole start-up path, not `main()` alone. */
const LAUNCHER = fileURLToPath(new URL('../bin/ab-ovo-mcp.mjs', import.meta.url));

test('the live source names the checkout it is in, not the directory it was started from', () => {
  // The lock file is committed, so this needs no fetch: it is the file whose
  // `contentBundle.destination` the loader resolves against the `web/` it is handed.
  assert.ok(existsSync(join(WEB_DIR, 'content', 'book.lock.json')), `${WEB_DIR} is not web/`);
  assert.ok(existsSync(join(REPOSITORY_ROOT, 'scripts', 'fetch-book-content.sh')), `${REPOSITORY_ROOT} is not the root`);
});

test(
  'the live source finds the book from a working directory outside the repository',
  { skip: skipWithoutBundle() },
  () => {
    // #136, as a host reproduces it: the process is somewhere that is not the checkout,
    // and the book is found anyway. Every cwd-relative guess misses from here.
    const before = process.cwd();
    const override = process.env['AB_OVO_CONTENT_BUNDLE'];
    process.chdir(mkdtempSync(join(tmpdir(), 'ab-ovo-host-')));
    delete process.env['AB_OVO_CONTENT_BUNDLE'];
    try {
      const [bundle] = liveBundles.all();
      assert.ok(bundle, 'no bundle from outside the repository');
      assert.ok(bundle.units.length > 10, 'that is not the book');
    } finally {
      process.chdir(before);
      if (override !== undefined) process.env['AB_OVO_CONTENT_BUNDLE'] = override;
    }
  },
);

test(
  'the launcher serves the book from outside the repository, with CI set',
  { skip: skipWithoutBundle(), timeout: 60_000 },
  async () => {
    // #136 end to end, through the launcher a host is pointed at. CI is set because it is
    // the environment where a test-only module once decided whether the server started at
    // all: `have-bundle.ts` came in through `@ab-ovo/web-kit`'s barrel, guessed from the
    // working directory, found nothing from here and threw at import — so the server
    // exited with a sentence about test ordering before it could look in its own checkout.
    // A host run under GitHub Actions starts it from exactly here.
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [LAUNCHER],
      cwd: mkdtempSync(join(tmpdir(), 'ab-ovo-host-')),
      // Only what the SDK passes on by default, plus CI: no AB_OVO_API_URL, so the place is
      // kept in memory, and no AB_OVO_CONTENT_BUNDLE, so nothing points at the book for it.
      env: { ...getDefaultEnvironment(), CI: '1' },
      stderr: 'pipe',
    });
    let stderr = '';
    transport.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const client = new Client({ name: 'content.test', version: '0.0.0' });
    try {
      await client.connect(transport).catch((error: unknown) => {
        throw new Error(`the server did not start: ${String(error)}\n${stderr}`);
      });
      const listed = await client.callTool({ name: 'list_programs', arguments: {} });
      const body = ((listed.content ?? []) as { type: string; text?: string }[])
        .map((part) => part.text ?? '')
        .join('');
      assert.equal(listed.isError, undefined, body);
      assert.match(body, /\bF01\b/, body);
    } finally {
      await client.close();
    }
  },
);
