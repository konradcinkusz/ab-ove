import { cookies } from 'next/headers';

import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  CLEARABLE_COOKIES,
  sessionCookieAttributes,
} from '@/lib/session-cookies';
import { verifyAccessToken } from './token.ts';

/**
 * Establishing and clearing the session — the ONE implementation.
 *
 * There are now two ways a session begins: a password sign-in, whose tokens are minted into
 * this process and never leave it (`/api/auth/login`), and a hand-over of tokens the client
 * already holds, which is what an OAuth callback produces (`/api/auth/session`). They are
 * different routes because they take different inputs. They must not be different CODE,
 * because everything below is either security-relevant or lifetime-relevant, and
 * FRONTEND-BFF.md §8's "Login loop after logout" is precisely what a second, drifted copy
 * of the cookie attributes buys you.
 *
 * This module is for route handlers: it imports `next/headers`, which middleware's Edge
 * sandbox does not have. `session-cookies.ts` stays free of it for that reason and holds
 * the names and attributes that both worlds share.
 */

export type EstablishOutcome =
  | { readonly status: 'established'; readonly expiresAt: number }
  /**
   * The token was REJECTED on its merits. From `/api/auth/login` this is not a wrong
   * password — authservice had just accepted the password to mint it — it is this
   * deployment's `AB_OVO_JWT_ISSUER`/`AB_OVO_JWT_AUDIENCE` disagreeing with the ones
   * authservice signs with. The distinction has to survive to the reader, because
   * "incorrect password" sends them round a loop no password can end.
   */
  | { readonly status: 'rejected'; readonly reason: string }
  /** The key set could not be reached. The token may be perfectly good; we cannot say. */
  | { readonly status: 'unverifiable'; readonly reason: string };

/**
 * A ceiling on how long the refresh cookie is OFFERED, not a claim about how long the token
 * is good for. A refresh token is not necessarily a JWT and its expiry is authservice's to
 * decide; the service rejects it whenever it chooses and the reader signs in again.
 */
const REFRESH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/**
 * Verify the access token and, only then, write the two cookies.
 *
 * The verification is not ceremony. Without it this is a way for anything that can reach
 * the route to install a session cookie of its choosing, which the proxy would then inject
 * as a bearer — FRONTEND-BFF.md §5's whole arrangement, inverted.
 */
export async function establishSession(
  accessToken: string,
  refreshToken: string | null,
): Promise<EstablishOutcome> {
  const verification = await verifyAccessToken(accessToken);

  if (verification.status === 'invalid') {
    return { status: 'rejected', reason: verification.reason };
  }
  if (verification.status === 'unverifiable') {
    return { status: 'unverifiable', reason: verification.reason };
  }

  const attributes = sessionCookieAttributes();
  const store = await cookies();

  store.set({
    name: ACCESS_TOKEN_COOKIE,
    value: accessToken,
    ...attributes,
    // The cookie should not outlive the token it carries. authservice mints no `iat`, so
    // the lifetime is computed from `exp` against now rather than from a token age.
    maxAge: Math.max(0, verification.claims.expiresAt - Math.floor(Date.now() / 1000)),
  });

  if (refreshToken) {
    store.set({
      name: REFRESH_TOKEN_COOKIE,
      value: refreshToken,
      ...attributes,
      maxAge: REFRESH_COOKIE_MAX_AGE_SECONDS,
    });
  }

  return { status: 'established', expiresAt: verification.claims.expiresAt };
}

/**
 * FRONTEND-BFF.md §3 — "The logout route deletes each cookie with the SAME attributes
 * (path, sameSite, secure, domain) it was set with."
 *
 * Setting an empty value with maxAge 0 AND the original attributes is the form that
 * actually removes it. A bare `delete(name)` omits the attributes, does not error, and
 * leaves the cookie alive — so the next request is signed in again (§8, "Login loop after
 * logout"). Note the plural in the guide: clearing only the access cookie leaves a refresh
 * token that mints a new session immediately.
 */
export async function clearSession(): Promise<void> {
  const store = await cookies();
  const attributes = sessionCookieAttributes();

  /*
   * `CLEARABLE_COOKIES`, which is WIDER than `SESSION_COOKIES` by exactly the two-factor
   * challenge. A challenge is not a session — it authenticates nothing, and the middleware
   * would not accept one — but a reader who abandons a half-finished sign-in and then signs
   * out should not be left holding a credential that proves their password was right.
   *
   * The MIDDLEWARE deliberately still clears only `SESSION_COOKIES`, and the difference is
   * not an oversight: it clears on the way to /login because a token it could not verify
   * must not linger, and a reader who opens a gated page in a second tab while their
   * authenticator app is open has done nothing that should cost them the challenge.
   */
  for (const name of CLEARABLE_COOKIES) {
    store.set({ name, value: '', ...attributes, maxAge: 0 });
  }
}
