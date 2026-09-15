import { cookies } from 'next/headers';

import { CHALLENGE_COOKIE, sessionCookieAttributes } from '@/lib/session-cookies';

/**
 * The two-factor challenge, stored between the password screen and the code screen.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A MODULE AND NOT TWO LINES IN A ROUTE.
 *
 * It is set by one route, read by a second and a page, and cleared by three paths. Written
 * out at each of those, the lifetime and the attributes would be written out six times —
 * and `session-cookies.ts`'s own header records what a second, drifted copy of a cookie's
 * attributes produces: a delete that silently leaves the cookie alive
 * (FRONTEND-BFF.md §8, "login loop after logout"). The same argument, one credential over.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * It shares `sessionCookieAttributes()` deliberately — HttpOnly, Secure outside dev,
 * SameSite=strict, path `/` — because every reason those attributes exist for a session
 * token applies to a token that proves a password was right. What it does NOT share is the
 * lifetime, which is the challenge's own and comes from authservice.
 */

/**
 * The fallback lifetime, used only when authservice sent no `expiresIn`.
 *
 * FIVE MINUTES BECAUSE THAT IS WHAT IT IS — `TokenService.TwoFactorChallengeMinutes` is 5
 * at the tag `flyio/authservice.fly.toml` pins. It is a FALLBACK rather than the value:
 * `completeSecondFactor` carries the real one, and a constant here that the service moved
 * past would be this app expiring a cookie while the token inside it still worked, or
 * keeping one that stopped working — both of which present to the reader as a code that is
 * refused for no visible reason.
 *
 * Erring SHORT is deliberate. A cookie that outlives its token wastes one of the reader's
 * five lockout attempts on a challenge that cannot succeed; one that dies early sends them
 * back to the password screen, which costs nothing.
 */
const FALLBACK_LIFETIME_SECONDS = 300;

/**
 * The upper bound this app will honour whatever it is told.
 *
 * `expiresIn` comes from outside, and a cookie's lifetime is not something to take on
 * trust from an upstream that could be misconfigured — a challenge good for a day is a
 * credential proving a password, sitting in a browser. Ten minutes is twice the real value
 * and far under anything that would matter.
 */
const MAX_LIFETIME_SECONDS = 600;

/** Set the challenge, for as long as authservice says it is good for. */
export async function storeChallenge(
  challengeToken: string,
  expiresInSeconds: number | null,
): Promise<void> {
  const store = await cookies();
  const lifetime = Math.min(expiresInSeconds ?? FALLBACK_LIFETIME_SECONDS, MAX_LIFETIME_SECONDS);

  store.set({
    name: CHALLENGE_COOKIE,
    value: challengeToken,
    ...sessionCookieAttributes(),
    maxAge: Math.max(1, lifetime),
  });
}

/**
 * The challenge this browser is holding, or `null`.
 *
 * `null` is not an error state to report as a fault: it is what a reader who waited too
 * long, or who arrived at `/login/2fa` without signing in, legitimately has. The caller
 * sends them back to the password screen.
 */
export async function readChallenge(): Promise<string | null> {
  const value = (await cookies()).get(CHALLENGE_COOKIE)?.value;
  return value && value.length > 0 ? value : null;
}

/**
 * Remove it, with the SAME attributes it was set with.
 *
 * Setting an empty value with `maxAge: 0` and the original attributes is the form that
 * actually removes a cookie; a bare `delete(name)` omits the attributes, does not error,
 * and leaves it alive. `session.ts` records the same thing about the session pair, and the
 * reason it is repeated rather than shared is that this is one cookie with one lifetime —
 * what is shared is `sessionCookieAttributes()`, which is the part that must not drift.
 */
export async function clearChallenge(): Promise<void> {
  const store = await cookies();
  store.set({ name: CHALLENGE_COOKIE, value: '', ...sessionCookieAttributes(), maxAge: 0 });
}
