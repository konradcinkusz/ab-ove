import { IntegrationReport } from '@/components/integration-report';

/**
 * The landing page.
 *
 * A Server Component that renders from content compiled into the app and nothing else: it
 * makes no fetch, reads no cookie and needs no backend. That is not an optimisation, it is
 * the product's first requirement — the reader loop must work with no account and no
 * backend — and a landing page that cannot render without an API would have broken it on
 * the first screen.
 *
 * The one live thing on the page is <IntegrationReport />, a Client Component that asks
 * this app's own origin what the API has. It is below the fold of the argument on purpose:
 * everything above it is true whether or not that panel finds anything.
 */
export default function LandingPage(): React.JSX.Element {
  return (
    <main className="shell">
      <header className="masthead">
        <p className="wordmark">
          ab<span>-</span>ovo
        </p>
        <h1 className="lede">A book you work, not a book you read.</h1>
        <p className="standfirst">
          ab-ovo encapsulates <em>Mathematics from Zero for the AI Engineer</em> — 47 programs
          of programmed-learning frames, in English and Polish, together with the book&rsquo;s
          computer exercises. The frames are Stroud&rsquo;s: each one asks for something before
          it tells you anything, and the next frame opens with the answer you should have
          written.
        </p>
      </header>

      {/*
        The anti-goal, first and in the reader's own interest.

        Every system that measures learning drifts towards measuring the learner, because
        that is the easier number to produce and the one that looks like progress. This
        product's instrument points the other way: a frame that most readers get wrong is
        evidence about the frame. Saying so on the landing page is the cheapest way to keep
        it true — a claim made publicly is one a later feature has to argue with.
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
            Where a program has computer exercises, work them in the lab pane. Python runs
            in your browser under Pyodide — your code does not leave the machine.
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
