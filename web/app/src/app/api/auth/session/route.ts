import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  SESSION_COOKIES,
  sessionCookieAttributes,
} from '@/lib/session-cookies';
import { verifyAccessToken } from '@/lib/server/token';

/**
 * The session routes — FRONTEND-BFF.md §3.
 *
 * "After login or OAuth callback, the client POSTs the tokens to its OWN BFF route; that
 * route sets them as cookies. The client does not store them and does not set them itself."
 *
 * The reason it cannot set them itself is mechanical rather than stylistic: `document.cookie`
 * CANNOT set HttpOnly. A server route is the only way to get the property, so any design in
 * which the client writes the session cookie has already lost it, whatever the code looks
 * like. §8's "Token visible in devtools/localStorage" is the shape of the alternative.
 *
 * All three verbs live in one file because they are one contract — the same two cookie
 * names and the same attribute set — and splitting them across three files is how the
 * delete path drifts from the set path.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface SessionState {
  authenticated: boolean;
  subject: string | null;
  email: string | null;
  roles: string[];
  expiresAt: number | null;
  /**
   * P8 — degradation must be legible. `true` means the identity service could not be
   * reached, so this answer is "we cannot say" rather than "you are signed out". The UI
   * uses it to avoid telling a signed-in reader they have been logged out because a
   * machine was cold.
   */
  identityUnavailable: boolean;
}

const SIGNED_OUT: SessionState = {
  authenticated: false,
  subject: null,
  email: null,
  roles: [],
  expiresAt: null,
  identityUnavailable: false,
};

interface SessionRequestBody {
  accessToken?: unknown;
  refreshToken?: unknown;
}

/**
 * POST /api/auth/session — establish the session.
 *
 * The client hands over the tokens it just received from authservice and gets back nothing
 * but a status. It never sees them again: the cookie is HttpOnly, so the browser will send
 * it and JavaScript will not read it, which is the property §3 is protecting.
 *
 * The token is VERIFIED before it is stored. That is not ceremony — storing an unverified
 * string would make this route a way for any script that can reach it to install a session
 * cookie of its choosing, and the proxy would then inject that string as a bearer.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: SessionRequestBody;
  try {
    body = (await request.json()) as SessionRequestBody;
  } catch {
    return NextResponse.json({ error: 'expected a JSON body' }, { status: 400 });
  }

  const accessToken = typeof body.accessToken === 'string' ? body.accessToken : null;
  const refreshToken = typeof body.refreshToken === 'string' ? body.refreshToken : null;

  if (!accessToken) {
    return NextResponse.json({ error: 'accessToken is required' }, { status: 400 });
  }

  const verification = await verifyAccessToken(accessToken);

  if (verification.status === 'invalid') {
    return NextResponse.json({ error: 'the token was rejected' }, { status: 401 });
  }
  if (verification.status === 'unverifiable') {
    // 502, not 401: the token may be perfectly good and we could not reach the key set to
    // find out. Reporting this as "your credentials are wrong" sends the reader round the
    // sign-in loop forever while the real fault is an identity service that is down.
    return NextResponse.json(
      { error: 'the identity service could not be reached to verify the token' },
      { status: 502 },
    );
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
      // A refresh token's own expiry is not readable here — it is not necessarily a JWT,
      // and it is authservice's to decide. Thirty days is a ceiling on how long the cookie
      // is offered, not a claim about how long the token is good for; the service rejects
      // it whenever it chooses and the reader signs in again.
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  return new NextResponse(null, { status: 204 });
}

/**
 * GET /api/auth/session — FRONTEND-BFF.md §3.
 *
 * "Create a GET /api/auth/session route that rehydrates the client's session state on page
 * load." The guide is explicit that this is mandatory rather than convenient: client JS
 * cannot read an HttpOnly cookie back — by design — so without this route the browser has
 * no way to discover that it is already signed in, and every page load looks signed out.
 *
 * What comes back is session STATE, never the token. The token stays where it was put.
 */
export async function GET(): Promise<NextResponse<SessionState>> {
  const store = await cookies();
  const token = store.get(ACCESS_TOKEN_COOKIE)?.value;

  const noStore = { headers: { 'cache-control': 'no-store' } } as const;

  if (!token) return NextResponse.json(SIGNED_OUT, noStore);

  const verification = await verifyAccessToken(token);

  if (verification.status === 'valid') {
    return NextResponse.json(
      {
        authenticated: true,
        subject: verification.claims.subject,
        email: verification.claims.email,
        roles: verification.claims.roles,
        expiresAt: verification.claims.expiresAt,
        identityUnavailable: false,
      },
      noStore,
    );
  }

  if (verification.status === 'unverifiable') {
    // Cookies are deliberately NOT cleared here. The token was not rejected; the key set
    // was unreachable. Deleting a good session because a machine was cold is a logout
    // nobody asked for, and the API behind the proxy is enforcing regardless.
    return NextResponse.json({ ...SIGNED_OUT, identityUnavailable: true }, noStore);
  }

  return NextResponse.json(SIGNED_OUT, noStore);
}

/**
 * DELETE /api/auth/session — logout.
 *
 * FRONTEND-BFF.md §3 — "The logout route deletes each cookie with the SAME attributes
 * (path, sameSite, secure, domain) it was set with." A delete whose attributes do not match
 * does not error; the browser simply keeps the cookie, and the next request is signed in
 * again. That is §8's "Login loop after logout", and it is why the attributes come from
 * `sessionCookieAttributes()` — the one function the POST above also calls — rather than
 * being written out a second time here.
 */
export async function DELETE(): Promise<NextResponse> {
  const store = await cookies();
  const attributes = sessionCookieAttributes();

  for (const name of SESSION_COOKIES) {
    // Setting an empty value with maxAge 0 AND the original attributes is the form that
    // actually removes it. A bare `delete(name)` would omit the attributes and is exactly
    // the mismatch the guide warns about.
    store.set({ name, value: '', ...attributes, maxAge: 0 });
  }

  return new NextResponse(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}
