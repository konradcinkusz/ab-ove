import type { Metadata } from 'next';
import Link from 'next/link';

import { IntegrationReport } from '@/components/integration-report';
import { SKIP_TARGET_ID, SkipLink } from '@/components/skip/skip-link';
import { chromeFor } from '@/lib/i18n/chrome';
import { indexHref } from '@/lib/index-href';
import { readerEdition } from '@/lib/server/reader-edition';

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
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ADR-0060 — THIS PAGE NEEDS NO API. READING DOES, AND THE PAGE NOW SAYS SO.
 *
 * "What it needs from you" used to answer "nothing": the reader loop worked with no account
 * and no backend, because frames were served with the site. ADR-0060 reversed the second
 * half — every frame and every reveal is a live call to `AbOvo.Api` — and left the first
 * standing, so the section now says the two separately, the way that ADR splits them: no
 * account (ADR-0004, ADR-0061), but this site's book server. The old sentence was false
 * exactly when a reader was most likely to be reading it — with the API stopped, the index
 * renders and every frame fails (measured 2026-09-24, #142). `specs/about.spec.ts` asserts
 * the new sentence.
 *
 * ADR-0040 — THE LAB IS NOT A STEP OF THE LOOP. The loop's fourth step was the program's own
 * exercises, with Python as its detour. The lab left the reader loop and the worksheet took
 * its place, so the worksheet is now the step, put where a reader uses it — between reading
 * the frame and committing an answer — and the lab has a section of its own, as what it is:
 * offered after a program, never beside a frame.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ISSUE #162 — THE PAGE SAYS WHAT A READER NEEDS, AND THE RECORDS KEEP THE REASONING.
 *
 * It cited `(ADR-0052)` in the middle of a sentence and ended on "Where the work is": Phase 1
 * to Phase 4, the order the product was BUILT in. Both were the repository talking to a
 * reader. The ADRs are cited in the comments beside the sentences they stand behind, and the
 * roadmap is gone from the screen — UI-UX.md still ranks the backlog by those phases, which
 * is where a contributor looks for them. The one fact in it a reader could use is the section
 * that replaced it: where the book's computer exercises are. `specs/about.spec.ts` asserts
 * both halves.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ISSUE #166 — IN THE READER'S EDITION, SO THE ANTI-GOAL IS PROMISED TO EVERY READER.
 *
 * The index's *O ab-ovo* opened this page in English. It is the page a reader opens to decide
 * whether to trust what the product measures, and a commitment written in one of the two
 * editions is a commitment made to half the readers, so the words are `chrome.aboutPage` and
 * the page resolves its edition as the index does: `?lang=`, which every link here carries
 * (`aboutHref`), else the edition this browser remembers, else English.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * A Server Component that renders from content compiled into the app and nothing else: no
 * fetch and no backend. It reads one cookie, this origin's own — the remembered edition —
 * which is why it is rendered per request where it used to be prerendered (ADR-0067 records
 * what that cost). Needing no backend is a fact about this page, not about reading, and it is
 * why the page can still tell a reader what is wrong when the API is not there. The one live
 * thing is <IntegrationReport />, a Client Component that asks this app's own origin what
 * the API has, and it is below the whole of the argument on purpose — everything above it is
 * true whether or not that panel finds anything. It is in English in both editions, and says
 * so: it reports the API's own words, which are English.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const strings = chromeFor(await readerEdition((await searchParams)['lang'])).aboutPage;
  return { title: strings.tabTitle, description: strings.description };
}

export default async function AboutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  const edition = await readerEdition((await searchParams)['lang']);
  const chrome = chromeFor(edition);
  const strings = chrome.aboutPage;
  // Both links to it decline to prefetch: the index titles its tab in the edition, and a
  // prefetched head outlives a change of it (ADR-0067, `index-href.ts`).
  const programs = indexHref({ edition });

  return (
    <main className="shell" lang={chrome.language}>
      <SkipLink language={chrome.language} />
      <header className="masthead">
        {/*
          The way back to the programs, first in the document, because this page is a
          detour from the loop rather than a step in it.
        */}
        <p className="wordmark">
          <Link href={programs} prefetch={false}>
            ab<span>-</span>ovo
          </Link>
        </p>
        <h1 className="lede" id={SKIP_TARGET_ID}>
          {strings.lede}
        </h1>
        <p className="standfirst">
          {strings.standfirst.before}
          <em>{strings.standfirst.work}</em>
          {strings.standfirst.after}
        </p>
        {/*
          The entry point, and on this page it is the way back to the first screen. Nothing
          past it needs an account (ADR-0004); the frames past it do need this site's book
          server, which is the claim the section two below it makes (ADR-0060).
        */}
        <p className="enter">
          <Link href={programs} prefetch={false}>{chrome.openPrograms}</Link>
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
      <section className="antigoal" aria-label={strings.antigoalLabel}>
        <p>
          <strong>{strings.antigoalClaim}</strong>
        </p>
        <p>{strings.antigoal}</p>
      </section>

      <section className="section">
        <h2>{strings.loopTitle}</h2>
        <ol className="loop">
          <li>{strings.loop[0]}</li>
          {/*
            ADR-0040 — the worksheet, in the place the lab used to hold as step four, and
            moved up to where it is used: a reader works a frame out before committing to an
            answer, not after seeing the book's. What a frame asks for is not a program, so
            this is the step that says no step asks for one.
          */}
          <li>{strings.loop[1]}</li>
          <li>{strings.loop[2]}</li>
          <li>{strings.loop[3]}</li>
        </ol>
      </section>

      <section className="section">
        <h2>{strings.needsTitle}</h2>
        {/*
          ADR-0060 — two requirements, stated as two, because they are independent and only
          one of them was reversed. The first sentence is what `specs/about.spec.ts` asserts.
          The account's half says what it is for. It said an account buys "exactly one
          thing", which the section below contradicts: the edition a reader chose is kept on
          the account too (ADR-0052). And it ended "the last phase of the work rather than
          the gate on the first", which read the roadmap below it — gone since issue #162 —
          back to the reader.
        */}
        <p>{strings.needs}</p>
      </section>

      <section className="section">
        <h2>{strings.editionTitle}</h2>
        {/*
          ADR-0052: the book still has two editions and no primary one — its own parity
          tooling gates them frame for frame — and this product opens in English and
          remembers a choice in this browser and on the account. The page cited it in its
          text until issue #162; it says what that means for a reader, and the record is
          named here.
        */}
        <p>{strings.edition}</p>
      </section>

      <section className="section">
        <h2>{strings.exercisesTitle}</h2>
        {/*
          ADR-0040, said to a reader: where the lab is, and that it is not in the loop. It
          was the first of four phases in a roadmap until issue #162, and the only one a
          reader could act on.
        */}
        <p>{strings.exercises}</p>
      </section>

      <IntegrationReport />

      <footer className="colophon">
        <p>{strings.colophon}</p>
        <p>
          <a href="https://github.com/konradcinkusz/ab-ovo">github.com/konradcinkusz/ab-ovo</a>
        </p>
      </footer>
    </main>
  );
}
