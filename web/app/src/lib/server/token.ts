import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTPayload } from 'jose';

import { backendCandidates } from './backends';

/**
 * Token verification for this app's server side.
 *
 * FRONTEND-BFF.md §4 — "Edge middleware must VERIFY the JWT signature (e.g.
 * jose.jwtVerify) — decoding to read `exp` is not authentication." The recorded failure is
 * blunt: decode-only middleware accepted forged tokens, because any base64 payload with a
 * future expiry passed. §8 names the symptom "Forged token accepted at the edge".
 *
 * This module uses only Web APIs and jose, so the same code runs in middleware's Edge
 * sandbox and in the Node route handlers. One implementation, one place to fix.
 */

/**
 * FRONTEND-BFF.md §4 (citing P5 — configuration through the environment) — "Verify against
 * the JWKS/key that the estate's identity service publishes. Do not embed a key constant in
 * the frontend." There is no key material in this repository and there must never be: the
 * frontend holds a URL, and the identity service holds the key.
 */
const JWKS_PATH = '/.well-known/jwks.json';

/**
 * The issuer and audience this deployment accepts.
 *
 * Both are BARE STRINGS, not URLs — authservice mints `iss: "AbOvo"`. That is why this app
 * points jose straight at the jwks.json URL instead of using an OIDC discovery client: a
 * full discovery client requires the issuer to be the URL it discovered from and rejects a
 * bare string outright.
 *
 * The defaults match `AbOvoIdentity` in AbOvo.AppHost. They are product-specific on
 * purpose: authservice defaults both to "AuthService", and two products left on the
 * defaults would accept each other's tokens.
 */
function expectedIssuer(): string {
  return process.env.AB_OVO_JWT_ISSUER?.trim() || 'AbOvo';
}

function expectedAudience(): string {
  return process.env.AB_OVO_JWT_AUDIENCE?.trim() || 'AbOvo';
}

type RemoteKeySet = ReturnType<typeof createRemoteJWKSet>;

/**
 * jose's remote key set caches the fetched keys and rate-limits its own refetch, so it must
 * be created ONCE per URL and reused. Rebuilding it per request would fetch the JWKS on
 * every page view — and authservice is pinned to min_machines_running = 1 precisely because
 * validators fetch it in-request; making that per-request rather than per-process is how a
 * page load turns into a cold start.
 */
const keySets = new Map<string, RemoteKeySet>();

function keySetFor(jwksUrl: string): RemoteKeySet {
  let existing = keySets.get(jwksUrl);
  if (!existing) {
    existing = createRemoteJWKSet(new URL(jwksUrl), {
      // Long enough that a rotation is picked up the same day, short enough that the
      // process does not have to be restarted for it.
      cacheMaxAge: 10 * 60 * 1000,
      // A scale-to-zero identity service still has to answer; a 5s ceiling is a verifier
      // that gives up before Fly has finished starting the machine.
      timeoutDuration: 10_000,
    });
  }
  keySets.set(jwksUrl, existing);
  return existing;
}

/** The candidate JWKS endpoints, in the ladder's order (FRONTEND-BFF.md §5). */
function jwksCandidates(): string[] {
  return backendCandidates('authservice').map((base) => `${base}${JWKS_PATH}`);
}

/**
 * The last endpoint that actually answered. Remembering it means the ladder is walked once
 * per process rather than once per request; it is cleared the moment that endpoint stops
 * working, so a rung that goes away is re-probed rather than pinned.
 */
let lastGoodJwksUrl: string | null = null;

export interface SessionClaims {
  subject: string;
  email: string | null;
  /**
   * authservice writes roles under the long URI claim, and — this is the part that bites —
   * a SINGLE role is a bare string while two or more is an array. Reading it as an array
   * unconditionally gives you the characters of the role name.
   */
  roles: string[];
  /** Epoch seconds. */
  expiresAt: number;
}

export type TokenVerification =
  | { status: 'valid'; claims: SessionClaims }
  /** The token is not acceptable. Terminal: no other key set would change this answer. */
  | { status: 'invalid'; reason: string }
  /** The key set could not be reached. The token may well be fine; we cannot say. */
  | { status: 'unverifiable'; reason: string };

const ROLE_CLAIM = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';
const NAME_CLAIM = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name';

/**
 * Error codes that say something about the TOKEN rather than about the transport.
 *
 * This is the same distinction FRONTEND-BFF.md §5 draws for the proxy, where a 403 means
 * "wrong ingress, try the next candidate" rather than "stop". Here it runs the other way:
 * a bad signature or a wrong audience is terminal and must NOT advance the ladder, because
 * walking on to the next rung after a signature failure is a verifier shopping for a key
 * set that will accept the token it was handed.
 */
const TERMINAL_CODES = new Set([
  'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
  'ERR_JWT_EXPIRED',
  'ERR_JWT_CLAIM_VALIDATION_FAILED',
  'ERR_JWS_INVALID',
  'ERR_JWT_INVALID',
  'ERR_JOSE_ALG_NOT_ALLOWED',
]);

function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return 'ERR_UNKNOWN';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readRoles(payload: JWTPayload): string[] {
  const raw = payload[ROLE_CLAIM];
  if (typeof raw === 'string') return [raw];
  if (Array.isArray(raw)) return raw.filter((entry): entry is string => typeof entry === 'string');
  return [];
}

function toClaims(payload: JWTPayload): SessionClaims | null {
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null;
  if (typeof payload.exp !== 'number') return null;

  const email =
    typeof payload['email'] === 'string'
      ? payload['email']
      : typeof payload[NAME_CLAIM] === 'string'
        ? (payload[NAME_CLAIM] as string)
        : null;

  return { subject: payload.sub, email, roles: readRoles(payload), expiresAt: payload.exp };
}

/**
 * FRONTEND-BFF.md §4 step 1 — "cheap `exp` decode first as a fast path".
 *
 * The guide is emphatic that this is a fast path and NEVER a substitute: it answers
 * "is this worth a network round trip" and nothing else. An unsigned string this function
 * accepts is still rejected by `verifyAccessToken` a line later. Do not promote it.
 */
export function isPlausiblyUnexpired(token: string, skewSeconds = 30): boolean {
  try {
    const payload = decodeJwt(token);
    if (typeof payload.exp !== 'number') return false;
    return payload.exp > Math.floor(Date.now() / 1000) - skewSeconds;
  } catch {
    return false;
  }
}

/**
 * FRONTEND-BFF.md §4 step 2 / Checklist item 4 — "Signature verification checks issuer AND
 * audience, not just the signature."
 */
export async function verifyAccessToken(token: string): Promise<TokenVerification> {
  const candidates = jwksCandidates();
  const ordered = lastGoodJwksUrl
    ? [lastGoodJwksUrl, ...candidates.filter((url) => url !== lastGoodJwksUrl)]
    : candidates;

  if (ordered.length === 0) {
    return { status: 'unverifiable', reason: 'no JWKS endpoint is configured' };
  }

  let lastTransportFailure = 'no JWKS endpoint answered';

  for (const jwksUrl of ordered) {
    try {
      const { payload } = await jwtVerify(token, keySetFor(jwksUrl), {
        // A bare string, compared as an opaque string. Not a URL, and not discovered.
        issuer: expectedIssuer(),
        // Strict and exact. authservice signs its 2FA CHALLENGE tokens with the same key
        // and distinguishes them only by audience — "AbOvo:2fa" — so this comparison is
        // the entire difference between a half-authenticated challenge and a session.
        audience: expectedAudience(),
        algorithms: ['RS256'],
        // Deliberately NOT set: `requiredClaims` for iat or nbf, and `maxTokenAge`.
        // authservice mints neither iat nor nbf, so requiring either (or asking for a max
        // token age, which is computed from iat) rejects every valid token this estate
        // issues. jose still enforces exp, and nbf when a token happens to carry one.
      });

      const claims = toClaims(payload);
      if (!claims) {
        return { status: 'invalid', reason: 'token verified but carries no usable sub/exp' };
      }

      lastGoodJwksUrl = jwksUrl;
      return { status: 'valid', claims };
    } catch (error) {
      const code = errorCode(error);
      if (TERMINAL_CODES.has(code)) {
        // The endpoint answered and the token was rejected on its merits, so the remembered
        // rung stays remembered: it is working.
        return { status: 'invalid', reason: `${code}: ${errorMessage(error)}` };
      }
      // Transport, DNS, timeout, or no matching key: this rung cannot answer. Try the next.
      lastTransportFailure = `${code}: ${errorMessage(error)}`;
      if (lastGoodJwksUrl === jwksUrl) lastGoodJwksUrl = null;
    }
  }

  // FRONTEND-BFF.md §5's shape, applied to verification: give up only when every candidate
  // has failed, and say that the failure was ours rather than the token's.
  return { status: 'unverifiable', reason: lastTransportFailure };
}
