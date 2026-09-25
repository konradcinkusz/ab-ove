import { expect, test, type BrowserContext } from '@playwright/test';

import { served, track } from './support/bundle.ts';
import { reveal } from './support/reveal.ts';

/**
 * JOURNEY — the book's server stops answering under a frame, and the reader gets back in.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * Issue #139. Since ADR-0060 every frame is a live call from the web app's server to
 * `AbOvo.Api`, so "the API did not answer" is the one failure the reading surface now has
 * as a matter of course — and the page behind it blamed the compiled bundle, promised a
 * place "kept in this browser" that the API keeps now, spoke English on a Polish frame, had
 * only the index for a way out, and titled the tab "Not found". Its *Try again* called
 * `reset()`, which re-renders the payload that had already failed, so it could not recover
 * however long the reader waited.
 *
 * Measured by hand once, on 2026-09-24, with the API stopped. It could not be a spec until
 * something could take the API away from ONE page: the call is made by the Next server, where
 * no browser-side route reaches it, and every spec shares one live API. The fault fixture in
 * front of the first deployment is that something (`fixtures/api-fault.mts`): it drops the
 * requests of the one reader a test names and forwards everybody else's, so the rest of the
 * run reads on beside this file.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * THE READER IS THE ONE THE APP MINTED. Each test opens `/` first, which makes the
 * middleware set `ab_ovo_rid` (ADR-0061) without a call to the API, and cuts THAT id — the
 * value the web app sends as `X-Ab-Ovo-Reader-Id` on every content request it makes for this
 * browser context. Nobody else holds it, so nobody else is cut.
 *
 * THE FIRST PROGRAM'S FIRST FRAME, because a reader with no record can open it: the program
 * gate opens the first program of a track to anybody (ADR-0051), and the reveal gate serves
 * frame 1 to a cursor that has never moved (ADR-0060). Read by position, for the reason
 * `no-backend.spec.ts` gives.
 */

const FAULT = process.env.AB_OVO_FAULT_BASE_URL;

const NEEDS_FAULT =
  'Needs the fault fixture in front of a running AbOvo.Api, which playwright.config.ts ' +
  'starts only for a local target given E2E_API_BASE_URL. CI always has both. Skipped ' +
  'rather than made conditional: with no fixture there is no way to take the API from one ' +
  'reader, and with no API at all there is nothing for *Try again* to come back to.';

const FIRST = served.units[0]!;

const frameAt = (language: string, n: number): string => `/read/${track}/${FIRST.id}/${language}/${n}`;
const contentsOf = (language: string): string => `/read/${track}/${FIRST.id}/${language}`;

async function readerIdOf(context: BrowserContext): Promise<string> {
  const cookie = (await context.cookies()).find((candidate) => candidate.name === 'ab_ovo_rid');
  expect(cookie, 'no reader cookie was minted, so there is no reader to cut off').toBeTruthy();
  return cookie!.value;
}

/** Takes the API away from this one reader (`PUT`), or gives it back (`DELETE`). */
async function setCut(readerId: string, method: 'PUT' | 'DELETE'): Promise<void> {
  const response = await fetch(`${FAULT}/__fault/${encodeURIComponent(readerId)}`, { method });
  expect(response.status, `the fault fixture refused a ${method}`).toBe(204);
}

test.describe('the error page', () => {
  test.skip(!FAULT, NEEDS_FAULT);

  test('a frame whose server did not answer says so, and Try again brings it back without a reload @smoke', async ({
    page,
  }) => {
    await page.goto('/');
    const reader = await readerIdOf(page.context());
    await setCut(reader, 'PUT');

    const response = await page.goto(frameAt('en', 1));
    expect(response?.status(), 'a failure on this side is a 500, never a 404 or a 200').toBe(500);

    // What happened, what is not lost, and what to do — in that order, in the reader's words.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('The book’s server did not answer.');
    await expect(page.getByRole('main')).toContainText(
      'Nothing you have written is lost, and neither is your place in the book.',
    );
    // Neither of the two claims the old page made, that are false since ADR-0060.
    await expect(page.getByRole('main')).not.toContainText('bundle');
    await expect(page.getByRole('main')).not.toContainText('kept in this browser');

    // The way back is the program's contents, which the address names — not the index.
    await expect(page.getByRole('link', { name: 'Back to the program’s contents' })).toHaveAttribute(
      'href',
      contentsOf('en'),
    );

    // A frame the server did not answer for is not a frame that does not exist.
    await expect(page).toHaveTitle('Frame 1 — ab-ovo');

    /*
      THE RECOVERY, AND THE PROOF IT WAS NOT A RELOAD. A mark on `window` survives anything
      but a new document, so if it is still there once the frame is on screen, *Try again*
      fetched the frame into the page it was pressed on. The old button's `reset()` re-rendered
      the payload that had failed and never asked the server again, so it could not pass this
      however long the API had been back.
    */
    await setCut(reader, 'DELETE');
    await page.evaluate(() => {
      (window as unknown as { abOvoSamePage?: boolean }).abOvoSamePage = true;
    });
    await page.getByRole('button', { name: 'Try again' }).click();

    await expect(reveal(page), 'the frame did not come back after Try again').toBeVisible();
    await expect(page.getByRole('heading', { name: 'The book’s server did not answer.' })).toHaveCount(0);
    expect(
      await page.evaluate(() => (window as unknown as { abOvoSamePage?: boolean }).abOvoSamePage),
      'the frame came back through a reload, not through Try again',
    ).toBe(true);
    await expect(page).toHaveTitle(`Frame 1 — ${FIRST.titles['en']!} — ab-ovo`);
  });

  test('a Polish frame that failed is explained in Polish @core', async ({ page }) => {
    await page.goto('/');
    const reader = await readerIdOf(page.context());
    await setCut(reader, 'PUT');

    const response = await page.goto(frameAt('pl', 1));
    expect(response?.status()).toBe(500);

    // The edition is the address's, so the page's words are Polish and say so on `lang`, for
    // a screen reader's voice as much as for the eye (`chrome.ts`'s header).
    await expect(page.getByRole('main')).toHaveAttribute('lang', 'pl');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Serwer książki nie odpowiedział.');
    await expect(page.getByRole('button', { name: 'Spróbuj ponownie' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Wróć do spisu treści programu' })).toHaveAttribute(
      'href',
      contentsOf('pl'),
    );

    // And the tab, which names the frame in the same edition and nothing it cannot know.
    await expect(page).toHaveTitle('Ramka 1 — ab-ovo');

    // Nobody else holds this reader, so a cut left behind by a failure above harms no other
    // test. It is lifted anyway, so a fixture reused by the next local run starts clean.
    await setCut(reader, 'DELETE');
  });

  test('a program’s contents and summary fail as a frame does, before the reader is led into one @core', async ({
    page,
  }) => {
    /*
      ISSUE #158. The contents and the summary read the compiled bundle, so with the API
      stopped they rendered — every heading on the contents a link into a frame that then
      answered 500. They come from the API now, so the page that fails is the first page of
      the program the reader opens, and it is the same page a frame gets.
    */
    await page.goto('/');
    const reader = await readerIdOf(page.context());
    await setCut(reader, 'PUT');

    const contents = await page.goto(contentsOf('en'));
    expect(contents?.status(), 'a failure on this side is a 500').toBe(500);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('The book’s server did not answer.');
    // The contents are the page that failed, so the way back is the programs (`failedReading`).
    await expect(page.getByRole('link', { name: 'Back to the program’s contents' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Open the programs' })).toBeVisible();
    // The tab names the page in the address's edition, and nothing the server would have said.
    await expect(page).toHaveTitle('Contents — ab-ovo');

    const summary = await page.goto(`${contentsOf('pl')}/summary`);
    expect(summary?.status()).toBe(500);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Serwer książki nie odpowiedział.');
    await expect(page.getByRole('link', { name: 'Wróć do spisu treści programu' })).toHaveAttribute(
      'href',
      contentsOf('pl'),
    );
    await expect(page).toHaveTitle('Podsumowanie — ab-ovo');

    // And back, once the server answers: the contents, from the API, for this reader.
    await setCut(reader, 'DELETE');
    await page.goto(contentsOf('en'));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(FIRST.titles['en']!);
  });
});
