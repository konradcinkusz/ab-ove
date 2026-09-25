import { expect, test, type Page } from '@playwright/test';

import { track } from './support/bundle.ts';

/**
 * JOURNEY — the tab shows the mark, and the browser's own furniture wears the paper (issue
 * #150).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * WHAT THE AUDIT SAW: every page load logged a 404 for `/favicon.ico`, and the tab and a
 * home-screen shortcut showed the browser's default, because no page named an icon and none
 * named a `theme-color`.
 *
 * The icon is `app/icon.svg`, which Next links from every page's head; that link is what
 * stops a browser guessing at `/favicon.ico`. Two properties of it are not visible in the
 * code that declares it, and they are the tests below: that it is served from THIS origin
 * (FRONTEND-BFF.md §1), and that it is served to a reader with no account at all — the page
 * gate in `middleware.ts` is private by default, and a gated icon is a 307 to `/login`
 * rather than a picture.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * NOT ONE COLOUR IS WRITTEN DOWN HERE, on `theme.spec.ts`'s reasoning: the theme colour a
 * machine's scheme selects must equal the paper the page is painted on under that scheme.
 * The hex values are `globals.css`'s, and `lib/theme/tokens.test.ts` holds the literal copies
 * — in `lib/theme/paper.ts` and in the icon — to them.
 *
 * WHAT IT DOES NOT ASSERT: that no request for an icon fails. A headless browser draws no
 * tab and need not ask for an icon at all, so a test counting failed icon requests would pass
 * on the build the audit complained about. What it asserts instead is the cause: one icon
 * link in the head, and what that link names answers 200 and decodes as an image.
 */

const FRAME = `/read/${track}/F01/en/1`;

/** The icon links in the head, resolved to absolute addresses. */
const iconLinks = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel="icon"]'), (link) => link.href),
  );

test.describe('the app icon', () => {
  test('the tab carries the mark, served by this origin to a reader with no account @smoke', async ({
    page,
  }) => {
    await page.goto('/');
    const links = await iconLinks(page);
    expect(links, 'the page names no icon, so the browser guesses at /favicon.ico').toHaveLength(1);

    const icon = new URL(links[0]!);
    expect(icon.origin, 'the icon is fetched from another origin').toBe(new URL(page.url()).origin);

    // `maxRedirects: 0` is load-bearing: followed, the gate's 307 returns the sign-in page as
    // 200, and this would pass for the wrong reason (the same trap `/healthz` fell into).
    const response = await page.request.get(icon.href, { maxRedirects: 0 });
    expect(response.status(), 'the icon is not served to a reader with no account').toBe(200);
    expect(response.headers()['content-type']).toContain('image/svg+xml');

    // And it is an image a browser will draw: an SVG that is not well-formed XML is refused
    // whole, which a status code cannot see.
    const width = await page.evaluate(async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      return image.naturalWidth;
    }, icon.href);
    expect(width, 'the icon does not decode as an image').toBeGreaterThan(0);
  });

  test('a frame names the same icon as the index @core', async ({ page }) => {
    // From the root layout's file convention, so every page has it — asserted on the page a
    // reader spends their time on, not only on the first one.
    await page.goto('/');
    const index = await iconLinks(page);
    await page.goto(FRAME);
    expect(await iconLinks(page)).toEqual(index);
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`theme-color is the paper the page is painted on, on a ${scheme} machine @core`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ colorScheme: scheme });
      const page = await context.newPage();
      await page.goto('/');

      const measured = await page.evaluate(() => {
        const applying = Array.from(
          document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'),
        ).filter((meta) => !meta.media || window.matchMedia(meta.media).matches);

        // The colour as the browser resolves it, so `#fbfaf8` and `rgb(251, 250, 248)` compare.
        const resolve = (colour: string): string => {
          const probe = document.createElement('i');
          probe.style.color = colour;
          document.body.append(probe);
          const resolved = getComputedStyle(probe).color;
          probe.remove();
          return resolved;
        };

        return {
          count: applying.length,
          tint: applying[0] ? resolve(applying[0].content) : undefined,
          paper: getComputedStyle(document.body).backgroundColor,
        };
      });

      expect(measured.count, `exactly one theme-color should apply on a ${scheme} machine`).toBe(1);
      expect(measured.tint, `the ${scheme} theme-color is not the paper under it`).toBe(measured.paper);
      await context.close();
    });
  }
});
