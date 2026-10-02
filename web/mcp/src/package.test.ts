/**
 * The published package (#172, ADR-0070): that what `scripts/build.ts` makes runs on Node
 * alone, that the build and the tarball check refuse what would put the book or TypeScript
 * into the package, and that the manifest says what the package is.
 *
 * WHAT ONLY THIS TIER CAN SHOW, AND WHAT IT CANNOT. It builds into a scratch directory and
 * starts the launcher from there, with no `src/` beside it, so the launcher takes the compiled
 * server and the handshake is the compiled server's own. It cannot pack and install: that
 * needs `pnpm` and a registry, which the unit tier has neither of. `.github/workflows/
 * mcp-package.yml` does it on the real tarball, with the same `scripts/verify-tarball.ts`
 * whose refusals are shown firing here, so a guard is seen to fail before it is trusted to.
 */
import { strict as assert } from 'node:assert';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';

import { Refusal, build, placeOf } from '../scripts/build.ts';
import { problemsWith, readTarball } from '../scripts/verify-tarball.ts';
import type { Entry } from '../scripts/verify-tarball.ts';
import { CREDITS } from './credit.ts';
import { StubApi, fixtureBundle } from './testing/stub-api.ts';

const PACKAGE = fileURLToPath(new URL('..', import.meta.url));
const REPOSITORY = join(PACKAGE, '..', '..');
const manifest = JSON.parse(readFileSync(join(PACKAGE, 'package.json'), 'utf8')) as {
  name: string;
  version: string;
  license?: string;
  files?: string[];
  bin?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

const running: Client[] = [];
afterEach(async () => {
  for (const client of running.splice(0)) await client.close().catch(() => undefined);
});

/** Every file under a directory, relative to it and with forward slashes. */
function filesUnder(directory: string, prefix = ''): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((item) =>
    item.isDirectory() ? filesUnder(join(directory, item.name), `${prefix}${item.name}/`) : [`${prefix}${item.name}`],
  );
}

/**
 * A package as a host would find it installed, minus the install: what the build writes, the
 * launcher and the manifest the tarball carries, and the SDK from this checkout's
 * `node_modules`. There is no `src/` in it, which is the point.
 */
function builtPackage(): { readonly directory: string; readonly files: readonly string[] } {
  const directory = mkdtempSync(join(tmpdir(), 'ab-ovo-built-'));
  const built = build(directory);
  mkdirSync(join(directory, 'bin'));
  copyFileSync(join(PACKAGE, 'bin', 'ab-ovo-mcp.mjs'), join(directory, 'bin', 'ab-ovo-mcp.mjs'));
  copyFileSync(join(PACKAGE, 'package.json'), join(directory, 'package.json'));
  symlinkSync(join(PACKAGE, 'node_modules'), join(directory, 'node_modules'), 'junction');
  return { directory, files: built.files.map((file) => file.path) };
}

test('the build writes JavaScript, the modules it runs of web-kit, the pin and the licence — and no book, test or TypeScript', () => {
  const { directory, files } = builtPackage();
  // What the build wrote: not the launcher, the manifest and the SDK link the scratch package was given.
  const written = filesUnder(directory).filter((file) => file !== 'node_modules' && !file.startsWith('bin/') && file !== 'package.json');
  assert.deepEqual([...written].sort(), [...files].sort(), 'the build reported files it did not write, or wrote ones it did not report');

  for (const file of written) {
    assert.ok(!/\.(?:[cm]?ts|tsx)$/.test(file), `${file} is TypeScript, which Node does not strip under node_modules`);
    assert.ok(!file.includes('.test.') && !/(?:^|\/)(?:testing|fixtures)\//.test(file), `${file} is test code`);
    assert.ok(!/(?:^|\/)(?:content|bundle)(?:\/|\.json$)/.test(file), `${file} looks like the book`);
  }
  assert.ok(written.includes('dist/server.js'));
  assert.ok(written.includes('dist/web-kit/index.js'), "web-kit's modules are carried beside the server's");
  assert.ok(written.includes('dist/web-kit/book.lock.json'), 'the pin is carried, which is the book\'s revision and never the book');
  assert.equal(readFileSync(join(directory, 'LICENSE'), 'utf8'), readFileSync(join(REPOSITORY, 'LICENSE'), 'utf8'));

  // A compiled file reads as its source does: the stripping keeps every line where it was, so a
  // stack trace from a reader's machine names a line of the source.
  const compiled = readFileSync(join(directory, 'dist', 'credit.js'), 'utf8');
  const source = readFileSync(join(PACKAGE, 'src', 'credit.ts'), 'utf8');
  assert.equal(compiled.split('\n').length, source.split('\n').length);
  assert.ok(compiled.includes("export const CREDITS"), 'the credit table is in the compiled output');
  assert.ok(!compiled.includes('interface Credit'), 'a type was left in');
});

test('the launcher, with no src/ beside it, starts the compiled server: it is the package\'s own version, and it credits the book', { timeout: 120_000 }, async () => {
  const { directory } = builtPackage();
  assert.ok(!readdirSync(directory).includes('src'), 'the scratch package has a src/, so it would not be the compiled server that started');

  const stub = new StubApi([fixtureBundle()]);
  const api = await stub.listen();
  try {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [join(directory, 'bin', 'ab-ovo-mcp.mjs')],
      cwd: mkdtempSync(join(tmpdir(), 'ab-ovo-host-')),
      env: { ...getDefaultEnvironment(), CI: '1', AB_OVO_API_URL: api.url, XDG_STATE_HOME: mkdtempSync(join(tmpdir(), 'ab-ovo-state-')) },
      stderr: 'pipe',
    });
    let stderr = '';
    transport.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const client = new Client({ name: 'package.test', version: '0.0.0' });
    running.push(client);
    await client.connect(transport).catch((error: unknown) => {
      throw new Error(`the compiled server did not start: ${String(error)}\n${stderr}`);
    });

    assert.deepEqual(client.getServerVersion(), { name: 'ab-ovo', version: manifest.version });
    const [credit] = Object.values(CREDITS);
    assert.ok(credit);
    const instructions = client.getInstructions() ?? '';
    for (const words of [credit.titles['en']!, credit.author, credit.copyright, credit.licence, credit.licenceUrl]) {
      assert.ok(instructions.includes(words), `the instructions do not say "${words}"`);
    }
    const listed = await client.callTool({ name: 'list_programs', arguments: {} });
    assert.notEqual(listed.isError, true);
    const text = ((listed.content ?? []) as { text?: string }[]).map((part) => part.text ?? '').join('');
    assert.ok(text.includes(credit.copyright) && text.includes(credit.licenceUrl), `list_programs does not credit the book: ${text}`);
    const credits = (listed.structuredContent as { credits?: { licence: string; author: string }[] }).credits;
    assert.deepEqual(credits?.map((one) => [one.author, one.licence]), [[credit.author, credit.licence]]);
    assert.equal(stderr, '', `the compiled server said something on stderr: ${stderr}`);
  } finally {
    await api.close();
  }
});

test('the build refuses what must never be in the package, with the rule that says why', () => {
  const kit = join(REPOSITORY, 'web', 'web-kit', 'src');
  // The pin is the one thing under web/content/ that goes in, and it goes where the code that reads it looks.
  assert.equal(placeOf(join(REPOSITORY, 'web', 'content', 'book.lock.json')), 'dist/web-kit/book.lock.json');
  assert.equal(placeOf(join(PACKAGE, 'src', 'server.ts')), 'dist/server.js');
  assert.equal(placeOf(join(kit, 'gate.ts')), 'dist/web-kit/gate.js');

  for (const [path, why] of [
    [join(REPOSITORY, 'web', 'content', 'bundle', 'bundle.json'), /CC BY-NC-SA 4\.0/],
    [join(REPOSITORY, 'web', 'content', 'book', 'lab', 'check.py'), /not redistributed through npm/],
    [join(PACKAGE, 'src', 'api.test.ts'), /is test code/],
    [join(PACKAGE, 'src', 'testing', 'stub-api.ts'), /is test code/],
    [join(kit, 'bundle.test.ts'), /test code/],
    [join(kit, 'fixtures', 'book-p01.v2.bundle.json'), /test code/],
    [join(kit, 'have-bundle.ts'), /test code/],
    [join(REPOSITORY, 'web', 'app', 'src', 'lib', 'x.ts'), /outside what this package is built from/],
  ] as const) {
    assert.throws(() => placeOf(path), (error: unknown) => error instanceof Refusal && why.test(error.message), `${relative(REPOSITORY, path)} was not refused as expected`);
  }
});

/** A tar header block, for the tarball reader's own test. */
function header(name: string, size: number, kind: string): Buffer {
  const block = Buffer.alloc(512);
  block.write(name, 0, 100, 'utf8');
  block.write('0000644\0', 100);
  block.write(`${size.toString(8).padStart(11, '0')}\0`, 124);
  block.write('        ', 148);
  block.write(kind, 156);
  block.write('ustar\0', 257);
  block.write('00', 263);
  const sum = block.reduce((total, byte) => total + byte, 0);
  block.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
  return block;
}
const padded = (data: Buffer): Buffer => Buffer.concat([data, Buffer.alloc((512 - (data.length % 512)) % 512)]);

test('the tarball reader finds a file by its ustar name and by its PAX path, and a directory is not a file', () => {
  const long = `package/dist/${'x'.repeat(120)}.js`;
  // A PAX record is "<length> path=<name>\n", and its length counts its own digits.
  const record = (length: number): string => `${length} path=${long}\n`;
  let length = record(0).length;
  while (record(length).length !== length) length = record(length).length;
  const pax = Buffer.from(record(length), 'utf8');

  const archive = gzipSync(
    Buffer.concat([
      header('package/', 0, '5'),
      header('package/package.json', 2, '0'),
      padded(Buffer.from('{}')),
      header('package/PaxHeader', pax.length, 'x'),
      padded(pax),
      header('package/dist/short-name-in-the-header.js', 5, '0'),
      padded(Buffer.from('1;\n\n\n')),
      Buffer.alloc(1024),
    ]),
  );
  const entries = readTarball(archive);
  assert.deepEqual(
    entries.map((entry) => [entry.path, entry.bytes.toString('utf8')]),
    [
      ['package/package.json', '{}'],
      [long, '1;\n\n\n'],
    ],
  );
});

/** A package that passes, as `problemsWith` sees one; a case changes one thing about it. */
function good(change: { manifest?: Record<string, unknown>; add?: Record<string, string | Buffer>; drop?: string[] } = {}): Entry[] {
  const files: Record<string, string | Buffer> = {
    'package/package.json': JSON.stringify({
      name: '@example/mcp',
      version: '1.0.0',
      type: 'module',
      license: 'MIT',
      engines: { node: '>=22.18.0' },
      bin: { 'ab-ovo-mcp': 'bin/ab-ovo-mcp.mjs' },
      dependencies: { '@modelcontextprotocol/sdk': '1.30.0' },
      devDependencies: { '@ab-ovo/web-kit': 'workspace:*' },
      ...change.manifest,
    }),
    'package/LICENSE': 'MIT License\n\nCopyright (c) 2026 someone\n',
    'package/README.md': '# readme\n',
    'package/bin/ab-ovo-mcp.mjs': '#!/usr/bin/env node\n',
    'package/dist/server.js': 'export const main = () => {};\n',
    'package/dist/web-kit/book.lock.json': '{}',
    ...change.add,
  };
  for (const path of change.drop ?? []) delete files[path];
  return Object.entries(files).map(([path, bytes]) => ({ path, bytes: Buffer.from(bytes) }));
}

test('the tarball check passes a package of this shape', () => {
  assert.deepEqual(problemsWith(good()), []);
  // A private manifest is a pass until it is checked for publishing: CI packs it before the
  // owner has removed the line, and the owner's own check is the stricter one.
  assert.deepEqual(problemsWith(good({ manifest: { private: true } })), []);
});

test('the tarball check refuses TypeScript, the book, test code, anything unrecognised and anything large, each with its rule', () => {
  const refused: [string, Record<string, string | Buffer>, RegExp][] = [
    ['TypeScript', { 'package/dist/server.ts': 'export {};' }, /dist\/server\.ts must not be in the package: it is TypeScript, and Node does not strip types/],
    ['declaration files', { 'package/dist/server.d.ts': 'export {};' }, /is TypeScript/],
    ['the compiled bundle', { 'package/dist/web-kit/bundle.json': '{}' }, /looks like the book[^]*CC BY-NC-SA 4\.0/],
    ['a book directory', { 'package/content/book/p01.tex': '' }, /looks like the book/],
    ['a test', { 'package/dist/api.test.js': '' }, /is source, a script or test code/],
    ['the source', { 'package/src/server.ts': '' }, /must not be in the package/],
    ['a stub', { 'package/dist/testing/stub-api.js': '' }, /test code/],
    ['an unrecognised file', { 'package/notes.txt': 'hi' }, /notes\.txt is not a file this package carries/],
    ['a file that is not code', { 'package/dist/big.js': Buffer.alloc(600 * 1024) }, /that is not code/],
    ['a path outside package/', { 'elsewhere/x.js': '' }, /outside package\//],
  ];
  for (const [what, add, message] of refused) {
    const problems = problemsWith(good({ add }));
    assert.ok(problems.some((problem) => message.test(problem)), `${what} was not refused as expected: ${JSON.stringify(problems)}`);
  }
  // Many files, none of them large: the whole is weighed too.
  const heavy = Object.fromEntries(Array.from({ length: 4 }, (_, index) => [`package/dist/part-${index}.js`, Buffer.alloc(400 * 1024)]));
  assert.ok(problemsWith(good({ add: heavy })).some((problem) => /past the \d+ it may weigh/.test(problem)));
});

test('the tarball check refuses a package with no licence, the wrong one, a registry-unresolvable dependency or an install script', () => {
  const cases: [string, Entry[], RegExp][] = [
    ['no LICENSE', good({ drop: ['package/LICENSE'] }), /There is no LICENSE/],
    ['another licence', good({ add: { 'package/LICENSE': 'Apache License\n' } }), /not the MIT licence/],
    ['no README', good({ drop: ['package/README.md'] }), /no README\.md/],
    ['a manifest that says another licence', good({ manifest: { license: 'ISC' } }), /license "ISC"/],
    ['no licence field', good({ manifest: { license: undefined } }), /license undefined/],
    ['a workspace dependency', good({ manifest: { dependencies: { '@ab-ovo/web-kit': 'workspace:*' } } }), /no registry can install/],
    ['a file dependency', good({ manifest: { dependencies: { thing: 'file:../thing' } } }), /"file:\.\.\/thing"/],
    ['a postinstall', good({ manifest: { scripts: { postinstall: 'node x.js' } } }), /"postinstall" script/],
    ['a bin that is not there', good({ manifest: { bin: { 'ab-ovo-mcp': 'bin/missing.mjs' } } }), /bin\/missing\.mjs, which the tarball does not carry/],
    ['no bin', good({ manifest: { bin: undefined } }), /no `bin`/],
    ['no Node floor', good({ manifest: { engines: undefined } }), /no Node floor/],
    ['CommonJS', good({ manifest: { type: undefined } }), /"type": "module"/],
  ];
  for (const [what, entries, message] of cases) {
    const problems = problemsWith(entries);
    assert.ok(problems.some((problem) => message.test(problem)), `${what} was not refused as expected: ${JSON.stringify(problems)}`);
  }
});

test('only the owner\'s own check, for publishing, refuses a private package', () => {
  const entries = good({ manifest: { private: true } });
  assert.deepEqual(problemsWith(entries), []);
  assert.ok(problemsWith(entries, { forPublish: true }).some((problem) => /"private": true, which npm refuses to publish/.test(problem)));
  assert.deepEqual(problemsWith(good(), { forPublish: true }), []);
});

test('the manifest says what the package is: MIT code, a launcher, one dependency, the files it carries and no more', () => {
  assert.equal(manifest.license, 'MIT');
  assert.deepEqual(manifest.files, ['bin/', 'dist/', 'LICENSE', 'README.md'], 'what the tarball carries is `files`, and a change to it is a decision about the book and about source');
  assert.deepEqual(Object.keys(manifest.dependencies ?? {}), ['@modelcontextprotocol/sdk']);
  assert.ok(!Object.values(manifest.dependencies ?? {}).some((range) => /^(?:workspace|file|link):/.test(range)));
  assert.equal(manifest.devDependencies?.['@ab-ovo/web-kit'], 'workspace:*', 'web-kit is carried in dist/, so it is a development dependency');
  assert.equal(manifest.bin?.['ab-ovo-mcp'], 'bin/ab-ovo-mcp.mjs');
  assert.equal(manifest.scripts?.['prepack'], 'node scripts/build.ts', 'a tarball must never carry a dist/ older than its source');
  for (const script of ['preinstall', 'install', 'postinstall']) assert.ok(!(script in (manifest.scripts ?? {})), `${script} would run on every reader's machine`);

  // dist/ and LICENSE are output of the build, and are not committed.
  const ignored = readFileSync(join(REPOSITORY, '.gitignore'), 'utf8').split('\n');
  for (const output of ['/web/mcp/dist/', '/web/mcp/LICENSE', '/web/mcp/*.tgz']) {
    assert.ok(ignored.includes(output), `.gitignore does not ignore ${output}`);
  }
});
