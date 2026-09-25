'use client';

import Link from 'next/link';
import { useEffect, useRef, useSyncExternalStore } from 'react';

import { chromeFor } from '@/lib/i18n/chrome';
import { serverSnapshot, snapshot, subscribe } from '@/lib/progress/client';
import { isOpen, wayOn } from '@/lib/progress/gate';

import styles from './program-grid.module.css';

export interface ShutNoticeProps {
  readonly track: string;
  /** The program the reader asked for and was turned away from. */
  readonly unit: string;
  /** The program the book puts before it — the one that opens it (ADR-0051). */
  readonly previous: string | undefined;
  /**
   * Every program the book puts before `unit`, in its order, ending with `previous` — ids
   * only (`refused-program.ts`). The way on is walked back through them.
   */
  readonly before: readonly string[];
  /** The edition the way on opens in: the one the index shows this course in. */
  readonly edition: string;
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
 * AND IT ENDS WITH A WAY ON, BECAUSE AN EXPLANATION WITH NOTHING TO PRESS IS HALF OF ONE
 * (issue #163).
 *
 * The sentence told the reader which program opens the one they asked for and left them to
 * find its tile. The link under it is that move: the program's contents, where its filled
 * control starts the frame that opens the next door. It is worked out from the same record
 * as the sentence, by `wayOn`, and it is the program that opens the refused one only when
 * this reader can open THAT — a link into the middle of the book, followed in a fresh
 * browser, would otherwise send them to a program that is shut too, and bounce them here
 * again one program further back. In that case the notice says so in a further sentence and
 * the link is the nearest program behind the refused one that is open to them, which for a
 * new reader is the first.
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
 * THE SERVER RENDERS IT AS FOR A READER WITH NO RECORD. This header used to say the server
 * rendered nothing here; measured for issue #163, a page loaded at `/?shut=F05` carries the
 * notice in its markup. `serverSnapshot` is the empty record (`lib/progress/client.ts`), under
 * which every program but the first is shut, so a LOADED `?shut=` address has the notice, and
 * a way on to the first program, in its first paint. The gate's own bounce never meets that
 * paint: `program-gate.tsx` moves the reader with a client navigation, and this renders from
 * their record straight away. The reader it is wrong for is one who reloads a `?shut=`
 * address for a program they have since opened: the notice leaves as their record arrives —
 * the tiles' first-paint trade (`tile-entry.tsx`), at the size of a block.
 */
export function ShutNotice({
  track,
  unit,
  previous,
  before,
  edition,
  language,
}: ShutNoticeProps): React.JSX.Element | null {
  const progress = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const chrome = chromeFor(language);
  const notice = useRef<HTMLDivElement>(null);
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

  // Always a program, because the first of a track is always open; `previous` stands in only
  // for a caller that handed over no run at all, which `refused-program.ts` never does.
  const way = wayOn(progress, track, before) ?? previous;

  return (
    <div
      className={styles.shutNotice}
      lang={chrome.language}
      ref={notice}
      role="status"
      tabIndex={-1}
    >
      <p>
        {chrome.shutNotice(unit, previous)}
        {way === previous ? null : ` ${chrome.shutNoticeFurther(unit, previous, way)}`}
      </p>
      <p>
        <Link className={styles.shutWayOn} href={`/read/${track}/${way}/${edition}`}>
          {chrome.shutNoticeWayOn(way)}
        </Link>
      </p>
    </div>
  );
}
