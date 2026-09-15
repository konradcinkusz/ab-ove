/**
 * Readers for the files that configure a DEPLOYMENT, so a test can hold two of them up
 * against each other.
 *
 * Nothing in the running application imports this module, and that is deliberate rather
 * than an oversight: the application reads its configuration from the environment (P5),
 * never from a `.toml` on disk. What needs these readers is the class of test that checks
 * an agreement BETWEEN files — the one thing no layer can hold, because the coupling is
 * not inside either end of it.
 *
 * It is a module rather than a copy in each test for the reason this repository keeps
 * finding the hard way: two parsers of the same format are two parsers that can drift, and
 * the looser of them defines what is actually checked. The comment on `settingIn` below
 * was paid for by a measurement, and it should exist once.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Walk up for the file that marks the repository root, from wherever the runner started. */
export function repositoryRoot(): string {
  let directory = dirname(fileURLToPath(import.meta.url));
  for (let hop = 0; hop < 12; hop++) {
    try {
      readFileSync(join(directory, 'AbOvo.sln'));
      return directory;
    } catch {
      const parent = dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
  }
  throw new Error('could not find AbOvo.sln above this test');
}

/** Read a repository file as text, by its path from the root. */
export function repositoryFile(relative: string): string {
  return readFileSync(join(repositoryRoot(), relative), 'utf8');
}

/**
 * The value of one `key = "value"` in a fly config, ignoring comments.
 *
 * **NOT A GREP, AND MEASURED RATHER THAN ASSUMED — the first draft of this comment gave one
 * reason for two mechanisms and was wrong about which did what.** `web.fly.toml` explains the
 * coupling in prose above the setting, so `AB_OVO_CLIENT_IP_HEADER` appears three times in
 * that file and the first two are commentary. Run on it, `grep -m1` returns
 * `# AB_OVO_CLIENT_IP_HEADER MUST EQUAL Network__ClientIpHeader IN` — the documentation,
 * reported as the configuration, and it would go on doing so after somebody changed the value
 * it was meant to be watching.
 *
 * That is what the ANCHORS defeat: `^\s*KEY\s*=` cannot match a line whose key sits behind a
 * `#`. Stripping the comment is a second and narrower thing, and the claim that it was doing
 * the same job did not survive being run — with the stripping removed, both real files still
 * parse to `Fly-Client-IP`. What it actually buys is a TRAILING comment: `KEY = "v"  # note`
 * fails the closing `\s*$` without it and the setting reads as absent, which is a false alarm
 * rather than a false pass. The fixture in `fly-config-agrees.test.ts` carries exactly that
 * line, so the stripping is held by a test rather than by this paragraph.
 */
export function settingIn(file: string, key: string): string | null {
  for (const line of file.split('\n')) {
    const code = line.split('#')[0] ?? '';
    const match = new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"\\s*$`).exec(code);
    if (match) return match[1] ?? null;
  }
  return null;
}

/**
 * The value of one `const string Name = "value";` in a C# source file.
 *
 * The same shape of reader for the other language this agreement spans, and it carries the
 * same hazard: `AbOvoIdentity`'s constants are DESCRIBED in comments elsewhere in AppHost.cs
 * as well as declared, so an unanchored search finds the prose. `^\s*internal const string`
 * cannot match a line behind a `//`, and the trailing `;` is required so a mention inside a
 * longer expression is not mistaken for the declaration.
 *
 * Deliberately narrow: it reads `const string`, not any field, because widening it to cover
 * shapes this repository does not use would be untested regex on the strength of a guess.
 */
export function csharpConstant(file: string, name: string): string | null {
  for (const line of file.split('\n')) {
    const code = line.split('//')[0] ?? '';
    const match = new RegExp(
      `^\\s*(?:internal|public|private|protected)?\\s*const\\s+string\\s+${name}\\s*=\\s*"([^"]*)"\\s*;`,
    ).exec(code);
    if (match) return match[1] ?? null;
  }
  return null;
}
