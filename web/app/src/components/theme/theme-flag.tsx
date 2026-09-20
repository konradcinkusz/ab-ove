'use client';

import { useEffect } from 'react';

import { mirror } from '@/lib/theme/client';

/**
 * The reader's theme, kept true on `<html>` wherever they are.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ONE SUBSCRIBER, IN THE ROOT LAYOUT, FOR THE SAME REASON `ProgressSync` IS THERE.
 *
 * The attribute every token in `globals.css` is keyed on belongs to `<html>`, which no page
 * and no component owns. `lib/theme/boot.ts` sets it before the first paint, and
 * `ThemeSwitch` sets it when a reader presses a position — but a reader with two tabs open
 * pressed it in only one of them, and the other has no way to hear about it unless something
 * is listening.
 *
 * A layout is not remounted by a soft navigation, so a reader moving between frames keeps
 * ONE subscriber rather than acquiring a fresh one per page; and being here rather than
 * inside the switch means the pages with no theme control on them — `/about`, `/login`, the
 * account screens — follow the choice too instead of catching up at their next navigation.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * It renders nothing, ever, and it writes nothing on mount: `mirror()` acts only on a change
 * (see `lib/theme/client.ts`), so a page that is already correct is left exactly as the
 * document served it. That is what keeps this island off the critical path of every paint.
 *
 * A component rather than a line in `layout.tsx`, because an effect needs one and because
 * the root layout is a Server Component — the `'use client'` boundary has to be somewhere,
 * and putting it here keeps the layout itself off the client entirely.
 */
export function ThemeFlag(): null {
  useEffect(() => mirror(), []);
  return null;
}
