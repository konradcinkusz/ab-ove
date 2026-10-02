/**
 * THE PACKED TARBALL, CHECKED AS A READER WILL RECEIVE IT — issue #172, ADR-0070.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS READS THE TARBALL AND NOT THE DIRECTORY IT WAS MADE FROM.
 *
 * What goes wrong with a package goes wrong between the source tree and the file npm
 * serves: a `files` entry that carries too much, a build that did not run, a compiler's
 * output that is not what the unit tier ran. Every check here is made on the `.tgz` itself,
 * and the last two on a copy of it installed the way a host's `npx` installs it, so a pass
 * says something about the thing that would be published and not about the thing it was
 * made from. `.github/workflows/mcp-package.yml` runs it on every tarball it uploads, and
 * the owner runs it on the one they download before they publish
 * (`docs/how-to/publish-the-mcp-package.md`): the same instrument on both sides of the
 * hand-over.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * WHAT IT CHECKS, IN ORDER, each failure said as the sentence that fixes it:
 *
 * 1. THE CONTENTS. Every file is on a short list of what a package of this kind carries: the
 *    launcher, JavaScript under `dist/`, web-kit's content schemas and the pin, `package.json`,
 *    the licence and the README. Anything else fails, and the specific refusals come first so
 *    the message names the rule: TypeScript (Node strips no types under `node_modules`), the
 *    book (CC BY-NC-SA 4.0, not redistributed through npm — ADR-0033, ADR-0066 §4), test
 *    code, and anything large enough to be a book rather than code. The licence is there and
 *    is MIT's; the manifest says `license: MIT`; nothing in `dependencies` is a workspace,
 *    file or link specifier no registry can resolve; and there is no install-time script,
 *    which would run on every reader's machine.
 * 2. THE INSTALL, into an empty directory outside any checkout, with the `npm` that ships with
 *    Node and nothing else. Every JavaScript file of the installed copy parses.
 * 3. THE START. `--version` through the `.bin` shim `npx` runs, `--help`, and a refusal of an
 *    argument the launcher does not take.
 * 4. THE HANDSHAKE. The installed server is started as a host starts it — over stdio, from a
 *    working directory of its own, with only `AB_OVO_API_URL` — and a client connects,
 *    initialises, lists the tools and calls `list_programs`. The book's credit must be in the
 *    instructions it sends first and in the list, in words and as data (ADR-0066 §4). The API
 *    is a stub of `AbOvo.Api` this checkout serves (`src/testing/stub-api.ts`), or, with
 *    `--api`, one somebody runs.
 *
 * WHAT IT DOES NOT CHECK, so nobody reads a pass as more: that the package's name is free on
 * npm or is the owner's, that this version has not been published (a version once published
 * cannot be used again), or that an API holds the book. The checklist names each.
 *
 * Usage: node scripts/verify-tarball.ts <tarball.tgz> [--api <url>] [--for-publish]
 *
 *   --api <url>      read from this API instead of the stub: `AbOvo.Api` as the local stack
 *                    runs it. A reader is created on it only if a call writes, and none does.
 *   --for-publish    additionally refuse a tarball whose manifest is `private`, which npm
 *                    would refuse to publish (`web/mcp/package.json`'s `//private`).
 *
 * The harness runs from a checkout — it uses the repository's MCP client, its credit table
 * and its stub — and what it tests does not: the installed server sees none of the checkout.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';

import { CREDITS, creditIn } from '../src/credit.ts';

/** A file of the tarball: its path inside it, and what it holds. */
export interface Entry {
  readonly path: string;
  readonly bytes: Buffer;
}

/**
 * The files of a `.tgz`, read without a `tar` on the machine (the owner may be on any
 * platform): ustar headers with their name prefix, and PAX extended headers' `path`, which
 * is all `npm pack` and `pnpm pack` write. Directories and links are not files and are left
 * out; a file of any other kind is a refusal, since a package has no business with one.
 */
export function readTarball(archive: Buffer): Entry[] {
  const tar = gunzipSync(archive);
  const entries: Entry[] = [];
  const field = (at: number, length: number): string =>
    tar.toString('utf8', at, at + length).replace(/\0.*$/s, '');
  let pax: string | undefined;
  for (let at = 0; at + 512 <= tar.length; ) {
    // Two empty blocks end the archive.
    if (tar.subarray(at, at + 512).every((byte) => byte === 0)) break;
    const size = Number.parseInt(field(at + 124, 12).trim() || '0', 8);
    const kind = field(at + 156, 1) || '0';
    const prefix = field(at + 345, 155);
    let name = prefix === '' ? field(at, 100) : `${prefix}/${field(at, 100)}`;
    const body = tar.subarray(at + 512, at + 512 + size);
    at += 512 + Math.ceil(size / 512) * 512;
    if (kind === 'x') {
      // PAX records: "<length> <key>=<value>\n", the length counting itself.
      pax = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(body.toString('utf8'))?.[1] ?? pax;
      continue;
    }
    if (kind === 'g') continue;
    if (pax !== undefined) {
      name = pax;
      pax = undefined;
    }
    if (kind === '5') continue;
    if (kind !== '0') throw new Error(`${name} is a tar entry of kind "${kind}", which a package does not carry.`);
    entries.push({ path: name, bytes: Buffer.from(body) });
  }
  return entries;
}

/**
 * The most a file, and all of them together, may weigh. A package of JavaScript is a few
 * hundred kilobytes (measured on 2026-10-02: the largest file is `dist/tools.js`, under 90
 * KiB, and the whole is under 300 KiB), and the book's compiled bundle at the pin is
 * megabytes (3.4 MB), so a file past the first ceiling is not code, and a tarball past the
 * second has been given something it should not carry. Raise one in a diff to this file, and
 * say why in the pull request.
 */
const LARGEST_FILE = 512 * 1024;
const LARGEST_PACKAGE = 1024 * 1024;

/** Refusals that say which rule a path broke, tried before the list of what is allowed. */
const REFUSED: readonly { readonly when: (path: string) => boolean; readonly because: string }[] = [
  {
    when: (path) => /\.(?:[cm]?ts|tsx)$/.test(path),
    because:
      'it is TypeScript, and Node does not strip types from a file under node_modules, so the package would ' +
      'fail to load: the build (scripts/build.ts) writes dist/ as JavaScript, and nothing else may carry source',
  },
  {
    when: (path) => /(?:^|\/)(?:content|book|bundle)(?:\/|\.json$)/.test(path),
    because:
      'it looks like the book, which is CC BY-NC-SA 4.0 and is not redistributed through npm ' +
      '(ADR-0033, ADR-0066 §4); the server reads it from the API',
  },
  {
    when: (path) => /\.test\.|(?:^|\/)(?:testing|fixtures|scripts|src)\//.test(path),
    because: 'it is source, a script or test code, and none of those is what a reader installs',
  },
];

/** What a tarball of this package may carry, and nothing else. */
const ALLOWED: readonly RegExp[] = [
  /^package\/package\.json$/,
  /^package\/LICENSE$/,
  /^package\/README\.md$/,
  /^package\/bin\/[\w-]+\.mjs$/,
  /^package\/dist\/(?:[\w-]+\/)*[\w.-]+\.js$/,
  // web-kit's content schemas and the pin (the book's revision, never the book).
  /^package\/dist\/web-kit\/(?:content-schema\.v[12]|book\.lock)\.json$/,
];

/** The specifiers in a dependency field that no registry can resolve. */
const UNRESOLVABLE = /^(?:workspace|file|link|portal):/;

/** The lifecycle scripts npm runs on a reader's machine when it installs a package. */
const INSTALL_SCRIPTS = ['preinstall', 'install', 'postinstall'] as const;

/**
 * Everything wrong with a tarball's contents, each as the sentence that fixes it; empty when
 * there is nothing. Pure, so `src/package.test.ts` can show each refusal firing.
 */
export function problemsWith(entries: readonly Entry[], options: { readonly forPublish?: boolean } = {}): string[] {
  const problems: string[] = [];
  const paths = new Set(entries.map((entry) => entry.path));

  for (const { path, bytes } of entries) {
    const inside = path.startsWith('package/') ? path.slice('package/'.length) : undefined;
    if (inside === undefined) {
      problems.push(`${path} is outside package/, where npm puts every file of a package.`);
      continue;
    }
    const refusal = REFUSED.find((rule) => rule.when(inside));
    if (refusal !== undefined) {
      problems.push(`${inside} must not be in the package: ${refusal.because}.`);
    } else if (!ALLOWED.some((pattern) => pattern.test(path))) {
      problems.push(
        `${inside} is not a file this package carries (the launcher, JavaScript under dist/, web-kit's ` +
          'schemas and the pin, package.json, LICENSE and README.md). Remove it from `files` in web/mcp/package.json, ' +
          'or add it to ALLOWED in scripts/verify-tarball.ts with the reason.',
      );
    }
    if (bytes.length > LARGEST_FILE) {
      problems.push(`${inside} is ${bytes.length} bytes, past the ${LARGEST_FILE} a file of this package may weigh: that is not code.`);
    }
  }
  const total = entries.reduce((sum, entry) => sum + entry.bytes.length, 0);
  if (total > LARGEST_PACKAGE) {
    problems.push(`The package is ${total} bytes unpacked, past the ${LARGEST_PACKAGE} it may weigh. Something is in it that should not be.`);
  }

  const licence = entries.find((entry) => entry.path === 'package/LICENSE');
  if (licence === undefined) problems.push('There is no LICENSE: the build copies the repository\'s MIT licence in (scripts/build.ts), and `files` lists it.');
  else if (!licence.bytes.toString('utf8').startsWith('MIT License')) problems.push('LICENSE is not the MIT licence the manifest declares.');
  if (!paths.has('package/README.md')) problems.push('There is no README.md.');

  const manifestEntry = entries.find((entry) => entry.path === 'package/package.json');
  if (manifestEntry === undefined) {
    problems.push('There is no package.json.');
    return problems;
  }
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(manifestEntry.bytes.toString('utf8')) as Record<string, unknown>;
  } catch (error) {
    problems.push(`package.json is not JSON: ${String(error)}`);
    return problems;
  }

  if (manifest['license'] !== 'MIT') problems.push(`package.json says license ${JSON.stringify(manifest['license'])}, and the code is MIT: set "license": "MIT".`);
  for (const field of ['name', 'version'] as const) {
    if (typeof manifest[field] !== 'string' || manifest[field] === '') problems.push(`package.json has no ${field}.`);
  }
  if (manifest['type'] !== 'module') problems.push('package.json is not "type": "module", and the compiled server is ES modules.');
  const engines = manifest['engines'] as { node?: unknown } | undefined;
  if (typeof engines?.node !== 'string') problems.push('package.json declares no Node floor under `engines`, and the launcher needs one.');

  const bin = manifest['bin'];
  if (typeof bin !== 'object' || bin === null || Object.keys(bin).length === 0) {
    problems.push('package.json has no `bin`, so there is no command to start.');
  } else {
    for (const [command, target] of Object.entries(bin as Record<string, unknown>)) {
      const file = typeof target === 'string' ? `package/${target.replace(/^\.\//, '')}` : '';
      if (!paths.has(file)) problems.push(`The command "${command}" names ${String(target)}, which the tarball does not carry.`);
    }
  }

  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies'] as const) {
    const declared = manifest[field];
    if (typeof declared !== 'object' || declared === null) continue;
    for (const [name, range] of Object.entries(declared as Record<string, unknown>)) {
      if (typeof range === 'string' && UNRESOLVABLE.test(range)) {
        problems.push(`${field} has ${name} as "${range}", which no registry can install: a workspace package is carried in dist/, and is a devDependency.`);
      }
    }
  }
  const scripts = (manifest['scripts'] ?? {}) as Record<string, unknown>;
  for (const name of INSTALL_SCRIPTS) {
    if (name in scripts) problems.push(`package.json runs a "${name}" script, which would run on every reader's machine at install.`);
  }
  if (options.forPublish === true && manifest['private'] === true) {
    problems.push('package.json is "private": true, which npm refuses to publish: the checklist removes it in the commit that sets the name.');
  }
  return problems;
}

/** What the tarball is called, from its manifest: `@scope/name` is `scope-name`. */
function fileNameOf(name: string, version: string): string {
  return `${name.replace(/^@/, '').replace('/', '-')}-${version}.tgz`;
}

/** The lines this run has said, for the summary, and whether any was a failure. */
const failures: string[] = [];
function ok(line: string): void {
  process.stdout.write(`  ok   ${line}\n`);
}
function fail(line: string): void {
  failures.push(line);
  process.stdout.write(`  FAIL ${line}\n`);
}

/** Run a program to the end, and return what it said; its exit status is the caller's to judge. */
function run(command: string, args: readonly string[], options: { cwd: string; env?: NodeJS.ProcessEnv }) {
  const result = spawnSync(command, args, {
    ...options,
    encoding: 'utf8',
    // `npm` is a `.cmd` on Windows, which cannot be started without a shell.
    shell: process.platform === 'win32' && command === 'npm',
    timeout: 300_000,
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '', error: result.error };
}

/** Every file under a directory, relative to it, skipping `node_modules`. */
function filesUnder(directory: string, prefix = ''): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((item) => {
    if (item.name === 'node_modules') return [];
    return item.isDirectory() ? filesUnder(join(directory, item.name), `${prefix}${item.name}/`) : [`${prefix}${item.name}`];
  });
}

/** Everything the book's credit must say, so that a pass means the reader is told. */
function creditWords(language: string): { readonly instructions: string[]; readonly list: string[] }[] {
  return Object.values(CREDITS).map((credit) => {
    const book = creditIn(credit, language);
    return {
      instructions: [book.title, book.author, book.copyright, book.licence, book.licenceUrl],
      list: [book.title, book.author, book.copyright, book.licence, book.licenceUrl, book.source],
    };
  });
}

async function main(argv: readonly string[]): Promise<void> {
  const flag = (name: string): boolean => argv.includes(name);
  const at = argv.indexOf('--api');
  const api = at === -1 ? undefined : argv[at + 1];
  const tarballArgument = argv.find((argument, index) => !argument.startsWith('--') && argv[index - 1] !== '--api');
  if (tarballArgument === undefined || (at !== -1 && (api === undefined || api.startsWith('--')))) {
    process.stderr.write(
      'verify-tarball: usage: node scripts/verify-tarball.ts <tarball.tgz> [--api <url>] [--for-publish]\n',
    );
    process.exitCode = 2;
    return;
  }
  const tarball = resolve(tarballArgument);
  if (!existsSync(tarball)) {
    process.stderr.write(`verify-tarball: there is no file at ${tarballArgument}. Pack first: pnpm --dir web/mcp pack --pack-destination <directory>.\n`);
    process.exitCode = 2;
    return;
  }

  // ── 1. The contents ────────────────────────────────────────────────────────────────
  process.stdout.write(`${basename(tarball)}\n`);
  const entries = readTarball(readFileSync(tarball));
  const problems = problemsWith(entries, { forPublish: flag('--for-publish') });
  if (problems.length > 0) {
    for (const problem of problems) fail(problem);
    process.stdout.write(`verify-tarball: ${failures.length} problem(s) in the contents; nothing was installed.\n`);
    process.exitCode = 1;
    return;
  }
  const total = entries.reduce((sum, entry) => sum + entry.bytes.length, 0);
  ok(`${entries.length} files, ${total} bytes unpacked: no TypeScript, no book, no test code; the MIT licence and the README are there`);
  const manifest = JSON.parse(entries.find((entry) => entry.path === 'package/package.json')!.bytes.toString('utf8')) as {
    name: string;
    version: string;
    private?: boolean;
    bin: Record<string, string>;
  };
  if (basename(tarball) !== fileNameOf(manifest.name, manifest.version)) {
    fail(`the file is called ${basename(tarball)}, and its manifest says ${manifest.name} ${manifest.version}: it was renamed, or is not what was packed.`);
  } else {
    ok(`${manifest.name} ${manifest.version}${manifest.private === true ? ' (private: npm will not publish it until the checklist removes that)' : ''}`);
  }

  const workdir = mkdtempSync(join(tmpdir(), 'ab-ovo-package-'));
  const state = mkdtempSync(join(tmpdir(), 'ab-ovo-package-state-'));
  const stub = api === undefined ? await (async () => {
    const { StubApi, fixtureBundle } = await import('../src/testing/stub-api.ts');
    return new StubApi([fixtureBundle()]).listen();
  })() : undefined;

  try {
    // ── 2. The install, with only Node ───────────────────────────────────────────────
    // The directory is empty but for the manifest that pins npm's prefix to it, so nothing
    // above it is read, and it is outside this checkout, so none of its node_modules is on
    // the way up from the installed server either.
    writeFileSync(join(workdir, 'package.json'), '{"private":true}\n');
    const install = run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error', tarball], { cwd: workdir });
    if (install.status !== 0) {
      fail(`npm install of the tarball failed (${install.status ?? install.error}):\n${install.stderr || install.stdout}`);
      return;
    }
    const installed = join(workdir, 'node_modules', ...manifest.name.split('/'));
    ok(`installed into an empty directory with npm ${execFileSync('npm', ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' }).trim()} and Node ${process.versions.node}`);

    const javascript = filesUnder(installed).filter((file) => /\.m?js$/.test(file));
    const unparsed = javascript.filter((file) => run(process.execPath, ['--check', join(installed, file)], { cwd: workdir }).status !== 0);
    if (unparsed.length > 0) fail(`these do not parse as JavaScript: ${unparsed.join(', ')}`);
    else ok(`${javascript.length} JavaScript files, every one of them parses`);

    // ── 3. The start ────────────────────────────────────────────────────────────────
    const [command, target] = Object.entries(manifest.bin)[0]!;
    const launcher = join(installed, ...target.split('/'));
    // `npx` runs the shim in `.bin`; on Windows that is a `.cmd`, so there Node runs the file.
    const shim = process.platform === 'win32' ? undefined : join(workdir, 'node_modules', '.bin', command);
    const version = shim === undefined ? run(process.execPath, [launcher, '--version'], { cwd: workdir }) : run(shim, ['--version'], { cwd: workdir });
    if (version.status === 0 && version.stdout === `${manifest.name} ${manifest.version}\n`) ok(`${command} --version prints "${version.stdout.trim()}"`);
    else fail(`${command} --version printed ${JSON.stringify(version.stdout)} (exit ${version.status}), not "${manifest.name} ${manifest.version}": ${version.stderr}`);

    const help = run(process.execPath, [launcher, '--help'], { cwd: workdir });
    if (help.status === 0 && help.stdout.includes('AB_OVO_API_URL')) ok(`${command} --help says how to configure it`);
    else fail(`${command} --help did not say AB_OVO_API_URL (exit ${help.status}): ${help.stdout}${help.stderr}`);

    const refused = run(process.execPath, [launcher, 'AB_OVO_API_URL=http://x'], { cwd: workdir });
    if (refused.status === 2 && !refused.stderr.includes('http://x')) ok('an argument is refused with a sentence that does not repeat it');
    else fail(`an argument was not refused as a host's mistake (exit ${refused.status}): ${refused.stderr}`);

    // ── 4. The handshake ────────────────────────────────────────────────────────────
    const address = api ?? stub!.url;
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [launcher],
      cwd: workdir,
      // What a host passes on, the API and a state directory of its own: no token, so the
      // reader is anonymous, and the user's real state directory is never touched.
      env: { ...getDefaultEnvironment(), AB_OVO_API_URL: address, XDG_STATE_HOME: state },
      stderr: 'pipe',
    });
    let stderr = '';
    transport.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const client = new Client({ name: 'verify-tarball', version: '0.0.0' });
    try {
      await client.connect(transport);
      const server = client.getServerVersion();
      if (server?.name === 'ab-ovo' && server.version === manifest.version) ok(`initialize: the server is ${server.name} ${server.version}`);
      else fail(`initialize: the server called itself ${JSON.stringify(server)}, not ab-ovo ${manifest.version}`);

      const instructions = client.getInstructions() ?? '';
      const missingFromInstructions = creditWords('en').flatMap((credit) => credit.instructions.filter((word) => !instructions.includes(word)));
      if (instructions !== '' && missingFromInstructions.length === 0) ok("the instructions the host gives its model credit the book: title, author, notice, licence and its link");
      else fail(`the instructions do not credit the book; missing ${JSON.stringify(missingFromInstructions)}`);

      const names = (await client.listTools()).tools.map((tool) => tool.name);
      if (['list_programs', 'open_program', 'current_step', 'submit_answer', 'review_step'].every((name) => names.includes(name))) ok(`tools/list: ${names.join(', ')}`);
      else fail(`tools/list: ${names.join(', ')} is not the server's tools`);

      const listed = await client.callTool({ name: 'list_programs', arguments: {} });
      const text = ((listed.content ?? []) as { type: string; text?: string }[]).map((part) => part.text ?? '').join('');
      const data = JSON.stringify(listed.structuredContent ?? {});
      if (listed.isError === true) {
        fail(`list_programs came back as an error — is ${address} an ab-ovo API that holds the book?\n${text}`);
      } else {
        const missing = creditWords('en').flatMap((credit) => credit.list.filter((word) => !text.includes(word) || !data.includes(word)));
        if (missing.length === 0) ok(`list_programs against ${address}: the programs, with the credit, in words and as data`);
        else fail(`list_programs does not credit the book in its words and its data; missing ${JSON.stringify(missing)}:\n${text}`);
        process.stdout.write(`\n${text.split('\n').map((line) => `       | ${line}`).join('\n')}\n\n`);
      }
      if (stderr.trim() !== '') process.stdout.write(`       the server said on stderr: ${stderr.trim()}\n`);
    } catch (error) {
      fail(`the installed server did not complete the handshake: ${String(error)}\n${stderr}`);
    } finally {
      await client.close().catch(() => undefined);
    }
  } finally {
    await stub?.close();
    for (const directory of [workdir, state]) {
      if (directory.startsWith(tmpdir() + sep)) rmSync(directory, { recursive: true, force: true });
    }
  }
}

/*
  Run only when this file is the entry point, so `src/package.test.ts` can import
  `problemsWith` and `readTarball`.
*/
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main(process.argv.slice(2));
  if (failures.length > 0) {
    process.stdout.write(`\nverify-tarball: ${failures.length} check(s) failed.\n`);
    process.exitCode = 1;
  } else if (process.exitCode === undefined) {
    process.stdout.write('\nverify-tarball: every check passed.\n');
  }
}
