/**
 * AN ANONYMOUS READER'S ID, MINTED ONCE AND KEPT IN ONE FILE OF THE USER'S — ADR-0066 §2.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ADR-0061'S SHAPE, UNCHANGED, HELD IN A FILE WHERE THE BROWSER HOLDS A COOKIE.
 *
 * The id is a GUID from a CSPRNG (`crypto.randomUUID`), sent as `X-Ab-Ovo-Reader-Id` and
 * filed by `AbOvo.Api` as `anon:<id>`. It is not a token: nothing is signed, and `AbOvo.Api`
 * mints nothing (P5). Possession is the only credential, so the id is one — it never appears
 * in a tool result or on stderr, and it is sent to the origin it was minted for and to
 * nothing else (`api.ts` does not follow a redirect for that reason).
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * WHERE. The user's own state directory — `$XDG_STATE_HOME/ab-ovo`, else
 * `~/.local/state/ab-ovo`, and the platform's equivalent where there is no XDG convention:
 * `~/Library/Application Support/ab-ovo` on macOS, `%LOCALAPPDATA%\ab-ovo` on Windows. Not
 * the working directory, which the host chooses (`web/mcp/README.md`), and not the package's
 * directory, which a package runner's cache may throw away. The directory is made readable by
 * its user alone (0700) and the file likewise (0600), and both are narrowed again whenever the
 * file is read; on Windows the per-user profile's own permissions are what keep it the user's.
 *
 * The home directory is asked for only when nothing names the directory, because there may be
 * none: `os.homedir()` throws when HOME is unset and the user has no entry in the system's user
 * database, a container run under a UID of its own being the usual case. Asked first, it made
 * XDG_STATE_HOME, the variable that says where, unable to help (#171's review).
 *
 * WHAT. One line per API origin — the origin of `AB_OVO_API_URL`, a space, and the id minted
 * for it. Anyone may run an instance (ADR-0033), so one id sent everywhere would let any
 * instance's operator replay it against another; an id goes only to the origin on its line.
 * Every later process run by that user on that machine reads the same file, so every host
 * there reads as one reader of each instance.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * CREATED ATOMICALLY, AND THE FIRST LINE FOR AN ORIGIN WINS.
 *
 * The file is created by an exclusive create (`O_EXCL`), with a comment that says what it is,
 * and an id is added by appending one line in one `write` to a file opened for appending: the
 * system writes an appended line whole and after every line before it, so two processes cannot
 * interleave their lines or write one over the other. Then the process reads the file again
 * and takes the FIRST line for its origin, which may be another process's. So two hosts that
 * start together for the first time still end on one id — the process that loses the race reads
 * the file again and adopts the winner's — and two processes adding two different origins lose
 * neither, which a file rewritten whole and renamed into place could not promise without a lock.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * A PLACE THAT CANNOT BE KEPT IS SAID OUT LOUD (P8). When no state directory can be found, or
 * the directory or the file cannot be made, read or written, an id is minted all the same and
 * held in this process's memory alone: the reader reads on, the API keeps the place under that
 * id, and a restart loses it. The results say so to the reader and stderr says why to whoever
 * runs the server — the file and the error, never the id (`server.ts`). `heldReaderId`, which
 * `server.ts` calls, does not throw.
 */
import { randomUUID } from 'node:crypto';
import { chmodSync, closeSync, constants, mkdirSync, openSync, readFileSync, writeSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, posix, win32 } from 'node:path';

/** An id and whether it is kept: `kept` is false when it lives in this process's memory alone. */
export interface HeldId {
  readonly id: string;
  readonly kept: boolean;
}

/** Where the id was looked for, and — when it could not be kept there — why, for stderr. */
export interface HeldIn extends HeldId {
  /** The file it is kept in, or was to be; absent when no state directory was found to look in. */
  readonly file?: string;
  readonly why?: string;
}

/** The file's name in the state directory. */
export const READER_IDS_FILE = 'reader-ids';

/**
 * What the file says about itself, written once, by the exclusive create. A person who finds it
 * learns what it holds and that it is not to be passed round: nothing here reads the comment.
 */
const HEADER =
  '# ab-ovo MCP server: the anonymous reader id this user reads under at each ab-ovo API, one\n' +
  '# line per API origin. An id is the only credential its reader\'s place has (ADR-0061): keep\n' +
  '# this file to yourself, and never send an id to any address but the origin beside it.\n';

/** A line of the file: an origin, one space, a GUID. Anything else is not read as an id. */
const LINE = /^(\S+) ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

/**
 * The directory the file lives in, for this environment. `XDG_STATE_HOME` wins wherever it is
 * set to an absolute path — the XDG specification ignores a relative one, and so does this —
 * and the platform's own place for an application's state is used otherwise.
 *
 * `home` is asked for last, and only on the branches that need it: `os.homedir()` throws when
 * there is no home directory (the header's WHERE), and that must not stop a directory the
 * environment names. So this throws only when nothing names one and there is no home to find
 * one in — which `heldReaderId` answers with an id held in memory.
 */
export function stateDirectory(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
  home?: string,
): string {
  const path = platform === 'win32' ? win32 : posix;
  const xdg = env['XDG_STATE_HOME'];
  if (xdg && path.isAbsolute(xdg)) return path.join(xdg, 'ab-ovo');
  if (platform === 'win32') {
    const local = env['LOCALAPPDATA'];
    if (local && path.isAbsolute(local)) return path.join(local, 'ab-ovo');
  }
  const user = home ?? homedir();
  if (platform === 'win32') return path.join(user, 'AppData', 'Local', 'ab-ovo');
  if (platform === 'darwin') return path.join(user, 'Library', 'Application Support', 'ab-ovo');
  return path.join(user, '.local', 'state', 'ab-ovo');
}

/** The origin an id is keyed by and sent to, or `undefined` for an address that is not http or https. */
export function originOf(address: string): string | undefined {
  const url = URL.parse(address);
  return url && (url.protocol === 'http:' || url.protocol === 'https:') ? url.origin : undefined;
}

/** The id the file's text holds for an origin: the FIRST line naming it, so every process agrees. */
export function idIn(text: string, origin: string): string | undefined {
  for (const line of text.split('\n')) {
    const match = LINE.exec(line.trim());
    if (match && match[1] === origin) return match[2];
  }
  return undefined;
}

/** The file's text, or nothing when there is no file yet. */
function readIfThere(file: string): string {
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw error;
  }
}

/** Readable by its user alone, as far as the platform lets a file say so. Best effort: a file that is kept wider still works. */
function tighten(path: string, mode: number): void {
  try {
    chmodSync(path, mode);
  } catch {
    // A filesystem that has no modes to set (or will not let them be set) keeps what it has.
  }
}

/** The error, in words stderr can carry: its code and message, which name the file and never an id. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The anonymous reader id for an API origin, in the state directory this environment names:
 * `readerIdFor` there — or, when no state directory can be found, one held in memory alone,
 * with why. It does not throw, so the P8 fallback runs whatever fails (`server.ts` says it).
 */
export function heldReaderId(
  origin: string,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
  home?: string,
): HeldIn {
  let directory: string;
  try {
    directory = stateDirectory(env, platform, home);
  } catch (error) {
    return { id: randomUUID(), kept: false, why: describe(error) };
  }
  return readerIdFor(origin, directory);
}

/**
 * The anonymous reader id for an API origin: the one the file already holds, else one minted
 * now and appended, else — when the file cannot be kept — one held in memory alone.
 */
export function readerIdFor(
  origin: string,
  directory: string,
  /**
   * Called between looking for a line and appending one — the moment another process's line
   * can land. A test puts one there to lose the race on purpose; nothing else passes it.
   */
  beforeAppend?: () => void,
): HeldIn & { readonly file: string } {
  const file = join(directory, READER_IDS_FILE);
  try {
    const held = idIn(readIfThere(file), origin);
    if (held !== undefined) {
      tighten(directory, 0o700);
      tighten(file, 0o600);
      return { id: held, kept: true, file };
    }

    mkdirSync(directory, { recursive: true, mode: 0o700 });
    tighten(directory, 0o700);

    // The exclusive create, which one process wins; the others find the file and use it.
    try {
      const created = openSync(file, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_APPEND, 0o600);
      try {
        writeSync(created, HEADER);
      } finally {
        closeSync(created);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    tighten(file, 0o600);

    // One line, in one write, to a file opened for appending. A file whose last line was cut
    // off (a crash half-way through a write) is given a line break first, so the new line is
    // not read as the end of the broken one.
    beforeAppend?.();
    const before = readIfThere(file);
    const line = `${before === '' || before.endsWith('\n') ? '' : '\n'}${origin} ${randomUUID()}\n`;
    const appending = openSync(file, constants.O_WRONLY | constants.O_APPEND);
    try {
      writeSync(appending, line);
    } finally {
      closeSync(appending);
    }

    // Read again, and take the first line for this origin: the winner's, whoever that was.
    const settled = idIn(readFileSync(file, 'utf8'), origin);
    if (settled === undefined) throw new Error(`${file} does not hold the line just appended to it`);
    return { id: settled, kept: true, file };
  } catch (error) {
    return { id: randomUUID(), kept: false, file, why: describe(error) };
  }
}
