import type { Metadata } from 'next';
import Link from 'next/link';

import { SKIP_TARGET_ID, SkipLink } from '@/components/skip/skip-link';
import { chromeFor } from '@/lib/i18n/chrome';
import { indexHref } from '@/lib/index-href';

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

/**
 * The tab, in the page's edition: since ADR-0067 the document's language is the page's, and a
 * title left as the site's English one would be read out in the page's voice.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const requested = (await searchParams)['lang'];
  const chrome = chromeFor(typeof requested === 'string' ? requested : '');
  return { title: `${chrome.deleteAccount.doneTitle} — ab-ovo` };
}

export default async function AccountDeletedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const requested = params['lang'];
  const chrome = chromeFor(typeof requested === 'string' ? requested : '');
  const strings = chrome.deleteAccount;
  // The programs, in the edition this page is in, so leaving it does not undo the choice — and
  // not prefetched, since the index titles its tab in it (ADR-0067, `index-href.ts`).
  const programs = indexHref({ edition: chrome.language });

  return (
    <main className="shell" lang={chrome.language}>
      <SkipLink language={chrome.language} />
      <header className="masthead">
        {/* The way home, as on the account's other pages (issue #166). */}
        <p className="wordmark">
          <Link href={programs} prefetch={false}>
            ab<span>-</span>ovo
          </Link>
        </p>
        <h1 className="lede" id={SKIP_TARGET_ID}>{strings.doneTitle}</h1>
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
          <Link href={programs} prefetch={false}>{strings.keepReading}</Link>
        </p>
      </footer>
    </main>
  );
}
