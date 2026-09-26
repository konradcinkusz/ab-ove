import type { NextResponse } from 'next/server';

import { resetPasswordHref } from '@/lib/account-href';
import { resetPassword } from '@/lib/server/account-recovery';
import { answerLinkUse } from '@/lib/server/recovery-routes';

/**
 * POST /api/auth/reset-password — choosing a new password with the link from the email
 * (issue #170).
 *
 * The form on `/login/reset` sends one thing: the password the reader typed. The address and
 * the token are NOT in it — they came from the link, and `app/reset-password/route.ts` moved
 * them into a cookie only this server reads (`emailed-link-cookie.ts`) before any page was
 * rendered. So the token is spent only by this POST, which the reader makes, and never by the
 * GET a mail program makes when it looks at a link before the reader does (the probe, §3).
 *
 * Done, the reader is sent to `/login` with a notice: the new password is the next thing to
 * type, and nothing here signs anybody in — authservice issues no token for a reset, and it
 * ends every session the account had (the probe, §2).
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<NextResponse> {
  return answerLinkUse(request, {
    kind: 'reset',
    page: resetPasswordHref,
    done: 'password-reset',
    use: async (link, post, readerAddress) => {
      // Exactly as typed: a password's spaces are part of it (`register.ts`).
      const password = post.field('password');
      if (!password) return { kind: 'incomplete' };
      return resetPassword(link, password, fetch, readerAddress);
    },
  });
}
