import { expect, test } from '@playwright/test';

import { languages, track, uniqueProbeIn, unitNamed } from './support/bundle.ts';
import { openPane, pane } from './support/pane.ts';
import { reveal } from './support/reveal.ts';
import { walkTo } from './support/walk.ts';

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
 * a defect in the page: the pager's `Next` is a real `<form>` and works before any
 * JavaScript runs, so the no-JS path is never broken and the shortcut is an enhancement on
 * top of it.
 *
 * What it waits on is the flag the handler sets on `<html>` when it binds and removes when it
 * unbinds (`frame-keys.tsx`). It used to be read through the hint — a visible line of
 * shortcuts the stylesheet revealed from the same flag — and ADR-0063 took the line off the
 * frame: the keys are an option, listed in *Reading settings*, and every move they make is a
 * labelled button. The flag stayed, because a test still must not press a key the page has
 * not bound.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
async function openReady(
  page: import('@playwright/test').Page,
  language: string,
  n: number,
): Promise<void> {
  // ADR-0060: a fresh reader's cursor starts at 1, so opening ANYWHERE past that needs the
  // walk first — every caller in this file wants "arrive at frame n, keyboard live", not
  // "arrive at whatever the gate lets through instead of frame n".
  await walkTo(page, unitId, language, n);
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

  test('and back again, one frame at a time, and from frame 1 to the contents @core', async ({ page }) => {
    await openReady(page, 'en', steps.length);
    for (let n = steps.length - 1; n >= 1; n -= 1) {
      await page.keyboard.press('ArrowLeft');
      await page.waitForURL(`**${at('en', n)}`);
    }
    await expect(page.locator('body')).toContainText(uniqueProbeIn(unit, 1, 'en'));

    // Frame 1 has no frame before it, and `←` goes where the button in `Previous`'s place
    // goes: the program's contents (#159). It used to do nothing — never wrapping to the end
    // of the program, which stays true — while that button led somewhere, so the key and the
    // button a reader is told are one move were two.
    await page.keyboard.press('ArrowLeft');
    await page.waitForURL(`**/read/${track}/${unitId}/en`);
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

  test('Enter opens the answer line, and Esc returns to reading with what was typed @core', async ({
    page,
  }) => {
    /*
      ──────────────────────────────────────────────────────────────────────────────────
      ADR-0041 DECIDED THESE TWO KEYS AND THE CODE DID NOT HAVE THEM.

      "`Enter` with nothing focused puts the caret in the answer line; `Esc` returns to
      reading." UI-UX.md repeated it. `frame-keys.tsx` handled the arrows and `g`, so a
      keyboard reader reached the answer line on every cue frame through four Tab stops.
      This is the decision, executed — and it is the reason "read end to end from the
      keyboard" (the first test in this file) can be "read AND answered".

      What is asserted is what the keys DO. A line under the question used to say which
      keys were live and this test read it; ADR-0063 took that line off the frame (the keys
      are an option, listed in *Reading settings*), and a page that teaches its shortcuts
      is not what makes them work.
      ──────────────────────────────────────────────────────────────────────────────────
    */
    const cue = steps.find((step) => step.cue && step.n > 1);
    if (!cue) throw new Error(`${unitId} has no cue frame past the first, so this proves nothing`);

    await openReady(page, 'en', cue.n);
    const line = page.getByRole('textbox', { name: /your answer/i });

    await page.keyboard.press('Enter');
    await expect(line, 'Enter with nothing focused did not open the answer line').toBeFocused();

    // Typing: the arrows are the caret's inside a field, so this `→` must not turn the page.
    await page.keyboard.type('a line the reader wrote');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(250);
    expect(page.url(), 'an arrow key inside the answer line turned the page').toContain(
      at('en', cue.n),
    );

    await page.keyboard.press('Escape');
    await expect(line, 'Esc did not return the reader to reading').not.toBeFocused();
    await expect(line, 'Esc threw away what was typed').toHaveValue('a line the reader wrote');

    // And the arrows are live again, which is what "back to reading" means.
    await page.keyboard.press('ArrowRight');
    await page.waitForURL(`**${at('en', cue.n + 1)}`);
  });

  test('Esc in the frame number cancels what was typed rather than going there @core', async ({
    page,
  }) => {
    // `g` opens the program map with the caret in its frame number (ADR-0063). The number
    // moves only on `Go` or Enter — it used to commit on blur, so an Esc that merely blurred
    // it NAVIGATED to a half-typed number — and Esc is the way out: it puts the number back,
    // closes the map, and goes nowhere.
    const n = Math.min(3, steps.length);
    await openReady(page, 'en', n);
    const jumper = page.locator('#frame-jumper');
    const map = page.getByTestId('program-map');

    await page.keyboard.press('g');
    await expect(map, '`g` did not open the program map').toBeVisible();
    await expect(jumper).toBeFocused();
    await jumper.fill('1');
    await page.keyboard.press('Escape');

    await expect(map, 'Esc left the program map open').toBeHidden();
    await expect(jumper).not.toBeFocused();
    await expect(jumper, 'Esc left a stray number in the frame number').toHaveValue(String(n));
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
    // the round trip is too quick to catch; the attribute's presence is what says the island
    // is wired to the form at all.
    await expect(control.locator('[data-pending]')).toHaveAttribute('data-pending', 'no');
  });

  test('the bars, the pager and the panes are a finger tall to press @core', async ({
    page,
  }) => {
    // 44 px is the smallest target a finger hits reliably, and the bound here is 40 so that
    // a sub-pixel of rounding is not a failure. What is measured is the box a press lands in,
    // not the type: every control below is set in small type and padded to the height.
    await openReady(page, 'en', 2);
    const targets = [
      // The top bar (ADR-0063): the way to the index, the way to the contents, the settings.
      page.getByRole('link', { name: 'ab-ovo' }),
      page.getByRole('link', { name: unit.titles['en']! }),
      page.getByTestId('reading-settings-button'),
      // The pager: the two buttons the owner asked for, and the position between them.
      page.getByRole('link', { name: /previous/i }),
      page.getByTestId('frame-position'),
      reveal(page),
      /*
        ────────────────────────────────────────────────────────────────────────────────
        THE TWO PANE BUTTONS, ADDED WITH ADR-0059 AND NOT BEFORE.

        `Work it out` and `Draw it` opened from 13px of the faintest ink with no padding at
        all, while the Grid / Axes / Undo / Clear buttons INSIDE the sketch already carried
        `min-height: 44px` each — so the only control in the worksheet that was never a
        finger tall was the one a reader had to find first, which is what "the sketch is
        hard to open" meant.
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

  test('the keys are told to the reader, in their own edition, behind the settings @core', async ({
    page,
  }) => {
    // A keyboard path nobody is told about is not an ergonomic feature, it is a secret. It
    // used to be told on every frame, in a line under the question; ADR-0063 made the keys
    // an option — the owner's word — and put the list where options live, in *Reading
    // settings*, with each pager button carrying its key in its tooltip. The assertion is
    // relational and needs no copy of either string — see language-choice.spec.
    const said: Record<string, string> = {};
    for (const language of languages) {
      await openReady(page, language, 2);
      await expect(
        page.getByTestId('frame-keys-hint'),
        `the ${language} frame still prints its shortcuts`,
      ).toHaveCount(0);

      // Each pager button names its arrow in its tooltip, so a reader who hovers it learns it.
      await expect(page.locator('[data-pager] a[title*="←"]')).toHaveCount(1);
      await expect(reveal(page)).toHaveAttribute('title', /→/);

      await page.getByTestId('reading-settings-button').click();
      const settings = page.getByTestId('reading-settings');
      await expect(settings, `the ${language} settings did not open`).toBeVisible();
      const keys = settings.getByRole('list');
      await expect(keys, `no list of keys in the ${language} settings`).toBeVisible();
      said[language] = (await keys.innerText()).trim();
      expect(said[language]!.length).toBeGreaterThan(0);
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
    await walkTo(page, unitId, 'en', 2);
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

    await walkTo(page, unitId, 'en', before);
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
 * frame, about keys the reader does not have; it was hidden on a coarse pointer, and then
 * ADR-0063 took it off every frame. What a touch reader has instead is the pager — two
 * labelled buttons at the bottom edge of the screen — and the full key map is still in
 * *Reading settings*, for a tablet with a keyboard attached.
 */
test.describe('the reading surface on a touch screen', () => {
  // Not a `devices[...]` preset: those carry `defaultBrowserType`, which is worker-scoped
  // and cannot be set inside a describe. The three options below are test-scoped — Chromium's
  // mobile emulation is what answers `hover: none` and `pointer: coarse` — so the block
  // shares the project's worker.
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 393, height: 851 } });

  test('the way on is a pair of buttons under the thumb, and the key map is still there @core', async ({
    page,
  }) => {
    await walkTo(page, unitId, 'en', 2);
    await page.goto(at('en', 2));
    await keysReady(page);

    // On screen with nothing scrolled: the pager is pinned to the bottom edge.
    await expect(page.getByRole('link', { name: /previous/i })).toBeInViewport();
    await expect(reveal(page)).toBeInViewport();

    /*
      ────────────────────────────────────────────────────────────────────────────────────
      THE KEY MAP IS ASSERTED AGAINST THE LIST ITSELF, WHICH IT USED NOT TO BE.

      It was `getByRole('group').filter({ hasText: /keys/i })`, counting one. That passed,
      and would have gone on passing after ADR-0058 moved the map inside *Reading settings*
      — because `hasText` matches text that is not painted, so the filter simply slid onto
      the enclosing disclosure and counted that instead. A test that keeps its green by
      matching a different element is worse than one that fails: the claim here is that a
      reader with a keyboard attached to a tablet can still find out what the keys do, and
      only the LIST can carry that claim.

      `role="list"` is said out loud in `keys-details.tsx` for the reason `program-map.tsx`
      records: a `<ul>` styled `list-style: none` loses the role in WebKit and Chromium, so
      without it these shortcuts are announced as loose text and this locator finds nothing.
      ────────────────────────────────────────────────────────────────────────────────────
    */
    await page.getByTestId('reading-settings-button').tap();
    await expect(page.getByTestId('reading-settings')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Keys' })).toBeVisible();
  });
});

/**
 * THE FRAME ON PAPER, AND FOR A READER WHO ASKS FOR LESS MOTION — two promises the
 * stylesheets make and nothing held.
 *
 * `worksheet.module.css`: "Ctrl+P is the reader's export. The frame, their answer and their
 * working print; the controls do not, because a printed button is ink spent on nothing." And
 * `frame-view.module.css`: a new frame fades in — with the pager standing still, the one sign
 * the page turned — and "a reader who asks for less motion gets none".
 */
test.describe('the frame on paper, and with less motion', () => {
  test('prints the frame, the reader’s answer and their working, and not one control @core', async ({
    page,
  }) => {
    const cue = steps.find((step) => step.cue && step.n > 1);
    if (!cue) throw new Error(`${unitId} has no cue frame past the first, so this proves nothing`);
    const written = 'the line the reader wrote';

    await openReady(page, 'en', cue.n);
    const line = page.getByRole('textbox', { name: /your answer/i });
    await line.fill(written);
    await openPane(page, 'working');
    const pad = page.getByRole('textbox', { name: /your working/i });
    await pad.fill('2^10');

    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('article')).toBeVisible();
    await expect(line, 'the reader’s answer did not print').toBeVisible();
    await expect(line).toHaveValue(written);
    await expect(pad, 'the reader’s working did not print').toBeVisible();
    await expect(pad).toHaveValue('2^10');
    // No control reaches the paper: not the pager, not the settings, not a closed pane's
    // button, not the pad's own. Counted by role, so a control added later is counted too.
    await expect(page.getByRole('button'), 'a button printed').toHaveCount(0);
    await expect(page.locator('[data-pager]')).toBeHidden();
    await expect(pane(page, 'sketch'), 'a closed pane printed its button').toBeHidden();

    // And on the frame that answers it, what the reader wrote prints beside the book's answer.
    await page.emulateMedia({ media: 'screen' });
    await reveal(page).click();
    await page.waitForURL(`**${at('en', cue.n + 1)}`);
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByText(written), 'what the reader wrote did not print').toBeVisible();

    await page.emulateMedia({ media: 'screen' });
    await expect(page.locator('[data-pager]'), 'the screen did not come back from paper').toBeVisible();
  });

  test('a new frame arrives without motion for a reader who asks for none @core', async ({ page }) => {
    await openReady(page, 'en', 2);
    const animation = (): Promise<string> =>
      page.locator('article').evaluate((node) => getComputedStyle(node).animationName);

    expect(await animation(), 'a new frame arrives with no sign that the page turned').not.toBe('none');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await animation(), 'a reader who asked for less motion still gets the fade').toBe('none');
  });
});
