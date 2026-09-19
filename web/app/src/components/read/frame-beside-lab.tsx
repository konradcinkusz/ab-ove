import { LabPane } from '@/components/lab/lab-pane';
import { chromeFor } from '@/lib/i18n/chrome';
import type { LabDescriptor } from '@/lib/lab/protocol';

import styles from './frame-beside-lab.module.css';

/**
 * The reading column's anchor, so the foot of the pane can send a reader back up to it.
 *
 * One constant rather than the string written twice, because the two halves of an anchor
 * that disagree fail silently: the browser scrolls nowhere and there is no error anywhere
 * to notice. It is deliberately not one of `LabPane`'s ids (`lab-editor`,
 * `lab-checks-heading`) and cannot collide with a frame's own markup, which carries none.
 */
const FRAME_ANCHOR = 'the-frame';

export interface FrameBesideLabProps {
  readonly lab: LabDescriptor;
  /** The content tag to record outcomes against, resolved on the server. See the route. */
  readonly bundleTag?: string;
  /** The edition the frame is in, so the region's own label is in a language. */
  readonly language: string;
  /** The frame. A rendered node, never a description of one — see below. */
  readonly children: React.ReactNode;
}

/**
 * The frame, and the lab pane beside it — UI-UX.md phase 1, item 1.5.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE FRAME IS A `children` SLOT, AND THAT IS THE WHOLE OF WHY THE ANSWER STAYS ABSENT.
 *
 * The property this product rests on is a property of the ROUTE, not of a component's
 * discipline: the reveal is a navigation to step `n + 1`, so the answer to the step on
 * screen is rendered by the request for the next one and by nothing before it. Two things
 * would break that here, and neither is hypothetical, which is why this component is shaped
 * the way it is rather than the obvious way.
 *
 * It does not take a step, a bundle or a unit. Given one it would have to render the frame
 * itself, and a component that renders the frame is one refactor away from rendering the
 * next frame's opening to make the reveal feel instant. It takes the finished node instead,
 * so there is nothing here to reach for.
 *
 * And the frame is a SIBLING of the pane rather than a child of it. `<LabPane>{children}</LabPane>`
 * would render identically and would put the frame's markup in a Client Component's props,
 * which is the one place on this page that is serialised into the document for hydration —
 * see frame-keys.tsx, which is held to the same rule for the same reason.
 *
 * This component is therefore a Server Component with no state, no props that are content
 * and no client boundary of its own. What crosses the boundary is what `LabPane` already
 * took at `/lab/<id>`: a lab descriptor and a content tag.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ON THE LANDMARKS, because composing two pages makes one out of two.
 *
 * `LabPane` renders `<main>`, which is correct on `/lab/<id>` where it is the page. Here it
 * is half of one, and a second `<main>` around the reading column would be invalid markup
 * rather than a fix — the element may appear once per document. So the frame gets a NAMED
 * REGION instead: a reader navigating by landmark finds "The frame" before the pane's main,
 * in source order, rather than finding the lab and no way to the frame. `chromeFor` supplies
 * the name so it is in a language rather than in English on a Polish page.
 *
 * The honest reading of that is that the pane keeps `<main>` because it brought it, not
 * because the lab is the more important half. Giving `LabPane` an optional element to render
 * as would settle it properly and is a change to a component this route only composes.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * NARROW SCREENS STACK RATHER THAN TAB, AND THE ONE CONTROL BELOW IS WHAT PAYS FOR THAT.
 *
 * #54 settled the divergence UI-UX.md 1.5 had been carrying: an external proposal wanted
 * tabs on a phone, the document says below, and below won — a tab that shows the pane
 * hides the frame, which is the one thing 1.5's last clause forbids in as many words.
 * The argument and the measurements are in UI-UX.md beside the requirement, because that
 * is where a decision about this layout is looked for and a component is not.
 *
 * Stacking's whole defence is that both halves stay reachable, so the distance between
 * them is this component's problem rather than a detail. Measured at 360x640 against the
 * fixture: the page is about 2,800 px tall and the editor opens some 1,390 px down, so a
 * reader at the foot of the checks is roughly four screens below the question. `backToFrame`
 * is that distance in one tap. It is a plain same-document anchor — no router, no client
 * boundary, nothing positioned — and the stylesheet withdraws it at exactly the width the
 * columns divide, because a link to something already beside you is noise.
 */
export function FrameBesideLab({
  lab,
  bundleTag,
  language,
  children,
}: FrameBesideLabProps): React.JSX.Element {
  const chrome = chromeFor(language);

  return (
    <div className={styles.spread}>
      {/*
        The frame first, in source order, on every screen width. That is what the
        single-column default in the stylesheet is for, and it is also what a screen reader
        and a keyboard both follow — so "the pane sits below it on a narrow screen" is one
        statement about the document rather than two about two layouts.

        `lang` is the CHROME's language and not the content's: the label is this
        application's word, the frame inside carries its own `lang`, and a track may declare
        an edition this repository has no controls for. lib/i18n/chrome.ts keeps the two
        sets apart and this is what that distinction is for.
      */}
      {/*
        `tabIndex={-1}` makes the region a focus target without putting it in the tab order,
        which is the skip-link pattern and is what stops the link below being a sighted
        reader's control only: without it the browser scrolls the frame into view and leaves
        focus at the foot of the pane, so the next Tab goes back to where the reader just
        left rather than into the frame they asked for.
      */}
      <section
        aria-label={chrome.frameRegion}
        className={styles.reading}
        id={FRAME_ANCHOR}
        lang={chrome.language}
        tabIndex={-1}
      >
        {children}
      </section>

      <div className={styles.lab}>
        <LabPane lab={lab} bundleTag={bundleTag} />

        {/*
          OUTSIDE the pane's `<main>`, and that is the point rather than an accident of where
          it was easy to put: this is navigation between the two halves of a composition, not
          something the lab contains, and `LabPane` renders the same markup at `/lab/<id>`
          where there is no frame to go back to. Keeping it here means the pane stays a
          component this route composes rather than one this route has edited.
        */}
        <a className={styles.backToFrame} href={`#${FRAME_ANCHOR}`} lang={chrome.language}>
          {chrome.backToFrame}
        </a>
      </div>
    </div>
  );
}
