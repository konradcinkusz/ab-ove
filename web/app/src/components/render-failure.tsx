'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { FALLBACK_LANGUAGE, chromeFor } from '@/lib/i18n/chrome';
import { failedReading, isContentUnavailable } from '@/lib/read/render-failure';

export interface RenderFailureProps {
  readonly error: Error & { readonly digest?: string };
  /** Next's `retry`: a router refresh, then a reset — the server is asked again. */
  readonly retry: () => void;
}

/**
 * The words and the two ways on, shared by `app/error.tsx` and `app/global-error.tsx` — the
 * second is the first with the `<html>` the failed root layout would have given it. The
 * reasoning is in `app/error.tsx`'s header, which is where a reader of the route tree looks.
 *
 * The edition is the failed address's (`failedReading`), English where the address has none
 * or names one this application has no words for, and `lang` says which one the page ended
 * up in — `chromeFor`'s contract, kept here as on every reading screen.
 */
export function RenderFailure({ error, retry }: RenderFailureProps): React.JSX.Element {
  const { language, contentsHref } = failedReading(usePathname());
  const chrome = chromeFor(language ?? FALLBACK_LANGUAGE);
  const words = chrome.renderError;
  const unavailable = isContentUnavailable(error);

  return (
    <main className="shell" lang={chrome.language}>
      <header className="masthead">
        <p className="wordmark">
          <Link href="/">
            ab<span>-</span>ovo
          </Link>
        </p>
        <h1 className="lede">{unavailable ? words.unavailableTitle : words.failedTitle}</h1>
        <p className="standfirst">
          {unavailable ? '' : `${words.failedWhere} `}
          {`${words.nothingLost} ${words.tryLater}`}
        </p>
        <p className="enter">
          <button onClick={() => retry()} type="button">
            {words.retry}
          </button>
          {contentsHref ? (
            <Link className="quiet" href={contentsHref}>
              {words.toContents}
            </Link>
          ) : (
            <Link className="quiet" href="/">
              {words.toPrograms}
            </Link>
          )}
        </p>
      </header>

      {error.digest ? (
        <section className="section">
          <h2>{words.reportTitle}</h2>
          <p className="meta">
            {words.reference} <code>{error.digest}</code>
          </p>
        </section>
      ) : null}
    </main>
  );
}
