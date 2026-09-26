/**
 * NO HOME DIRECTORY, AS THE SYSTEM ANSWERS IT — for the tests of #171's review.
 *
 * `os.homedir()` reads HOME, and when HOME is unset it asks the system's user database. A user
 * with no entry there — a container run under a UID of its own — has no home directory, and
 * Node throws `ERR_SYSTEM_ERROR`. `withNoHome` runs its callback with `homedir` answering that
 * way, and puts the real one back after.
 *
 * A builtin module's named exports follow its CommonJS exports once `syncBuiltinESMExports()`
 * is called, so `identity.ts`'s own `import { homedir } from 'node:os'` sees the stub.
 * `node --test` runs each test file in a process of its own, so no other file sees it.
 */
import { createRequire, syncBuiltinESMExports } from 'node:module';

/** The words Node's own error carries, which stderr is expected to pass on. */
export const NO_HOME = 'A system error occurred: uv_os_homedir returned ENOENT (no such file or directory)';

export async function withNoHome<T>(run: () => T | Promise<T>): Promise<T> {
  const os = createRequire(import.meta.url)('node:os') as { homedir: () => string };
  const real = os.homedir;
  os.homedir = () => {
    throw Object.assign(new Error(NO_HOME), { code: 'ERR_SYSTEM_ERROR' });
  };
  syncBuiltinESMExports();
  try {
    return await run();
  } finally {
    os.homedir = real;
    syncBuiltinESMExports();
  }
}
