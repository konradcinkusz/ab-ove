import { cookies } from 'next/headers';

import { sessionCookieAttributes } from '@/lib/session-cookies';

/**
 * The address a failed sign-in was attempted with, handed to the page that reports the
 * failure — in a cookie this origin's server sets, and never in the URL (issue #166).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ADR-0018 TOOK THE RETYPE ON PURPOSE, AND THIS IS A CHANNEL IT DID NOT USE.
 *
 * The form posts, and a failure answers with a 303 to `/login?error=…`. ADR-0018 would not
 * put the address on that URL — an address bar is the one place a value reaches browser
 * history and every access log between here and the reader — so the field came back empty
 * after every mistyped password. The redirect has a second channel: the response it rides
 * on, which can set a cookie the browser sends with the GET it makes next. So the address
 * travels the way the second-factor challenge does (ADR-0029): set by the server, HttpOnly so
 * no script on the page can read it, and gone in a minute.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * Its attributes are the session pair's (`sessionCookieAttributes`: HttpOnly, Secure outside
 * dev, SameSite=strict) except the PATH, which is `/login`: that scope sends it with requests
 * for `/login` and the pages under it — the second step is one — and with nothing else on
 * this origin, and of those only `/login` reads it. It authenticates nothing and is not in
 * `CLEARABLE_COOKIES` — a sign-out deletes with the session pair's path, which would not
 * reach it, and a minute is the whole of its life.
 *
 * The page cannot delete it — a Server Component cannot set a cookie — so it lives out its
 * minute, and a reload inside that minute fills the field again, which is what a reload is
 * for. The route removes it as soon as a password is accepted. What it risks is a second
 * person at the same browser within the minute seeing the address typed before them — which
 * the browser's own form history offers them for much longer.
 */
export const SIGN_IN_ADDRESS_COOKIE = 'ab_ovo_signin_address';

/** A minute. The redirect it rides takes milliseconds; the rest is room for a reload. */
const LIFETIME_SECONDS = 60;

/**
 * The longest address an account can have: `[StringLength(256)]` on `RegisterRequest.Email`
 * at the tag `flyio/authservice.fly.toml` pins. Anything longer is not an address any
 * account holds, so it is not worth a cookie — and a cookie is a reader-editable value, so
 * what is read back is held to the same bound.
 */
const MAX_LENGTH = 256;

const attributes = () => ({ ...sessionCookieAttributes(), path: '/login' });

/** A value worth putting back into the field: not empty, not over the bound, no control characters. */
function usable(address: string): boolean {
  if (address.length === 0 || address.length > MAX_LENGTH) return false;
  for (const character of address) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return false;
  }
  return true;
}

/** Keep the address for the sign-in page the failed attempt is about to be sent to. */
export async function rememberAddress(address: string): Promise<void> {
  if (!usable(address)) return;
  (await cookies()).set({
    name: SIGN_IN_ADDRESS_COOKIE,
    value: address,
    ...attributes(),
    maxAge: LIFETIME_SECONDS,
  });
}

/**
 * Remove it — with the attributes it was set with, for `challenge.ts`'s reason: a delete that
 * names a different path does not error and leaves the cookie alive.
 *
 * Unconditional, because the route that calls it never SEES the cookie: it is scoped to
 * `/login`, and the route is `/api/auth/login`.
 */
export async function forgetAddress(): Promise<void> {
  (await cookies()).set({ name: SIGN_IN_ADDRESS_COOKIE, value: '', ...attributes(), maxAge: 0 });
}

/** The address to fill the form with, or `null`. Read by `/login`, never rendered as text. */
export async function rememberedAddress(): Promise<string | null> {
  const value = (await cookies()).get(SIGN_IN_ADDRESS_COOKIE)?.value;
  return value !== undefined && usable(value) ? value : null;
}
