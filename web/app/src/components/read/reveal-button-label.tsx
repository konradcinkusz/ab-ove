'use client';

import { useFormStatus } from 'react-dom';

/**
 * `pending-label.tsx`'s twin for the reveal, which is not a link — ADR-0060 turned it from a
 * `<Link>` into a `<form action={revealStep}>`, and `useLinkStatus` only reads the nearest
 * `<Link>`'s pending state, not a form's. `useFormStatus` is the same idea for a form: it must
 * be a DESCENDANT of the `<form>` for the same reason `PendingLabel` must be a `<Link>`'s
 * child, so this is a separate component rather than a branch inside that one.
 *
 * Same discipline as `PendingLabel`: a label and nothing else. This is a Client Component on
 * the reading surface, so its props are serialised into the document — a step, a body or an
 * answer may never be one of them.
 */
export function RevealButtonLabel({ label }: { readonly label: string }): React.JSX.Element {
  const { pending } = useFormStatus();
  return (
    <span aria-busy={pending || undefined} data-pending={pending ? 'yes' : 'no'}>
      {label}
    </span>
  );
}
