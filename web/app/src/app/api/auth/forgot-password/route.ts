import type { NextResponse } from 'next/server';

import { forgotPasswordHref } from '@/lib/account-href';
import { requestPasswordReset } from '@/lib/server/account-recovery';
import { answerLinkRequest } from '@/lib/server/recovery-routes';

/**
 * POST /api/auth/forgot-password — asking for a link to choose a new password (issue #170).
 *
 * `/login/forgot`'s form posts here: an address, the edition and where the reader was going.
 * authservice is asked from this server (`account-recovery.ts`), and the reader is sent back to
 * the page with a notice saying what happens next — the same notice for every address the
 * service can parse, because its answer is the same for every one, and a page that said more
 * would be the account-existence oracle upstream refuses to be. What the route shares with its
 * three siblings is `lib/server/recovery-routes.ts`, which says what they all do.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<NextResponse> {
  return answerLinkRequest(request, {
    page: forgotPasswordHref,
    ask: (email, readerAddress) => requestPasswordReset(email, fetch, readerAddress),
  });
}
