import type { Metadata, Viewport } from 'next';

import { LanguageSync } from '@/components/language/language-sync';
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

export const metadata: Metadata = {
  title: 'ab-ovo — Mathematics from Zero for the AI Engineer',
  description:
    'A learning platform that encapsulates the book "Mathematics from Zero for the AI Engineer": 47 programs of programmed-learning frames in English and Polish, with the book\'s computer exercises running in the browser. The instrument measures the book, never the reader.',
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
        {/*
          The account's copy of the chosen edition, adopted once per page load (ADR-0048).

          Here for the same structural reason as the sync above — a layout is not remounted
          by a soft navigation, so one subscriber serves a whole reading session — and for a
          reason of its own: the index renders the edition out of a cookie, so the component
          that can correct that cookie from the account has to run on every page, not only
          on the index a reader may not visit again this session.

          It renders nothing at all, in every state. There is no notice to place and no
          layout to shift.
        */}
        <LanguageSync />
      </body>
    </html>
  );
}
