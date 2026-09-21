'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';

import { chromeFor } from '@/lib/i18n/chrome';
import { serverSnapshot, snapshot, subscribe } from '@/lib/progress/client';
import { isOpen } from '@/lib/progress/gate';

import styles from './program-grid.module.css';

export interface ShutNoticeProps {
  readonly track: string;
  /** The program the reader asked for and was turned away from. */
  readonly unit: string;
  /** The program the book puts before it — the one that opens it (ADR-0051). */
  readonly previous: string | undefined;
  /** The index's edition, which this sentence is written in. */
  readonly language: string;
}

/**
 * WHY THIS PAGE IS ON SCREEN INSTEAD OF THE ONE THAT WAS ASKED FOR.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE GATE USED TO MOVE READERS SILENTLY, AND SILENCE IS NOT AN EXPLANATION.
 *
 * `program-gate.tsx` sends a reader who asks for a shut program back here, and everything
 * they were told about it was `opens after F01` in the position slot of one tile among
 * forty-seven. That is the right size of note for a reader BROWSING the index; it is not an
 * answer for a reader who followed a bookmark to F02 and watched the address bar change
 * under them. Their question is not "what does this tile mean" — it is "did the link rot,
 * is the program gone, did I do something wrong, what do I do now", and none of those four
 * were answered anywhere in the product.
 *
 * So the sentence says, in this order: what was refused, why this page opened instead, what
 * opens it and how little that takes, and where on this page the program they asked for is.
 * `chrome.shutNotice` carries the words; this component decides whether they are true.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IT ASKS THE GATE AGAIN RATHER THAN TRUSTING THE ADDRESS THAT BROUGHT IT HERE.
 *
 * `?shut=F02` is a claim anybody can type and a claim that goes stale: a reader who opens
 * F01 in a second tab has a record that says F02 is open now, and this tab's URL still says
 * it was refused. A notice rendered from the parameter alone would then be a page insisting
 * on a rule the product is no longer applying — the exact failure `program-gate.tsx` guards
 * against by subscribing to the record instead of reading it once.
 *
 * So the parameter names the program and the RECORD answers for it, through the same
 * `isOpen` every tile uses. When the answer is "open" this renders nothing at all, and the
 * reader is simply on the index with F02's tile linked like any other.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IT TAKES FOCUS, ONCE, AND THAT IS THE POINT RATHER THAN A FLOURISH.
 *
 * The address carries `#p-F02` as well, so the browser's own behaviour is to scroll the
 * TILE into view — past the sentence that explains why the reader is looking at it. Moving
 * focus here brings the explanation into view instead and puts the keyboard's next `Tab`
 * beside it, which is the standard remedy for a navigation the reader did not ask for.
 *
 * ONCE, guarded by a ref rather than by the dependency list: the record can change under
 * this page (a sync, a second tab) and a notice that grabbed focus again on every such
 * change would be taking the page away from a reader who had moved on. `role="status"`
 * announces it to a screen reader in the same breath, so the two ways of noticing agree.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * THE SERVER RENDERS NOTHING HERE, and deliberately: `serverSnapshot` is the empty record
 * (`lib/progress/client.ts`), under which every program but the first is shut — so a
 * server-rendered notice would be right for a new reader and wrong for the returning one,
 * printed into the markup a crawler keeps. The sentence arrives with the reader's own
 * record, like the tiles it is about.
 */
export function ShutNotice({
  track,
  unit,
  previous,
  language,
}: ShutNoticeProps): React.JSX.Element | null {
  const progress = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const chrome = chromeFor(language);
  const notice = useRef<HTMLParagraphElement>(null);
  const announced = useRef(false);

  // `previous` is re-tested rather than asserted, as on the tile: `isOpen` is true when
  // nothing precedes this program, so a refused one always has a program to name.
  const shut = previous !== undefined && !isOpen(progress, { track, unit, previous });

  useEffect(() => {
    if (!shut || announced.current) return;
    announced.current = true;
    notice.current?.focus();
  }, [shut]);

  if (!shut || previous === undefined) return null;

  return (
    <p
      className={styles.shutNotice}
      lang={chrome.language}
      ref={notice}
      role="status"
      tabIndex={-1}
    >
      {chrome.shutNotice(unit, previous)}
    </p>
  );
}
