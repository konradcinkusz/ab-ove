/**
 * The anonymous reader's cursor cookie — ADR-0061.
 *
 * A random, unguessable, opaque value, not a token: nothing here is signed, because
 * `AbOvo.Api` validates tokens and mints none (P5), and minting an "anonymous JWT" would make
 * it a second issuer the moment somebody reached for that convenience elsewhere. Possession of
 * this value is the only credential; there is nothing to verify because there is nothing
 * signed.
 *
 * Deliberately its own module, separate from `session-cookies.ts`'s vocabulary: an anonymous
 * reader's position is not a credential, sign-out has no claim over it, and
 * `CLEARABLE_COOKIES` must never include this name.
 *
 * This module deliberately imports nothing from `next/headers`, the same reason
 * `session-cookies.ts` gives: it is read by middleware (Edge runtime) and by Server Components
 * calling `AbOvo.Api` directly (Node runtime) alike.
 */

/** ADR-0061 — the cookie a reader's anonymous position lives in. */
export const READER_ID_COOKIE = 'ab_ovo_rid';

/**
 * The header the BFF proxy injects this as, server-side, on a client-initiated write
 * (ADR-0061) — never a header a client is trusted to set itself. Lower-case: header names
 * are compared case-insensitively, but the proxy route's own forwarding tables are written
 * lower-case throughout and this matches them.
 */
export const READER_ID_HEADER = 'x-ab-ovo-reader-id';

export interface ReaderCookieAttributes {
  httpOnly: true;
  secure: boolean;
  sameSite: 'strict';
  path: string;
  maxAge: number;
}

/**
 * ~400 days — the practical ceiling several browsers clamp a cookie's `Max-Age` to
 * regardless of what is requested, so asking for longer buys nothing. This is a resume
 * mechanism and is meant to long outlive a session cookie: a session cookie is gone in
 * minutes to hours; this should still be found a year later.
 */
const READER_ID_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

/**
 * Read at call time, not captured at module load — the same reasoning
 * `session-cookies.ts`'s `sessionCookieAttributes()` gives: this module is also evaluated
 * during `next build`, and a value captured then would be baked into the image.
 */
export function readerCookieAttributes(): ReaderCookieAttributes {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: READER_ID_MAX_AGE_SECONDS,
  };
}
