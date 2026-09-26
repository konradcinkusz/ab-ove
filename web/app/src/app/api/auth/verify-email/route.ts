import type { NextResponse } from 'next/server';

import { confirmAddressHref } from '@/lib/account-href';
import { confirmAddress } from '@/lib/server/account-recovery';
import { answerLinkUse } from '@/lib/server/recovery-routes';

/**
 * POST /api/auth/verify-email — confirming an address with the link from the email (issue #170).
 *
 * The button on `/login/confirm` posts here with nothing but the edition: the address and the
 * token are the ones `app/verify-email/route.ts` took out of the link and holds server-side.
 * A button rather than confirming on arrival, because the link is a GET, and a mail program
 * that fetches links to scan them must not be the one that confirms an address (the probe, §3).
 *
 * Done — or already done, which authservice answers as a success too — the reader is sent to
 * `/login` with a notice, since signing in is what the address was waiting for.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<NextResponse> {
  return answerLinkUse(request, {
    kind: 'verify',
    page: confirmAddressHref,
    done: 'email-verified',
    use: (link, _post, readerAddress) => confirmAddress(link, fetch, readerAddress),
  });
}
