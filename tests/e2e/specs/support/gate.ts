import { type Page } from '@playwright/test';

import { served, track } from './bundle.ts';

/**
 * A browser that has walked the book as far as a given program.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHY EVERY SPEC THAT DEEP-LINKS PAST THE FIRST PROGRAM NEEDS THIS.
 *
 * ADR-0051 shuts a program until the reader has a place in the one before it, and the
 * reading routes enforce it (`components/read/program-gate.tsx`) — so a spec that opens
 * `/read/<track>/P01/en/1` in a fresh browser is now a spec about being sent back to the
 * index. The journeys those specs are about (the frame, the worksheet, the sync, the
 * bearer hop) are journeys of a reader who GOT there, and this is the cheapest honest way
 * to be that reader: the record they would have, seeded before the first paint.
 *
 * It writes the record the walk would have left and NOTHING ELSE — a place at frame 1 in
 * every program before this one, and no `last`. The absent `last` is deliberate: it is
 * what the index's resume control reads, and a spec asserting "no resume control for a
 * reader who has not started" must not be handed one by its own setup.
 *
 * The order comes from the SERVED bundle rather than from the ids: `unitBefore` is
 * adjacency in the manifest (ADR-0051), and a helper that assumed F02 follows F01 would
 * be a second opinion about the book's order, free to disagree with the application's.
 *
 * `addInitScript` with a one-shot guard, in `sync.spec.ts`'s shape: the seed happens before
 * the app's first script on the first navigation and never again, because a test that
 * forgets the record mid-journey must stay forgotten.
 *
 * IT MERGES, AND THE GUARD IS PER PROGRAM, because one page can need two walks: the
 * worksheet suite reads F02 and then a frame found anywhere in the book, and a second seed
 * that replaced the first would have taken away the program the test was already in. Two
 * calls compose; a second call for the same program is still one write.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export async function openThrough(page: Page, unitId: string): Promise<void> {
  const index = served.units.findIndex((unit) => unit.id === unitId);
  if (index < 0) {
    throw new Error(
      `${unitId} is not in the served bundle, so there is no walk to it — see ` +
        `specs/support/bundle.ts for what is actually being served.`,
    );
  }

  // The first program of the track is open to everybody; seeding an empty record would
  // only leave a document for `ForgetProgress` to find.
  if (index === 0) return;

  const walked = Object.fromEntries(
    served.units.slice(0, index).map((unit) => [`${track}/${unit.id}`, { language: 'en', step: 1 }]),
  );

  await page.addInitScript(
    ([key, positions, seeded]) => {
      if (window.localStorage.getItem(seeded!)) return;
      window.localStorage.setItem(seeded!, '1');

      const raw = window.localStorage.getItem(key!);
      let held: { positions?: Record<string, unknown> } = {};
      if (raw !== null) {
        try {
          held = JSON.parse(raw) as { positions?: Record<string, unknown> };
        } catch {
          // A record this seed cannot read is a record it replaces, which is the same
          // thing the application does with one (`lib/progress/store.ts`).
          held = {};
        }
      }

      window.localStorage.setItem(
        key!,
        JSON.stringify({
          ...held,
          version: 1,
          positions: { ...held.positions, ...(JSON.parse(positions!) as Record<string, unknown>) },
        }),
      );
    },
    ['ab-ovo:progress:v1', JSON.stringify(walked), `ab-ovo:e2e:opened-through:${unitId}`] as const,
  );
}
