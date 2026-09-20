import { expect, test } from '@playwright/test';

import { served, track, trackTitles } from './support/bundle.ts';

/**
 * JOURNEY 1c — the courses, and the index narrowed to one of them.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ADR-0048 — A COURSE IS CHOSEN ON A PAGE, AND THE INDEX NARROWS TO IT.
 *
 * `specs/landing.spec.ts` owns the index itself: the grid, the edition switch, the account
 * control. This file owns the choice one level up — which course the index is showing — and
 * the property it protects is that the two narrowings are INDEPENDENT. Choosing an edition
 * must not un-narrow the course, and choosing a course must not choose an edition; each of
 * those failures leaves a page that looks perfectly reasonable and has quietly undone
 * something the reader asked for.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * IT ASSERTS HREFS RATHER THAN TILES, for `landing.spec.ts`'s reason: a list of courses that
 * linked nowhere would satisfy every assertion a "renders" test makes. And it counts
 * nothing that the number of pinned courses could change — one course and three courses must both
 * pass, because today's deployment pins one and the page exists for the day it pins more.
 *
 * NO ACCOUNT AND NO BACKEND: the page reads content compiled into the app, exactly as the
 * index does, which is why the first test is `@smoke`.
 */

/** A literal title, as a pattern — the titles carry characters a bare RegExp would read. */
const rx = (text: string): RegExp => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

/** The served course, by the two things a URL and an assertion need. */
const COURSE = {
  href: `/?track=${track}`,
  en: trackTitles['en']!,
  pl: trackTitles['pl']!,
};

/** The same, in the edition a reader who has chosen nothing gets (ADR-0052). */
const DEFAULTED = `${COURSE.href}&lang=en`;

test.describe('the courses page', () => {
  test('lists every course, and each one is a link into the index @smoke', async ({ page }) => {
    const response = await page.goto('/courses');
    expect(response?.status(), 'the courses page must answer 200').toBe(200);

    // The page is the real page and not an error document or an empty shell, asserted
    // before anything on it — `landing.spec.ts` says why that order matters.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Courses');

    /*
      THE REQUIREMENT, AS AN HREF: the course reaches the index NARROWED TO ITSELF. Not "a
      link exists" and not "the title is on the page" — `?track=` is the whole of what
      choosing a course does, and it is the only part a list of titles cannot fake.
    */
    const course = page.getByRole('link', { name: rx(COURSE.en) });
    await expect(course).toHaveAttribute('href', DEFAULTED);

    /*
      ONE ENTRY PER PINNED COURSE, which is one today and is asserted as one on purpose.

      This suite cannot see how many courses a deployment pins: `support/bundle.ts` reads
      the single compiled bundle the application serves, so "every pinned course is listed"
      is held where the logic is — `web/app/src/lib/content/chosen-track.test.ts`, which is
      written against two. What this line holds is that the page renders an entry per course
      it knows about rather than a title with no link behind it, and the day a second course
      is pinned it fails and says which file has to learn to read a second bundle. A count
      relaxed to "at least one" would pass on a page that listed one of two.
    */
    await expect(page.locator('a[href^="/?track="]')).toHaveCount(1);
  });

  test('is one move from the index, and the index is one move back @core', async ({ page }) => {
    await page.goto('/');

    const courses = page.getByRole('link', { name: 'Courses' });
    await expect(courses).toHaveAttribute('href', '/courses?lang=en');
    await courses.click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Courses');

    // The way back is the label the reading surface already uses for the same destination,
    // and it leads to the index that shows every course rather than to one of them. It
    // carries the edition and nothing else: `?lang=` is not a narrowing (ADR-0052), it is
    // the one thing every screen in the product is in.
    await page.getByRole('link', { name: '← Programs' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Programs');
    expect(
      new URLSearchParams(new URL(page.url()).search).get('track'),
      'the way back narrows nothing',
    ).toBeNull();
  });

  test('shows one title per course, in the reader’s edition @core', async ({ page }) => {
    /*
      THIS TEST REVERSED WITH ADR-0052, AND THE OLD ONE IS WORTH RECORDING.

      It asserted that the page "chooses a course without choosing an edition for the
      reader": a course carried a title per edition inside ONE anchor, so picking a course
      said nothing about which edition you read. That was ADR-0015's refusal held at one more
      door, and ADR-0052 removed the thing it was protecting — there is always a reader
      edition now, so a second title beside the first is this page asking a question the
      control at the top of it has already answered.

      What is asserted instead is the other half of the same property: the English title is
      the only one, and the reader can change that in the control rather than by being made
      to choose in a list.
    */
    await page.goto('/courses');

    await expect(page.getByRole('link', { name: rx(COURSE.en) })).toHaveAttribute('href', DEFAULTED);
    await expect(page.getByRole('link', { name: rx(COURSE.pl) })).toHaveCount(0);

    // And the other edition is one press away, on the page's own control.
    await page.getByRole('link', { name: 'polski' }).click();
    await expect(page.getByRole('link', { name: rx(COURSE.pl) })).toBeVisible();
  });

  test('follows the edition a reader has chosen, and keeps it on the way out @core', async ({
    page,
  }) => {
    await page.goto('/courses?lang=pl');

    // ADR-0016: the controls follow the reader's edition. The heading is the page's own
    // word in Polish, and the course shows the Polish title alone.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kursy');
    await expect(page.getByRole('link', { name: rx(COURSE.pl) })).toHaveAttribute(
      'href',
      `${COURSE.href}&lang=pl`,
    );
    await expect(page.getByRole('link', { name: rx(COURSE.en) })).toHaveCount(0);

    // And leaving does not undo it: the way back carries the edition the reader chose.
    await expect(page.getByRole('link', { name: '← Programy' })).toHaveAttribute('href', '/?lang=pl');
  });
});

test.describe('the index narrowed to one course', () => {
  test('shows that course’s programs and answers 200 @core', async ({ page }) => {
    const response = await page.goto(COURSE.href);
    expect(response?.status(), 'a course this deployment serves is not an error').toBe(200);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Programs');
    await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText(COURSE.en);

    // The programs are still the way in, which is what makes this the index rather than a
    // page about a course.
    const unit = served.units[0]!;
    await expect(page.getByRole('link', { name: unit.titles['en']! })).toHaveAttribute(
      'href',
      `/read/${track}/${unit.id}/en`,
    );
  });

  test('treats a course the deployment does not serve as no choice at all @core', async ({
    page,
  }) => {
    /*
      A typo in a query string is a reader's slip, not a deployment fault — `chosenEdition`'s
      stance on an unknown edition, applied to an unknown course. NOT a 404, and above all not
      a quiet fall back to the first course, which is the one outcome that would look correct
      to whoever wrote the typo.
    */
    const response = await page.goto('/?track=physics-from-zero');
    expect(response?.status(), 'an unknown course is not an error').toBe(200);
    await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText(COURSE.en);
  });

  test('keeps the course when the reader changes edition, and the other way round @core', async ({
    page,
  }) => {
    await page.goto(`${COURSE.href}&lang=pl`);

    /*
      THE PROPERTY THIS WHOLE FILE IS ABOUT. The two choices are independent, so every
      position of the language control carries `?track=`. A control that dropped it would
      answer "show me this in English" with every course on the platform, which is the
      reader's course narrowing being undone by a question about language.
    */
    await expect(page.getByRole('link', { name: 'English' })).toHaveAttribute(
      'href',
      `${COURSE.href}&lang=en`,
    );
    /*
      THERE IS NO THIRD POSITION ANY MORE (ADR-0052), and its absence is asserted rather
      than merely not tested: *Both editions* was the way back to an index that had chosen
      neither, and the index always chooses one now. A control that grew it back would be
      the ninety-four-title first screen returning.
    */
    await expect(page.getByRole('link', { name: 'Obie edycje' })).toHaveCount(0);

    // And the link out to the courses carries the edition, so the page it opens is in the
    // language this one is in.
    await expect(page.getByRole('link', { name: 'Kursy' })).toHaveAttribute(
      'href',
      '/courses?lang=pl',
    );
  });

  test('returns a reader from sign-in to the page they left, narrowing and all @core', async ({
    page,
  }) => {
    await page.goto(`${COURSE.href}&lang=pl`);

    /*
      The index is the one page in the product whose location is a path plus TWO choices,
      and the sign-in link is built on the server from both. `landing.spec.ts` asserts the
      edition half; this is the half a `usePathname()` answer would drop silently — a reader
      signing in from a narrowed index and landing on the unnarrowed one.
    */
    await expect(page.getByRole('link', { name: 'Zaloguj się' })).toHaveAttribute(
      'href',
      `/login?redirect=${encodeURIComponent(`${COURSE.href}&lang=pl`)}`,
    );
  });
});
