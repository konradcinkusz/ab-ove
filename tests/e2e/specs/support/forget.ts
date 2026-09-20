import { expect, type Page } from '@playwright/test';

/**
 * *Forget where I am*, pressed the way a reader presses it: twice.
 *
 * The control is two presses (ADR-0047): the first renames it to say what it will do, and
 * the second does it. A spec that clicked once would be asserting that a primed control
 * has done nothing — which is a property, and `progress.spec.ts` asserts it in as many
 * words — so every journey that wants the record gone goes through here, and the two
 * labels are the English ones because a test context has chosen no edition and the index
 * therefore opens in English (ADR-0049).
 */
export async function forgetWhereIAm(page: Page): Promise<void> {
  const control = page.getByRole('button', { name: 'Forget where I am' });
  await control.click();
  const armed = page.getByRole('button', { name: 'Forget it — on every device' });
  await expect(armed, 'the first press did not arm the control').toBeVisible();
  await armed.click();
}
