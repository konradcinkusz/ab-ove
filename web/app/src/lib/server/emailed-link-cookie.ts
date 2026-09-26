import { cookies } from 'next/headers';

import {
  decodeEmailedLink,
  EMAILED_LINK_LIFETIME_SECONDS,
  encodeEmailedLink,
  type EmailedLink,
} from '@/lib/server/emailed-link';
import { sessionCookieAttributes } from '@/lib/session-cookies';

/**
 * Where this origin's server keeps a link from an email between the page it lands on and the
 * form that uses it (issue #170) — the address and the token, out of the URL at the first hop.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * A COOKIE THE SERVER SETS, AS THE ADDRESS OF A FAILED SIGN-IN AND THE SECOND FACTOR'S
 * CHALLENGE ARE (`sign-in-address.ts`, ADR-0029).
 *
 * The page a link lands on (`app/reset-password/route.ts`, `app/verify-email/route.ts`) is a
 * route, not a page: it reads the pair off its own query, sets this cookie, and answers 303
 * with an address that carries neither — so no document is ever rendered at the address the
 * token arrived in, and nothing a page loads could send that address on as a referrer. The
 * token never enters the document either: the form that spends it carries nothing but what
 * the reader types, and its route reads the pair from here. A hidden field was the other way,
 * refused for `session-cookies.ts`'s reason about the challenge: a credential in the DOM is in
 * form restore, in devtools, and in a screenshot.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * `SameSite=Lax`, WHERE EVERY OTHER COOKIE THIS APP SETS ON ITS SERVER IS `Strict`.
 *
 * A link in an email is followed FROM ANOTHER SITE — the reader's mail — and a browser does
 * not send a `Strict` cookie on a navigation another site started, nor on the redirects that
 * navigation follows. So a `Strict` cookie set by the landing's 303 would be missing from the
 * very request the 303 makes, and the page would say no link was open. `lib/language/store.ts`
 * met the same fact about its own cookie and chose `Lax` for it; `specs/account-recovery.spec.ts`
 * follows the link from a page on another site, which is the only way to see it.
 *
 * What `Lax` gives up is sending on a cross-site POST, and that is the one thing it must not
 * do anyway: the only request that SPENDS the pair is a POST, from this origin's own form, to a
 * route that refuses any other origin (`same-origin.ts`). A cross-site GET carries it to a
 * page that reads whether it is there and nothing more.
 *
 * ADR-0018's amendment for issue #170 records this as a decision, with what it costs, so a
 * review that tightens it to `Strict` meets the reason before the failing spec.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * The rest of its attributes are the session pair's — HttpOnly, Secure outside dev — and its
 * path is `/`, the challenge's, because the page that asks whether a link is held and the route
 * that spends it live under different paths (`/login/…`, `/api/auth/…`). The proxy forwards no
 * cookie to any backend (`app/api/proxy/[...path]/route.ts`), so `/` reaches nothing else that
 * would read it. It is not in `CLEARABLE_COOKIES`: it belongs to no session, and it is gone
 * when the link is used, when the service refuses it, or when its lifetime ends.
 */

/** The two links authservice sends, each held under its own name so one cannot spend the other. */
export type EmailedLinkKind = 'reset' | 'verify';

export const EMAILED_LINK_COOKIES: Readonly<Record<EmailedLinkKind, string>> = {
  reset: 'ab_ovo_reset',
  verify: 'ab_ovo_verify',
};

const attributes = () => ({ ...sessionCookieAttributes(), sameSite: 'lax' as const });

/** Keep the pair a link carried, replacing any link of the same kind held before it. */
export async function keepEmailedLink(kind: EmailedLinkKind, link: EmailedLink): Promise<void> {
  (await cookies()).set({
    name: EMAILED_LINK_COOKIES[kind],
    value: encodeEmailedLink(link),
    ...attributes(),
    maxAge: EMAILED_LINK_LIFETIME_SECONDS,
  });
}

/**
 * The pair held for `kind`, or `null`. A page asks only whether there is one; the route that
 * spends it reads it. Neither ever renders it.
 */
export async function heldEmailedLink(kind: EmailedLinkKind): Promise<EmailedLink | null> {
  return decodeEmailedLink((await cookies()).get(EMAILED_LINK_COOKIES[kind])?.value);
}

/**
 * Remove it — with the attributes it was set with, for `challenge.ts`'s reason: a delete that
 * names a different path does not error and leaves the cookie alive.
 */
export async function forgetEmailedLink(kind: EmailedLinkKind): Promise<void> {
  (await cookies()).set({ name: EMAILED_LINK_COOKIES[kind], value: '', ...attributes(), maxAge: 0 });
}
