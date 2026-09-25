/**
 * Where the live source looks for the book — the one thing in content.ts that is not
 * re-exported from `@ab-ovo/web-kit`, and the one the working directory used to decide.
 *
 * `@ab-ovo/web-kit`'s bundle.test.ts asserts the loader's half against the committed
 * fixture, from a scratch directory: a named `web/` is found from anywhere and replaces the
 * guesses. What only this file can say is that THIS package names the right `web/`.
 */
import { strict as assert } from 'node:assert';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { skipWithoutBundle } from '@ab-ovo/web-kit';

import { REPOSITORY_ROOT, WEB_DIR, liveBundles } from './content.ts';

test('the live source names the checkout it is in, not the directory it was started from', () => {
  // The lock file is committed, so this needs no fetch: it is the file whose
  // `contentBundle.destination` the loader resolves against the `web/` it is handed.
  assert.ok(existsSync(join(WEB_DIR, 'content', 'book.lock.json')), `${WEB_DIR} is not web/`);
  assert.ok(existsSync(join(REPOSITORY_ROOT, 'scripts', 'fetch-book-content.sh')), `${REPOSITORY_ROOT} is not the root`);
});

test(
  'the live source finds the book from a working directory outside the repository',
  { skip: skipWithoutBundle() },
  () => {
    // #136, as a host reproduces it: the process is somewhere that is not the checkout,
    // and the book is found anyway. Every cwd-relative guess misses from here.
    const before = process.cwd();
    const override = process.env['AB_OVO_CONTENT_BUNDLE'];
    process.chdir(mkdtempSync(join(tmpdir(), 'ab-ovo-host-')));
    delete process.env['AB_OVO_CONTENT_BUNDLE'];
    try {
      const [bundle] = liveBundles.all();
      assert.ok(bundle, 'no bundle from outside the repository');
      assert.ok(bundle.units.length > 10, 'that is not the book');
    } finally {
      process.chdir(before);
      if (override !== undefined) process.env['AB_OVO_CONTENT_BUNDLE'] = override;
    }
  },
);
