#!/usr/bin/env node
/*
 * The launcher an MCP host is pointed at.
 *
 * WHY A .MJS IN FRONT OF A .TS. The server is TypeScript run directly by Node's own type
 * stripping, which needs Node 22.18 or later. A host — Claude Desktop, Claude Code, an
 * editor — starts whatever `node` is first on its PATH, and an older one fails on the first
 * `import type` with a SyntaxError that says nothing about versions. A check inside
 * `src/server.ts` could not run on the Node that needs it, because that file is the one
 * it cannot parse; this file is plain JavaScript and runs anywhere, so it checks first and
 * then hands over.
 *
 * Everything the server does is in `src/`; this holds nothing but the check and the
 * hand-over, and it says one sentence on stderr for each way the hand-over can fail.
 */
const REQUIRED = { major: 22, minor: 18 };
const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);

if (major < REQUIRED.major || (major === REQUIRED.major && minor < REQUIRED.minor)) {
  process.stderr.write(
    `ab-ovo MCP: Node ${process.versions.node} cannot run this server. It needs Node ` +
      `${REQUIRED.major}.${REQUIRED.minor} or later, which strips TypeScript types itself; ` +
      `the host started "${process.execPath}", so point its command at a newer node.\n`,
  );
  process.exit(1);
}

try {
  const { main } = await import('../src/server.ts');
  await main();
} catch (error) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  if (code === 'ERR_UNKNOWN_FILE_EXTENSION' || error instanceof SyntaxError) {
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
