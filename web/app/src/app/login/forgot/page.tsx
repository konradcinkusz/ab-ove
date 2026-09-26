import type { Metadata } from 'next';

import { LinkRequestPage, linkRequestMetadata } from '../link-request.tsx';

/**
 * `/login/forgot` — asking for a link to choose a new password (issue #170).
 *
 * `/login`'s *Forgot your password?* leads here. The page is `../link-request.tsx`, shared with
 * `/login/resend`, whose header says what it does and why; the form posts to
 * `/api/auth/forgot-password`, and the link in the email that follows lands on
 * `/reset-password`, which moves it into this origin's server and opens `/login/reset`.
 */

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  return linkRequestMetadata('reset', searchParams);
}

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<React.JSX.Element> {
  return LinkRequestPage({ kind: 'reset', searchParams });
}
