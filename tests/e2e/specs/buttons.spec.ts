import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';

import { chromeFor } from '../../../web/app/src/lib/i18n/chrome.ts';
import { READER } from '../fixtures/accounts.mts';

import { served, track } from './support/bundle.ts';
import { signIn } from './support/sign-in.ts';

/**
 * JOURNEY — one family of buttons, off the reading screens as on them (#169).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * THE READING SCREENS HAD ONE FAMILY (ADR-0063), AND EVERY OTHER PAGE HAD ANOTHER.
 *
 * `components/read/controls.module.css` drew the reading screens' buttons: an 8 px corner, a
 * finger tall, the UI face, one focus ring. Beside them the index's and the 404's *Open the
 * programs*, the error page's *Try again*, the sign-in forms' submit, the consent's answers,
 * the account's *Sign out*, the deletion screen's button and the lab's bar were drawn by hand —
 * a 3 px corner (4 on the lab), about 34 px tall, and a brightness under the pointer. They
 * compose from that file now, and `lib/theme/tokens.test.ts` refuses a stylesheet that paints a
 * button of its own.
 *
 * What this file holds is what a reader gets: every one of those buttons has the SAME SHAPE as
 * the index's *Start*, which was the shared set's before this change — the same corner, height,
 * face, size and weight — is at least a finger tall, and answers the pointer with a change of
 * fill or edge rather than a filter.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * WHAT IT DOES NOT ASSERT: colours. A primary is filled and a secondary is outlined, and which is
 * which is each page's decision, recorded where it is made; the tokens are held in both schemes
 * by `tokens.test.ts`. Found by role and name wherever a name is stable, and by the test id the
 * lab publishes for its own bar.
 */

const en = chromeFor('en');

/** What makes two buttons one family. */
interface Shape {
  readonly corner: string;
  readonly minHeight: string;
  readonly face: string;
  readonly size: string;
  readonly weight: string;
}

const shapeOf = (control: Locator): Promise<Shape> =>
  control.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      corner: style.borderTopLeftRadius,
      minHeight: style.minHeight,
      face: style.fontFamily,
      size: style.fontSize,
      weight: style.fontWeight,
    };
  });

/** The index's *Start with …*, the shared set's `primary` before this issue (`program-grid.module.css`). */
async function referenceShape(page: Page): Promise<Shape> {
  await page.goto('/?lang=en');
  return shapeOf(page.getByTestId('start-card').getByRole('link'));
}

/** The paint a pointer can change: the fill and the edge, and whether a filter is involved at all. */
const paintOf = (control: Locator) =>
  control.evaluate((node) => {
    const style = getComputedStyle(node);
    return { fill: style.backgroundColor, edge: style.borderTopColor, filter: style.filter };
  });

/**
 * That `control` is one of the family: `reference`'s shape, a finger tall, and — unless it is
 * disabled — a hover that is a change of fill or edge, never a filter.
 */
async function isOfTheFamily(page: Page, control: Locator, what: string, reference: Shape): Promise<void> {
  await expect(control, `${what} is not on the page`).toBeVisible();
  expect(await shapeOf(control), `${what} is not the shared set's shape`).toEqual(reference);

  const box = await control.boundingBox();
  expect(box!.height, `${what} is ${box!.height} px tall, under a finger's 44`).toBeGreaterThanOrEqual(44);

  const rest = await paintOf(control);
  expect(rest.filter, `${what} is filtered at rest`).toBe('none');
  if (await control.isDisabled()) return;

  await control.hover();
  const hovered = await paintOf(control);
  expect(hovered.filter, `${what} answers the pointer with a filter`).toBe('none');
  expect(
    hovered.fill !== rest.fill || hovered.edge !== rest.edge,
    `${what} does not answer the pointer at all`,
  ).toBe(true);
  // Away again, so the next control's rest is measured at rest.
  await page.mouse.move(0, 0);
}

test.describe('one family of buttons off the reading screens', () => {
  test('the index’s consent answers are the shared set’s @smoke', async ({ page }) => {
    const reference = await referenceShape(page);
    await isOfTheFamily(page, page.getByRole('button', { name: en.consent.grant }), 'the grant', reference);
    await isOfTheFamily(page, page.getByRole('button', { name: en.consent.decline }), 'the decline', reference);
  });

  test('the argument’s and the 404’s way to the programs are the shared set’s @core', async ({ page }) => {
    const reference = await referenceShape(page);

    await page.goto('/about?lang=en');
    await isOfTheFamily(page, page.getByRole('link', { name: en.openPrograms, exact: true }), '/about’s way in', reference);

    await page.goto(`/read/${track}/NOPE/en`);
    await isOfTheFamily(page, page.getByRole('link', { name: en.openPrograms, exact: true }), 'the 404’s way back', reference);

    await page.goto('/nope');
    await isOfTheFamily(
      page,
      page.getByRole('main').getByRole('link', { name: en.openPrograms, exact: true }),
      'the missing page’s way back',
      reference,
    );
  });

  test('the lab’s bar is the shared set’s @core', async ({ page }) => {
    const reference = await referenceShape(page);
    await page.goto('/lab/p01');
    // Check, Stop and Reset: the filled way on, and the two outlined — Stop disabled until a run.
    for (const id of ['lab-run', 'lab-stop', 'lab-reset']) {
      await isOfTheFamily(page, page.getByTestId(id), `the lab's ${id}`, reference);
    }
  });

  /*
    THE ERROR PAGE, which needs a fault to render: the fixture `error-page.spec.ts` uses, in front
    of the first deployment, drops the requests of the one reader a test names. Skipped rather
    than made conditional without it, for that file's reason.
  */
  test('the error page’s two ways on are the shared set’s @core', async ({ page, context }) => {
    const fault = process.env.AB_OVO_FAULT_BASE_URL;
    test.skip(!fault, 'Needs the fault fixture in front of a running AbOvo.Api, as error-page.spec.ts does.');

    const reference = await referenceShape(page);
    const reader = await readerIdOf(context);
    await setCut(fault!, reader, 'PUT');
    try {
      const response = await page.goto(`/read/${track}/${served.units[0]!.id}/en`);
      expect(response?.status(), 'the contents did not fail, so there is no error page to measure').toBe(500);
      await isOfTheFamily(page, page.getByRole('button', { name: en.renderError.retry }), '*Try again*', reference);
      await isOfTheFamily(
        page,
        page.getByRole('link', { name: en.renderError.toPrograms, exact: true }),
        'the error page’s way back',
        reference,
      );
    } finally {
      await setCut(fault!, reader, 'DELETE');
    }
  });
});

/*
  THE FORMS, in the `identity` project — the only deployment where sign-in and registration
  carry their forms and the account's pages render for a session.
*/
test.describe('one family of buttons behind an account', () => {
  test('the sign-in and registration submits are the shared set’s @identity', async ({ page }) => {
    const reference = await referenceShape(page);

    await page.goto('/login?lang=en');
    await isOfTheFamily(page, page.locator('form button[type="submit"]'), 'the sign-in submit', reference);

    await page.goto('/register?lang=en');
    await isOfTheFamily(page, page.locator('form button[type="submit"]'), 'the registration submit', reference);

    await page.goto('/nope');
    await isOfTheFamily(
      page,
      page.getByRole('main').getByRole('link', { name: en.signIn, exact: true }),
      'the missing page’s way to sign in',
      reference,
    );
  });

  test('the account’s Sign out and the deletion screen’s button are the shared set’s @identity', async ({
    page,
  }) => {
    const reference = await referenceShape(page);

    await page.goto('/login?redirect=%2Faccount%3Flang%3Den');
    await signIn(page, READER, /\/account(\?|$)/);
    await isOfTheFamily(page, page.getByRole('main').getByRole('button', { name: en.signOut }), '*Sign out*', reference);

    // Measured and not pressed: the deletion itself is `account-deletion.spec.ts`'s.
    await page.goto('/account/delete?lang=en');
    await isOfTheFamily(page, page.locator('form button[type="submit"]'), 'the deletion button', reference);
  });
});

async function readerIdOf(context: BrowserContext): Promise<string> {
  const cookie = (await context.cookies()).find((candidate) => candidate.name === 'ab_ovo_rid');
  expect(cookie, 'no reader cookie was minted, so there is no reader to cut off').toBeTruthy();
  return cookie!.value;
}

/** Takes the API away from this one reader (`PUT`), or gives it back (`DELETE`) — `error-page.spec.ts`'s. */
async function setCut(fault: string, readerId: string, method: 'PUT' | 'DELETE'): Promise<void> {
  const response = await fetch(`${fault}/__fault/${encodeURIComponent(readerId)}`, { method });
  expect(response.status, `the fault fixture refused a ${method}`).toBe(204);
}
