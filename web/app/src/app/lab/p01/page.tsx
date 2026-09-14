import type { Metadata } from 'next';

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
  return <LabPane lab={P01} />;
}
