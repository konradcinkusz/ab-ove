import { expect, test } from '@playwright/test';

import { languages, track, uniqueProbeIn, unitNamed } from './support/bundle.ts';
import { reveal } from './support/reveal.ts';

/**
 * JOURNEY — reading a program, which is the thing the product is for.
 *
 * Issue #7's "done when" draws a distinction this suite is built around: *a program can be
 * read end to end from the keyboard* — "not 'is keyboard accessible' — actually read, start
 * to finish, without reaching for a mouse". Those are different claims and only one of them
 * was true before this change. Measured on the frame view as it stood: reaching the reveal
 * took **three** Tab presses past the crumb and the edition switch, on every frame, and
 * focus reset to `<body>` after each navigation — so a 45-frame program was 135 presses and
 * 45 Enters. Every one of those is a control a reader can reach, which is what makes the
 * weaker claim true and the stronger one false.
 *
 * So the first test below is the issue's sentence executed: start at frame 1, press one key
 * per frame, arrive at the last one, and check the right frame was on screen at every step.
 */
/*
  THE PROGRAM THIS SUITE READS, from the bundle the application serves.

  F01 by name rather than "the first unit", because the assertions below are about a
  reader moving through a whole program and F01 is the one every reader opens first — and
  because `units[0]` would silently become a different program the day the manifest's
  order changes, which is a suite testing something else without saying so.

  `uniqueProbeIn` rather than the body itself: a real frame is Markdown with KaTeX in it
  and none of that source string is on the rendered page. See specs/support/bundle.ts.
*/
const unitId = 'F01';
const unit = unitNamed(unitId);
const steps = unit.steps;

const at = (language: string, n: number): string =>
  `/read/${track}/${unitId}/${language}/${n}`;

/**
 * Open a frame and wait until the keyboard path is actually live.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE WAIT IS NOT A SLEEP, AND IT IS NOT A TEST HOOK EITHER.
 *
 * The shortcut is a Client Component, so it does not exist until the page hydrates —
 * measured, by pressing the key immediately after a deep link and getting nothing, then
 * pressing it after a settle and getting the next frame. The first draft of this suite
 * pressed immediately and failed for that reason, which is a race in the TEST rather than
 * a defect in the page: the reveal link is a real `<a>` and works before any JavaScript
 * runs, so the no-JS path is never broken and the shortcut is an enhancement on top of it.
 *
 * What it waits on is the hint — the visible line telling the reader the key exists, which
 * the stylesheet reveals from the same flag the handler sets when it binds. So the page
 * cannot promise a shortcut that is not live, and this suite cannot press one. One
 * mechanism, serving a reader and a test, rather than an attribute that exists for the
 * suite alone.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
async function openReady(
  page: import('@playwright/test').Page,
  language: string,
  n: number,
): Promise<void> {
  await page.goto(at(language, n));
  await keysReady(page);
}

/**
 * Wait until the page's keyboard handler has bound, before pressing one of its keys.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE SAME WAIT `openReady` DOES, BUT AFTER A CLIENT-SIDE NAVIGATION — AND THE ABSENCE OF
 * IT COST TWO MINUTES PER RUN AND READ LIKE A BROKEN KEY.
 *
 * `waitForURL` resolves on `load`, which is before React has hydrated the island that
 * listens for the arrow keys. A press in that window reaches a page with no handler on it
 * and is simply lost — and the test then waits out its whole budget for a navigation that
 * was never going to happen, reporting the wait rather than the press.
 *
 * Measured rather than reasoned about: pressing `←` on the summary immediately after
 * arriving there times out, and pressing it after this wait navigates in under a second.
 * The product is right and the suite was wrong — this file's own header says the page
 * "cannot promise a shortcut that is not live, and this suite cannot press one", which is
 * exactly the rule these two presses were skipping.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
async function keysReady(page: import('@playwright/test').Page): Promise<void> {
  await expect(
    page.locator('[data-frame-keys="on"]'),
    'the keyboard handler never attached, so nothing below would be pressing anything',
  ).toHaveCount(1);
}

test.describe('reading ergonomics', () => {
  test('a program is read end to end from the keyboard @smoke', async ({ page }) => {
    expect(steps.length, 'a one-frame program would make this test vacuous').toBeGreaterThan(1);

    await openReady(page, 'en', 1);
    await expect(page.locator('body')).toContainText(uniqueProbeIn(unit, 1, 'en'));

    // One key per frame, from the top of the document, with nothing focused. That is the
    // whole claim: no Tab, no mouse, no hunting for the control.
    for (let n = 2; n <= steps.length; n += 1) {
      await page.keyboard.press('ArrowRight');
      await page.waitForURL(`**${at('en', n)}`);
      await expect(
        page.locator('body'),
        `pressing forward from frame ${n - 1} did not produce frame ${n}`,
      ).toContainText(uniqueProbeIn(unit, n, 'en'));
    }

    // And the end HANDS OFF rather than being a wall. It used to be one: `→` on the last
    // frame did nothing, which is a defensible answer to "there is no frame 46" and a poor
    // one to "I have finished this program". The summary is what comes next, so the same
    // key opens it — and a reader who read the whole program with one finger never has to
    // find a mouse to leave it.
    await page.keyboard.press('ArrowRight');
    await page.waitForURL(`**/read/${track}/${unitId}/en/summary`);

    // Symmetric, or a reader who arrived by `→` is stranded on a screen whose own key map
    // promises `← back`. The wait is not a flake guard: the summary is a different page
    // with its own island, and pressing before it binds is pressing at nothing.
    await keysReady(page);
    await page.keyboard.press('ArrowLeft');
    await page.waitForURL(`**${at('en', steps.length)}`);
  });

  test('and back again, one frame at a time @core', async ({ page }) => {
    await openReady(page, 'en', steps.length);
    for (let n = steps.length - 1; n >= 1; n -= 1) {
      await page.keyboard.press('ArrowLeft');
      await page.waitForURL(`**${at('en', n)}`);
    }
    await expect(page.locator('body')).toContainText(uniqueProbeIn(unit, 1, 'en'));

    // Frame 1 has nowhere to go back to, and the key does nothing rather than wrapping to
    // the end of the program — which is the shape of "nothing happened" a reader can trust.
    const wasAt = page.url();
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(400);
    expect(page.url()).toBe(wasAt);
  });

  test('the shortcut yields to the browser’s own arrow shortcuts @core', async ({ page }) => {
    // Alt+Left is Back and Alt+Right is Forward in every desktop browser. Stealing them
    // would break navigation in order to fix navigation, so the handler ignores any key
    // held with a modifier.
    await openReady(page, 'en', 1);
    const wasAt = page.url();
    for (const modifier of ['Alt', 'Control', 'Meta', 'Shift']) {
      await page.keyboard.press(`${modifier}+ArrowRight`);
      await page.waitForTimeout(250);
      expect(page.url(), `${modifier}+ArrowRight was swallowed`).toBe(wasAt);
    }

    // The positive control, in the same test: without a modifier it DOES move, so the four
    // assertions above mean "ignored" rather than "the handler is not running at all".
    await page.keyboard.press('ArrowRight');
    await page.waitForURL(`**${at('en', 2)}`);
  });

  test('the shortcut yields to anywhere a reader might be typing @core', async ({ page }) => {
    // ──────────────────────────────────────────────────────────────────────────────────
    // THIS TEST INJECTS THE FIELD IT NEEDS, AND THAT IS DELIBERATE RATHER THAN A SHORTCUT.
    //
    // A frame carries no input today, so the guard is unreachable from any page that
    // exists: it is there for /login, which is a redirect target and not yet a form, and
    // for the lab pane's editor. Waiting for those to be built before asserting the guard
    // means discovering, from a reader, that the frame view eats an arrow key inside
    // somebody's answer. Injecting the field tests the GUARD rather than the page, which is
    // the honest description of what this asserts.
    // ──────────────────────────────────────────────────────────────────────────────────
    await openReady(page, 'en', 1);
    const wasAt = page.url();

    for (const kind of ['input', 'textarea'] as const) {
      await page.evaluate((tag) => {
        const field = document.createElement(tag);
        field.id = 'probe';
        document.body.appendChild(field);
        field.focus();
      }, kind);
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(250);
      expect(page.url(), `an arrow key inside a <${kind}> navigated the frame`).toBe(wasAt);
      await page.evaluate(() => document.getElementById('probe')?.remove());
    }

    // A contenteditable is the third one, and the one a rich editor uses.
    await page.evaluate(() => {
      const editor = document.createElement('div');
      editor.id = 'probe';
      editor.contentEditable = 'true';
      document.body.appendChild(editor);
      editor.focus();
    });
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(250);
    expect(page.url(), 'an arrow key inside a contenteditable navigated the frame').toBe(wasAt);
  });

  test('Enter opens the answer line, Esc returns to reading, and the hint says which @core', async ({
    page,
  }) => {
    /*
      ──────────────────────────────────────────────────────────────────────────────────
      ADR-0041 DECIDED THESE TWO KEYS AND THE CODE DID NOT HAVE THEM.

      "`Enter` with nothing focused puts the caret in the answer line; `Esc` returns to
      reading … while a field has focus the line says what is true there." UI-UX.md
      repeated it. `frame-keys.tsx` handled the arrows and `g`, so a keyboard reader
      reached the answer line on every cue frame through four Tab stops, and the hint went
      on promising the arrows inside a field where they are dead. This is the decision,
      executed — and it is the reason "read end to end from the keyboard" (the first test
      in this file) can now be "read AND answered".
      ──────────────────────────────────────────────────────────────────────────────────
    */
    const cue = steps.find((step) => step.cue && step.n > 1);
    if (!cue) throw new Error(`${unitId} has no cue frame past the first, so this proves nothing`);

    await openReady(page, 'en', cue.n);
    const line = page.getByRole('textbox', { name: /your answer/i });
    const hint = page.getByTestId('frame-keys-hint');

    // Reading state: the arrows and Enter are offered; nothing about Esc yet. `useInnerText`
    // throughout: every state's line is in the markup and only one is visible, and the
    // question is what the reader can see.
    const shown = { useInnerText: true } as const;
    await expect(hint).toContainText('→', shown);
    await expect(hint).toContainText('Enter', shown);
    await expect(hint).not.toContainText('Esc', shown);

    await page.keyboard.press('Enter');
    await expect(line, 'Enter with nothing focused did not open the answer line').toBeFocused();

    // Typing state: the arrows are dead in a field, so the hint stops promising them and
    // says what is true here instead.
    await expect(hint).toContainText('Esc', shown);
    await expect(hint).not.toContainText('→', shown);
    await page.keyboard.type('a line the reader wrote');

    await page.keyboard.press('Escape');
    await expect(line, 'Esc did not return the reader to reading').not.toBeFocused();
    await expect(line, 'Esc threw away what was typed').toHaveValue('a line the reader wrote');
    await expect(hint).toContainText('→', shown);

    // And the arrows are live again, which is what "back to reading" means.
    await page.keyboard.press('ArrowRight');
    await page.waitForURL(`**${at('en', cue.n + 1)}`);
  });

  test('Esc in the frame number cancels what was typed rather than going there @core', async ({
    page,
  }) => {
    // The jumper commits on blur — the number itself is the control — so an Esc that merely
    // blurred it would NAVIGATE to a half-typed number. Cancel first, then leave.
    const n = Math.min(3, steps.length);
    await openReady(page, 'en', n);
    const jumper = page.locator('#frame-jumper');

    await page.keyboard.press('g');
    await expect(jumper).toBeFocused();
    await jumper.fill('1');
    await page.keyboard.press('Escape');

    await expect(jumper).not.toBeFocused();
    await expect(jumper, 'Esc left a stray number in the place row').toHaveValue(String(n));
    await page.waitForTimeout(400);
    expect(page.url(), 'Esc navigated to the number that was being typed').toContain(`/${n}`);
  });

  test('the reveal shows its focus as a ring, and says when it is under way @core', async ({
    page,
  }) => {
    /*
      The filled controls expressed `:focus-visible` as a ten-percent brightness, which a
      keyboard reader tabbing to the one control the frame is built around could not see.
      Reached by Tab rather than by `focus()`, because `:focus-visible` is about HOW focus
      arrived, and a script-focused element does not always count.
    */
    await openReady(page, 'en', 2);
    const control = reveal(page);
    for (let presses = 0; presses < 20; presses += 1) {
      await page.keyboard.press('Tab');
      if (await control.evaluate((node) => node === document.activeElement)) break;
    }
    await expect(control).toBeFocused();
    const ring = await control.evaluate((node) => getComputedStyle(node).boxShadow);
    expect(ring, 'the reveal has no visible focus ring').not.toBe('none');

    // And the label carries the pending flag the stylesheet dims on — idle here, because
    // the fetch is too quick to catch; the attribute's presence is what says the island is
    // wired to the link at all.
    await expect(control.locator('[data-pending]')).toHaveAttribute('data-pending', 'no');
  });

  test('the place row, the foot and the panes are a finger tall to press @core', async ({
    page,
  }) => {
    // 44 px is the smallest target a finger hits reliably; the rows are set in small type,
    // so the controls are padded to it and given the space back with a negative margin.
    // What is measured is the box a press lands in, not the type.
    await openReady(page, 'en', 2);
    const targets = [
      page.locator('#frame-jumper'),
      page.getByRole('link', { name: unit.titles['en']! }),
      page.getByRole('link', { name: /previous/i }),
      /*
        ────────────────────────────────────────────────────────────────────────────────
        THE TWO PANE BUTTONS, ADDED WITH ADR-0059 AND NOT BEFORE.

        They are the reason this list grew. `Work it out` and `Draw it` opened from 13px of
        the faintest ink with no padding at all, while the Grid / Axes / Undo / Clear
        buttons INSIDE the sketch already carried `min-height: 44px` each — so the only
        control in the worksheet that was never a finger tall was the one a reader had to
        find first, which is what "the sketch is hard to open" meant.

        They rest on `min-height` rather than on the foot's negative-margin idiom, because
        that idiom exists to grow the box around a line of TEXT and these are bordered
        boxes of their own. Different mechanism, same claim — so it is measured here rather
        than asserted in a document.
        ────────────────────────────────────────────────────────────────────────────────
      */
      page.locator('details[data-pane="working"] summary'),
      page.locator('details[data-pane="sketch"] summary'),
    ];
    for (const target of targets) {
      const box = await target.boundingBox();
      expect(box, 'a control has no box, so nothing here measured anything').toBeTruthy();
      expect(box!.height, `${await target.evaluate((n) => n.outerHTML.slice(0, 60))} is not a finger tall`).toBeGreaterThanOrEqual(40);
    }
  });

  test('the shortcut is told to the reader, in their own edition @core', async ({ page }) => {
    // A keyboard path nobody is told about is not an ergonomic feature, it is a secret. The
    // assertion is relational and needs no copy of either string — see language-choice.spec.
    const said: Record<string, string> = {};
    for (const language of languages) {
      await openReady(page, language, 1);
      // BY ITS OWN HOOK, and that is a change this suite had to make rather than chose.
      // The locator used to be "the last element carrying this language that contains an
      // arrow", which worked while the hint was the only such thing on the page. The foot
      // now carries a `Keys` disclosure holding the same arrows, and it is always visible
      // — so the old locator would have quietly moved to an element that cannot fail the
      // visibility assertion below, and this test would have gone on passing while testing
      // nothing. See frame-view.tsx for why the hook is a `data-testid`.
      const hint = page.getByTestId('frame-keys-hint');
      await expect(hint, `the hint is not one element on the ${language} frame`).toHaveCount(1);
      // VISIBLE, not merely present: the hint is hidden until the shortcut is live, so
      // `toHaveCount(1)` alone would pass on a page that never promises anything a reader
      // can see.
      await expect(hint, `no keyboard hint on the ${language} frame`).toBeVisible();
      said[language] = (await hint.innerText()).trim();
    }
    expect(said[languages[0]!]).not.toBe(said[languages[1]!]);
  });

  test('the reading column is the measure the book set, not whatever fits @core', async ({
    page,
  }) => {
    // 34rem, and a number rather than a taste: the book fixed both its paper formats at
    // about the same measure because a wider block "would be some eighty-five characters,
    // past the point where the eye loses the line return". Asserted on the RENDERED width,
    // so a later stylesheet that lets the column grow fails here rather than in a reader's
    // eye.
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto(at('en', 2));

    const measured = await page.evaluate(() => {
      const article = document.querySelector('article');
      if (!article) return undefined;
      const root = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
      return {
        rems: article.getBoundingClientRect().width / root,
        viewport: window.innerWidth,
      };
    });

    expect(measured, 'the frame did not render an <article> to measure').toBeTruthy();
    expect(
      measured!.viewport,
      'the viewport is narrower than the measure, so this proves nothing',
    ).toBeGreaterThan(900);
    expect(measured!.rems, 'the reading column is not 34rem wide').toBeCloseTo(34, 1);
  });

  test('revealing an answer shifts nothing already on the page @core', async ({ page }) => {
    // ──────────────────────────────────────────────────────────────────────────────────
    // A BOUND, NOT THE MEASUREMENT. This build scores exactly 0 — the page is server
    // rendered with no web font, no image and nothing inserted after paint — and committing
    // "0" would make the test a statement about one machine's timing rather than about the
    // page. 0.01 is two orders under the 0.1 that counts as good and an order under
    // anything a reader could see.
    //
    // The reveal is a SOFT navigation, so layout-shift entries really are recorded across
    // it: without that this test would be measuring a fresh document and reporting a
    // reassuring zero for the wrong reason.
    // ──────────────────────────────────────────────────────────────────────────────────
    // AND IT IS MEASURED ON A FRAME THAT CARRIES DISPLAY MATHS, which the fixture this
    // suite used to read had none of. A KaTeX subtree is the one thing on these pages whose
    // height depends on a font file arriving, so measuring the reveal on a paragraph of
    // plain prose would report a reassuring zero about the case that cannot shift. The
    // frame is chosen from the served bundle rather than written down, so it stays a
    // maths-heavy frame when the book renumbers itself.
    const heavy = steps.find((step) => step.n > 1 && (step.body.en ?? '').includes('$$'));
    if (!heavy) throw new Error(`${unitId} has no display maths, so this test measures nothing`);
    const before = heavy.n - 1;

    await page.goto(at('en', before));
    await page.evaluate(() => {
      const scope = window as unknown as { __shift: number };
      scope.__shift = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as unknown as {
          value: number;
          hadRecentInput: boolean;
        }[]) {
          if (!entry.hadRecentInput) scope.__shift += entry.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });

    await reveal(page).click();
    await page.waitForURL(`**${at('en', heavy.n)}`);
    await expect(page.locator('body')).toContainText(uniqueProbeIn(unit, heavy.n, 'en'));
    await page.waitForTimeout(700);

    const shift = await page.evaluate(
      () => (window as unknown as { __shift: number }).__shift,
    );
    expect(shift, 'the answer arriving moved the page under the reader').toBeLessThan(0.01);
  });
});

/**
 * A phone has no arrow keys. The one-line hint under the reveal used to say `→ next frame
 * · ← previous frame · Ctrl+Enter commit and reveal` on a 360 px screen, in the way of the
 * frame, about keys the reader does not have. It is not rendered on a coarse-pointer device;
 * the full key map stays, for a tablet with a keyboard attached — inside *Reading settings*
 * since ADR-0058, which is where every setting on a reading screen now lives.
 */
test.describe('the reading surface on a touch screen', () => {
  // Not a `devices[...]` preset: those carry `defaultBrowserType`, which is worker-scoped
  // and cannot be set inside a describe. The three options below are what the hint's media
  // query reads — Chromium's mobile emulation is what answers `hover: none` and
  // `pointer: coarse` — and they are test-scoped, so the block shares the project's worker.
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 393, height: 851 } });

  test('the keyboard hint is not there, and the key map still is @core', async ({ page }) => {
    await page.goto(at('en', 2));
    await keysReady(page);
    await expect(page.getByTestId('frame-keys-hint')).toBeHidden();

    /*
      ────────────────────────────────────────────────────────────────────────────────────
      THE SECOND HALF IS ASSERTED AGAINST THE LIST ITSELF, WHICH IT USED NOT TO BE.

      It was `getByRole('group').filter({ hasText: /keys/i })`, counting one. That passed,
      and would have gone on passing after ADR-0058 moved the map inside *Reading settings*
      — because `hasText` matches text that is not painted, so the filter simply slid onto
      the enclosing disclosure and counted that instead. A test that keeps its green by
      matching a different element is worse than one that fails: the claim here is that a
      reader with a keyboard attached to a tablet can still find out what the keys do, and
      only the LIST can carry that claim.

      `role="list"` is said out loud in `keys-details.tsx` for the reason `place-row.tsx`
      records: a `<ul>` styled `list-style: none` loses the role in WebKit and Chromium, so
      without it these shortcuts are announced as loose text and this locator finds nothing.
      ────────────────────────────────────────────────────────────────────────────────────
    */
    const settings = page.getByTestId('reading-settings');
    await expect(settings, 'the reading settings are not on a touch frame').toHaveCount(1);
    await settings.locator('summary').click();
    await expect(page.getByRole('list', { name: 'Keys' })).toBeVisible();
  });
});
