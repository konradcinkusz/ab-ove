import type { Metadata, Viewport } from 'next';

import { ProgressSync } from '@/components/sync/progress-sync';

import './globals.css';

/**
 * FRONTEND-BFF.md §1 — no CDN, anywhere, at run time.
 *
 * There is deliberately no `next/font/google` import here. It reads well and it fetches the
 * font files from a third party at BUILD time, which makes the image build depend on a host
 * outside this estate; the self-hosting it then does is a good property bought at a price
 * this app does not need to pay. `globals.css` uses the reader's own system fonts, so this
 * page renders with zero external requests of any kind.
 */

/*
  THE PRODUCT IS THE PLATFORM, NOT ONE COURSE ON IT (ADR-0048).

  This title named a single work — the one course pinned on the day it was written — and
  every page of the application inherits it, so a reader on the courses page or on a second
  course's frame had a tab saying they were somewhere else. What ab-ovo IS, is a way of
  working programmed-learning courses; which courses a deployment carries is `PINS`, in
  `lib/content/bundle.ts`, and a deployment that pins two must not have one of them in the
  title of the other's pages. The first course is named in the description, where it is a
  fact about this deployment rather than a claim about the product.
*/
export const metadata: Metadata = {
  title: 'ab-ovo — courses you work, a frame at a time',
  description:
    'A learning platform for programmed-learning courses: each one a sequence of programs in the editions it is published in, worked a frame at a time, with its computer exercises running in the browser. The first is "Mathematics from Zero for the AI Engineer" — 47 programs in English and Polish. The instrument measures the book, never the reader.',
  applicationName: 'ab-ovo',
  // No `metadataBase` and no absolute URL anywhere in this object. An absolute site URL
  // here would be an environment-specific address baked into the image at build time —
  // FRONTEND-BFF.md §2's defect wearing a metadata tag — and the same image is meant to
  // serve dev and production unchanged (Checklist item 2).
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return (
    <html lang="en">
      <body>
        {children}
        {/*
          Synchronisation runs from the ROOT layout, for two reasons that pull the same way.

          A conflict does not happen on a page a reader navigates to — it happens when a
          sync lands, on whatever page they are looking at — so the notice it renders has
          to be reachable from every one of them (#11: "on the screen where the conflict
          happens"). And a layout is not remounted by a soft navigation, so a reader moving
          between frames keeps ONE subscriber and one debounce timer instead of acquiring a
          pair per page and firing a cycle on every frame turn.

          It renders nothing at all unless a position moved under the reader, and what it
          does render is `position: fixed` — so a page with no conflict is byte-identical to
          one built without it, and a page with one does not move when it arrives.

          It is last in the body so the reading content is the first thing in the document
          order for a screen reader, and so a notice that IS rendered comes after the page
          it is about rather than before it.
        */}
        <ProgressSync />
      </body>
    </html>
  );
}
