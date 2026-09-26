'use client';

import { RenderFailure } from '@/components/render-failure';

/**
 * The page behind a render failure.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * A 500 IS A FAULT ON THIS SIDE, AND THE PAGE SAYS WHICH ONE WHEN IT KNOWS.
 *
 * Since ADR-0060 the usual cause is the content API not answering: every frame is a live,
 * server-side call to `AbOvo.Api`, and the reading page throws when every candidate address
 * fails (`read/[track]/[unit]/[lang]/[step]/page.tsx`'s `unavailable` outcome). That throw
 * carries a digest of its own (`lib/read/render-failure.ts`), so this page can say "the
 * book's server did not answer" for that failure and for no other — any other gets a
 * sentence saying the fault is on this side and not in the address, which is all the page
 * can know about it. Either way "nothing a reader typed can cause it and nothing a reader
 * does can fix it", the line `bundleFor`'s doc comment drew first; what a reader CAN do is
 * wait, and the page says that nothing is lost by waiting (issue #139).
 *
 * The same page catches `/legal/<document>/<version>`'s throw when the host that publishes
 * the Terms and the Privacy Policy does not answer (`lib/server/legal.ts`, ADR-0049's
 * amendment): a document host is part of the deployment, and that failure gets the
 * fault-on-this-side sentence, because the page names no cause it cannot know.
 *
 * The page this replaced blamed "the deployment or the book's compiled bundle" for every
 * failure and promised a place "kept in this browser" — both from before ADR-0060, when
 * content was compiled in and the place lived in the browser alone.
 *
 * *TRY AGAIN* IS `retry`, NOT `reset`. `reset` clears the boundary and re-renders the payload
 * that already failed, so it could never recover, however long the reader waited; `retry`
 * refreshes the route first — the server is asked again — and then resets
 * (`next/dist/client/components/error-boundary.js`). Once the API answers, the frame comes
 * back in the page the reader pressed it on. `specs/error-page.spec.ts` holds both halves.
 *
 * THE WAY BACK IS THE PROGRAM'S CONTENTS when the address names a program, and the programs
 * otherwise — a reader two sections into P12 wants P12, not the whole grid of programs.
 *
 * IN THE READER'S EDITION, read off the address (`/read/<track>/<unit>/<lang>/…`), with the
 * words in `lib/i18n/chrome.ts` beside every other string a reader sees. This used to be
 * English only, on the reasoning `/login` gave then, that "there is no edition to follow when
 * the page that would have carried one is the page that failed" — but the ADDRESS did not
 * fail, and on the reading surface it always names one. Elsewhere there is none, and the page
 * is English. (The 404 reads the same address and, where it names nothing, the edition this
 * browser remembers, because its server half can read the cookie; this page is a Client
 * Component that renders where the server's did not, and has no server half to ask.)
 *
 * A CLIENT COMPONENT BY REQUIREMENT — `error.tsx` must be one, because it renders after the
 * server-side tree failed. `error.message` is never rendered: in production Next redacts it
 * to a generic sentence, and the `digest` is what an operator greps the log for, so the
 * digest is the one thing worth printing.
 *
 * The page itself is `components/render-failure.tsx`, because `app/global-error.tsx` says
 * the same thing when the root layout is what failed.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export default function RenderError({
  error,
  retry,
}: {
  readonly error: Error & { digest?: string };
  readonly retry: () => void;
}): React.JSX.Element {
  return <RenderFailure error={error} retry={retry} />;
}
