import type { Metadata } from 'next';

import { LinkPage, linkPageMetadata } from '../link-page.tsx';

/**
 * `/login/confirm` — confirming an address, once the link in the email has been opened
 * (issue #170).
 *
 * `/verify-email`, where the link lands, moved the address and the token into this origin's
 * server and sent the reader here; the page is `../link-page.tsx`, shared with `/login/reset`.
 * It has no field: the form is one button, because the confirmation is spent by a POST the
 * reader makes and never by the GET a mail program makes to scan the link (the probe, §3).
 */

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  return linkPageMetadata('verify', searchParams);
}

export default async function ConfirmAddressPage({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<React.JSX.Element> {
  return LinkPage({ kind: 'verify', searchParams });
}
