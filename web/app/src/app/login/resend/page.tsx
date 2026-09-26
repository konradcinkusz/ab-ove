import type { Metadata } from 'next';

import { LinkRequestPage, linkRequestMetadata } from '../link-request.tsx';

/**
 * `/login/resend` — asking for the link that confirms an address, again (issue #170).
 *
 * The way back for an address that was never confirmed. `/login` offers it under the problems
 * such an address meets — a refused password among them, which is what the pinned authservice
 * answers an unconfirmed account with (`sign-in-problem.ts`). The page is `../link-request.tsx`,
 * shared with `/login/forgot`; the form posts to `/api/auth/resend-verification`, and the link in
 * the email lands on `/verify-email`, which moves it into this origin's server and opens
 * `/login/confirm`.
 */

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  return linkRequestMetadata('verify', searchParams);
}

export default async function ResendConfirmationPage({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<React.JSX.Element> {
  return LinkRequestPage({ kind: 'verify', searchParams });
}
