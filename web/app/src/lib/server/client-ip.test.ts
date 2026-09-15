/**
 * The trust gate in front of the forwarded address.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE OFF CASE IS THE LOAD-BEARING ONE.
 *
 * Forwarding a client-supplied header would be *strictly worse* than the shared bucket issue
 * #31 describes: with no proxy in front, every visitor sets their own `Fly-Client-IP` and
 * picks their own partition at authservice — which has no trust flag of its own and buckets
 * on whatever arrives. So the tests that matter most are the ones asserting that nothing is
 * forwarded when this deployment has not said a proxy is there.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * `process.env` is set per test, which is why `client-ip.ts` reads it per call rather than
 * capturing it at import: a module-level constant would be settled by whichever test ran
 * first, and exactly one of the two branches would be assertable.
 */
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { clientIpHeader, readerAddress } from './client-ip.ts';

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
});

const requestWith = (headers: Record<string, string>): Request =>
  new Request('https://ab-ovo.example/api/auth/login', { method: 'POST', headers });

// ── Off by default, and off is a refusal rather than an oversight ───────────────────────

test('nothing is forwarded when no proxy is declared', () => {
  delete process.env.AB_OVO_TRUST_PROXY_CLIENT_IP;

  assert.equal(readerAddress(requestWith({ 'Fly-Client-IP': '203.0.113.7' })), null);
});

test('a client-supplied header is refused, which is the point of the flag', () => {
  // The attack the flag exists for: with nothing in front, a visitor sets this themselves.
  // Forwarding it would give every visitor their own partition at authservice, which is worse
  // than one shared bucket because it removes the limit rather than widening it.
  for (const value of ['false', '', 'TRUE_ISH', '1', 'yes']) {
    process.env.AB_OVO_TRUST_PROXY_CLIENT_IP = value;

    assert.equal(
      readerAddress(requestWith({ 'Fly-Client-IP': '203.0.113.7' })),
      null,
      `the flag set to ${JSON.stringify(value)} forwarded a client-supplied address`,
    );
  }
});

// ── On, behind a proxy that sets the header ─────────────────────────────────────────────

test('the address is forwarded when a proxy is declared', () => {
  process.env.AB_OVO_TRUST_PROXY_CLIENT_IP = 'true';

  assert.equal(readerAddress(requestWith({ 'Fly-Client-IP': '203.0.113.7' })), '203.0.113.7');
});

test('the flag is case-insensitive, like the one ClientIdentity.cs reads', () => {
  for (const value of ['true', 'True', 'TRUE']) {
    process.env.AB_OVO_TRUST_PROXY_CLIENT_IP = value;
    assert.equal(readerAddress(requestWith({ 'Fly-Client-IP': '203.0.113.7' })), '203.0.113.7');
  }
});

test('an absent header forwards nothing, even with the flag on', () => {
  process.env.AB_OVO_TRUST_PROXY_CLIENT_IP = 'true';

  assert.equal(readerAddress(requestWith({})), null);
  assert.equal(readerAddress(requestWith({ 'Fly-Client-IP': '' })), null);
});

test('a list takes its first entry, like both resolvers in this estate', () => {
  process.env.AB_OVO_TRUST_PROXY_CLIENT_IP = 'true';

  assert.equal(
    readerAddress(requestWith({ 'Fly-Client-IP': '203.0.113.7, 198.51.100.4' })),
    '203.0.113.7',
  );
});

test('IPv6 survives, because it is what half the internet arrives as', () => {
  process.env.AB_OVO_TRUST_PROXY_CLIENT_IP = 'true';

  assert.equal(
    readerAddress(requestWith({ 'Fly-Client-IP': '2001:db8::8a2e:370:7334' })),
    '2001:db8::8a2e:370:7334',
  );
});

// ── Validation, for two different reasons ───────────────────────────────────────────────

test('a value that is not an address is not forwarded', () => {
  process.env.AB_OVO_TRUST_PROXY_CLIENT_IP = 'true';

  // Values that are odd rather than illegal, which is the set that can actually arrive: a
  // partition key that is not an address is a bucket nobody can reason about.
  for (const hostile of ['not-an-address', '203.0.113.7 evil', '<script>', 'a'.repeat(200), '..']) {
    assert.equal(
      readerAddress(requestWith({ 'Fly-Client-IP': hostile })),
      null,
      `${JSON.stringify(hostile)} was forwarded`,
    );
  }
});

// ── The header name ─────────────────────────────────────────────────────────────────────

test('the header defaults to the one Fly sets and authservice reads', () => {
  delete process.env.AB_OVO_CLIENT_IP_HEADER;
  assert.equal(clientIpHeader(), 'Fly-Client-IP');
});

test('the header name is configurable, and read under the same name it is sent under', () => {
  process.env.AB_OVO_TRUST_PROXY_CLIENT_IP = 'true';
  process.env.AB_OVO_CLIENT_IP_HEADER = 'X-Real-IP';

  assert.equal(clientIpHeader(), 'X-Real-IP');
  assert.equal(readerAddress(requestWith({ 'X-Real-IP': '203.0.113.7' })), '203.0.113.7');

  // And the default is then NOT read: one name, both ends. Reading a second header would be
  // this side having an opinion the deployment did not give it.
  assert.equal(readerAddress(requestWith({ 'Fly-Client-IP': '203.0.113.7' })), null);
});

test('a CRLF cannot reach this function, and the platform is why', () => {
  // The first draft of `client-ip.ts` justified its regex partly as a defence against header
  // injection. It is not one, and this is the measurement that says so: `Headers` refuses the
  // value before a `Request` can carry it, so the case the regex was partly written for
  // cannot occur through the only door this function has.
  //
  // Kept rather than deleted, because the next person to read that regex will wonder the same
  // thing, and because a rationale that was corrected by a failing test is worth one test.
  assert.throws(
    () => new Request('https://ab-ovo.example/', { headers: { 'Fly-Client-IP': 'a\r\nX: 1' } }),
    /invalid header value/i,
  );
});

/**
 * ADDED BECAUSE A MUTATION SURVIVED. Deleting `.trim()` left all forty-eight tests green, so
 * nothing in the suite was holding it and it read as decoration.
 *
 * Measured, and it is load-bearing on exactly one input shape. `Headers.get` already trims the
 * outer edges of a value — `"  203.0.113.7  "` comes back `"203.0.113.7"` — so for a single
 * address the call really is redundant. RFC 9110 permits optional whitespace around a list
 * delimiter, and for `"a , b"` the split leaves `"203.0.113.7 "`, which fails the address
 * shape. Without the trim this function would answer `null` to a perfectly good address and
 * the reader would fall back into the shared bucket, silently — the exact failure the change
 * exists to remove, reintroduced by a space.
 *
 * It is also where the two resolvers would part company: authservice's `ResolveClientIp` does
 * `value.Split(',')[0].Trim()`, so it would key on the address while this side sent nothing.
 */
test('optional whitespace around the list delimiter does not lose the address', () => {
  process.env.AB_OVO_TRUST_PROXY_CLIENT_IP = 'true';
  delete process.env.AB_OVO_CLIENT_IP_HEADER;

  // The ordinary form, which works with or without the trim.
  assert.equal(
    readerAddress(requestWith({ 'Fly-Client-IP': '203.0.113.7, 198.51.100.1' })),
    '203.0.113.7',
  );

  // The permitted form that the trim is actually for.
  assert.equal(
    readerAddress(requestWith({ 'Fly-Client-IP': '203.0.113.7 , 198.51.100.1' })),
    '203.0.113.7',
  );
});
