import type { Page } from '@playwright/test';

/**
 * Collect uncaught exceptions the page throws.
 *
 * NO ASSERTIONS, NO WAITS, NO RETRY — this returns a live array and nothing else, and the
 * spec asserts on it. The reason for that discipline is in service-info.ts: a shared helper
 * that hid a swallowed failure or a wait that does not wait would be invisible at the call
 * site, which is the exact defect E2E-ACCEPTANCE-TESTING.md §4 records.
 *
 * WHY IT IS WORTH ASSERTING. A React client component that throws during render leaves the
 * server-rendered HTML on screen. The page therefore still looks right, `toBeVisible()`
 * still passes on everything above the broken component, and the only witness is an
 * exception in the console. Without this, "the app still renders when the API is
 * unreachable" would be satisfied by an app that rendered and then crashed.
 */
export function collectPageErrors(page: Page): readonly Error[] {
  const errors: Error[] = [];
  page.on('pageerror', (error) => errors.push(error));
  return errors;
}

/** Render collected errors for an assertion message a reader can act on. */
export function describePageErrors(errors: readonly Error[]): string {
  return errors.map((error) => `${error.name}: ${error.message}`).join('\n');
}
