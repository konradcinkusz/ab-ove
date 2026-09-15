import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

/**
 * EVERY RELATIVE IMPORT IN THIS APP CARRIES ITS FILE EXTENSION, because the two things that
 * read this source disagree about whether it needs one.
 *
 * Next resolves `./backends` happily. `node --test --experimental-strip-types`, which runs
 * every test in this package, does not — it is plain ESM, where a specifier is a path and
 * `./backends` is a file that does not exist. So an extensionless import is not a style
 * question: it is a module that CANNOT BE UNIT TESTED, and the application builds and runs
 * perfectly the whole time.
 *
 * The failure is delayed and it lands on the wrong person. It is invisible until somebody
 * writes the first test that reaches that module, and then it arrives as
 * `ERR_MODULE_NOT_FOUND` naming a file they did not touch. It has now happened twice:
 * `sign-in.ts` importing `./client-ip` (#31), and `token.ts` importing `./backends` (#43),
 * each found by a new test rather than by a build.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHY A TEST RATHER THAN A LINT RULE. `import/extensions` needs a plugin this package does
 * not carry, and a dependency added to enforce one rule is a dependency to keep current
 * forever. This is a few lines, it runs in the suite that has the problem, and its failure
 * message can say what the fix is.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */

function sourceFiles(root: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(entry)) found.push(path);
  }
  return found;
}

const RELATIVE_IMPORT = /(?:from|import)\s+'(\.\.?\/[^']*)'/g;
const HAS_EXTENSION = /\.(ts|tsx|js|mjs|json|css)$/;

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function extensionlessIn(text: string): string[] {
  return [...text.matchAll(RELATIVE_IMPORT)]
    .map((match) => match[1] as string)
    .filter((specifier) => !HAS_EXTENSION.test(specifier));
}

/*
 * The instrument first, against strings whose answers are known — the estate's standing rule.
 * A scanner whose regex silently matched nothing would report every file clean, which is the
 * same answer a correct one gives on a correct tree.
 */
test('the scanner tells an extensionless import from a complete one', () => {
  // The fixtures are BUILT rather than written out, and that is not a flourish: an import
  // line spelled out in full here IS an extensionless import as far as the scan below is
  // concerned, and the first two drafts failed on their own examples -- once on the
  // fixtures, and once on a comment that quoted the offending line to explain it.
  // Assembling the line from a parameter keeps this file inside the scan rather than exempt
  // from it, and an exemption would leave the one file guaranteed to contain the pattern as
  // the one file nobody checks.
  const line = (specifier: string) => `import { a } from '${specifier}';`;

  assert.deepEqual(extensionlessIn(line('./backends')), ['./backends']);
  assert.deepEqual(extensionlessIn(line('../lib/store')), ['../lib/store']);
  assert.deepEqual(extensionlessIn(line('./backends.ts')), []);
  assert.deepEqual(extensionlessIn(line('./styles.css')), []);
  // A bare package specifier is not relative and is resolved by node_modules, not by path.
  assert.deepEqual(extensionlessIn(line('jose')), []);
});

test('no relative import in the app omits its extension', () => {
  const offenders: string[] = [];

  for (const file of sourceFiles(sourceRoot)) {
    for (const specifier of extensionlessIn(readFileSync(file, 'utf8'))) {
      offenders.push(`${file} imports '${specifier}'`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'add the .ts/.tsx extension - Next resolves these and `node --test` does not, so each ' +
      'one is a module no unit test can reach',
  );
});

/*
 * And the reason the scan above can be trusted to have LOOKED at everything: `grep -rn` skips
 * a file it considers binary, and one committed test really did contain a raw NUL byte (a
 * deliberate `safeRedirectTarget` security assertion, written as the byte rather than as the
 * escape). Every repository-wide grep silently excluded that file — the sweep that found the
 * imports above included — and reported nothing rather than reporting a gap. The escape is
 * equivalent to the byte, so the assertion is unchanged and the file is text.
 */
test('no source file is binary, so a repository-wide search cannot silently skip one', () => {
  const binary = sourceFiles(sourceRoot).filter((file) => readFileSync(file).includes(0x00));

  assert.deepEqual(binary, [], 'write a NUL with a unicode escape rather than as the byte');
});
