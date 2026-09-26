/**
 * A link from an email, read off the address it arrives at and kept server-side — at the layer
 * with the logic (P13, issue #170).
 *
 * What is worth holding here is that the pair survives the trip intact — a token is base64,
 * and a `+` that came back a space would be a link that never works — and that anything which
 * cannot be a pair is refused rather than kept, on arrival and again when the cookie is read
 * back, since a cookie is a value the reader can edit.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { decodeEmailedLink, emailedLinkFrom, encodeEmailedLink } from './emailed-link.ts';

/** An Identity token has base64's `+`, `/` and `=`; authservice escapes them in the link. */
const TOKEN = 'CfDJ8Ab+c/d==';

/** The query exactly as authservice writes it: `Uri.EscapeDataString` on both values. */
const arriving = (email: string, token: string): URLSearchParams =>
  new URL(
    `https://ab-ovo.invalid/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`,
  ).searchParams;

test('the pair comes out of the link exactly as the service wrote it', () => {
  assert.deepEqual(emailedLinkFrom(arriving('reader+tag@example.test', TOKEN)), {
    email: 'reader+tag@example.test',
    token: TOKEN,
  });
});

test('a link that does not carry both halves carries nothing worth keeping', () => {
  assert.equal(emailedLinkFrom(new URLSearchParams('token=abc')), null);
  assert.equal(emailedLinkFrom(new URLSearchParams('email=reader%40example.test')), null);
  assert.equal(emailedLinkFrom(new URLSearchParams('')), null);
  // Not an address at all.
  assert.equal(emailedLinkFrom(arriving('reader', TOKEN)), null);
});

test('a value no link of the service’s would carry is refused', () => {
  // A control character, which no address and no base64 token contains.
  assert.equal(emailedLinkFrom(arriving('reader@example.test', 'abc\ndef')), null);
  // Longer than any account's address can be.
  assert.equal(emailedLinkFrom(arriving(`${'a'.repeat(250)}@example.test`, TOKEN)), null);
  // A token long enough that the cookie holding it would be refused by the browser.
  assert.equal(emailedLinkFrom(arriving('reader@example.test', 'A'.repeat(2049))), null);
});

test('the kept value reads back as the same pair, and shows neither half as written', () => {
  const link = { email: 'reader@example.test', token: TOKEN };
  const value = encodeEmailedLink(link);
  assert.deepEqual(decodeEmailedLink(value), link);
  assert.ok(!value.includes('reader@example.test'), 'the address is readable in the cookie');
  assert.ok(!value.includes(TOKEN), 'the token is readable in the cookie');
  // Nothing in it needs a cookie's own escaping.
  assert.match(value, /^[A-Za-z0-9_-]+$/);
});

test('a cookie that is not a pair — edited, truncated, or empty — is no link at all', () => {
  assert.equal(decodeEmailedLink(undefined), null);
  assert.equal(decodeEmailedLink(''), null);
  assert.equal(decodeEmailedLink('not base64 json'), null);
  assert.equal(decodeEmailedLink(Buffer.from('[1,2]').toString('base64url')), null);
  assert.equal(decodeEmailedLink(Buffer.from('{"email":1,"token":"x"}').toString('base64url')), null);
  assert.equal(
    decodeEmailedLink(Buffer.from(JSON.stringify({ email: 'reader@example.test', token: 'a\u0000b' })).toString('base64url')),
    null,
  );
});
