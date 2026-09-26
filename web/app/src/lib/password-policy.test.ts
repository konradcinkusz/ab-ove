/**
 * The browser's check against the identity service's, at the layer with the logic (P13).
 *
 * The property is that the two AGREE: a password the browser lets through is one authservice
 * accepts, and one it refuses is one authservice would refuse. The reference below is a
 * transcription of what `password-policy.ts` read — `RegisterRequest`'s `[StringLength]` and
 * ASP.NET Identity's `PasswordValidator` under `Program.cs`'s options — in C#'s own terms:
 * `string.Length` in UTF-16 code units and each class tested one `char` at a time.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_PATTERN } from './password-policy.ts';

/** What authservice v0.3.1 accepts. */
function serviceAccepts(password: string): boolean {
  const chars = password.split(''); // UTF-16 code units, as C#'s `char`
  const digit = (c: string) => c >= '0' && c <= '9';
  const lower = (c: string) => c >= 'a' && c <= 'z';
  const upper = (c: string) => c >= 'A' && c <= 'Z';
  return (
    password.length >= 8 &&
    password.length <= 100 &&
    password.trim().length > 0 &&
    chars.some(digit) &&
    chars.some(lower) &&
    chars.some(upper) &&
    !chars.every((c) => digit(c) || lower(c) || upper(c))
  );
}

/**
 * What the form lets through: `minlength` in code units, and the pattern the way the HTML
 * standard compiles it — anchored, with the `v` flag, or with `u` in a browser older than
 * `v`. A pattern that is not valid under the browser's flag is IGNORED rather than reported,
 * so compiling it here under both is also the test that the browser checks anything at all.
 */
function formAccepts(password: string, flag: 'u' | 'v' = 'v'): boolean {
  const pattern = new RegExp(`^(?:${PASSWORD_PATTERN})$`, flag);
  return password.length >= PASSWORD_MIN_LENGTH && pattern.test(password);
}

/** Each sample with the service's own verdict, so the agreement below is about the right answer. */
const SAMPLES: readonly (readonly [string, boolean])[] = [
  ['Fixture-password-1!', true], // the acceptance suite's own (`support/register.ts`)
  ['Aa1!aaaa', true],
  ['Zażółć-gęślą-jaźń-1A', true], // the Polish letters count as the symbol; Z and A are A–Z
  ['Correct horse 1', true], // a space is a symbol
  // A line separator is one too, and a password field keeps it (it strips only CR and LF).
  // The first pattern matched the length with `.`, which stops at a line terminator, and
  // refused this password the service accepts.
  ['Aa1\u2028aaaa', true],
  [`Aa1!${'x'.repeat(96)}`, true], // exactly a hundred
  ['abcdefgh', false],
  ['Aa1!aaa', false], // seven
  ['ABCDEFG1!', false], // no lower case
  ['abcdefg1!', false], // no upper case
  ['Abcdefgh!', false], // no digit
  ['Abcdefg1', false], // nothing that is none of those
  ['Łódź-2024!', false], // Ł is not A–Z: no upper case letter, as far as the service counts
  ['ŁÓŹ-łóź-2024', false], // and no letter at all
  [`Aa1!${'x'.repeat(97)}`, false], // a hundred and one
];

test('the identity service gives each sample the verdict written beside it', () => {
  for (const [password, verdict] of SAMPLES) {
    assert.equal(serviceAccepts(password), verdict, `"${password}"`);
  }
});

test('and the form gives the same one, before anything is sent, under either flag', () => {
  for (const flag of ['v', 'u'] as const) {
    for (const [password, verdict] of SAMPLES) {
      assert.equal(
        formAccepts(password, flag),
        verdict,
        `"${password}" is ${verdict ? 'accepted' : 'refused'} by the service and not by the form (${flag})`,
      );
    }
  }
});

test('the floor and the ceiling are the service’s numbers', () => {
  assert.equal(PASSWORD_MIN_LENGTH, 8);
  assert.equal(PASSWORD_MAX_LENGTH, 100);
});

/**
 * THE ONE PLACE THEY DIFFER, named rather than hidden (`password-policy.ts` says why the
 * ceiling is a pattern and not `maxlength`). A pattern counts code points and the service
 * counts code units, so a password of astral characters under a hundred code points and over
 * a hundred code units gets past the form and is refused by the service, whose refusal the
 * page reports in the same words.
 */
test('astral characters are the known gap, and it is the permissive side', () => {
  const emoji = `Aa1${'😀'.repeat(50)}`; // 53 code points, 103 code units
  assert.equal(serviceAccepts(emoji), false);
  assert.equal(formAccepts(emoji), true);
});
