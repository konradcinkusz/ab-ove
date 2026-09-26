'use client';

import { ask, signOut, snapshot } from '@/lib/session/client';

import styles from './sign-out.module.css';

/**
 * *Sign out*, on the account's own page — and then off it.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE SAME SIGN-OUT AS THE INDEX'S, AND A DIFFERENT PAGE TO BE LEFT ON.
 *
 * It calls `signOut` from `lib/session/client.ts`, the one sign-out there is: the BFF drops
 * the two cookies and nothing else, so issue #11's promise — signing out is not a
 * punishment for having an account — is kept by the same absence the index relies on.
 *
 * What differs is where the reader stands afterwards. The index's control flips to *Sign in*
 * and the page stays, because the page is still true. This one is not: every line on it is
 * about a session that has just ended, and `/account` is private, so a reload would meet the
 * sign-in form for the page the reader chose to leave. So it goes to the programs, in the
 * reader's edition, and REPLACES this entry in the history for the same reason — Back from
 * the index must not land on that form either. A full navigation rather than a router push:
 * the whole document was rendered for the session, and nothing of it should outlive it.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * It leaves unless the session says it is STILL signed in. `unavailable` is a sign-out whose
 * answer could not be read back, and the page the reader goes to asks again and shows what it
 * finds (`account-control.tsx`) — whereas staying here would keep showing an account that
 * may be gone. Only a reader who is certainly still signed in stays, on a page that is still
 * true, with the control to press again.
 *
 * It needs script, as the index's does: the session route ends a session with `DELETE`, which
 * a plain form cannot send.
 */
export function SignOut({
  label,
  language,
  then,
}: {
  readonly label: string;
  readonly language: string;
  /** Where the reader goes once the session is gone: the index, in their edition. */
  readonly then: string;
}): React.JSX.Element {
  const leave = async (): Promise<void> => {
    await signOut();

    /*
      `ask()` shares a request already in flight — the progress sync asks on arrival and when
      the tab comes back into view — and one that began before the `DELETE` can only report
      what was true before it. So a `signed-in` is asked once more, fresh, before it is
      believed.
    */
    const status = snapshot() === 'signed-in' ? await ask() : snapshot();
    if (status !== 'signed-in') window.location.replace(then);
  };

  return (
    <button className={styles.signOut} lang={language} onClick={() => void leave()} type="button">
      {label}
    </button>
  );
}
