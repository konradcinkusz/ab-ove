import Link from 'next/link';
import type { Metadata } from 'next';

import { IntegrationReport } from '@/components/integration-report';

/**
 * What this is, how the loop works, and where the work has got to.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THIS WAS THE LANDING PAGE, AND EVERY WORD OF IT IS STILL HERE.
 *
 * It was in front of the book: a reader arriving at `/` met the loop, the phases and an
 * integration panel before any way into a program. The owner's first complaint on running
 * the application was side text unrelated to the frames, and this was the first and
 * largest of it — so it moved to the page a reader opens when they want it, rather than
 * being cut to make the first screen shorter. Nothing here is a summary of something
 * longer; this IS the longer thing.
 *
 * What did NOT move is the anti-goal. It is on the index, above the list, because a claim
 * about not measuring the reader is worth least on the page a reader visits deliberately
 * and most on the one they cannot avoid.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * A Server Component that renders from content compiled into the app and nothing else: it
 * makes no fetch, reads no cookie and needs no backend. The one live thing on the page is
 * <IntegrationReport />, a Client Component that asks this app's own origin what the API
 * has. It is below the fold of the argument on purpose: everything above it is true
 * whether or not that panel finds anything.
 */
export const metadata: Metadata = {
  title: 'About — ab-ovo',
  description: 'What ab-ovo is, how the reader loop works, and where the work has got to.',
};

export default function AboutPage(): React.JSX.Element {
  return (
    <main className="shell">
      <header className="masthead">
        <p className="wordmark">
          ab<span>-</span>ovo
        </p>
        <h1 className="lede">A book you work, not a book you read.</h1>
        <p className="standfirst">
          ab-ovo encapsulates <em>Mathematics from Zero for the AI Engineer</em> — 47 programs
          of programmed-learning frames, in English and Polish. The frames are Stroud&rsquo;s:
          each one asks for something before it tells you anything, and the next frame opens
          with the answer you should have written.
        </p>
        <p className="enter">
          <Link href="/read">Open the programs</Link>
        </p>
      </header>

      <section className="section">
        <h2>The loop</h2>
        <ol className="loop">
          <li>Read a frame. It is short by construction — one idea, sometimes one line.</li>
          <li>
            Commit an answer before you turn over. The commitment is the mechanism; a frame
            you skimmed teaches nothing, and the book is built on that assumption.
          </li>
          <li>
            Reveal the next frame, which opens with the answer. Compare, and carry on or go
            back one.
          </li>
          <li>
            Work the program&rsquo;s own exercises where it has them. What a frame asks for is
            a number, a word or a line of working — not a program — so nothing in the loop
            asks you to write code.
          </li>
        </ol>
      </section>

      <section className="section">
        <h2>What it needs from you</h2>
        <p>
          Nothing. The reader loop works with no account and no backend: frames are served
          with the site and everything you write stays in your own browser. An account buys
          exactly one thing — progress that follows you between machines — and it is the
          last phase of the work rather than the gate on the first.
        </p>
      </section>

      <section className="section">
        <h2>Where the work is</h2>
        <ul className="phases">
          <li>
            <dfn>Phase 1</dfn>
            <span>The lab pane: the book&rsquo;s computer exercises, running in the browser.</span>
          </li>
          <li>
            <dfn>Phase 2</dfn>
            <span>
              The content schema and the frame view — 47 programs, two languages, one
              structure.
            </span>
          </li>
          <li>
            <dfn>Phase 3</dfn>
            <span>Progress and accounts, for readers who want their place kept.</span>
          </li>
          <li>
            <dfn>Phase 4</dfn>
            <span>
              The instrument: which frames the book is getting wrong, and the evidence for
              it.
            </span>
          </li>
        </ul>
      </section>

      <IntegrationReport />

      <footer className="colophon">
        <p>
          This page is served entirely from its own origin. No font, stylesheet, script or
          icon is fetched from anywhere else, and the browser never talks to a backend
          directly — everything goes through this site.
        </p>
        <p>
          <a href="https://github.com/konradcinkusz/ab-ovo">github.com/konradcinkusz/ab-ovo</a>
        </p>
      </footer>
    </main>
  );
}
