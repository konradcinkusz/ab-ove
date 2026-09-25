import Link from 'next/link';

import type { Chrome } from '@/lib/i18n/chrome';
import { isReachable, openingEnds, type SectionSpan } from '@/lib/read/place';

import controls from './controls.module.css';
import { FrameJumper } from './frame-jumper.tsx';
import { Close, List, Lock } from './icons.tsx';
import { PendingLabel } from './pending-label.tsx';
import styles from './program-map.module.css';
import { PROGRAM_MAP_ID } from './popover.ts';
import { PopoverCloser } from './popover-closer.tsx';
import { RichInline } from './rich-text.tsx';
import sheet from './sheet.module.css';

export interface ProgramMapProps {
  readonly chrome: Chrome;
  /** The CONTENT's language — section titles are set in it. */
  readonly language: string;
  readonly unitId: string;
  readonly unitTitle: string;
  readonly spans: readonly SectionSpan[];
  /** The span the reader is in, or `undefined` in the opening before the first heading. */
  readonly currentSpan: SectionSpan | undefined;
  readonly current: number;
  readonly last: number;
  /** The gate's furthest servable frame (ADR-0063), or `undefined` when the API did not say. */
  readonly furthest: number | undefined;
  /** `/read/<track>/<unit>/<lang>` — the contents page, and the base a frame number goes on. */
  readonly base: string;
}

/**
 * THE PROGRAM MAP — every heading of the program and the jump to a frame number, one panel
 * opened from the pager's position (ADR-0063).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * WHAT IT REPLACED: TWO CONTROLS NOBODY COULD SEE.
 *
 * The section was 13px of grey text with a `▾` in the place row, opening a list that pushed
 * the frame down; the jump was the frame number itself, an input styled as text. Both were
 * one hop to anywhere (ADR-0041), and neither looked like it did anything. They are one panel
 * now, behind the one control on the pager that shows where the reader is — pressed, it
 * answers "where else can I go".
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * A SECTION PAST THE READER'S FURTHEST FRAME IS TEXT WITH A LOCK, NOT A LINK.
 *
 * The old list linked every heading, and every heading past the reader's furthest frame led
 * to the gate's "Not there yet" — a control that is reliably refused, which this project
 * removes wherever it finds one (`when-open.tsx`, ADR-0056). The furthest frame is the
 * content API's own cursor, sent with the frame (`StepResponse.furthest`); the browser's
 * record could not stand in for it, because it holds the frame last viewed rather than the
 * furthest reached. A locked row still names the section and says why it cannot be opened.
 * It is the reading ORDER speaking, like a shut program's `opens after`, never a count of
 * what is left (ADR-0041).
 *
 * When the API did not send `furthest` every row is a link and the gate answers, as before.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * A heading carries no question and no answer — the contents page's own rule — so listing
 * them on a frame leaks nothing; every link is `prefetch={false}` on the reveal's reasoning,
 * because a section's first frame opens with the answer to the frame before it.
 *
 * EVERY LINK HERE, AND THE JUMP, SAYS WHEN ITS PAGE IS ON ITS WAY (#160) — and says it on the
 * pager, because the map shuts on the press (`popover-closer.tsx`) and the row that was
 * pressed goes with it. The flag stays in the shut panel while the frame comes
 * (`pending-label.tsx`, and the jump's own in `frame-jumper.tsx`), and the map's door — the
 * pager's position — reads it from there (`reading-foot.module.css`).
 *
 * THE CURRENT HEADING IS A SPAN WITH `aria-current` AND NO `lang`, AND ITS RANGE SITS OUTSIDE
 * IT: `navigation.spec.ts` reads its exact text, and `language-choice.spec.ts` holds
 * `[aria-current="true"][lang]` to the language control alone. The `lang` is on the `<li>`.
 *
 * `role="list"` on the `<ul>` because WebKit and Chromium drop the role from a list styled
 * `list-style: none`; `role="dialog"` on the panel so its heading names it for a screen reader.
 */
export function ProgramMap({
  chrome,
  language,
  unitId,
  unitTitle,
  spans,
  currentSpan,
  current,
  last,
  furthest,
  base,
}: ProgramMapProps): React.JSX.Element {
  const opening = openingEnds(spans);
  const inOpening = currentSpan === undefined && opening >= 1;
  const range = (from: number, to: number): string => (from === to ? `${from}` : `${from}–${to}`);

  const row = (
    key: string,
    title: React.ReactNode,
    from: number,
    to: number,
    isCurrent: boolean,
    lang?: string,
  ): React.JSX.Element => {
    const reachable = isReachable(from, furthest);
    return (
      <li
        className={isCurrent ? `${styles.row} ${styles.current}` : reachable ? styles.row : `${styles.row} ${styles.locked}`}
        key={key}
        lang={lang}
      >
        {isCurrent ? (
          <span aria-current="true" className={styles.rowTitle}>
            {title}
          </span>
        ) : reachable ? (
          <Link className={styles.rowTitle} href={`${base}/${from}`} prefetch={false}>
            <PendingLabel>{title}</PendingLabel>
          </Link>
        ) : (
          <span className={styles.rowTitle}>
            {title}
            <span className={styles.lockNote} lang={chrome.language}>
              <Lock className={styles.lockIcon} /> {chrome.lockedSection}
            </span>
          </span>
        )}
        <span className={styles.range}>{range(from, to)}</span>
      </li>
    );
  };

  return (
    <div
      aria-labelledby={`${PROGRAM_MAP_ID}-title`}
      className={`${sheet.sheet} ${sheet.bottom}`}
      data-testid="program-map"
      id={PROGRAM_MAP_ID}
      lang={chrome.language}
      popover="auto"
      role="dialog"
    >
      <PopoverCloser id={PROGRAM_MAP_ID} />
      <div className={sheet.head}>
        <h2 className={sheet.title} id={`${PROGRAM_MAP_ID}-title`}>
          <span className={styles.mapId}>{unitId}</span>{' '}
          <span lang={language}>
            <RichInline language={language} text={unitTitle} />
          </span>
        </h2>
        <button
          aria-label={chrome.close}
          className={`${controls.ghost} ${sheet.close}`}
          popoverTarget={PROGRAM_MAP_ID}
          popoverTargetAction="hide"
          type="button"
        >
          <Close className={controls.icon} />
        </button>
      </div>

      <div className={sheet.body}>
        <FrameJumper
          base={base}
          current={current}
          furthest={furthest}
          go={chrome.go}
          goToFurthest={furthest === undefined ? undefined : chrome.goToFrameNumber(furthest)}
          label={chrome.goToFrame}
          language={chrome.language}
          last={last}
          notReached={furthest === undefined ? undefined : chrome.notReachedBody(furthest)}
          ofTotal={chrome.ofTotal(last)}
          outOfRange={chrome.frameRange(last)}
        />

        <ul aria-label={chrome.sectionsLabel} className={styles.sections} role="list">
          <li className={styles.row}>
            <Link className={styles.rowTitle} href={base}>
              <List className={styles.rowIcon} />
              <PendingLabel>{chrome.contents}</PendingLabel>
            </Link>
          </li>
          {opening >= 1 ? row('opening', chrome.opening, 1, opening, inOpening) : null}
          {spans.map((span) =>
            row(
              span.section.id,
              <RichInline language={language} text={sectionTitle(span, language)} />,
              span.from,
              span.to,
              span.section.id === currentSpan?.section.id,
              language,
            ),
          )}
        </ul>
      </div>
    </div>
  );
}

function sectionTitle(span: SectionSpan, language: string): string {
  const title = span.section.titles[language];
  if (title === undefined) {
    throw new Error(`section ${span.section.id} has no "${language}", which a validated bundle cannot do`);
  }
  return title;
}
