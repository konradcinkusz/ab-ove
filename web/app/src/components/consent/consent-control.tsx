'use client';

import { useSyncExternalStore } from 'react';

import { answer, serverSnapshot, snapshot, subscribe } from '@/lib/consent/client';
import { chromeFor } from '@/lib/i18n/chrome';

import styles from './consent-control.module.css';

/**
 * Consent to contribute to the instrument — the invitation and the durable control, which
 * are one component in three states.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ONE COMPONENT, BECAUSE THE THREE STATES ARE ONE DECISION AND MUST NOT DRIFT.
 *
 * `undecided` renders the invitation. `granted` and `declined` render a line of status and
 * one button that moves to the other. Splitting them into an "ask" component and a
 * "settings" component would be two places that decide what is being agreed to, and only
 * one of them would ever be corrected.
 *
 * WHAT MAKES THIS NOT A NAG. The invitation renders if and only if the answer is
 * `undecided`, and answering — either way — writes a record that is remembered. There is no
 * dismiss that leaves the state unchanged, because a dismissal that did not count as an
 * answer is precisely the thing that comes back on the next page. Issue #14: "no nag, no
 * second ask on the next page, no 'are you sure'."
 *
 * There is no confirmation on decline for the same reason. One click, and the invitation is
 * gone for good.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * IT RENDERS NOTHING ON THE SERVER. `serverSnapshot` is `undecided`, which would render the
 * invitation into the first paint of every page for every reader INCLUDING those who have
 * already declined — the nag arriving through hydration rather than through a decision. So
 * the component reads a second signal: `useSyncExternalStore` only settles on the client,
 * and until it does this renders `null`.
 *
 * That also means the control is absent from the first paint, so it lives at the END of the
 * page where appearing costs no layout shift — the same constraint the resume controls have
 * (issue #7), solved the same way.
 */
export function ConsentControl({
  language,
}: {
  readonly language: string;
}): React.JSX.Element | null {
  const consent = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const chrome = chromeFor(language);
  const strings = chrome.consent;

  /*
    Whether this is the client yet.

    `useSyncExternalStore` gives the server snapshot during SSR and the first hydration
    pass, and there is no way to tell that apart from a genuinely undecided reader by
    looking at the value alone — both are `undecided`. A second store whose server snapshot
    differs from its client one is the standard way to ask "am I hydrated", and it costs one
    subscription that never fires.
  */
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  if (!hydrated) return null;

  if (consent === 'undecided') {
    return (
      <section className={styles.invitation} lang={chrome.language}>
        <h2 className={styles.title}>{strings.invitationTitle}</h2>
        <p className={styles.body}>{strings.invitationWhat}</p>
        <p className={styles.body}>{strings.invitationNoReader}</p>
        {/*
          The sentence that makes declining safe to do, and it is load-bearing rather than
          reassurance: a reader who is not told that "no" costs them nothing will hesitate,
          and a hesitant yes is not consent.
        */}
        <p className={styles.reassurance}>{strings.invitationEitherWay}</p>
        <div className={styles.answers}>
          <button className={styles.grant} onClick={() => answer('granted')} type="button">
            {strings.grant}
          </button>
          {/*
            The decline is a real button of equal weight, not a link, not smaller, and not
            greyed. A decline that is harder to press than the accept is an opt-in in
            wording only.
          */}
          <button className={styles.decline} onClick={() => answer('declined')} type="button">
            {strings.decline}
          </button>
        </div>
      </section>
    );
  }

  const granted = consent === 'granted';

  return (
    <p className={styles.status} lang={chrome.language}>
      <span className={styles.statusText}>
        {granted ? strings.statusGranted : strings.statusDeclined}
      </span>{' '}
      <button
        className={styles.toggle}
        onClick={() => answer(granted ? 'declined' : 'granted')}
        type="button"
      >
        {granted ? strings.withdraw : strings.join}
      </button>
      {/*
        Shown only while contributing, because it is a fact about stopping. A reader who is
        already not contributing has nothing to be told about what stopping cannot undo.
      */}
      {granted ? <span className={styles.caveat}>{strings.withdrawCannotRetract}</span> : null}
    </p>
  );
}
