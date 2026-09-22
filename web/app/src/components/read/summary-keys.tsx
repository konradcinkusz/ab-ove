'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { isPopoverOpen } from './popover.ts';

export interface SummaryKeysProps {
  /** Back to the program's last frame. */
  readonly back: string;
  /** On to the next program's first frame — absent for the very last program. */
  readonly forward?: string;
}

/**
 * The summary screen's own pair of keys — `frame-keys.tsx`'s mechanism, at one program's
 * scale rather than one frame's.
 *
 * A SEPARATE COMPONENT RATHER THAN A THIRD MODE OF `FrameKeys`, because the two do not
 * share an invariant worth sharing: `FrameKeys` reads the frame number out of the URL and
 * adds or subtracts one, and there is no number here to read — this screen has exactly two
 * destinations and both are already known when the page renders, so threading them through
 * the same arithmetic would be a branch bent to fit a shape it was not for.
 *
 * `data-frame-keys='on'` is the SAME flag `frame-keys.tsx` sets, on purpose: it says "the
 * arrows are live" whichever of the two components put it there, and the acceptance suite
 * waits on that one flag before it presses a key on either screen (`specs/reading.spec.ts`).
 */
export function SummaryKeys({ back, forward }: SummaryKeysProps): null {
  const router = useRouter();

  useEffect(() => {
    document.documentElement.dataset.frameKeys = 'on';

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      // The reading settings are a panel on this screen too; with it open, its keys (ADR-0063).
      if (isPopoverOpen()) return;

      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable) return;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        router.push(back);
        return;
      }

      if (event.key === 'ArrowRight' && forward) {
        event.preventDefault();
        router.push(forward);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      delete document.documentElement.dataset.frameKeys;
    };
  }, [back, forward, router]);

  return null;
}
