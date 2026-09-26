'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Masthead } from '@/components/masthead/masthead';
import controls from '@/components/read/controls.module.css';
import { SKIP_TARGET_ID } from '@/components/skip/skip-link';
import { FALLBACK_LANGUAGE, chromeFor } from '@/lib/i18n/chrome';
import { indexHref } from '@/lib/index-href';
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
 *
 * Its links to the index do not prefetch, as none does: the index titles its tab in the
 * edition, and a prefetched head outlives a change of it (ADR-0069, `index-href.ts`). They
 * carry the failed address's edition where it named one (#169, the masthead's rule): a bare `/`
 * everywhere else, so the index opens in the edition this browser remembers.
 *
 * THE TWO WAYS ON ARE THE SHARED SET'S (#169): *Try again* filled, as the page's way on, and the
 * way back outlined beside it — the reading screens' `Next` and `Previous`. They were a filled
 * block that brightened under the pointer and a link drawn as text.
 */
export function RenderFailure({ error, retry }: RenderFailureProps): React.JSX.Element {
  const { language, contentsHref } = failedReading(usePathname());
  const chrome = chromeFor(language ?? FALLBACK_LANGUAGE);
  const words = chrome.renderError;
  const unavailable = isContentUnavailable(error);
  const programs = indexHref({ edition: language });

  return (
    <main className="shell" lang={chrome.language}>
      {/* The masthead (#169) and the skip link it carries (#149), in the address's edition. */}
      <Masthead home={programs} language={chrome.language} />
      <h1 className="lede" id={SKIP_TARGET_ID}>
        {unavailable ? words.unavailableTitle : words.failedTitle}
      </h1>
      <p className="standfirst">
        {unavailable ? '' : `${words.failedWhere} `}
        {`${words.nothingLost} ${words.tryLater}`}
      </p>
      <p className="enter">
        <button className={controls.primary} onClick={() => retry()} type="button">
          {words.retry}
        </button>
        {contentsHref ? (
          <Link className={controls.secondary} href={contentsHref}>
            {words.toContents}
          </Link>
        ) : (
          <Link className={controls.secondary} href={programs} prefetch={false}>
            {words.toPrograms}
          </Link>
        )}
      </p>

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
