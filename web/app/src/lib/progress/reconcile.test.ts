/**
 * The conflict rule, asserted where the rule lives.
 *
 * P13 — test at the layer with the logic. `reconcile` touches no network and no browser, so
 * every branch of the rule is reachable from here in milliseconds; asserting it through a
 * spec would mean a merge defect showed up as a resume link pointing somewhere odd, three
 * layers from the line that caused it.
 *
 * The property the ticket actually asks for is CONVERGENCE — "two machines converge" — and
 * a convergence claim is not established by an example. `two machines converge whatever
 * order they sync in` below is the property stated as one: the same two devices, run in
 * both orders, land on the same record.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  couldBeOwnReveal,
  reconcile,
  settle,
  shownHere,
  stillNews,
  type Raised,
  type RemoteRecord,
} from './reconcile.ts';
import { EMPTY, type Progress } from './store.ts';

const TRACK = 'math-for-ai-engineers';

const local = (positions: Record<string, { language: string; step: number }>, last?: string): Progress => ({
  ...(last ? { last: { track: TRACK, unit: last, ...positions[`${TRACK}/${last}`]! } } : {}),
  positions,
});

const row = (unit: string, step: number, language = 'en', updatedAt = '2026-01-01T00:00:00Z'): RemoteRecord => ({
  track: TRACK,
  unit,
  step,
  language,
  updatedAt,
});

const at = (result: { merged: Progress }, unit: string) => result.merged.positions[`${TRACK}/${unit}`];

// ── The rule ────────────────────────────────────────────────────────────────────────────

test('the account is further ahead, so it wins and the reader is told', () => {
  const result = reconcile(local({ [`${TRACK}/P01`]: { language: 'en', step: 12 } }), [row('P01', 40, 'pl')]);

  assert.deepEqual(at(result, 'P01'), { language: 'pl', step: 40 });
  assert.deepEqual(result.toPush, [], 'nothing to send: this machine was behind');
  assert.deepEqual(result.raised, [
    { program: { track: TRACK, unit: 'P01' }, from: 12, to: { language: 'pl', step: 40 } },
  ]);
});

test('this machine is further ahead, so it wins and is sent to the account', () => {
  const result = reconcile(local({ [`${TRACK}/P01`]: { language: 'en', step: 40 } }), [row('P01', 12, 'pl')]);

  assert.deepEqual(at(result, 'P01'), { language: 'en', step: 40 });
  assert.deepEqual(result.toPush, [
    { program: { track: TRACK, unit: 'P01' }, position: { language: 'en', step: 40 } },
  ]);
  assert.deepEqual(result.raised, [], 'nothing moved under the reader, so nothing to say');
});

test('a program the account has never seen is sent to it', () => {
  const result = reconcile(local({ [`${TRACK}/P01`]: { language: 'en', step: 7 } }), []);

  assert.deepEqual(at(result, 'P01'), { language: 'en', step: 7 });
  assert.equal(result.toPush.length, 1);
  assert.deepEqual(result.raised, []);
});

test('a program this machine has never seen arrives, and the reader is told it is new here', () => {
  const result = reconcile(EMPTY, [row('P04', 9, 'pl')]);

  assert.deepEqual(at(result, 'P04'), { language: 'pl', step: 9 });
  assert.deepEqual(result.toPush, []);
  assert.deepEqual(result.raised, [
    { program: { track: TRACK, unit: 'P04' }, from: null, to: { language: 'pl', step: 9 } },
  ]);
});

/**
 * The row that is not obviously symmetric. Same frame, different edition: the account's
 * copy is adopted whole, because "frame 40, in Polish" is one fact. Keeping the local
 * language here is stable without converging — see `reconcile.ts`.
 */
test('a tie on the frame adopts the account edition, and says nothing', () => {
  const result = reconcile(local({ [`${TRACK}/P01`]: { language: 'en', step: 40 } }), [row('P01', 40, 'pl')]);

  assert.deepEqual(at(result, 'P01'), { language: 'pl', step: 40 });
  assert.deepEqual(result.toPush, [], 'a tie is not ahead, so there is nothing to send');
  assert.deepEqual(result.raised, [], 'no frame moved, so the reader has not been moved');
});

/**
 * Issue #157, at the layer with the logic. A reader read to frame 3, the account holds 3,
 * and they went back to frame 2 — on this machine. The furthest is 3 and `last` is 2, so
 * there is nothing to send and nobody moved them.
 */
test('a reader who went back is neither raised nor sent anything', () => {
  const here: Progress = {
    last: { track: TRACK, unit: 'P01', language: 'en', step: 2 },
    positions: { [`${TRACK}/P01`]: { language: 'en', step: 3 } },
  };
  const result = reconcile(here, [row('P01', 3, 'en')]);

  assert.deepEqual(result.raised, [], 'going back was announced as reading done elsewhere');
  assert.deepEqual(result.toPush, [], 'going back was sent to the account');
  assert.deepEqual(result.merged, here, 'the sync moved where this browser was');
});

// ── Convergence, as a property rather than an example ───────────────────────────────────

test('two machines converge whatever order they sync in', () => {
  const phone = local({ [`${TRACK}/P01`]: { language: 'pl', step: 40 } }, 'P01');
  const laptop = local({ [`${TRACK}/P01`]: { language: 'en', step: 12 } }, 'P01');

  // Phone first: it pushes 40, so the laptop meets an account holding 40.
  const phoneThenLaptop = reconcile(laptop, [row('P01', 40, 'pl')]);
  // Laptop first: it pushes 12, which the SERVICE refuses to move backwards — so what the
  // phone later meets is still 40, and it is the service's refusal that makes this true.
  const laptopThenPhone = reconcile(phone, [row('P01', 12, 'en')]);

  assert.deepEqual(at(phoneThenLaptop, 'P01'), { language: 'pl', step: 40 });
  assert.deepEqual(at(laptopThenPhone, 'P01'), { language: 'pl', step: 40 });
  assert.deepEqual(at(phoneThenLaptop, 'P01'), at(laptopThenPhone, 'P01'));
});

test('merging twice changes nothing the second time', () => {
  const first = reconcile(local({ [`${TRACK}/P01`]: { language: 'en', step: 12 } }), [row('P01', 40, 'pl')]);
  const second = reconcile(first.merged, [row('P01', 40, 'pl')]);

  assert.deepEqual(second.merged, first.merged);
  assert.deepEqual(second.toPush, []);
  assert.deepEqual(second.raised, [], 'a reader who has already been told is not told again');
});

// ── The pointer ─────────────────────────────────────────────────────────────────────────

test('a raise moves the program, and leaves `last` where this browser was', () => {
  // `last` is the frame this browser last showed (issue #157); a raise is not a frame it
  // showed. The index offers the raised frame anyway, because it reads the program's
  // furthest out of `positions` — which is the half asserted second.
  const result = reconcile(local({ [`${TRACK}/P01`]: { language: 'en', step: 12 } }, 'P01'), [row('P01', 40, 'pl')]);

  assert.deepEqual(result.merged.last, { track: TRACK, unit: 'P01', language: 'en', step: 12 });
  assert.deepEqual(at(result, 'P01'), { language: 'pl', step: 40 });
});

test('a machine that knows where it was keeps it, however recently the account moved', () => {
  const here = local(
    {
      [`${TRACK}/P01`]: { language: 'en', step: 40 },
      [`${TRACK}/P04`]: { language: 'en', step: 2 },
    },
    'P01',
  );

  const result = reconcile(here, [row('P04', 9, 'pl', '2026-06-01T00:00:00Z')]);

  assert.equal(result.merged.last?.unit, 'P01', 'the account does not get a vote on this');
});

test('a machine with no place of its own is offered the program the account touched last', () => {
  const result = reconcile(EMPTY, [
    row('P01', 40, 'pl', '2026-01-01T00:00:00Z'),
    row('P04', 9, 'en', '2026-06-01T00:00:00Z'),
  ]);

  assert.deepEqual(result.merged.last, { track: TRACK, unit: 'P04', language: 'en', step: 9 });
});

test('a timestamp that does not parse sorts oldest rather than deciding by array order', () => {
  const forwards = reconcile(EMPTY, [row('P01', 4, 'en', 'not a date'), row('P04', 9, 'en', '2026-01-01T00:00:00Z')]);
  const backwards = reconcile(EMPTY, [row('P04', 9, 'en', '2026-01-01T00:00:00Z'), row('P01', 4, 'en', 'not a date')]);

  assert.equal(forwards.merged.last?.unit, 'P04');
  assert.equal(backwards.merged.last?.unit, 'P04');
});

test('an account with nothing in it leaves a reader their place', () => {
  const here = local({ [`${TRACK}/P01`]: { language: 'en', step: 12 } }, 'P01');
  const result = reconcile(here, []);

  assert.deepEqual(result.merged.last, here.last);
  assert.deepEqual(result.raised, []);
});

// ── What crossed the network is not believed ────────────────────────────────────────────

test('a row this module does not recognise the shape of costs that row and nothing else', () => {
  const rows = [
    row('P01', 40, 'pl'),
    { track: TRACK, unit: 'P04', step: 2.5, language: 'en', updatedAt: '2026-01-01T00:00:00Z' },
    { track: TRACK, unit: 'P05', step: 0, language: 'en', updatedAt: '2026-01-01T00:00:00Z' },
    { track: TRACK, unit: 'P06', step: '9', language: 'en', updatedAt: '2026-01-01T00:00:00Z' },
    { track: '', unit: 'P07', step: 3, language: 'en', updatedAt: '2026-01-01T00:00:00Z' },
    { unit: 'P08', step: 3, language: 'en', updatedAt: '2026-01-01T00:00:00Z' },
    null,
    'P09',
  ] as unknown as RemoteRecord[];

  const result = reconcile(EMPTY, rows);

  assert.deepEqual(Object.keys(result.merged.positions), [`${TRACK}/P01`]);
  assert.equal(result.raised.length, 1);
});

test('a stored key this module cannot address is kept rather than tidied away', () => {
  const result = reconcile({ positions: { 'no-slash': { language: 'en', step: 3 } } }, []);

  assert.deepEqual(result.merged.positions['no-slash'], { language: 'en', step: 3 });
  assert.deepEqual(result.toPush, [], 'and it is never sent anywhere, because it addresses nothing');
});

// ── A cycle that lands after the reader read on ──────────────────────────────────────────

const raise = (unit: string, to: number, from: number | null = null): Raised => ({
  program: { track: TRACK, unit },
  from,
  to: { language: 'en', step: to },
});

/**
 * Issue #157, the race half. A cycle pulled with this browser at frame 5; while it was out
 * the reader revealed frame 6 — which moved the account too — and landed on it. Writing the
 * cycle's record back whole put 6 back to 5, and the next cycle announced 6 as read
 * elsewhere.
 */
test('a cycle that lands late keeps what the reader reached while it was out', () => {
  const merged = local({ [`${TRACK}/P01`]: { language: 'en', step: 5 } }, 'P01');
  const now = local({ [`${TRACK}/P01`]: { language: 'en', step: 6 } }, 'P01');

  const { record } = settle(now, merged, []);

  assert.deepEqual(record.positions[`${TRACK}/P01`], { language: 'en', step: 6 }, 'the write lowered the furthest');
  assert.deepEqual(record.last, now.last, '`last` is where this browser is now');
});

test('a raise this browser reached on its own while the cycle was out is not announced', () => {
  const merged = local({
    [`${TRACK}/P01`]: { language: 'en', step: 6 },
    [`${TRACK}/P04`]: { language: 'en', step: 9 },
  });
  const now = local({
    [`${TRACK}/P01`]: { language: 'en', step: 6 },
    [`${TRACK}/P04`]: { language: 'en', step: 2 },
  });

  const { raised } = settle(now, merged, [raise('P01', 6, 5), raise('P04', 9, 2)]);

  assert.deepEqual(raised, [raise('P04', 9, 2)], 'only the raise still ahead of this browser is news');
});

test('a program first opened while the cycle was out is kept, and one only the cycle knows arrives', () => {
  const merged = local({ [`${TRACK}/P04`]: { language: 'pl', step: 9 } });
  const now = local({ [`${TRACK}/P01`]: { language: 'en', step: 1 } }, 'P01');

  const { record } = settle(now, merged, []);

  assert.deepEqual(record.positions, {
    [`${TRACK}/P01`]: { language: 'en', step: 1 },
    [`${TRACK}/P04`]: { language: 'pl', step: 9 },
  });
});

test('a tie keeps the cycle’s edition, which is the account’s — ADR-0019’s tie rule', () => {
  const merged = local({ [`${TRACK}/P01`]: { language: 'pl', step: 40 } });
  const now = local({ [`${TRACK}/P01`]: { language: 'en', step: 40 } });

  assert.deepEqual(settle(now, merged, []).record.positions[`${TRACK}/P01`], { language: 'pl', step: 40 });
});

test('a browser with no `last` of its own takes the cycle’s', () => {
  const merged = local({ [`${TRACK}/P04`]: { language: 'en', step: 9 } }, 'P04');

  assert.deepEqual(settle(EMPTY, merged, []).record.last, merged.last);
});

// ── A raise this browser caused itself ───────────────────────────────────────────────────

/**
 * The half `settle` cannot reach: a cycle that lands between a signed-in reveal's answer and
 * the page it leads to finds the account one frame ahead of the frame this browser last
 * showed — the shape of a raise from elsewhere. `sync.ts` holds a raise of that shape back
 * and then asks `stillNews`, which a page that has since recorded itself answers no.
 */
test('a raise to the frame after the one shown here could be this browser’s own reveal', () => {
  const onFrame3: Progress = {
    last: { track: TRACK, unit: 'P01', language: 'en', step: 3 },
    positions: { [`${TRACK}/P01`]: { language: 'en', step: 3 } },
  };

  assert.equal(couldBeOwnReveal(raise('P01', 4, 3), onFrame3), true, 'the next frame is a reveal’s shape');
  assert.equal(couldBeOwnReveal(raise('P01', 5, 3), onFrame3), false, 'a reveal moves the account by one');
  assert.equal(couldBeOwnReveal(raise('P04', 4), onFrame3), false, 'nobody revealed in another program');
  assert.equal(couldBeOwnReveal(raise('P01', 4, 3), EMPTY), false, 'a browser that showed nothing');
});

test('a raise is news until this browser shows that frame, or stops keeping it', () => {
  // Adopted: the furthest is at the raised frame, and `last` is still where the reader was —
  // adopting a raise moves the furthest and never `last`, so writing it down withdraws nothing.
  const adopted: Progress = {
    last: { track: TRACK, unit: 'P01', language: 'en', step: 3 },
    positions: {
      [`${TRACK}/P01`]: { language: 'en', step: 4 },
      [`${TRACK}/P04`]: { language: 'en', step: 9 },
    },
  };
  assert.equal(stillNews(raise('P01', 4, 3), adopted), true, 'adopting the raise withdrew it');

  const landed: Progress = { ...adopted, last: { track: TRACK, unit: 'P01', language: 'en', step: 4 } };
  assert.equal(shownHere(raise('P01', 4, 3), landed), true);
  assert.equal(stillNews(raise('P01', 4, 3), landed), false, 'the page it raced never took it back');
  assert.equal(stillNews(raise('P04', 9, 2), landed), true, 'another program’s line went with this one');

  const raisedAgain: Progress = {
    ...adopted,
    positions: { ...adopted.positions, [`${TRACK}/P01`]: { language: 'en', step: 9 } },
  };
  assert.equal(stillNews(raise('P01', 4, 3), raisedAgain), false, 'a later raise has a line of its own');
  assert.equal(stillNews(raise('P01', 4, 3), EMPTY), false, 'a forgotten program is not news');
});
