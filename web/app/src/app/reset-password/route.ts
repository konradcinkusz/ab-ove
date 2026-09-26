import type { NextResponse } from 'next/server';

import { resetPasswordHref } from '@/lib/account-href';
import { emailedLinkFrom } from '@/lib/server/emailed-link';
import { keepEmailedLink } from '@/lib/server/emailed-link-cookie';
import { seeOther } from '@/lib/server/form-post';
import { readerEdition } from '@/lib/server/reader-edition';

/**
 * GET /reset-password?token=…&email=… — where the link in authservice's password email lands
 * (issue #170).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE PATH IS AUTHSERVICE'S, AND SO IS THE QUERY. THIS IS WHERE THEY STOP.
 *
 * `ForgotPassword` builds the link as `{FrontendBaseUrl}/reset-password?token=…&email=…` — the
 * path fixed upstream, only the base configurable (the probe, §3) — so this address has to
 * answer, and when it does the reader's address and a credential are in the address bar. This
 * route is the first and last thing that reads them from a URL: it keeps the pair in a cookie
 * only this origin's server can read (`emailed-link-cookie.ts`) and answers 303 with
 * `/login/reset`, which carries neither. Every address the app shows from here on is clean,
 * and `specs/account-recovery.spec.ts` holds every one of them to it.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * A ROUTE, NOT A PAGE, so no document is ever rendered at an address holding a token: nothing
 * it loads could send that address on as a referrer, and the history entry a reader keeps is
 * the clean one. `Referrer-Policy: no-referrer` on the redirect covers what is left — the
 * browser applies it to the request the redirect makes. And a GET spends nothing: the token is
 * used only by the POST from the form on the page this leads to, which a mail program that
 * fetches links to scan them never makes.
 *
 * A link that carries no usable pair still arrives on the page, which then says no reset is
 * open and how to get one. A pair already held is replaced, never kept beside a newer one.
 *
 * The edition is the one this browser remembers — a link from an email names none — and the
 * redirect names it, as every way into these pages does (issue #166). The page is the same
 * page without it; with it, the address says which edition it was opened in.
 *
 * The middleware lets this through before it asks for any cookie: `/reset-password` is a
 * carve-out in `lib/page-gate.ts`, for FRONTEND-BFF.md §4's reason about a callback — it arrives
 * unauthenticated by construction, and a bounce to `/login` would lose its query.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<NextResponse> {
  const link = emailedLinkFrom(new URL(request.url).searchParams);
  if (link) await keepEmailedLink('reset', link);
  const edition = await readerEdition(undefined);
  return seeOther(resetPasswordHref({ edition }), { 'referrer-policy': 'no-referrer' });
}
