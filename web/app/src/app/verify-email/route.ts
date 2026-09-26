import type { NextResponse } from 'next/server';

import { confirmAddressHref } from '@/lib/account-href';
import { emailedLinkFrom } from '@/lib/server/emailed-link';
import { keepEmailedLink } from '@/lib/server/emailed-link-cookie';
import { seeOther } from '@/lib/server/form-post';
import { readerEdition } from '@/lib/server/reader-edition';

/**
 * GET /verify-email?token=…&email=… — where the link in authservice's confirmation email lands
 * (issue #170).
 *
 * `app/reset-password/route.ts` one email over, and its header is this route's too: the path
 * and the query are upstream's (`SendVerificationEmailAsync`, the probe §3); the pair goes into
 * a cookie only this server reads, and the answer is a 303 to `/login/confirm`, which carries
 * neither the address nor the token. Nothing is confirmed on arrival — a GET is what a mail
 * program makes when it scans a link — only by the button on the page this leads to.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<NextResponse> {
  const link = emailedLinkFrom(new URL(request.url).searchParams);
  if (link) await keepEmailedLink('verify', link);
  const edition = await readerEdition(undefined);
  return seeOther(confirmAddressHref({ edition }), { 'referrer-policy': 'no-referrer' });
}
