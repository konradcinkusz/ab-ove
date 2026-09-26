'use client';

import { useLinkStatus } from 'next/link';

/**
 * The label of a link on the reading surface, which knows whether the page it leads to is on
 * its way.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * EVERY PAGE THESE LINKS LEAD TO IS A ROUND TRIP, AND NOTHING SAID SO (issue #160).
 *
 * A frame is rendered on the server, per request, from live calls to `AbOvo.Api` (ADR-0060).
 * It is a dynamic route with no `loading.tsx`, so Next has nothing of it to show before the
 * server answers, and the links that could carry an answer are never prefetched at all
 * (`prefetch={false}`, ADR-0014). So every press waits on the server, and until #160 only the
 * forward button showed it: `Previous`, the program map and *Go to frame* went on looking
 * exactly as they had while the server worked — a press that seemed to do nothing, and a
 * reader who pressed again.
 *
 * `useLinkStatus` is Next's own answer: it reads the pending state of the nearest `<Link>`,
 * which is why this is the link's CHILD rather than the link. It changes two attributes and
 * no box — the stylesheets set the cursor, and move an icon by `transform` or the map's door
 * by `opacity`, none of which is layout — so the pager stays exactly where ADR-0063 pinned it
 * while the next page comes.
 *
 * NOT A `loading.tsx`, deliberately. A loading boundary would swap the frame for a skeleton
 * on every turn of the page, with the bars drawn again from nothing but the address: a
 * `loading.tsx` is handed no params and no content, so its top bar has no program title —
 * and on a phone the title, which wraps (`reading-top.module.css`), is what decides how tall
 * that bar is. The frame stays on screen instead, marked as leaving, until the next one
 * replaces it, and nothing around it is drawn twice.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * IT TAKES A LABEL AND NOTHING ELSE. This is a Client Component on the reading surface, and
 * the rule `frame-keys.tsx` states governs it: its props are serialised into the document, so
 * a step, a body or an answer may never be one of them. What it is given is what the link
 * already shows — a chrome string, a program's or a heading's title.
 */
export function PendingLabel({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  const { pending } = useLinkStatus();
  return (
    <span aria-busy={pending || undefined} data-pending={pending ? 'yes' : 'no'}>
      {children}
    </span>
  );
}
