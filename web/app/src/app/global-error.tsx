'use client';

import { RenderFailure } from '@/components/render-failure';

import './globals.css';

/**
 * The page behind a failure in the ROOT LAYOUT itself (issue #139).
 *
 * `app/error.tsx` sits inside `app/layout.tsx`, so it cannot catch what that layout throws,
 * and without this file such a failure fell through to Next's own default — a page in no
 * design language, with no way back. This is the same page as `error.tsx`, same words, same
 * *Try again*, same way back (`components/render-failure.tsx`), wrapped in the `<html>` and
 * `<body>` the failed layout would have given it, because a global error REPLACES the root
 * layout rather than rendering inside it.
 *
 * IT CARRIES LESS THAN THE LAYOUT IT STANDS IN FOR, deliberately. The stylesheet is imported
 * here because the layout that imports it is the thing that failed. The theme's boot script
 * (`lib/theme/boot.ts`) and the synchronisers are not: a page that exists because the shell
 * broke should depend on as little of the shell as it can, so it follows the reader's system
 * colour scheme rather than their chosen theme, and syncs nothing.
 *
 * `lang="en"` on `<html>` as in `app/layout.tsx`; the page's own `<main>` says which edition
 * it is actually in.
 */
export default function GlobalError({
  error,
  retry,
}: {
  readonly error: Error & { digest?: string };
  readonly retry: () => void;
}): React.JSX.Element {
  return (
    <html lang="en">
      <head>
        <title>ab-ovo</title>
      </head>
      <body>
        <RenderFailure error={error} retry={retry} />
      </body>
    </html>
  );
}
