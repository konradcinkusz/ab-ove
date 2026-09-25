'use client';

import { useEffect, useState } from 'react';

import { readingUnavailable, type ProbeResult } from '@/lib/content/reading-probe';

import styles from './reading-unavailable.module.css';

/** The BFF path. `/api/proxy` + the service's own route — see the §5 routing table. */
const CONTENT = '/api/proxy/api/v1/content';

export interface ReadingUnavailableProps {
  /** The courses on screen. Each is probed, and one that would not open is enough to say so. */
  readonly tracks: readonly string[];
  /** The sentence, in the page's edition — `chrome.readingUnavailable`. */
  readonly message: string;
  readonly language: string;
}

/**
 * THE INDEX SAYS WHEN READING IS UNAVAILABLE — issue #158's decision for the index.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * The index stays on the bundle compiled into the app (the deviation register in
 * `docs/architecture/00-ARCHITECTURE.md` says why, and until when), so it renders with the
 * API stopped — and without this, every tile on it was a way into a program that would open
 * on the error page, with nothing on the page that led there to say so. This asks the API
 * the question a program's contents would ask, and when the book's server does not answer it
 * (`reading-probe.ts` says which answers count), says so above the list. The list stays: the
 * titles are the compiled bundle's, true whether or not the server answers, and a reader who
 * came to see what the book holds still can.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * FROM THE BROWSER, THROUGH THIS ORIGIN'S PROXY, AFTER THE PAGE IS UP — never during the
 * server render. The index's first property is that it renders without waiting on the API,
 * and a probe on the server would put the API's slowest answer in front of every first paint.
 * `/api/proxy` is this origin (FRONTEND-BFF.md §1), addressed by its fixed path as the
 * progress sync addresses it (`lib/progress/sync.ts`) rather than through `/api/config`: the
 * path is not an address that varies by deployment, and the integration panel on `/about`
 * stays the one component that reads the runtime config.
 *
 * THE LINE IS IN THE DOCUMENT FROM THE FIRST RENDER AND EMPTY, as the reveal's status line is
 * (`reading-foot.module.css`): a live region that arrives with its message is not reliably
 * announced. Empty, it has no box, so on the ordinary path — the API answering — nothing on
 * the page moves; only a page that has something to say grows by one line to say it.
 */
export function ReadingUnavailable({ tracks, message, language }: ReadingUnavailableProps): React.JSX.Element {
  const [down, setDown] = useState(false);
  // A string rather than the array, so the effect runs once per set of courses rather than
  // once per render of a parent that built a new array with the same ids in it.
  const key = tracks.join(' ');

  useEffect(() => {
    let cancelled = false;

    async function probe(track: string): Promise<ProbeResult> {
      try {
        const response = await fetch(`${CONTENT}/${encodeURIComponent(track)}`, {
          headers: { accept: 'application/json' },
          cache: 'no-store',
        });
        // The status is the answer; the program list it carries is the index's already.
        void response.body?.cancel();
        return response.status;
      } catch {
        return 'failed';
      }
    }

    void Promise.all(key.split(' ').filter(Boolean).map(probe)).then((results) => {
      if (!cancelled) setDown(results.some(readingUnavailable));
    });

    return () => {
      cancelled = true;
    };
  }, [key]);

  /*
    A POLITE LIVE REGION, AND NOT `role="status"`: the index already has one status, the shut
    notice (`shut-notice.tsx`), which a reader moved here is sent to and `gate.spec.ts` finds by
    that role — and an ordinary visit is held to having none. `aria-live` with `aria-atomic` is
    what the role would imply, announced the same way, without a second status on every visit.
  */
  return (
    <p
      aria-atomic="true"
      aria-live="polite"
      className={styles.notice}
      data-testid="reading-unavailable"
      lang={language}
    >
      {down ? message : null}
    </p>
  );
}
