import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { csharpConstant, repositoryFile, settingIn } from './deployment-config.ts';
import { expectedAudience, expectedIssuer } from './token.ts';

/**
 * FOUR FILES DECLARE THE SAME TWO STRINGS, in three languages, and nothing reports it when
 * one of them stops agreeing.
 *
 * A token is minted by authservice with an `iss` and an `aud`, and it is then verified
 * TWICE by two different stacks: this app's BFF verifies it before attaching it as a bearer,
 * and `AbOvo.Api` verifies it again when the bearer arrives. Every one of those four places
 * names the pair separately:
 *
 *   src/AbOvo.AppHost/AppHost.cs      AbOvoIdentity.Issuer / .Audience   (local, both ends)
 *   flyio/authservice.fly.toml        Jwt__Issuer / Jwt__Audience        (deployed, minting)
 *   flyio/api.fly.toml                Jwt__Issuer / Jwt__Audience        (deployed, verifying)
 *   web/app/.../token.ts              expectedIssuer() / expectedAudience()
 *
 * Disagree, and every side is individually correct and consistent with itself. The signature
 * is fine, the key is right, the clock is right, and the answer is 401 on every request from
 * every reader. Issue #43 names this as the seam worth the most: *"a three-file agreement
 * whose failure is every token rejected after a working deploy, and no test in this
 * repository can see all three at once."*
 *
 * It is worse than a build failure, because it passes every gate and fails only once
 * deployed — and it fails TOTALLY rather than partially, so there is no signal short of
 * nobody being able to sign in.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS NOT. It is not the test #43 asks for. The proxy carrying a real bearer to a
 * real `AbOvo.Api` needs a Postgres service container and a running API in the `e2e` job,
 * and that is still open. This is the half that issue itself proposes doing "first and
 * separately", on the `fly-config-agrees.test.ts` pattern — it checks that the two ends
 * AGREE, never that either end works.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */

const apphost = repositoryFile('src/AbOvo.AppHost/AppHost.cs');
const authservice = repositoryFile('flyio/authservice.fly.toml');
const api = repositoryFile('flyio/api.fly.toml');

/*
 * The C# reader first, against a fixture whose answer is known before it is asked. The TOML
 * reader is already held by the fixture in `fly-config-agrees.test.ts`; this one is new here,
 * and a parser nobody has watched fire is indistinguishable from one that returns null for
 * everything — which would make every assertion below pass on two nulls.
 */
test('the C# reader reads a declaration and not the prose about it', () => {
  const fixture = [
    'internal static class Fixture',
    '{',
    '    // Issuer MUST EQUAL the one in flyio/api.fly.toml, and this line is not it.',
    '    // internal const string Issuer = "wrong";',
    '    internal const string Issuer = "right";',
    '    public const string Audience = "also-right";   // trailing note',
    '    internal const string NotAString = Something.Else;',
    '}',
  ].join('\n');

  assert.equal(csharpConstant(fixture, 'Issuer'), 'right');
  assert.equal(csharpConstant(fixture, 'Audience'), 'also-right');
  assert.equal(csharpConstant(fixture, 'NotAString'), null);
  assert.equal(csharpConstant(fixture, 'Absent'), null);
});

/*
 * Each source is asserted to still SAY something before the four are compared. Without this
 * a renamed key reads as absent, and `null === null` would pass while two files had stopped
 * configuring anything at all — the failure mode being the whole point of the exercise.
 */
test('all four sources still declare an issuer and an audience', () => {
  for (const [what, value] of [
    ['AbOvoIdentity.Issuer', csharpConstant(apphost, 'Issuer')],
    ['AbOvoIdentity.Audience', csharpConstant(apphost, 'Audience')],
    ['authservice.fly.toml Jwt__Issuer', settingIn(authservice, 'Jwt__Issuer')],
    ['authservice.fly.toml Jwt__Audience', settingIn(authservice, 'Jwt__Audience')],
    ['api.fly.toml Jwt__Issuer', settingIn(api, 'Jwt__Issuer')],
    ['api.fly.toml Jwt__Audience', settingIn(api, 'Jwt__Audience')],
  ] as const) {
    assert.equal(typeof value, 'string', `${what} is no longer declared`);
    assert.ok((value as string).length > 0, `${what} is empty`);
  }
});

test('the minting end and both verifying ends name one issuer', () => {
  const mints = settingIn(authservice, 'Jwt__Issuer');

  assert.equal(settingIn(api, 'Jwt__Issuer'), mints, 'AbOvo.Api would reject every token');
  assert.equal(csharpConstant(apphost, 'Issuer'), mints, 'the local estate would disagree');
});

test('the minting end and both verifying ends name one audience', () => {
  const mints = settingIn(authservice, 'Jwt__Audience');

  assert.equal(settingIn(api, 'Jwt__Audience'), mints, 'AbOvo.Api would reject every token');
  assert.equal(csharpConstant(apphost, 'Audience'), mints, 'the local estate would disagree');
});

/*
 * The web app's half, and the one with a different shape: `flyio/web.fly.toml` sets NEITHER
 * variable, deliberately — its own comment says the pair are "the defaults the code already
 * carries, which is why they are unset rather than restated".
 *
 * So the deployed web app runs on the fallbacks in `token.ts`, and those fallbacks are load
 * bearing rather than a convenience. The functions are CALLED with the environment cleared,
 * which is what a deployment does to them, rather than having their literals read out of the
 * source — a test that parsed the file it is checking would agree with itself.
 */
test('the BFF falls back to the issuer and audience the estate mints with', () => {
  const previousIssuer = process.env.AB_OVO_JWT_ISSUER;
  const previousAudience = process.env.AB_OVO_JWT_AUDIENCE;
  delete process.env.AB_OVO_JWT_ISSUER;
  delete process.env.AB_OVO_JWT_AUDIENCE;
  try {
    assert.equal(expectedIssuer(), settingIn(authservice, 'Jwt__Issuer'));
    assert.equal(expectedAudience(), settingIn(authservice, 'Jwt__Audience'));
  } finally {
    if (previousIssuer === undefined) delete process.env.AB_OVO_JWT_ISSUER;
    else process.env.AB_OVO_JWT_ISSUER = previousIssuer;
    if (previousAudience === undefined) delete process.env.AB_OVO_JWT_AUDIENCE;
    else process.env.AB_OVO_JWT_AUDIENCE = previousAudience;
  }
});

/*
 * The second agreement in the same seam, and the one authservice's own config asks for in as
 * many words: *"It must equal Jwt__Authority in flyio/api.fly.toml."*
 *
 * `Jwt__PublicBaseUrl` is where authservice publishes its JWKS; `Jwt__Authority` is where
 * `AbOvo.Api`'s JwtBearer goes to fetch it. A mismatch is not a rejected token but something
 * worse to diagnose: the API cannot retrieve a key at all, so it fails every request while
 * both services are healthy and every health check is green.
 */
test('the API fetches keys from the address authservice publishes them at', () => {
  const publishes = settingIn(authservice, 'Jwt__PublicBaseUrl');
  const fetches = settingIn(api, 'Jwt__Authority');

  assert.equal(typeof publishes, 'string', 'authservice.fly.toml no longer sets Jwt__PublicBaseUrl');
  assert.equal(typeof fetches, 'string', 'api.fly.toml no longer sets Jwt__Authority');
  assert.equal(fetches, publishes);
});
