#!/usr/bin/env node
/**
 * A FIXTURE THAT IMPERSONATES authservice, FOR THE ACCEPTANCE SUITE ONLY.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS PROVES, AND — SAID FIRST — WHAT IT DOES NOT.
 *
 * It proves the WIRING, end to end and on every push: a form post reaching
 * `/api/auth/login`, two cookies coming back with the attributes they must have, the token
 * inside them verifying against a published JWKS, `GET /api/auth/session` reading the
 * claims off it, and the middleware letting a gated page through on the strength of that
 * cookie. Those four things were measured by hand once (ADR-0018) and were evidence about
 * one afternoon.
 *
 * **IT PROVES NOTHING ABOUT THE CONTRACT WITH authservice.** A fixture and the code that
 * reads it agree by construction, so a green suite here does not mean authservice still
 * answers this way — it means this file and `web/app/src/lib/server/` still agree with each
 * other. Issue #29 names that limit and it is not closed by this file.
 *
 * The contract half lives in `web/app/src/lib/server/sign-in.test.ts`, which was written
 * from `AuthController.Login`'s source rather than from the app's behaviour, and which
 * would still fail if upstream changed a status code.
 *
 * WHAT MAKES THIS MORE THAN A MIRROR OF `token.ts`. Every shape below was read out of
 * authservice's own source at the tag `flyio/authservice.fly.toml` pins — `TokenService`'s
 * `BuildClaimsAsync` and `GenerateAccessToken`, `JwtSigningKeys.BuildJwks`,
 * `AuthController.Login` — and NOT out of the code that consumes it. That is what leaves
 * the fixture able to refute the consumer rather than merely echo it: if `token.ts` stopped
 * handling the single-role-as-a-bare-string case below, this fixture would catch it.
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * NO DEPENDENCY, DELIBERATELY. `tests/e2e` has three devDependencies and a lockfile CI
 * checks by name; a fixture is not a reason to add a fourth. Node's own `crypto` generates
 * the key, exports the JWK and signs RS256, which is about twenty lines — see `sign`.
 *
 * NO KEY MATERIAL IN THE TREE. The pair is generated on boot and lives for the process. The
 * repository's rule is that a secret is named and never written down (P5); a fixture key
 * that existed in a file would be a private key in git whatever it was labelled.
 *
 * Addresses come from the environment (P5) so `playwright.config.ts` is the one place that
 * decides which ports this estate's fixtures use.
 *
 * THE ACCOUNTS ARE IN `accounts.mts` AND NOT HERE, because this file listens at its top
 * level: a spec importing them from here would start a second fixture inside the Playwright
 * worker and die on EADDRINUSE. See that file.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createSign, generateKeyPairSync, randomUUID } from 'node:crypto';

import { ACCOUNTS, type FixtureAccount } from './accounts.mts';

const PORT = Number(process.env.AB_OVO_STUB_PORT ?? 3200);

/**
 * The issuer and audience the web app expects. Bare strings, not URLs — that is
 * authservice's own default shape and the reason `token.ts` points jose straight at
 * jwks.json instead of using an OIDC discovery client.
 */
const ISSUER = process.env.AB_OVO_JWT_ISSUER ?? 'AbOvo';
const AUDIENCE = process.env.AB_OVO_JWT_AUDIENCE ?? 'AbOvo';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const kid = randomUUID();

/**
 * The JWKS document, in `JwtSigningKeys.BuildJwks`'s own field order and field set:
 * `kty`, `use`, `alg`, `kid`, `n`, `e`. Node's JWK export supplies the first and the last
 * two; the other three are what the service adds.
 */
const jwks = {
  keys: (({ kty, n, e }) => [{ kty, use: 'sig', alg: 'RS256', kid, n, e }])(
    publicKey.export({ format: 'jwk' }),
  ),
};

const b64url = (value: string) => Buffer.from(value).toString('base64url');

/** RS256 over `header.payload`, which is all a JWT is. */
function sign(claims: Record<string, unknown>) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
  const payload = b64url(JSON.stringify(claims));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${signer.sign(privateKey).toString('base64url')}`;
}

/** ASP.NET's long claim URIs. Reproduced because the consumer has to handle them. */
const ROLE_CLAIM = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';
const NAME_CLAIM = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name';
const NAMEID_CLAIM = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier';

/**
 * THE ONE SHAPE MOST WORTH REPRODUCING, and the reason the fixture carries two accounts.
 *
 * `BuildClaimsAsync` adds one `ClaimTypes.Role` claim per role and `JwtSecurityTokenHandler`
 * collapses them on the way out: a SINGLE role serialises as a bare string and two or more
 * as an array. A consumer that reads it as an array unconditionally gets the characters of
 * the role name back, which is a bug that passes every test written against a two-role user
 * and fails for every real one.
 */
const roleClaim = (roles: readonly string[]) => (roles.length === 1 ? roles[0] : roles);

function accessTokenFor(account: FixtureAccount) {
  const now = Math.floor(Date.now() / 1000);
  return sign({
    // JwtRegisteredClaimNames, in TokenService's own order.
    sub: account.id,
    email: account.email,
    jti: randomUUID(),
    [NAMEID_CLAIM]: account.id,
    [NAME_CLAIM]: account.email,
    [ROLE_CLAIM]: roleClaim(account.roles),
    iss: ISSUER,
    aud: AUDIENCE,
    iat: now,
    // Long enough that no spec can race it, short enough to be obviously a fixture.
    exp: now + 3600,
  });
}

const json = (response: ServerResponse, status: number, body: unknown) => {
  const encoded = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(encoded),
    'cache-control': 'no-store',
  });
  response.end(encoded);
};

const readBody = (request: IncomingMessage): Promise<string> =>
  new Promise((resolve) => {
    let raw = '';
    request.on('data', (chunk: Buffer | string) => {
      raw += chunk;
    });
    request.on('end', () => resolve(raw));
  });

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${PORT}`);

  if (request.method === 'GET' && url.pathname === '/.well-known/jwks.json') {
    return json(response, 200, jwks);
  }

  // Enough OIDC metadata that a consumer configured with an authority can find the keys.
  // `issuer` is the bare string tokens actually carry, never this server's URL — which is
  // the distinction authservice's own comment on this endpoint is about.
  if (request.method === 'GET' && url.pathname === '/.well-known/openid-configuration') {
    return json(response, 200, {
      issuer: ISSUER,
      jwks_uri: `http://127.0.0.1:${PORT}/.well-known/jwks.json`,
      id_token_signing_alg_values_supported: ['RS256'],
      response_types_supported: [],
      subject_types_supported: ['public'],
    });
  }

  if (request.method === 'GET' && (url.pathname === '/health' || url.pathname === '/alive')) {
    return json(response, 200, { status: 'Healthy', service: 'AuthService' });
  }

  if (request.method === 'POST' && url.pathname === '/api/v1/auth/login') {
    let body: { email?: unknown; password?: unknown };
    try {
      body = JSON.parse(await readBody(request)) as typeof body;
    } catch {
      return json(response, 400, { error: 'Invalid request' });
    }

    const account = ACCOUNTS.find((candidate) => candidate.email === body.email);

    // The status and the body shape are `AuthController.Login`'s. It answers 401 with this
    // message for both an unknown email and a wrong password — deliberately, so the reply
    // does not say which — and the web app's own tests pin that separately.
    if (!account || body.password !== account.password) {
      return json(response, 401, { error: 'Invalid email or password' });
    }

    // `TokenResponse(AccessToken, RefreshToken, ExpiresIn, TokenType)`, camelCase because
    // authservice's Program.cs sets PropertyNamingPolicy = JsonNamingPolicy.CamelCase.
    return json(response, 200, {
      accessToken: accessTokenFor(account),
      refreshToken: `fixture-refresh-${randomUUID()}`,
      expiresIn: 3600,
      tokenType: 'Bearer',
    });
  }

  json(response, 404, { error: 'Not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  // Playwright's `webServer` waits on a URL, so this line is for a human reading the log.
  console.log(`authservice fixture listening on http://127.0.0.1:${PORT} (kid ${kid})`);
});
