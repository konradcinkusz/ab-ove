'use client';

import { useEffect, useRef } from 'react';

/**
 * Run something once when the component mounts, and its teardown when it unmounts.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE REF IS FOR STRICT MODE, AND IT IS NOT DEFENSIVE PROGRAMMING.
 *
 * React's development Strict Mode mounts, unmounts and remounts every component to surface
 * effects that are not clean up after themselves. That is a good check and this effect
 * passes it — but the effect it guards starts a NETWORK CYCLE, so passing it honestly
 * means the double invocation fires two syncs on every dev page load, which is two PUTs of
 * the same position and a misleading network panel for whoever is debugging one.
 *
 * `sync()` serialises concurrent runs anyway, so the second is harmless; this keeps it
 * from happening at all, which is cheaper than explaining it in a comment on the panel.
 * The teardown still runs and the subscriptions still come off — the assertion that they
 * do is that `startSync` returns its own remover and nothing here invents one.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function useOnMount(start: () => () => void): void {
  const stop = useRef<(() => void) | null>(null);

  useEffect(() => {
    stop.current ??= start();
    return () => {
      stop.current?.();
      stop.current = null;
    };
    // Once, for the life of the component. `start` is a module function and is stable; a
    // dependency on it would be a dependency on an identity that cannot change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
