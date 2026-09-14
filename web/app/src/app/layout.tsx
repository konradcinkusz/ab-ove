import type { Metadata, Viewport } from 'next';

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
      <body>{children}</body>
    </html>
  );
}
