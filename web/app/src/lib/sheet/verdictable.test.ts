/**
 * WHICH FRAMES THE MACHINE IS ALLOWED TO SAY "MATCHES" ON — a list a person has read.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * A FIXTURE RATHER THAN A RECOMPUTATION, AND THE DIFFERENCE IS WHO CHECKED IT.
 *
 * `number.test.ts` asserts that the classifier behaves as its rules say. This asserts
 * something the classifier cannot: that the set of frames it picks out of the BOOK is the
 * set somebody opened and agreed with. Those are different claims, and only the second
 * catches a rule that is internally consistent and wrong about real content.
 *
 * `verdictable.json` was generated from the pinned bundle and then read, row by row — all
 * 170 of them, which is 8% of the book's 2072 answer-and-edition pairs. Every row is a bare
 * number, a number in scientific notation, or `<identifier> = <number>`, and none is a
 * sentence that merely contains a digit. That reading is the artefact; this test is what
 * makes the next bundle bump require another one.
 *
 * WHAT A FAILURE HERE MEANS. Not "the code is broken" — it means the book moved and the
 * set moved with it, and a person has to look at what joined or left before the fixture is
 * regenerated. A frame that newly earns a verdict is a frame where a reader will be told
 * they are right, so it is worth the minute.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * IT SKIPS WHEN THERE IS NO COMPILED BUNDLE, on `maths.test.ts`'s own pattern: the fetch
 * script has not run in a fresh clone, and a test that fails for that reason teaches a
 * developer to ignore it.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PINS, bundleFor, say, skipWithoutBundle, type Bundle } from '@ab-ovo/web-kit';

import { bookNumberOf } from './number.ts';
import fixture from './verdictable.json' with { type: 'json' };


test('the fixture is a hand-reviewed list and not an empty one', () => {
  // The positive control, and it runs with or without a bundle: an empty fixture would
  // satisfy every comparison below and would mean the machine never speaks at all.
  assert.ok(fixture.rows.length > 100, `only ${fixture.rows.length} rows — has the fixture been emptied?`);
  assert.ok(fixture.tag.length > 0);
});

test('every row of the fixture is still what the classifier says it is', { skip: skipWithoutBundle() }, () => {
  for (const row of fixture.rows) {
    assert.equal(
      bookNumberOf(row.printed, row.language),
      row.number,
      `${row.unit}/${row.step}/${row.language}: ${JSON.stringify(row.printed)}`,
    );
  }
});

test('and the book has not grown or lost a verdict-able frame since it was reviewed', { skip: skipWithoutBundle() }, () => {
  const bundle = bundleFor(PINS[0]!.track) as Bundle;
  assert.equal(
    bundle.tag,
    fixture.tag,
    `the served bundle is ${bundle.tag} and the fixture was reviewed at ${fixture.tag}. ` +
      `Regenerate it and READ the difference — see this file's header.`,
  );

  const now = new Set<string>();
  for (const unit of bundle.units) {
    for (const step of unit.steps) {
      if (!step.answer) continue;
      for (const language of bundle.track.languages) {
        if (bookNumberOf(say(step.answer, language), language) !== undefined) {
          now.add(`${unit.id}/${step.n}/${language}`);
        }
      }
    }
  }

  const reviewed = new Set(fixture.rows.map((row) => `${row.unit}/${row.step}/${row.language}`));
  const joined = [...now].filter((key) => !reviewed.has(key));
  const left = [...reviewed].filter((key) => !now.has(key));

  assert.deepEqual(
    { joined, left },
    { joined: [], left: [] },
    'the verdict-able set has changed and nobody has read the difference',
  );
});
