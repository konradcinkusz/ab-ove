'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSyncExternalStore } from 'react';

import { SKIP_TARGET_ID, SkipLink } from '@/components/skip/skip-link';
import { chromeFor } from '@/lib/i18n/chrome';
import { indexHref } from '@/lib/index-href';
import { serverSnapshot, snapshot, subscribe } from '@/lib/language/client';
import { resolvedEdition } from '@/lib/language/store';
import { failedReading } from '@/lib/read/render-failure';

export interface NotFoundPageProps {
  /** Every edition the courses are published in — what any edition named must be one of. */
  readonly offered: readonly string[];
}

/**
 * The 404's words and its way back, in the reader's edition — the reasoning is in
 * `app/not-found.tsx`, which is where a reader of the route tree looks.
 *
 * ADR-0052's precedence, through `resolvedEdition`, the one place it is written down: the
 * address's edition, read as the 500 reads it (`failedReading` — only a whole reading address
 * counts, and only its own segment); else the choice this browser remembers; else English.
 * The pathname is known during the server render, so a reading address's 404 is in its
 * edition from the first paint. The remembered choice is not — the store's server snapshot is
 * "none", as for every control that reads it — so where only the memory names an edition, the
 * page renders once in English and again in that edition as soon as it is in the browser.
 */
export function NotFoundPage({ offered }: NotFoundPageProps): React.JSX.Element {
  const remembered = useSyncExternalStore(subscribe, snapshot, serverSnapshot)?.language;
  const edition = resolvedEdition(offered, failedReading(usePathname()).language, remembered);
  const chrome = chromeFor(edition);
  const strings = chrome.notFound;
  const programs = indexHref({ edition });

  return (
    <main className="shell" lang={chrome.language}>
      <SkipLink language={chrome.language} />
      <header className="masthead">
        <p className="wordmark">
          <Link href={programs}>
            ab<span>-</span>ovo
          </Link>
        </p>
        <h1 className="lede" id={SKIP_TARGET_ID}>
          {strings.title}
        </h1>
        <p className="standfirst">{strings.standfirst}</p>
        <p className="enter">
          <Link href={programs}>{chrome.openPrograms}</Link>
        </p>
      </header>

      <section className="section">
        <h2>{strings.followedTitle}</h2>
        <p>{strings.followed}</p>
      </section>
    </main>
  );
}
