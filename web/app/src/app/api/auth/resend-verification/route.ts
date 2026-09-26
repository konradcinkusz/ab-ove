import type { NextResponse } from 'next/server';

import { resendConfirmationHref } from '@/lib/account-href';
import { requestConfirmationEmail } from '@/lib/server/account-recovery';
import { answerLinkRequest } from '@/lib/server/recovery-routes';

/**
 * POST /api/auth/resend-verification — asking for the link that confirms an address, again
 * (issue #170).
 *
 * `/login/resend`'s form posts here, and the page it answers with says what happens next. The
 * way to that page is under the sign-in problems an unconfirmed address can meet — including a
 * refused password, which is what the pinned authservice answers an unconfirmed account with
 * (the probe, §5) — and it is safe to offer under all of them, because authservice answers this
 * the same for an address waiting to be confirmed, one already confirmed and one with no
 * account. A link sent before still works after this one is sent (the probe, §2).
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<NextResponse> {
  return answerLinkRequest(request, {
    page: resendConfirmationHref,
    ask: (email, readerAddress) => requestConfirmationEmail(email, fetch, readerAddress),
  });
}
