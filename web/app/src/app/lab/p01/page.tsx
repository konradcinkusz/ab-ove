import type { Metadata } from 'next';

import { tagFor } from '@ab-ovo/web-kit';

import { LabPane } from '@/components/lab/lab-pane';
import { P01 } from '@/lib/lab/protocol';

/**
 * Lab P1 — the route.
 *
 * A Server Component that renders one Client Component and nothing else: it reads no
 * cookie, makes no fetch and needs no backend, which is what lets `/lab` sit in the
 * middleware's public-route list. The reader loop is required to work with no account, and
 * a lab page that had to ask an API anything would have broken that on the first exercise.
 */
export const metadata: Metadata = {
  title: `${P01.program} — ${P01.title} — ab-ovo lab`,
  description:
    "The computer exercises for Program P1 of 'Mathematics from Zero for the AI Engineer', " +
    'worked in the browser. Python runs on your own machine under WebAssembly; your code is ' +
    'never sent anywhere, and the lab needs no account.',
};

export default function LabP01Page(): React.JSX.Element {
  /*
   * Resolved HERE, on the server, and handed down as a string.
   *
   * `tagFor` lives beside `bundleFor`, whose module imports and validates the whole bundle
   * — so reading it from the client would put the fixture in the lab route's JavaScript for
   * the sake of one string. A Server Component reads it for free and sends six characters.
   *
   * `undefined` for a track this build does not pin, and the pane reports nothing when it
   * gets one: a tally that cannot say which version of the frame the reader saw is worse
   * than no tally. The lab itself is unaffected, which is the point — the reader loop does
   * not depend on the instrument working (ADR-0004).
   */
  return <LabPane lab={P01} bundleTag={tagFor(P01.track)} />;
}
