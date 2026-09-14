/**
 * The session cookie contract — ONE definition of the names and ONE definition of the
 * attributes, shared by every place that sets, reads or deletes them.
 *
 * FRONTEND-BFF.md §3 — "The logout route deletes each cookie with the SAME attributes
 * (path, sameSite, secure, domain) it was set with." §8 gives the symptom of a second,
 * drifted copy: "Login loop after logout — Cookie deleted with different attributes than
 * it was set with." A delete whose path or sameSite does not match silently leaves the
 * cookie alive and the next request is authenticated again.
 *
 * That failure is only possible when the attributes are written out twice. They are
 * written out once, here, and the set path, the delete path and the middleware all call
 * this function.
 *
 * This module deliberately imports nothing from `next/headers`: it is used by route
 * handlers (Node runtime) and by middleware (Edge runtime) alike.
 */

/**
 * FRONTEND-BFF.md §4 — "clear BOTH cookies". Note the plural in the guide: the session is
 * an access token and a refresh token, and clearing only the access cookie leaves a client
 * that can mint itself a new session immediately after being logged out.
 */
export const ACCESS_TOKEN_COOKIE = 'ab_ovo_at';
export const REFRESH_TOKEN_COOKIE = 'ab_ovo_rt';

/** Both session cookies, so no caller has to remember that there are two. */
export const SESSION_COOKIES = [ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE] as const;

export interface SessionCookieAttributes {
  httpOnly: true;
  secure: boolean;
  sameSite: 'strict';
  path: string;
}

/**
 * FRONTEND-BFF.md §3 / Checklist item 3 — "httpOnly, secure (outside dev), and
 * sameSite: strict".
 *
 * `httpOnly` is the whole point: §3 records that `document.cookie` CANNOT set HttpOnly, so
 * a server route is the only way to establish this cookie, and any design where the client
 * sets it has already lost the property. §8's "Token visible in devtools/localStorage" is
 * what the alternative looks like.
 *
 * NODE_ENV is read HERE, on each call, rather than captured at module load. That is not
 * pedantry: this module is also evaluated during `next build`, and a value captured then
 * would be baked into the image — the same build-time-freezing defect §2 exists to remove,
 * arriving through a different door.
 */
export function sessionCookieAttributes(): SessionCookieAttributes {
  return {
    httpOnly: true,
    // `secure` outside dev. The image always runs with NODE_ENV=production, so every
    // deployed environment gets it; `next dev` over plain http on a laptop does not, where
    // a secure cookie would simply never be stored.
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  };
}
