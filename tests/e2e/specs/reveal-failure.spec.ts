import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';

import { collectPageErrors, describePageErrors } from './support/page-errors.js';

import { track, uniqueProbeIn, unitNamed } from './support/bundle.ts';
import { reveal } from './support/reveal.ts';
import { walkTo } from './support/walk.ts';

/**
 * JOURNEY — a reveal that does not happen says so, beside `Next`, and the frame stays put.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * ISSUE #138, MEASURED BEFORE IT WAS FIXED: open a frame, stop `AbOvo.Api`, press `Next`, and
 * twelve seconds later the reader was still on the same frame, with no message, no busy state
 * and no change of address. `revealStep` redirected on success and returned nothing
 * otherwise, and its comment promised that Next would re-render the route and show the
 * unavailable screen — which Next 16 does not do after an action that revalidates nothing.
 * The keyboard's two ways to reveal (`→`, and `Ctrl`/`⌘`+`Enter` in the answer line) called
 * the action directly and showed no pending state at all.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * HOW THE FAILURE IS INJECTED, AND WHY NOT THE WAY `no-backend.spec.ts` INJECTS ITS OWN.
 *
 * That file fails the BROWSER's request to this app's BFF proxy, with route interception,
 * because the panel it drives fetches from the browser. The reveal does not: it is a Server
 * Action, so the browser POSTs to the frame's own address and it is THIS APP'S SERVER that
 * calls `POST .../advance` on `AbOvo.Api`. No route the browser can intercept is the call
 * that fails — aborting the browser's POST would test a different fault (this origin out of
 * reach), which the app answers differently (its error page), and would leave the path the
 * issue is about unexercised.
 *
 * What the browser DOES decide is what the server action sends: the reader's cookie. A value
 * that is not a reader id reaches the API as `X-Ab-Ovo-Reader-Id`, `ReaderIdentity.Resolve`
 * refuses it, the advance answers 400 (`NoIdentity`) — the issue's own third repro, "a reader
 * with no identity cookie" — and `lib/server/content.ts` walks its ladder and reports
 * `unavailable`, which is the outcome an API that answers nothing at all produces too. So
 * the real web server and the real API are both in the loop, and the one thing changed is
 * the credential; `reader-identity.spec.ts` sets its cookies the same way.
 *
 * Route interception still has a job here, and it changes nothing that is sent: it HOLDS the
 * action's POST in the browser, so the pending state can be looked at before it is over.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * What is NOT asserted: the rate limiter's sentence. A 429 from the configured rung cannot be
 * produced here without starving every other spec sharing the API, so `content.test.ts` and
 * `reveal-outcome.test.ts` hold that branch at the layer that has it.
 */

const unitId = 'F01';
const unit = unitNamed(unitId);
const steps = unit.steps;

const at = (language: string, n: number): string => `/read/${track}/${unitId}/${language}/${n}`;

/** The sentence a failed reveal shows, per edition — `chrome.ts`'s `revealUnreachable`. */
const UNREACHABLE: Readonly<Record<string, string>> = {
  en: 'Could not reach the book. Try again.',
  pl: 'Nie udało się dotrzeć do książki. Spróbuj ponownie.',
};

/** A frame that asks — the answer line and its `Ctrl+Enter` exist only there. */
const asking = steps.find((step) => step.cue && step.n < steps.length);
if (!asking) throw new Error(`${unitId} has no frame that asks before its last`);

const COOKIE = 'ab_ovo_rid';

const pager = (page: Page): Locator => page.locator('[data-pager]');
const status = (page: Page): Locator => pager(page).getByRole('status');
const pending = (page: Page): Locator => reveal(page).locator('[data-pending]');

/**
 * Swap the reader's cookie for a value the API will not take as a reader, and hand back the
 * way to put the real one back. Only the NEXT request carries it — the frame on screen was
 * rendered with the real one — so the reveal is the one call that fails.
 */
async function refuseTheNextAdvance(context: BrowserContext): Promise<() => Promise<void>> {
  const real = (await context.cookies()).find((cookie) => cookie.name === COOKIE);
  expect(real, 'no reader cookie was minted, so there is no identity to take away').toBeTruthy();
  const cookie = real as NonNullable<typeof real>;
  await context.addCookies([{ ...cookie, value: 'not-a-reader' }]);
  return async () => {
    await context.addCookies([cookie]);
  };
}

/** Every Server Action POST the page sends — the reveal is the only one on a frame. */
function countActions(page: Page): { readonly count: () => number } {
  let sent = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.headers()['next-action']) sent += 1;
  });
  return { count: () => sent };
}

/**
 * Hold the frame's own POST — the action — in the browser until `release` is called, so the
 * state between the press and the answer stays on screen long enough to be asserted.
 */
async function holdTheAction(page: Page, path: string): Promise<() => void> {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    (url) => url.pathname === path,
    async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      await held;
      return route.continue();
    },
  );
  return () => release();
}

async function keysReady(page: Page): Promise<void> {
  // `reading.spec.ts`'s `keysReady`, for the same reason: a key pressed before the handler
  // binds is lost, and the test would then be about the race rather than the page.
  await expect(page.locator('[data-frame-keys="on"]')).toHaveCount(1);
}

test.describe('a reveal the API does not take', () => {
  test('says so beside Next, keeps the frame, and works when pressed again @core', async ({
    page,
    context,
  }) => {
    const pageErrors = collectPageErrors(page);
    await page.goto(at('en', 1));
    await expect(page.locator('body')).toContainText(uniqueProbeIn(unit, 1, 'en'));
    // The live region is there before it has anything to say, or its first sentence is not
    // reliably announced — and it says nothing until something failed.
    await expect(status(page)).toHaveCount(1);
    await expect(status(page)).toHaveText('');

    const restore = await refuseTheNextAdvance(context);
    await reveal(page).click();

    await expect(status(page), 'a failed reveal said nothing').toHaveText(UNREACHABLE.en!);
    await expect(page, 'a failed reveal moved the reader').toHaveURL(new RegExp(`${at('en', 1)}$`));
    await expect(page.locator('body')).toContainText(uniqueProbeIn(unit, 1, 'en'));
    // ADR-0014 / ADR-0060: nothing of the next frame arrives with the refusal.
    await expect(page.locator('body')).not.toContainText(uniqueProbeIn(unit, 2, 'en'));

    // Try again, as the sentence says — with the reader's own identity back, it turns over,
    // and the sentence does not follow the reader onto the next frame.
    await restore();
    await reveal(page).click();
    await expect(page).toHaveURL(new RegExp(`${at('en', 2)}$`));
    await expect(page.locator('body')).toContainText(uniqueProbeIn(unit, 2, 'en'));
    await expect(status(page)).toHaveText('');

    expect(pageErrors, describePageErrors(pageErrors)).toEqual([]);
  });

  test('`→` shows the press was taken, cannot fire twice, and says what happened @core', async ({
    page,
    context,
  }) => {
    const pageErrors = collectPageErrors(page);
    const actions = countActions(page);
    await page.goto(at('en', 1));
    await keysReady(page);

    await refuseTheNextAdvance(context);
    const release = await holdTheAction(page, at('en', 1));

    await page.keyboard.press('ArrowRight');
    // The same busy state the button shows for a click — the key goes through the same form.
    await expect(pending(page), '`→` showed nothing while the reveal was on its way').toHaveAttribute(
      'data-pending',
      'yes',
    );
    // A second press while the first is out is not a second reveal.
    await page.keyboard.press('ArrowRight');
    release();

    await expect(status(page)).toHaveText(UNREACHABLE.en!);
    await expect(pending(page)).toHaveAttribute('data-pending', 'no');
    await expect(page).toHaveURL(new RegExp(`${at('en', 1)}$`));
    expect(actions.count(), 'two presses of `→` sent two reveals').toBe(1);

    expect(pageErrors, describePageErrors(pageErrors)).toEqual([]);
  });

  test('`Ctrl+Enter` in the answer line keeps what was written and says what happened, in Polish @core', async ({
    page,
    context,
  }) => {
    const pageErrors = collectPageErrors(page);
    await walkTo(page, unitId, 'pl', asking.n);
    await page.goto(at('pl', asking.n));
    await keysReady(page);

    await refuseTheNextAdvance(context);
    const release = await holdTheAction(page, at('pl', asking.n));

    const line = page.locator('#answer-line');
    await line.fill('42');
    await line.press('Control+Enter');
    await expect(pending(page), '`Ctrl+Enter` showed nothing while the reveal was on its way').toHaveAttribute(
      'data-pending',
      'yes',
    );
    release();

    await expect(status(page)).toHaveText(UNREACHABLE.pl!);
    await expect(page).toHaveURL(new RegExp(`${at('pl', asking.n)}$`));
    await expect(line, 'the answer was lost with the reveal').toHaveValue('42');

    expect(pageErrors, describePageErrors(pageErrors)).toEqual([]);
  });
});

test.describe('a reveal the API does not take, with no JavaScript at all', () => {
  /*
    THE FORM IS A FORM FIRST (ADR-0060, `pager.spec.ts`'s own no-script block). With no script
    the browser posts it, the server runs the same action, and — the action having returned a
    failure rather than a redirect — renders the same frame with the sentence in it.
  */
  test.use({ javaScriptEnabled: false });

  test('renders the same frame with the sentence beside Next @core', async ({ page, context }) => {
    await page.goto(at('en', 1));
    await expect(page.locator('body')).toContainText(uniqueProbeIn(unit, 1, 'en'));

    const restore = await refuseTheNextAdvance(context);
    await reveal(page).click();

    await expect(status(page)).toHaveText(UNREACHABLE.en!);
    await expect(page).toHaveURL(new RegExp(`${at('en', 1)}$`));
    await expect(page.locator('body')).toContainText(uniqueProbeIn(unit, 1, 'en'));
    await expect(page.locator('body')).not.toContainText(uniqueProbeIn(unit, 2, 'en'));

    await restore();
    await reveal(page).click();
    await expect(page).toHaveURL(new RegExp(`${at('en', 2)}$`));
  });
});
