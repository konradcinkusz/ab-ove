import type { Metadata, Viewport } from 'next';

import { LanguageSync } from '@/components/language/language-sync';
import { ProgressSync } from '@/components/sync/progress-sync';
import { ThemeFlag } from '@/components/theme/theme-flag';
import { THEME_BOOT } from '@/lib/theme/boot';

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
  `@ab-ovo/web-kit`'s `bundle.ts`, and a deployment that pins two must not have one of them in the
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
    /*
      `suppressHydrationWarning` IS ABOUT ONE ATTRIBUTE, AND IT IS NOT A BLANKET.

      The script below sets `data-theme` on this element before React ever sees the document,
      so the server's `<html>` and the browser's `<html>` differ by exactly that attribute for
      every reader who has chosen a theme. React's response would be a hydration warning on
      every page load — which, in a repository whose `specs/hydration.spec.ts` treats that
      console message as the instrument for a whole class of defect, is worse than noise: it
      is a permanent false positive in the one place we need to be believed.

      It suppresses the warning for THIS element's own attributes and nothing below it
      (React's flag is not inherited by children), so the guard that spec exists for is
      untouched.
    */
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          THE THEME, BEFORE THE FIRST PAINT (ADR-0048).

          The reader's choice lives in `localStorage`, which the server cannot read, so
          without this the document goes out with no theme, the stylesheet falls back to
          `prefers-color-scheme`, and a reader who asked for light on a dark machine watches
          the page correct itself after hydration — on every navigation.

          It is inline and synchronous because nothing else runs early enough, and inline is
          not a hole in FRONTEND-BFF.md §1: there is no `src`, no second origin, and no
          request. The script's TEXT is built from `lib/theme/store.ts`'s own constants
          (`lib/theme/boot.ts`) and executed by `lib/theme/boot.test.ts`, because a script
          that lives as a string is invisible to the compiler, the linter and the bundler.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
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
          And the theme, kept true for as long as the tab is open. It renders nothing and
          writes nothing on mount — the script above has already done the first paint's work
          — so all it costs a page is one subscription that fires when the reader switches in
          ANOTHER tab. See `theme-flag.tsx`.
        */}
        <ThemeFlag />
        {/*
          The account's copy of the chosen edition, adopted once per page load (ADR-0052).

          Here for the same structural reason as the sync above — a layout is not remounted
          by a soft navigation, so one subscriber serves a whole reading session — and for a
          reason of its own: the index renders the edition out of a cookie, so the component
          that can correct that cookie from the account has to run on every page, not only
          on the index a reader may not visit again this session.

          It renders nothing at all, in every state. There is no notice to place and no
          layout to shift. The theme does the same job one line up, through a boot script
          this cannot use: a cookie the server reads is available to the FIRST paint where
          `localStorage` is not, so the edition needs no inline script and the theme does.
        */}
        <LanguageSync />
      </body>
    </html>
  );
}
