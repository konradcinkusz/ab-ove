#!/usr/bin/env node
/*
 * The launcher an MCP host is pointed at — in a checkout, and in the published package (#172).
 *
 * WHICH SERVER. A checkout runs the TypeScript in `src/` directly, through Node's own type
 * stripping. The package carries no `src/`: it carries the JavaScript `scripts/build.ts` made
 * of it, in `dist/`, because Node strips no types from a file under `node_modules`, which is
 * where an installed package lives (ADR-0066's Consequences). So the source is run wherever it
 * is there, which in a checkout is always — a `dist/` left behind by a build is never run in
 * its place, and cannot go stale under a developer — and `dist/` only where there is no
 * source, which is the package. `src/restart.test.ts` starts this file in the first shape, and
 * `src/package.test.ts` and `.github/workflows/mcp-package.yml` start it in the second.
 *
 * WHY A .MJS IN FRONT OF EITHER. A host — Claude Desktop, Claude Code, an editor — starts
 * whatever `node` is first on its PATH. On a Node older than 22.18 the source fails on its
 * first `import type` with a SyntaxError that says nothing about versions, and a check inside
 * `src/server.ts` could not run on the Node that needs it, because that file is the one it
 * cannot parse. This file is plain JavaScript that runs anywhere, so it checks first and then
 * hands over. The package's JavaScript strips nothing, and the floor is the same for it: it
 * is the Node this package is built and tested on, and nothing tests it on an older one.
 *
 * Everything the server does is in `src/`. This holds the check, the hand-over and the
 * flags a person at a terminal may try, and it says one sentence on stderr for each way the
 * hand-over can fail.
 */
import { existsSync, readFileSync } from 'node:fs';

/*
  --version AND --help, FOR A PERSON AT A TERMINAL, before anything else: a host passes no
  argument, and neither flag needs the server. `package.json` sits one directory up in a
  checkout and in the package alike. Anything else is refused rather than ignored, because a
  host configuration that passes arguments has been written for some other server — or puts
  AB_OVO_API_URL where an argument goes, which is why a refusal never repeats what it was
  given: an address can carry a password.
*/
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const given = process.argv.slice(2);
const [flag] = given;

if (given.length === 0) {
  await serve();
} else if (given.length === 1 && (flag === '--version' || flag === '-v')) {
  process.stdout.write(`${manifest.name} ${manifest.version}\n`);
} else if (given.length === 1 && (flag === '--help' || flag === '-h')) {
  process.stdout.write(
    `${manifest.name} ${manifest.version} — an MCP server for a programmed-learning book, read\n` +
      'one step at a time. It is a client of an ab-ovo API, which holds the book and the\n' +
      "reader's place; it carries no book itself.\n\n" +
      'An MCP host starts it over stdio, with no arguments, and configures it through the\n' +
      'environment:\n\n' +
      "  AB_OVO_API_URL       the ab-ovo API's address, such as http://localhost:8180 (required)\n" +
      "  AB_OVO_READER_TOKEN  an account's access token (optional). Without one the reader is\n" +
      "                       anonymous, under an id kept in the user's state directory.\n\n" +
      'In Claude Code, for example:\n\n' +
      `  claude mcp add ab-ovo -e AB_OVO_API_URL=<the API's address> -- npx -y ${manifest.name}\n\n` +
      'Its README says more, and --version prints the version.\n',
  );
} else {
  process.stderr.write(
    `ab-ovo MCP: it takes no arguments, and was given ${given.length}. An MCP host starts it ` +
      'with none and configures it through the environment: AB_OVO_API_URL is set in the ' +
      "host's configuration (with -e in `claude mcp add`), not passed as an argument. --help " +
      'says how, and --version prints the version.\n',
  );
  process.exitCode = 2;
}

/** The Node check, then the server: from `src/` in a checkout, from `dist/` in the package. */
async function serve() {
  const REQUIRED = { major: 22, minor: 18 };
  const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);

  if (major < REQUIRED.major || (major === REQUIRED.major && minor < REQUIRED.minor)) {
    process.stderr.write(
      `ab-ovo MCP: Node ${process.versions.node} cannot run this server. It needs Node ` +
        `${REQUIRED.major}.${REQUIRED.minor} or later; the host started "${process.execPath}", ` +
        'so point its command at a newer node.\n',
    );
    process.exit(1);
  }

  const source = new URL('../src/server.ts', import.meta.url);
  const fromSource = existsSync(source);

  try {
    const { main } = await import(fromSource ? source.href : new URL('../dist/server.js', import.meta.url).href);
    await main();
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    if (fromSource && (code === 'ERR_UNKNOWN_FILE_EXTENSION' || error instanceof SyntaxError)) {
      process.stderr.write(
        `ab-ovo MCP: this Node (${process.versions.node}) could not load the server's ` +
          'TypeScript source. Node 22.18 or later strips types itself; on 22.6 to 22.17, ' +
          'start it as `node --experimental-strip-types bin/ab-ovo-mcp.mjs`.\n',
      );
      process.exit(1);
    }
    process.stderr.write(`ab-ovo MCP failed to start: ${String(error)}\n`);
    process.exit(1);
  }
}
