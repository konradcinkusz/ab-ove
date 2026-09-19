import Link from 'next/link';

import { chromeFor } from '@/lib/i18n/chrome';

/**
 * The page a reader lands on once the account is gone.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IT IS PUBLIC BECAUSE THE OPERATION THAT SENDS A READER HERE ENDS THEIR SESSION.
 *
 * This is the whole reason it is a separate page rather than `/account?deleted=1`. The
 * deletion route's last act is `clearSession()`, so by the time the browser follows the
 * 303 there is no cookie — and `/account` is private by default, so the middleware would
 * bounce it to `/login?redirect=/account%3Fdeleted%3D1`. The reader would confirm the
 * deletion of their account and be shown a sign-in form for it.
 *
 * Nothing warns about that. The route answers 303 and succeeds, the page exists and
 * renders, and the defect lives entirely in the interaction between a redirect and a gate
 * — visible only by following the redirect through the middleware, or by doing it once.
 *
 * So `/account/deleted` has its own entry in `PUBLIC_PATHS`, with the reason written
 * beside it, and it is the ONLY page under `/account` that has one.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * It takes no state and asserts nothing it cannot know: a reader who types this address
 * without having deleted anything is told what the page is for, which is harmless, and the
 * alternative — a flag on the query string — would be a claim the reader supplies about
 * what this server did.
 */

export const dynamic = 'force-dynamic';

export default async function AccountDeletedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const requested = params['lang'];
  const chrome = chromeFor(typeof requested === 'string' ? requested : '');
  const strings = chrome.deleteAccount;

  return (
    <main className="shell" lang={chrome.language}>
      <header className="masthead">
        <p className="wordmark">
          ab<span>-</span>ovo
        </p>
        <h1 className="lede">{strings.doneTitle}</h1>
      </header>

      <section className="section">
        <p>{strings.done}</p>
      </section>

      {/*
        Repeated here rather than left behind on the page the reader has just left. This is
        the moment the sentence is load-bearing: they have deleted an account and are
        entitled to know, on the page that confirms it, which of their traces the deletion
        did not reach.
      */}
      <section className="section">
        <h2>{strings.cannotReachTitle}</h2>
        <p>{strings.cannotReach}</p>
      </section>

      <section className="section">
        <h2>{strings.staysTitle}</h2>
        <p>{strings.stays}</p>
      </section>

      <footer className="colophon">
        <p>
          <Link href="/">{strings.keepReading}</Link>
        </p>
      </footer>
    </main>
  );
}
