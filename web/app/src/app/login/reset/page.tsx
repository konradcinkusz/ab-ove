import type { Metadata } from 'next';

import { PASSWORD_MIN_LENGTH, PASSWORD_PATTERN } from '@/lib/password-policy';

import styles from '../../credentials-form.module.css';
import { LinkPage, linkPageMetadata } from '../link-page.tsx';

/**
 * `/login/reset` — choosing a new password, once the link in the email has been opened
 * (issue #170).
 *
 * `/reset-password`, where the link lands, moved the address and the token into this origin's
 * server and sent the reader here; the page is `../link-page.tsx`, shared with `/login/confirm`,
 * whose header says what it holds and what it never does. What is this page's own is the field.
 *
 * THE RULES ARE THE FIELD'S DESCRIPTION, as on `/register` since issue #166, and the browser
 * checks them before anything is sent (`lib/password-policy.ts`): `ResetPasswordRequest` carries
 * the same `[StringLength(100, MinimumLength = 8)]` as `RegisterRequest`, and Identity applies
 * the same policy to a reset as to a registration. The words are `registerPage.passwordRules`
 * rather than a second copy of the same sentence.
 */

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The password field's description, by id — the paragraph that states the rules. */
const PASSWORD_RULES_ID = 'password-rules';

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  return linkPageMetadata('reset', searchParams);
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<React.JSX.Element> {
  return LinkPage({
    kind: 'reset',
    searchParams,
    fields: (chrome) => (
      <div className={styles.field}>
        <label className={styles.label} htmlFor="password">
          {chrome.resetPage.passwordLabel}
        </label>
        <input
          className={styles.input}
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          pattern={PASSWORD_PATTERN}
          aria-describedby={PASSWORD_RULES_ID}
          required
        />
        <p className={styles.hint} id={PASSWORD_RULES_ID}>
          {chrome.registerPage.passwordRules}
        </p>
      </div>
    ),
  });
}
