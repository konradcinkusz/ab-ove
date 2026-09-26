/**
 * The anonymous reader's id and the file it is kept in (ADR-0066 §2, issue #171): where the
 * file is, what it holds, that it is created once and readable by its user alone, that the
 * first line for an origin wins a race, and that a file that cannot be kept, or a state
 * directory that cannot be found, is said and not failed on.
 */
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { appendFileSync, chmodSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { READER_IDS_FILE, heldReaderId, idIn, originOf, readerIdFor, stateDirectory } from './identity.ts';
import { NO_HOME, withNoHome } from './testing/no-home.ts';

const ORIGIN = 'https://api.example';
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const scratch = (): string => mkdtempSync(join(tmpdir(), 'ab-ovo-state-'));

test("the state directory is XDG_STATE_HOME's when it is absolute, and the platform's own otherwise", () => {
  assert.equal(stateDirectory({ XDG_STATE_HOME: '/srv/state' }, 'linux', '/home/r'), '/srv/state/ab-ovo');
  // The XDG specification ignores a relative path, and so does this.
  assert.equal(stateDirectory({ XDG_STATE_HOME: 'state' }, 'linux', '/home/r'), '/home/r/.local/state/ab-ovo');
  assert.equal(stateDirectory({}, 'linux', '/home/r'), '/home/r/.local/state/ab-ovo');
  assert.equal(stateDirectory({}, 'darwin', '/Users/r'), '/Users/r/Library/Application Support/ab-ovo');
  assert.equal(
    stateDirectory({ LOCALAPPDATA: 'C:\\Users\\r\\AppData\\Local' }, 'win32', 'C:\\Users\\r'),
    'C:\\Users\\r\\AppData\\Local\\ab-ovo',
  );
  assert.equal(stateDirectory({}, 'win32', 'C:\\Users\\r'), 'C:\\Users\\r\\AppData\\Local\\ab-ovo');
  // Set, it wins on every platform: a person who says where their state lives is believed.
  assert.equal(stateDirectory({ XDG_STATE_HOME: '/srv/state' }, 'darwin', '/Users/r'), '/srv/state/ab-ovo');
});

test('the home directory is asked for only when nothing names the state directory, and none found is held in memory', async () => {
  // #171's review: `os.homedir()` throws when there is no home directory, and it used to be
  // asked first, so XDG_STATE_HOME — set to say exactly where — could not help.
  await withNoHome(() => {
    assert.equal(stateDirectory({ XDG_STATE_HOME: '/srv/state' }, 'linux'), '/srv/state/ab-ovo');
    assert.equal(stateDirectory({ XDG_STATE_HOME: '/srv/state' }, 'darwin'), '/srv/state/ab-ovo');
    assert.equal(stateDirectory({ LOCALAPPDATA: 'C:\\Users\\r\\AppData\\Local' }, 'win32'), 'C:\\Users\\r\\AppData\\Local\\ab-ovo');
    for (const platform of ['linux', 'darwin', 'win32'] as const) {
      assert.throws(() => stateDirectory({ XDG_STATE_HOME: 'relative' }, platform), { message: NO_HOME }, platform);
    }

    // Nowhere to look: an id all the same, held in memory, with why and no file.
    const held = heldReaderId(ORIGIN, {}, 'linux');
    assert.deepEqual([held.kept, held.file, held.why], [false, undefined, NO_HOME]);
    assert.match(held.id, GUID);

    // Named: kept there, the home directory never asked for.
    const state = scratch();
    const kept = heldReaderId(ORIGIN, { XDG_STATE_HOME: state }, 'linux');
    assert.deepEqual([kept.kept, kept.file], [true, join(state, 'ab-ovo', READER_IDS_FILE)]);
    assert.equal(idIn(readFileSync(kept.file!, 'utf8'), ORIGIN), kept.id);
  });
});

test('an id is keyed by the origin of AB_OVO_API_URL, and an address with no http origin keys none', () => {
  assert.equal(originOf('https://api.example:8443/prefix/'), 'https://api.example:8443');
  assert.equal(originOf('http://127.0.0.1:8180'), 'http://127.0.0.1:8180');
  assert.equal(originOf('https://API.example'), 'https://api.example');
  for (const address of ['not-a-url', 'localhost:8180', 'ftp://api.example']) assert.equal(originOf(address), undefined, address);
});

test('the id is minted once, from a CSPRNG, and every later look finds the same one', () => {
  const directory = join(scratch(), 'ab-ovo');
  const first = readerIdFor(ORIGIN, directory);
  assert.equal(first.kept, true);
  assert.match(first.id, GUID, 'not a version-4 GUID, which is what randomUUID mints');
  assert.equal(first.file, join(directory, READER_IDS_FILE));

  const again = readerIdFor(ORIGIN, directory);
  assert.deepEqual(again, first);

  const text = readFileSync(first.file, 'utf8');
  assert.match(text, /^# ab-ovo MCP server/m, 'the file says what it is');
  assert.equal(text.split('\n').filter((line) => line.split(' ')[0] === ORIGIN).length, 1);
});

test('the directory and the file are readable by their user alone', () => {
  const directory = join(scratch(), 'ab-ovo');
  const { file } = readerIdFor(ORIGIN, directory);
  assert.equal(statSync(directory).mode & 0o777, 0o700);
  assert.equal(statSync(file).mode & 0o777, 0o600);

  // A file or a directory someone widened is narrowed again the next time the file is read.
  chmodSync(file, 0o644);
  chmodSync(directory, 0o755);
  readerIdFor(ORIGIN, directory);
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(statSync(directory).mode & 0o777, 0o700);
});

test('one id per API origin, each on its own line, and an origin never answered with another\'s', () => {
  const directory = join(scratch(), 'ab-ovo');
  const here = readerIdFor(ORIGIN, directory);
  const there = readerIdFor('http://127.0.0.1:8180', directory);
  assert.notEqual(here.id, there.id);
  assert.equal(readerIdFor(ORIGIN, directory).id, here.id);
  assert.equal(readerIdFor('http://127.0.0.1:8180', directory).id, there.id);
  assert.equal(readerIdFor('https://api.example:8443', directory).id === here.id, false, 'a port is another origin');
});

test('the first line for an origin wins, and nothing but an origin and a GUID is read as one', () => {
  const winner = '11111111-2222-4333-8444-555555555555';
  const loser = '99999999-8888-4777-8666-555555555555';
  const text = [
    '# a comment',
    `${ORIGIN} not-a-guid`,
    `${ORIGIN}  ${loser}`,
    `${ORIGIN} ${winner}`,
    `${ORIGIN} ${loser}`,
    '',
  ].join('\n');
  assert.equal(idIn(text, ORIGIN), winner);
  assert.equal(idIn(text, 'https://elsewhere.example'), undefined);

  // A line cut off by a crash is not the end of the next one: the next is written on its own line.
  const directory = join(scratch(), 'ab-ovo');
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, READER_IDS_FILE), `${ORIGIN} 1234`);
  const minted = readerIdFor(ORIGIN, directory);
  assert.equal(minted.kept, true);
  assert.equal(idIn(readFileSync(minted.file, 'utf8'), ORIGIN), minted.id);
});

test('a file that cannot be kept is said, and an id is held in memory rather than the call failing', () => {
  // A directory that cannot be made: a file stands where it would go.
  const root = scratch();
  writeFileSync(join(root, 'in-the-way'), '');
  const held = readerIdFor(ORIGIN, join(root, 'in-the-way', 'ab-ovo'));
  assert.equal(held.kept, false);
  assert.match(held.id, GUID);
  assert.ok(held.why && held.why.length > 0, 'why it could not be kept is for stderr');
  assert.ok(!held.why.includes(held.id), 'the reason names the file, never the id');
});

test('a process that loses the race reads the file again and adopts the winner\'s id', () => {
  // ADR-0066 §2. Another process's line lands between this one's look and its append — the
  // window a race lives in — and this one takes the first line for its origin, the winner's,
  // rather than its own; so does every later look.
  const directory = join(scratch(), 'ab-ovo');
  const winner = '11111111-2222-4333-8444-555555555555';
  const held = readerIdFor(ORIGIN, directory, () =>
    appendFileSync(join(directory, READER_IDS_FILE), `${ORIGIN} ${winner}\n`),
  );
  assert.deepEqual([held.id, held.kept], [winner, true]);

  // The origin field compared whole, as `idIn` does: a prefix would also count another origin's line.
  const lines = readFileSync(held.file, 'utf8').split('\n').filter((line) => line.split(' ')[0] === ORIGIN);
  assert.equal(lines.length, 2, "the loser's line was not appended, so this lost no race");
  assert.equal(readerIdFor(ORIGIN, directory).id, winner);
});

test('processes that start together for the first time end on one id', async () => {
  // ADR-0066 §2: "a process that loses the race reads the file again". Several processes, as
  // several hosts started at once, each find no file, each mint and append, and each must
  // settle on the same line — the first.
  const directory = join(scratch(), 'ab-ovo');
  const module = new URL('./identity.ts', import.meta.url).href;
  const script =
    `import { readerIdFor } from ${JSON.stringify(module)};` +
    `const held = readerIdFor(${JSON.stringify(ORIGIN)}, ${JSON.stringify(directory)});` +
    'process.stdout.write(held.kept ? held.id : "not kept");';

  const ids = await Promise.all(
    Array.from(
      { length: 6 },
      () =>
        new Promise<string>((resolve, reject) => {
          const child = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore', 'pipe', 'pipe'] });
          let out = '';
          let err = '';
          child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()));
          child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString()));
          child.on('error', reject);
          child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`exit ${code}: ${err}`))));
        }),
    ),
  );

  assert.equal(new Set(ids).size, 1, `the processes ended on ${new Set(ids).size} ids: ${ids.join(', ')}`);
  assert.match(ids[0]!, GUID);
  assert.equal(idIn(readFileSync(join(directory, READER_IDS_FILE), 'utf8'), ORIGIN), ids[0]);
});
