/**
 * THE PUBLISHED PACKAGE'S JAVASCRIPT — ADR-0066's Consequences, issue #172, ADR-0070.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHY THERE IS A BUILD AT ALL.
 *
 * A checkout runs `src/*.ts` directly: Node strips the types itself. It will not do that for
 * a file under `node_modules`, which is where an installed package lives, and
 * `@ab-ovo/web-kit`, which the server imports, is a private workspace package that no
 * registry has. So the package carries JavaScript, with the modules of `@ab-ovo/web-kit` it
 * runs beside it, and needs no workspace, no pnpm, no book and no compiler to start.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * NO BUNDLER, AND NO DEPENDENCY ADDED TO BE ONE.
 *
 * The types are stripped by `module.stripTypeScriptTypes`, Node's own stripper: the one that
 * runs every `.ts` file of this package in the unit tier and from a checkout. It replaces each
 * type with whitespace, so a line of `dist/` is the line of `src/` it came from, and a stack
 * trace from a reader's machine names a line of the source. The only other change is to the
 * import specifiers, which TypeScript's own parser finds (a devDependency already): `./api.ts`
 * becomes `./api.js`, and `@ab-ovo/web-kit` a relative path to the copy of it in
 * `dist/web-kit/`. Nothing is minified or joined, so what is published reads as the source
 * does, comments and all. Node marks the stripping API experimental and says its output may
 * change between versions; what is written here is run before it is shipped — by
 * `src/package.test.ts` in the unit tier and by `.github/workflows/mcp-package.yml` from the
 * packed tarball — so a change there is a red build, not a broken package.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * WHAT GOES IN is what `src/server.ts` imports, followed import by import, and nothing else:
 * the modules of `src/` it reaches, the modules of `@ab-ovo/web-kit` those reach, and the JSON
 * those import, which is web-kit's content schemas and the pin (`web/content/book.lock.json`,
 * where `PINS` comes from — the book's revision, never the book). A type-only import is erased
 * by the stripping and followed nowhere, which is why `@ab-ovo/web-kit/wire` does not ship.
 *
 * WHAT IT REFUSES, each with the sentence that says why — so a change that would put one of
 * these into the package fails here, before a tarball exists:
 *
 * - anything under `web/content/` but the pin. The book is CC BY-NC-SA 4.0 and is not
 *   redistributed through npm (ADR-0033, ADR-0066 §4); the compiled bundle lives there;
 * - test code: a `*.test.ts`, `src/testing/`, web-kit's `fixtures/` and `have-bundle.ts`;
 * - a module outside `web/mcp/src`, `web/web-kit/src` and the pin;
 * - a bare import that `dependencies` does not declare, and a `workspace:` dependency, which
 *   no registry can install: a workspace package is carried in `dist/`, and is a
 *   devDependency;
 * - a dynamic `import()`, whose target this cannot follow.
 *
 * It writes `dist/` (emptied first, so nothing stale survives) and `LICENSE`, the repository's
 * own (MIT), which the package carries at its root. Both are gitignored: they are output.
 *
 * Usage: node scripts/build.ts [--out <directory>]   (default: this package's directory)
 * `pnpm pack` runs it first, as `prepack`, so a tarball never carries a `dist/` older than its
 * source.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { builtinModules, stripTypeScriptTypes } from 'node:module';
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import ts from 'typescript';

const PACKAGE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = resolve(PACKAGE, '..');
const REPOSITORY = resolve(WEB, '..');
const SOURCE = join(PACKAGE, 'src');
const MANIFEST = join(PACKAGE, 'package.json');
const ENTRY = join(SOURCE, 'server.ts');
const CONTENT = join(WEB, 'content');
/** The pin: the book's repository and revision, which `PINS` is derived from. Not the book. */
const PIN = join(CONTENT, 'book.lock.json');
const KIT_NAME = '@ab-ovo/web-kit';
/** web-kit's own sources, found the way the server finds them: through the workspace link. */
const KIT = dirname(realpathSync(fileURLToPath(import.meta.resolve(KIT_NAME))));

/** A reason this build will not produce a package, said as the sentence that fixes it. */
export class Refusal extends Error {
  override readonly name = 'Refusal';
}

/** A path as a person reads it in this repository: from its root, with forward slashes. */
const shown = (path: string): string => relative(REPOSITORY, path).split(sep).join('/');

function inside(path: string, directory: string): boolean {
  const between = relative(directory, path);
  return between !== '' && !between.startsWith('..') && !isAbsolute(between);
}

/** `x.ts` becomes `x.js`; JSON keeps its name; nothing else is a module the package carries. */
function emitted(name: string, source: string): string {
  if (name.endsWith('.ts')) return `${name.slice(0, -'.ts'.length)}.js`;
  if (name.endsWith('.json')) return name;
  throw new Refusal(`${shown(source)} is neither TypeScript nor JSON, and the package carries only those.`);
}

/**
 * Where a module of the server's graph goes in the package, relative to its root — or the
 * refusal that says why it may not go in at all. Exported so the rules can be tested without
 * writing a module that breaks them.
 */
export function placeOf(source: string): string {
  if (source === MANIFEST) return 'package.json';
  if (source === PIN) return 'dist/web-kit/book.lock.json';
  if (inside(source, CONTENT)) {
    throw new Refusal(
      `${shown(source)} is under web/content/, and nothing from there but the pin (book.lock.json) ` +
        'enters the package: the book is CC BY-NC-SA 4.0 and is not redistributed through npm ' +
        '(ADR-0033, ADR-0066 §4). The server reads the book from the API.',
    );
  }
  const test = (name: string): boolean => name.endsWith('.test.ts') || name.endsWith('.test.mts');
  if (inside(source, SOURCE)) {
    const name = relative(SOURCE, source).split(sep).join('/');
    if (test(name) || name.startsWith('testing/')) {
      throw new Refusal(`${shown(source)} is test code, and the package carries none: the server's graph reaches it.`);
    }
    return posix.join('dist', emitted(name, source));
  }
  if (inside(source, KIT)) {
    const name = relative(KIT, source).split(sep).join('/');
    if (test(name) || name.startsWith('fixtures/') || name === 'have-bundle.ts') {
      throw new Refusal(
        `${shown(source)} is ${KIT_NAME}'s test code, and the package carries none: the server's graph reaches it.`,
      );
    }
    return posix.join('dist', 'web-kit', emitted(name, source));
  }
  throw new Refusal(
    `${shown(source)} is outside what this package is built from — web/mcp/src, ` +
      `${shown(KIT)} and the pin — so the server's graph must not reach it.`,
  );
}

/** One import or re-export of a module, as the stripped JavaScript spells it. */
interface Specifier {
  readonly text: string;
  /** Where its text starts and ends, inside the quotes. */
  readonly start: number;
  readonly end: number;
}

/** Every static import and re-export of `code`; a dynamic `import()` is refused. */
function specifiersOf(code: string, source: string): Specifier[] {
  const file = ts.createSourceFile(source, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const found: Specifier[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const literal = node.moduleSpecifier;
      found.push({ text: literal.text, start: literal.getStart(file) + 1, end: literal.getEnd() - 1 });
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      throw new Refusal(`${shown(source)} has a dynamic import(), which this build cannot follow into the package.`);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** The package a bare specifier names: `@scope/name` or `name`. */
function packageOf(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? specifier);
}

/**
 * The file a specifier names, when the package carries it — or `undefined` for one it leaves
 * to Node: a builtin, or a dependency the package declares.
 */
function resolved(specifier: string, from: string, dependencies: ReadonlySet<string>): string | undefined {
  if (specifier.startsWith('node:') || builtinModules.includes(specifier)) return undefined;
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    const path = resolve(dirname(from), specifier);
    if (!existsSync(path)) throw new Refusal(`${shown(from)} imports "${specifier}", and there is no such file.`);
    return realpathSync(path);
  }
  const name = packageOf(specifier);
  if (name === KIT_NAME) return realpathSync(fileURLToPath(import.meta.resolve(specifier)));
  if (dependencies.has(name)) return undefined;
  throw new Refusal(
    `${shown(from)} imports "${specifier}", which the package does not declare. Add ${name} to ` +
      `dependencies in web/mcp/package.json, or carry it in dist/ as ${KIT_NAME} is.`,
  );
}

/** A specifier from one place in the package to another. */
function between(from: string, to: string): string {
  const path = posix.relative(posix.dirname(from), to);
  return path.startsWith('.') ? path : `./${path}`;
}

export interface Built {
  /** Each file written, relative to the output directory, with the source it came from. */
  readonly files: readonly { readonly path: string; readonly from: string; readonly bytes: number }[];
}

/**
 * Build the package's JavaScript into `out` (this package's directory unless told otherwise):
 * `dist/`, emptied first, and `LICENSE`. Throws a `Refusal` rather than write a package it
 * should not.
 */
export function build(out: string = PACKAGE): Built {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as { dependencies?: Record<string, string> };
  const declared = Object.entries(manifest.dependencies ?? {});
  for (const [name, range] of declared) {
    if (range.startsWith('workspace:')) {
      throw new Refusal(
        `web/mcp/package.json depends on ${name} as "${range}", which no registry can install. A ` +
          'workspace package is carried in dist/ by this build, and is a devDependency.',
      );
    }
  }
  const dependencies = new Set(declared.map(([name]) => name));

  // Everything is read, placed and rewritten before anything is written, so a refusal leaves
  // whatever `dist/` there was as it was.
  const files = new Map<string, { readonly from: string; readonly bytes: Buffer }>();
  const queue = [realpathSync(ENTRY)];
  const seen = new Set(queue);

  for (let source = queue.shift(); source !== undefined; source = queue.shift()) {
    const place = placeOf(source);
    let bytes: Buffer;
    if (source.endsWith('.json')) {
      bytes = readFileSync(source);
      JSON.parse(bytes.toString('utf8'));
    } else {
      let code = stripTypeScriptTypes(readFileSync(source, 'utf8'));
      // From the last specifier to the first, so each replacement leaves the earlier offsets be.
      for (const specifier of specifiersOf(code, source).reverse()) {
        const target = resolved(specifier.text, source, dependencies);
        if (target === undefined) continue;
        if (!seen.has(target)) {
          seen.add(target);
          queue.push(target);
        }
        code = code.slice(0, specifier.start) + between(place, placeOf(target)) + code.slice(specifier.end);
      }
      bytes = Buffer.from(code, 'utf8');
    }
    // The package's own manifest is imported for its version, and is already at the root.
    if (place === 'package.json') continue;
    const clash = files.get(place);
    if (clash !== undefined) throw new Refusal(`${shown(source)} and ${clash.from} would both be ${place}.`);
    files.set(place, { from: shown(source), bytes });
  }

  rmSync(join(out, 'dist'), { recursive: true, force: true });
  for (const [place, file] of files) {
    const target = join(out, ...place.split('/'));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.bytes);
  }
  const licence = join(REPOSITORY, 'LICENSE');
  copyFileSync(licence, join(out, 'LICENSE'));

  return {
    files: [
      ...[...files].map(([path, file]) => ({ path, from: file.from, bytes: file.bytes.length })),
      { path: 'LICENSE', from: 'LICENSE', bytes: statSync(licence).size },
    ],
  };
}

/*
  Run only when this file is the entry point, so `src/package.test.ts` can import `placeOf` and
  `build` — the comparison `server.ts` makes, on real paths.
*/
const entry = process.argv[1] ? pathToFileURL(realpathSync(process.argv[1])).href : undefined;
if (entry !== undefined && import.meta.url === entry) {
  const at = process.argv.indexOf('--out');
  const out = at === -1 ? PACKAGE : resolve(process.argv[at + 1] ?? '');
  try {
    const built = build(out);
    let total = 0;
    for (const file of built.files) {
      total += file.bytes;
      process.stdout.write(`  ${file.path.padEnd(34)} ${String(file.bytes).padStart(7)} bytes  from ${file.from}\n`);
    }
    process.stdout.write(`build: ${built.files.length} files, ${total} bytes, into ${shown(out) || '.'}\n`);
  } catch (error) {
    process.stderr.write(`build: ${error instanceof Refusal ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
