'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';

import { indexHref } from '@/lib/index-href';
import { serverSnapshot, snapshot, subscribe } from '@/lib/progress/client';
import { isOpen } from '@/lib/progress/gate';

export interface ProgramGateProps {
  readonly track: string;
  readonly unit: string;
  /** The program the book puts before this one, or `undefined` for the first (ADR-0051). */
  readonly previous: string | undefined;
  /** The edition this page is in, so the index the reader lands on is in it too. */
  readonly language: string;
}

/**
 * The gate on the reading routes: a reader who has not got here yet is sent back.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WITHOUT THIS, THE RULE IS A DECORATION ON ONE PAGE.
 *
 * ADR-0051 shuts a program until the reader has a place in the one before it, and the
 * index expresses that by not rendering a link. A link is not the only way into a URL: the
 * address bar, a bookmark, a shared link, the contents page's own foot and the browser's
 * history all reach `/read/<track>/<unit>/<lang>` without passing a tile. So the three
 * reading routes ask the same question the tile asked, and the ones that are shut send the
 * reader to the index.
 *
 * IT IS NOT A SERVER REDIRECT TODAY, AND THE REASON CHANGED UNDER IT. It used to be a
 * property of the product: the record lived only in the reader's browser (ADR-0017), the
 * pages were rendered with no reader at all, and the loop was required to need no server
 * (ADR-0004), so a server that could gate these routes would have been one that knows who
 * is asking. ADR-0060 and ADR-0061 built exactly that for the FRAME — `AbOvo.Api` now holds
 * every reader's cursor, an anonymous one's under an opaque cookie, and refuses a step past
 * it. What they did not build is THIS rule: the API's gate is per step within a program and
 * deliberately does not carry the program-level one (`src/AbOvo.Api/Content/Reveal.cs` says
 * why), so a program's contents, which the API serves since issue #158, come back whether or
 * not the program is open. So this question is still put to the browser's record: the page
 * renders, hydration reads the record, and a shut program is left within a few hundred
 * milliseconds.
 * The honest cost is in ADR-0051's Consequences: the first paint of a shut program is the
 * program, and a reader with script off is not gated at all.
 *
 * `replace`, NEVER `push`. A pushed redirect puts the shut page in the history behind the
 * index, so *Back* returns to it and is bounced forward again — the reader is in a trap
 * they cannot leave in the direction they are pressing.
 *
 * IT LANDS ON THE TILE. The index is forty-seven tiles and a reader who has just been
 * moved is owed the one they asked for, so the redirect carries a fragment naming the
 * program, and the course and edition they were reading — through `indexHref`, which is
 * the one place that address is built (its own note says why a fifth hand-rolled template
 * string is a fifth chance to drop a parameter).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * AND IT CARRIES THE REASON, WHICH IT DID NOT USED TO.
 *
 * What stood here said the tile's own `opens after P06` "is the whole of the explanation,
 * and it is at the destination rather than in a notice this page would have to invent and
 * carry across a navigation." Two of those three claims held. The third did not: it
 * assumed a reader who NOTICED a navigation they had not asked for, understood that the
 * new page was an answer to the old address, and then found one tile in forty-seven. A
 * reader who follows a bookmark to F02 and finds the index instead has been told nothing —
 * they do not know the program exists, whether the link rotted, or what to do next.
 *
 * The notice is not invented and not carried in state: `?shut=<unit>` says which program
 * to ask about, `shut-notice.tsx` asks the GATE about it again — against the reader's own
 * record, which may by then say something else — and renders the sentence only if the
 * answer is still "shut". The tile's note stays exactly as it was, because it is the right
 * size for the other forty-six.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * It subscribes to the record rather than reading it once, because the record can change
 * under a page: a sync adopting the account's copy (`lib/progress/sync.ts`) or a forget in
 * another tab both announce here. The consequence worth knowing is the second one — a
 * reader who forgets their place in one tab is returned to the index in the other, which
 * is the record and the page agreeing rather than a page left standing on a permission
 * that has been withdrawn.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE DECISION IS TAKEN FROM `snapshot()` AND NOT FROM THE SUBSCRIBED VALUE, AND THAT IS A
 * MEASURED BUG RATHER THAN A PREFERENCE.
 *
 * `useSyncExternalStore` returns the SERVER snapshot — an empty record — for the render
 * that hydrates, which is correct and is what keeps the markup identical. An effect
 * queued by that render therefore carries "this reader has nothing", and the first draft
 * of this component redirected on it: a reader who was ten frames into F02 lost the page
 * under them on every reload, and the acceptance suite caught it as a reveal link
 * detaching mid-click.
 *
 * So the effect asks the browser for the record itself. The subscribed value stays, in the
 * dependencies, as the thing that RE-ASKS the question when the record changes; it is
 * never the thing that answers it. The recorder does the same for the same reason
 * (`remember-position.tsx`), and now for a second: two components reading storage the same
 * way cannot disagree about what is in it.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function ProgramGate({ track, unit, previous, language }: ProgramGateProps): null {
  const progress = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const router = useRouter();

  useEffect(() => {
    if (isOpen(snapshot(), { track, unit, previous })) return;
    router.replace(`${indexHref({ track, edition: language, shut: unit })}#p-${unit}`);
    // `progress` is a dependency and not a value: a record that changes under the page
    // asks the question again, and the answer is read from storage when it does.
  }, [progress, track, unit, previous, router, language]);

  return null;
}
