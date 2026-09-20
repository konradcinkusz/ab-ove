'use client';

import { useEffect } from 'react';

/**
 * Which modifier this reader's keyboard has, said once on `<html>`.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE HINT SAID `Ctrl+Enter` TO EVERY READER, AND HALF OF THEM HAVE NO CONTROL KEY WHERE IT
 * MATTERS. The handlers already accepted `⌘+Enter` (`answer-line.tsx`, `working.tsx`
 * test `metaKey` too); only the words were wrong. This sets `data-modifier="meta"` on an
 * Apple platform and the stylesheet shows the `⌘` spelling — both spellings are in the
 * server-rendered markup, so nothing is rewritten after paint and nothing hydrates against
 * a string the server did not send.
 *
 * A component rather than a line in `frame-keys.tsx`, because the foot's full key map is
 * on the contents and summary pages too, where no keyboard island runs. `keys-details.tsx`
 * renders this beside the list, so every page that names the chord names it correctly.
 *
 * `navigator.userAgentData.platform` where the browser has it, `navigator.platform` where
 * it does not; a platform is not a fact that changes under a reader, so the flag is set
 * and never cleared.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function usesCommandKey(): boolean {
  const data = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  const platform = data?.platform ?? navigator.platform ?? '';
  return /mac|iphone|ipad|ipod/i.test(platform);
}

export function ModifierFlag(): null {
  useEffect(() => {
    if (usesCommandKey()) document.documentElement.dataset.modifier = 'meta';
  }, []);
  return null;
}
