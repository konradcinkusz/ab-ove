import Link from 'next/link';

import type { Chrome } from '@/lib/i18n/chrome';

import styles from './frame-view.module.css';

export interface NotReachedProps {
  readonly chrome: Chrome;
  readonly language: string;
  /** `Reveal.Refusal.Furthest` — the reader's own cursor, not this frame's number. */
  readonly furthest: number;
  readonly contentsHref: string;
  /** Where the furthest-reached frame actually is. */
  readonly furthestHref: string;
}

/**
 * ADR-0060 — the reveal gate refusing a step this reader has not earned, rendered directly
 * by the page the reader asked for.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * A DIRECT RENDER, NOT A REDIRECT — the opposite of `ProgramGate`/`shut-notice.tsx`'s
 * program-level equivalent, and the difference is where the truth lives.
 *
 * The program-level gate reads a reader's LOCAL, client-only progress and has to move them
 * off a page it cannot yet know is wrong — `program-gate.tsx` has the reasoning for why that
 * one cannot be a server redirect. This refusal is the opposite case: the reveal gate is
 * server-side and already knows, before any HTML is sent, that this step has not been
 * reached — so there is nothing to move the reader off of. The GET for the step they asked
 * for answers with this screen instead of the frame, in one response.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function NotReached({
  chrome,
  language,
  furthest,
  contentsHref,
  furthestHref,
}: NotReachedProps): React.JSX.Element {
  return (
    <article className={styles.page} lang={language}>
      <h1 lang={chrome.language}>{chrome.notReachedHeading}</h1>
      <p lang={chrome.language}>{chrome.notReachedBody(furthest)}</p>
      <p lang={chrome.language}>
        <Link href={furthestHref}>{chrome.backToLastFrame}</Link>
        {' · '}
        <Link href={contentsHref}>{chrome.backToContents}</Link>
      </p>
    </article>
  );
}
