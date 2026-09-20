'use client';

import { useLinkStatus } from 'next/link';

/**
 * The reveal's label, which knows whether the reveal is under way.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE ONE PLACE IN THE PRODUCT WHERE A ROUND TRIP IS GUARANTEED TO BE VISIBLE.
 *
 * Every other navigation may be prefetched. The reveal must not be — `prefetch={false}`
 * is half of ADR-0014's property, "do not remove this to make the reveal feel faster" —
 * so pressing it always costs a fetch, and until now nothing on the page moved while it
 * ran. On a slow connection that is a filled button that appears to do nothing, and a
 * reader who presses it twice.
 *
 * `useLinkStatus` is Next's own answer: it reads the pending state of the nearest
 * `<Link>`, which is why this has to be the link's CHILD rather than the link. The
 * stylesheet dims the whole control through `:has()` and sets `cursor: progress`;
 * `aria-busy` says the same to a screen reader. Nothing moves — `opacity` is not layout —
 * so `specs/reading.spec.ts`'s shift bound on the reveal is untouched.
 *
 * IT TAKES A LABEL AND NOTHING ELSE. This is a Client Component on the reading surface,
 * and the rule that governs `frame-keys.tsx` and `remember-position.tsx` governs it: its
 * props are serialised into the document, so a step, a body or an answer may never be one
 * of them. A chrome string is not content.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function RevealLabel({ label }: { readonly label: string }): React.JSX.Element {
  const { pending } = useLinkStatus();
  return (
    <span aria-busy={pending || undefined} data-pending={pending ? 'yes' : 'no'}>
      {label}
    </span>
  );
}
