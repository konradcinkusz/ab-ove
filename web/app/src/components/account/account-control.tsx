'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';

import { chromeFor } from '@/lib/i18n/chrome';
import { ask, serverSnapshot, signOut, snapshot, subscribe } from '@/lib/session/client';

import styles from './account-control.module.css';

/**
 * Sign in, or sign out — the reader's end of the account.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ISSUE #11 — "Signing out leaves local progress intact. A sign-out that wipes the
 * reader's place is a punishment for using an account."
 *
 * `signOut` clears the two cookies and touches nothing else; the enforcement is that
 * `lib/session/client.ts` does not import the progress store at all, so there is no line
 * that could clear it. What the reader sees is the control change and their place stay
 * exactly where it was — which is what makes signing in a thing worth trying rather than a
 * commitment.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * IT RENDERS NOTHING UNTIL IT KNOWS. The session cookie is HttpOnly, so this cannot be
 * answered without asking the BFF (FRONTEND-BFF.md §3), and the first paint therefore has
 * no idea. Offering "Sign in" during that gap would tell a signed-in reader they are signed
 * out for as long as the round trip takes, which is the false-logout §3's `identityUnavailable`
 * flag exists to avoid — undone in the UI. Absent is honest; wrong is not.
 *
 * P8 — an identity service that cannot be reached is a supported state. `unavailable` means
 * there IS a cookie and the key set could not be reached to verify it, so the reader is
 * offered SIGN OUT: it is the more likely of the two, and it is the one that still works,
 * because signing out is this origin deleting its own cookies and needs no identity service.
 */
export function AccountControl({
  language,
}: {
  readonly language: string;
}): React.JSX.Element | null {
  const status = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const chrome = chromeFor(language);

  /*
    The path, and deliberately not the query string.

    `useSearchParams()` opts a client component out of static rendering, and this control
    is in the crumb row of `/read`, which IS statically rendered — the build fails with
    "useSearchParams() should be wrapped in a suspense boundary", and the fix on offer is a
    Suspense boundary around a control that is absent from the first paint anyway.

    What it costs is that signing in from a page with a meaningful query string would
    return the reader to that page without it. No page that renders this control has one:
    a frame is `/read/<track>/<unit>/<lang>/<n>`, the lab is a path, and every piece of
    reading state is a segment. Whoever adds a page whose query matters and puts this
    control on it has to revisit the trade rather than discover it.
  */
  const pathname = usePathname();

  useEffect(() => {
    // Shared with the progress sync: `ask()` collapses concurrent callers into one
    // request, so the two components that need this answer do not each fetch it.
    void ask();
  }, []);

  if (status === 'unknown') return null;

  if (status === 'signed-out') {
    // Carrying the current location means signing in returns the reader to the page they
    // were on rather than to the top of the site — the same `?redirect=` contract the
    // middleware's own bounce uses, and validated by the same `safeRedirectTarget`.
    return (
      <Link
        className={styles.account}
        href={`/login?redirect=${encodeURIComponent(pathname)}`}
        lang={chrome.language}
      >
        {chrome.signIn}
      </Link>
    );
  }

  /*
    Signed in, or unverifiable. Both get the account link as well as sign-out, and for the
    same reason sign-out is offered on `unavailable`: the deletion screen is a page on this
    origin, so it renders whatever the identity service is doing, and a reader who has
    decided to close their account should not be told to come back when a machine is warm.
    The route behind it reports honestly if authservice cannot be reached.

    The language rides the href. It is the edition the reading chrome is already in — the
    same signal that decided the word on this link — and it is what makes the deletion
    screen's four paragraphs readable by the reader they are for. See `app/account/page.tsx`
    for why that page follows an edition where `/login` declines to.
  */
  return (
    <span className={styles.group}>
      <Link
        className={styles.account}
        href={`/account?lang=${encodeURIComponent(chrome.language)}`}
        lang={chrome.language}
      >
        {chrome.account}
      </Link>
      <button
        className={styles.account}
        lang={chrome.language}
        onClick={() => void signOut()}
        type="button"
      >
        {chrome.signOut}
      </button>
    </span>
  );
}
