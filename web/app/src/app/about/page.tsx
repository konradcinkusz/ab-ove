import type { Metadata } from 'next';
import Link from 'next/link';

import { IntegrationReport } from '@/components/integration-report';

/**
 * What ab-ovo is, and what its instrument is for.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ADR-0036 — THIS IS THE PROSE THAT USED TO BE THE FIRST SCREEN, AND IT MOVED WHOLE.
 *
 * It was not trimmed on the way. The landing page is now the programs, and the argument for
 * the product is a page a reader chooses to open — but the argument is the same argument,
 * because the sections below are the ones a later feature has to argue with. The anti-goal
 * in particular is NOT marketing copy: it is a public commitment about what this system
 * will never measure, and `tests/e2e/specs/about.spec.ts` asserts it here for the same
 * reason it used to assert it on `/`.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * A Server Component that renders from content compiled into the app and nothing else: no
 * fetch, no cookie, no backend. The one live thing is <IntegrationReport />, a Client
 * Component that asks this app's own origin what the API has, and it is below the whole of
 * the argument on purpose — everything above it is true whether or not that panel finds
 * anything.
 */
export const metadata: Metadata = {
  title: 'About — ab-ovo',
  description:
    'What ab-ovo is, how the reader loop works, and what the instrument measures — the book, never the reader.',
};

export default function AboutPage(): React.JSX.Element {
  return (
    <main className="shell">
      <header className="masthead">
        {/*
          The way back to the programs, first in the document, because this page is a
          detour from the loop rather than a step in it.
        */}
        <p className="wordmark">
          <Link href="/">
            ab<span>-</span>ovo
          </Link>
        </p>
        <h1 className="lede">A book you work, not a book you read.</h1>
        <p className="standfirst">
          ab-ovo encapsulates <em>Mathematics from Zero for the AI Engineer</em> — 47 programs
          of programmed-learning frames, in English and Polish, together with the book&rsquo;s
          computer exercises. The frames are Stroud&rsquo;s: each one asks for something before
          it tells you anything, and the next frame opens with the answer you should have
          written.
        </p>
        {/*
          The entry point, and on this page it is the way back to the first screen. It needs
          no account and no backend, which is the claim the section two below it makes
          (ADR-0004).
        */}
        <p className="enter">
          <Link href="/">Open the programs</Link>
        </p>
      </header>

      {/*
        The anti-goal, first and in the reader's own interest.

        Every system that measures learning drifts towards measuring the learner, because
        that is the easier number to produce and the one that looks like progress. This
        product's instrument points the other way: a frame that most readers get wrong is
        evidence about the frame. Saying so in public is the cheapest way to keep it true —
        a claim made publicly is one a later feature has to argue with — and ADR-0036 moved
        the page it is said on without weakening the claim or the test that holds it.
      */}
      <section className="antigoal" aria-label="What this instrument is for">
        <p>
          <strong>The instrument measures the book, never the reader.</strong>
        </p>
        <p>
          When a frame is answered wrongly by many readers, that is a finding about the
          frame — its wording, its position, the frame before it — and it goes into
          revising the book. ab-ovo does not score you, rank you, or build a profile of
          what you are bad at. There is no leaderboard and there will not be one.
        </p>
      </section>

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
            a number, a word or a line of working &mdash; not a program &mdash; so nothing in
            the loop asks you to write code. Python is a detour for the one program that has
            computer exercises, never a step.
          </li>
        </ol>
      </section>

      <section className="section">
        <h2>What it needs from you</h2>
        <p>
          Nothing. The reader loop works with no account and no backend: frames are served
          with the site and the lab runs client-side. An account buys exactly one thing —
          progress that follows you between machines — and it is the last phase of the work
          rather than the gate on the first.
        </p>
      </section>

      <section className="section">
        <h2>Which edition you read</h2>
        <p>
          Both, or either, and the choice is yours to make rather than ours to guess. The
          book has two editions and no primary one — its own tooling gates them frame for
          frame — so the index lists a title per edition until you pick one, and picking one
          is a link you can see, share and leave (ADR-0015, ADR-0036). No flag, no default,
          and nothing inferred from your browser&rsquo;s settings.
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
