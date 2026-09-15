import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { clientIpHeader } from './client-ip.ts';
import { repositoryFile, settingIn } from './deployment-config.ts';

/**
 * The two ends of the client-IP forwarding must name the SAME HEADER, and nothing about a
 * deployment reports it when they do not.
 *
 * `web.fly.toml` tells this app which header to read and send; `authservice.fly.toml` tells
 * authservice which one to partition its rate limit on. Disagree, and each side is
 * individually correct: this one forwards a header nobody reads, that one reads a header
 * nothing sends, and the shared bucket #31 exists to remove stays exactly where it was. Both
 * files look configured. The only observable is a rate limit that is still wrong, on a
 * deployment, under load — which is the last place to find out.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHY A TEST AND NOT A COMMENT. TESTING-STRATEGY.md §3 puts a test at the layer that holds
 * the logic, and the logic here is a coupling between two files in neither layer. It is
 * cheap — two reads and a string compare — and it is the only thing in the repository that
 * can see the pair at once.
 *
 * It reads the files rather than a fixture on purpose: a fixture would agree with itself
 * forever while the deployment drifted.
 *
 * The readers live in `deployment-config.ts`, shared with the identity agreement next door,
 * because two parsers of one format are two parsers that can drift.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */

const web = repositoryFile('flyio/web.fly.toml');
const authservice = repositoryFile('flyio/authservice.fly.toml');

/*
 * The instrument first, on a fixture whose answer is known before it is asked — the estate's
 * standing rule, and it has caught a confident wrong answer more than once. Two of the three
 * cases exist because the real files contain exactly that shape.
 */
test('the parser reads configuration and not the prose about it', () => {
  const fixture = [
    '[env]',
    '  # Alpha MUST EQUAL Beta, and this line is not the setting.',
    '  # Alpha = "wrong"',
    '  Alpha = "right"      # trailing note',
    '  Beta  = "also-right"',
  ].join('\n');

  assert.equal(settingIn(fixture, 'Alpha'), 'right');
  assert.equal(settingIn(fixture, 'Beta'), 'also-right');
  assert.equal(settingIn(fixture, 'Gamma'), null);
});

test('both fly configs name the same client-IP header', () => {
  const sent = settingIn(web, 'AB_OVO_CLIENT_IP_HEADER');
  const read = settingIn(authservice, 'Network__ClientIpHeader');

  // Each half separately, so a failure says WHICH file stopped saying it rather than only
  // that two strings differ.
  assert.equal(typeof sent, 'string', 'flyio/web.fly.toml no longer sets AB_OVO_CLIENT_IP_HEADER');
  assert.equal(
    typeof read,
    'string',
    'flyio/authservice.fly.toml no longer sets Network__ClientIpHeader',
  );
  assert.equal(sent, read);
});

test('the deployed header is the one the code falls back to, so an omission still agrees', () => {
  // Not a tautology: `clientIpHeader()` carries its own default, and a deployment that drops
  // the variable gets that default rather than nothing. If the two ever part company, an
  // omission on one side stops being harmless and starts being a silent shared bucket.
  const previous = process.env.AB_OVO_CLIENT_IP_HEADER;
  delete process.env.AB_OVO_CLIENT_IP_HEADER;
  try {
    assert.equal(clientIpHeader(), settingIn(authservice, 'Network__ClientIpHeader'));
  } finally {
    if (previous === undefined) delete process.env.AB_OVO_CLIENT_IP_HEADER;
    else process.env.AB_OVO_CLIENT_IP_HEADER = previous;
  }
});

test('forwarding is switched on deliberately, in the file that knows a proxy is there', () => {
  // The header name alone does nothing: `readerAddress` returns null until the trust flag is
  // set, so a deployment naming a header and omitting the flag is configured and inert. That
  // is the safe direction and it is still not what flyio/web.fly.toml means to say.
  assert.equal(settingIn(web, 'AB_OVO_TRUST_PROXY_CLIENT_IP'), 'true');
});
