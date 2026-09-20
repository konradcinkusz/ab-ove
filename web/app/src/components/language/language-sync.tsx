'use client';

import { useRouter } from 'next/navigation';

import { syncLanguage } from '@/lib/language/sync';

import { useOnMount } from '../sync/use-on-mount.ts';

/**
 * The account's copy of the chosen edition, adopted once per page load.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHAT IT IS FOR, IN ONE CASE: THE SECOND MACHINE.
 *
 * A reader chooses Polish on their laptop. Everything about that choice is in the laptop's
 * own browser (`lib/language/store.ts`), which is the whole feature for somebody with no
 * account and is nothing at all on their phone. This is what makes the phone agree — it
 * asks the account on the first page load after signing in, and adopts whichever choice is
 * the more recent (`lib/language/sync.ts` has the rule and why it is not the progress one).
 *
 * It renders nothing, ever. It is in the ROOT layout beside `ProgressSync`, for that
 * component's first reason: a layout is not remounted by a soft navigation, so a reader
 * moving between frames keeps ONE subscriber instead of acquiring a pair per page.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * `router.refresh()` RATHER THAN A NAVIGATION, AND THE DIFFERENCE IS THE WHOLE DESIGN.
 *
 * A refresh re-renders the page the reader is already on, at the URL they are already at,
 * with the cookie the adoption just wrote. On the index — which has no language in its URL
 * and renders from that cookie — that is exactly the correction wanted: the titles arrive in
 * the adopted edition. On a reading page the URL names the edition in a path segment, so the
 * re-render changes nothing at all, and that is also exactly right: a deep link to the
 * English frame 31 is a link to the English frame 31, whoever opens it and whatever they
 * usually read in. Their choice is now remembered on this machine and the next thing they
 * open from the index will be in it.
 *
 * One `refresh` at most, and only when the adopted edition DIFFERS from what this browser
 * already had — `syncLanguage` answers `undefined` for every other outcome, including the
 * ordinary one where the account agrees with the browser.
 */
export function LanguageSync(): null {
  const router = useRouter();

  useOnMount(() => {
    let live = true;

    void syncLanguage().then((adopted) => {
      if (live && adopted) router.refresh();
    });

    // Nothing to unsubscribe from: the cycle is one exchange, not a subscription. The flag
    // is what stops a refresh landing on a tree this component has already left — in Strict
    // Mode's double mount, and on a reader who navigated away mid-request.
    return () => {
      live = false;
    };
  });

  return null;
}
