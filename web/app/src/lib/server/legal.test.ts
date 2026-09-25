/**
 * The legal documents, at the layer with the logic.
 *
 * P13 / TESTING-STRATEGY.md §3 — what is worth asserting is a translation table (a host's
 * answer into published / unpublished / unavailable) and the rules that decide what may
 * become a path on another host. The acceptance suite follows the links against a fixture
 * host that publishes both documents (`specs/registration.spec.ts`); the paths it cannot
 * reach — no host configured, a host that answers HTML, a host that is down, a version that
 * is not a file name — are here.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import {
  classifyLegalResponse,
  isLegalDocumentId,
  isPublishableVersion,
  legalDocument,
  legalPath,
  legalSourceBase,
  offersRegistrationForm,
  paragraphs,
  type FetchLike,
  type LegalDocumentOutcome,
} from './legal.ts';

const ORIGINAL = process.env.AB_OVO_LEGAL_URL;

beforeEach(() => {
  delete process.env.AB_OVO_LEGAL_URL;
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.AB_OVO_LEGAL_URL;
  else process.env.AB_OVO_LEGAL_URL = ORIGINAL;
});

/** A fetch that records what it was asked for and answers with one canned response. */
function recording(answer: () => Response | Promise<Response>): {
  fetchImpl: FetchLike;
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    fetchImpl: async (input) => {
      calls.push(input);
      return answer();
    },
  };
}

const text = (body: string, type = 'text/plain; charset=utf-8', status = 200): Response =>
  new Response(body, { status, headers: { 'content-type': type } });

test('the two documents are the only ids, and the id is case-sensitive', () => {
  assert.equal(isLegalDocumentId('terms'), true);
  assert.equal(isLegalDocumentId('privacy'), true);
  assert.equal(isLegalDocumentId('cookies'), false);
  assert.equal(isLegalDocumentId('Terms'), false);
  assert.equal(isLegalDocumentId(''), false);
});

/**
 * THE VERSION BECOMES A PATH ON ANOTHER HOST, and it arrives from the address bar as well as
 * from the identity service. Nothing that could climb out of the document directory, or
 * split into two segments, may pass.
 */
test('a version that names a file passes, and one that could leave the directory does not', () => {
  for (const good of ['2026-01-01', 'v1.2', '3', 'terms_2026.1']) {
    assert.equal(isPublishableVersion(good), true, good);
  }
  for (const bad of ['', '.', '..', '../x', 'a/b', 'a\\b', '.hidden', '-1', 'a b', '%2e%2e', 'x'.repeat(65)]) {
    assert.equal(isPublishableVersion(bad), false, JSON.stringify(bad));
  }
});

test('the link a page offers is on this origin and carries the version', () => {
  assert.equal(legalPath('terms', '2026-01-01'), '/legal/terms/2026-01-01');
  assert.equal(legalPath('privacy', 'v1.2'), '/legal/privacy/v1.2');
});

test('the host is an absolute http(s) address or it is not configured', () => {
  assert.equal(legalSourceBase(), null);

  process.env.AB_OVO_LEGAL_URL = '   ';
  assert.equal(legalSourceBase(), null);

  process.env.AB_OVO_LEGAL_URL = 'legal.example.test/docs';
  assert.equal(legalSourceBase(), null, 'no scheme is not an address');

  process.env.AB_OVO_LEGAL_URL = 'file:///etc/legal';
  assert.equal(legalSourceBase(), null, 'only http and https are hosts');

  process.env.AB_OVO_LEGAL_URL = ' https://legal.example.test/docs/ ';
  assert.equal(legalSourceBase(), 'https://legal.example.test/docs');
});

test('a plain-text 200 with something in it is the document', () => {
  assert.deepEqual(classifyLegalResponse(200, 'text/plain; charset=utf-8', 'Terms.\n'), {
    kind: 'published',
    text: 'Terms.\n',
  });
  // The type is compared without its parameters and without regard to case.
  assert.equal(classifyLegalResponse(200, 'Text/Plain', 'x').kind, 'published');
});

test('a byte-order mark is stripped, and an empty file is not a document', () => {
  assert.deepEqual(classifyLegalResponse(200, 'text/plain', '﻿Terms.'), {
    kind: 'published',
    text: 'Terms.',
  });
  assert.equal(classifyLegalResponse(200, 'text/plain', '  \n\t\n').kind, 'unpublished');
});

/**
 * THE CASE THE CONTENT TYPE EXISTS FOR. A static host with a fallback page answers every
 * missing path 200 with HTML. Rendered as a document, that page would be what a reader is
 * asked to accept.
 */
test('a 200 in any type but text/plain is a host that does not have the file', () => {
  assert.equal(classifyLegalResponse(200, 'text/html; charset=utf-8', '<!doctype html>').kind, 'unpublished');
  assert.equal(classifyLegalResponse(200, 'application/json', '{}').kind, 'unpublished');
  assert.equal(classifyLegalResponse(200, null, 'Terms.').kind, 'unpublished');
});

test('404 and 410 are unpublished; every other status is the host failing, not the file missing', () => {
  assert.equal(classifyLegalResponse(404, 'text/html', '').kind, 'unpublished');
  assert.equal(classifyLegalResponse(410, null, '').kind, 'unpublished');
  for (const status of [301, 401, 403, 500, 502, 503]) {
    assert.equal(classifyLegalResponse(status, 'text/plain', '').kind, 'unavailable', String(status));
  }
});

test('with no host configured nothing is fetched and the document is unpublished', async () => {
  const host = recording(() => text('never read'));
  assert.deepEqual(await legalDocument('terms', '2026-01-01', host.fetchImpl), {
    kind: 'unpublished',
  });
  assert.deepEqual(host.calls, []);
});

test('a version that cannot name a file is never sent to the host', async () => {
  process.env.AB_OVO_LEGAL_URL = 'https://legal.example.test/docs';
  const host = recording(() => text('never read'));
  assert.deepEqual(await legalDocument('terms', '../secrets', host.fetchImpl), {
    kind: 'unpublished',
  });
  assert.deepEqual(host.calls, []);
});

test('the document is read from <host>/<document>/<version>.txt', async () => {
  process.env.AB_OVO_LEGAL_URL = 'https://legal.example.test/docs/';
  const host = recording(() => text('Privacy.'));
  assert.deepEqual(await legalDocument('privacy', '2026-01-01', host.fetchImpl), {
    kind: 'published',
    text: 'Privacy.',
  });
  assert.deepEqual(host.calls, ['https://legal.example.test/docs/privacy/2026-01-01.txt']);
});

test('an answer that is not the document has its body cancelled, not left open', async () => {
  process.env.AB_OVO_LEGAL_URL = 'https://legal.example.test';
  const answer = text('<!doctype html><p>Not here</p>', 'text/html', 404);
  const host = recording(() => answer);
  assert.deepEqual(await legalDocument('terms', '2026-01-01', host.fetchImpl), {
    kind: 'unpublished',
  });
  assert.equal(answer.bodyUsed, true, 'the 404 body was released');
});

test('a host that cannot be reached is unavailable, and says which host', async () => {
  process.env.AB_OVO_LEGAL_URL = 'https://legal.example.test';
  const host = recording(() => {
    throw new TypeError('fetch failed');
  });
  const outcome = await legalDocument('terms', '2026-01-01', host.fetchImpl);
  assert.equal(outcome.kind, 'unavailable');
  assert.match(outcome.kind === 'unavailable' ? outcome.reason : '', /legal\.example\.test.*fetch failed/);
});

/**
 * #141 — THE FORM IS WITHDRAWN WHEN THE DOCUMENTS CANNOT BE SHOWN, and that is the state
 * the AppHost and `flyio/web.fly.toml` are in today, with no `AB_OVO_LEGAL_URL`. The
 * acceptance suite never reaches it (see `offersRegistrationForm`), so this is the test
 * that goes red if the checkbox is offered again without a document behind it.
 */
const PUBLISHED: LegalDocumentOutcome = { kind: 'published', text: 'Terms.' };
const UNPUBLISHED: LegalDocumentOutcome = { kind: 'unpublished' };
const UNAVAILABLE: LegalDocumentOutcome = { kind: 'unavailable', reason: 'down' };
const READY = {
  identityConfigured: true,
  versionsKnown: true,
  answered: false,
  documents: [PUBLISHED, PUBLISHED],
} as const;

test('the form is offered when identity, versions and both documents are all there', () => {
  assert.equal(offersRegistrationForm(READY), true);
});

test('a deployment with no document host withdraws the form, end to end', async () => {
  // What `/register` computes today under the AppHost: the variable unset, both documents
  // asked for, neither published.
  const documents = await Promise.all([
    legalDocument('terms', '2026-01-01', recording(() => text('never read')).fetchImpl),
    legalDocument('privacy', '2026-01-01', recording(() => text('never read')).fetchImpl),
  ]);
  assert.equal(offersRegistrationForm({ ...READY, documents }), false);
});

test('one document missing or unreadable is enough to withdraw the form', () => {
  for (const documents of [
    [PUBLISHED, UNPUBLISHED],
    [UNPUBLISHED, PUBLISHED],
    [PUBLISHED, UNAVAILABLE],
    [UNAVAILABLE, UNAVAILABLE],
  ]) {
    assert.equal(offersRegistrationForm({ ...READY, documents }), false, JSON.stringify(documents));
  }
});

test('documents not asked for, or none at all, are not documents published', () => {
  assert.equal(offersRegistrationForm({ ...READY, documents: null }), false);
  assert.equal(offersRegistrationForm({ ...READY, documents: [] }), false);
});

test('the earlier reasons still withdraw the form with both documents published', () => {
  assert.equal(offersRegistrationForm({ ...READY, identityConfigured: false }), false);
  assert.equal(offersRegistrationForm({ ...READY, versionsKnown: false }), false);
  assert.equal(offersRegistrationForm({ ...READY, answered: true }), false);
});

test('paragraphs split on blank lines and keep a paragraph’s own line breaks', () => {
  assert.deepEqual(paragraphs('Title\r\n\r\nFirst line\nsecond line\n\n\n  \nLast.\n'), [
    'Title',
    'First line\nsecond line',
    'Last.',
  ]);
  assert.deepEqual(paragraphs('\n\n  \n'), []);
});
