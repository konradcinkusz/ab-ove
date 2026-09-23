'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { hidePopover } from './popover.ts';

/**
 * Shuts a popover when a choice made inside it takes the reader somewhere — ADR-0063.
 *
 * A popover stays open until something closes it, and a soft navigation is not something:
 * whether the frame's tree is remounted between frames is not a property this repository
 * can rely on (`frame-jumper.tsx` measured the instance persisting; the router's segment keys
 * suggest otherwise), so a reader who picked a section from the map could land on it with the
 * map still covering the text. Two moments close it, whichever comes first: a click on a link
 * inside it, and the path changing at all.
 *
 * It renders nothing and needs nothing from the page but the popover's id.
 */
export function PopoverCloser({ id }: { readonly id: string }): null {
  const pathname = usePathname();
  const seen = useRef(pathname);

  useEffect(() => {
    // Not on mount: a declarative `popovertarget` opens the panel before hydration, and
    // closing it the moment this island arrives would be a panel that shuts by itself.
    if (seen.current === pathname) return;
    seen.current = pathname;
    hidePopover(id);
  }, [id, pathname]);

  useEffect(() => {
    const element = document.getElementById(id);
    if (!element) return;
    const onClick = (event: MouseEvent): void => {
      const link = (event.target as Element | null)?.closest('a[href]');
      if (link && element.contains(link)) hidePopover(id);
    };
    element.addEventListener('click', onClick);
    return () => element.removeEventListener('click', onClick);
  }, [id]);

  return null;
}
