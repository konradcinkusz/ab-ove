import { ThemeSwitch } from '@/components/theme/theme-switch';
import type { Chrome } from '@/lib/i18n/chrome';

import { KeyMap } from './keys-details.tsx';
import styles from './reading-foot.module.css';

export interface ReadingFootProps {
  readonly chrome: Chrome;
  /** The way back: `← Previous`, `← F01`, `Contents`. Absent on a screen that has none. */
  readonly back?: React.ReactNode;
  /** Where the reader is, as text — the frame count. Omitted where the page already says. */
  readonly where?: React.ReactNode;
  /** The way on: `Next section →`, `F03 →`, `Next program → …`. */
  readonly forward?: React.ReactNode;
  /** Neither a place to go nor a setting — `Clear my answer`, on a cue frame. */
  readonly aside?: React.ReactNode;
}

/**
 * THE FOOT OF EVERY READING SCREEN, FROM ONE COMPONENT AND ONE STYLESHEET — ADR-0058.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * WHAT IT REPLACED, AND WHY THREE COPIES WAS THE DEFECT RATHER THAN THE SYMPTOM.
 *
 * The frame, the contents page and the summary each carried their own `.foot` in their own
 * stylesheet, and ADR-0057 restyled exactly one of them. Its Consequences named the rest as
 * work deliberately not done — "so the three reading screens do not drift into two visual
 * languages without anyone deciding to" — and they had already drifted by the time anybody
 * looked. One component is what stops a fourth screen inventing a fourth foot.
 *
 * THE OWNER'S REPORT WAS THAT IT LOOKED BAD, AND IT DID, FOR A REASON WITH A NAME. Each
 * foot was a `flex` row with `justify-content: space-between` holding six things of three
 * different kinds: somewhere to go, something to press once and regret, a readout, and two
 * settings. `Keys` carried `flex-basis: 100%` — a real fix for a real 360px overflow — so
 * the disclosure ALWAYS broke to its own line, which is the dangling row in the report's
 * screenshots. Flex decides the break from the content; there is no content here that makes
 * a good break, so the break is stated instead.
 * ────────────────────────────────────────────────────────────────────────────────────────
 *
 * A GRID WITH NAMED AREAS, AND THE BREAK IS WRITTEN DOWN. `back where forward` on one row
 * with `aside` under it, and below 30rem one control per row. `1fr auto 1fr` keeps the
 * position centred whatever the buttons are called, and an absent slot — frame 1 has no
 * `back`, the contents page and the summary have no `where` — collapses its own cell
 * without moving the others. There is no width at which an item can strand, because there
 * is no width at which the layout is decided by measurement.
 *
 * THE SETTINGS ARE NOT IN THE `<nav>`, WHICH IS THE OTHER HALF OF THE REPORT. The theme
 * switch and the key map are one `<details>` BELOW the navigation landmark — they are not
 * places to go, and a landmark named *Where to next* containing a colour picker was the
 * name being wrong rather than the control being misplaced. `specs/gate.spec.ts` locates
 * that landmark by its name, and the name is now true.
 *
 * IT IS LAST ON THE PAGE, AND THAT IS LOAD-BEARING. `keys-details.tsx` held the property
 * before this file did: a disclosure below every control cannot push anything a reader is
 * looking at when it opens, which is the layout-shift bound `specs/reading.spec.ts`
 * asserts. It is kept here by placement, exactly as it was kept there.
 */
export function ReadingFoot({
  chrome,
  back,
  where,
  forward,
  aside,
}: ReadingFootProps): React.JSX.Element {
  return (
    <>
      <nav aria-label={chrome.footNav} className={styles.foot} lang={chrome.language}>
        <div className={styles.back}>{back}</div>
        <div className={styles.where}>{where}</div>
        <div className={styles.forward}>{forward}</div>
        {aside ? <div className={styles.aside}>{aside}</div> : null}
      </nav>

      {/*
        ONE DISCLOSURE FOR EVERY SETTING, RATHER THAN A SWITCH AND A DISCLOSURE SIDE BY SIDE.

        ADR-0048 put the theme switch on the reading screens because the answer to "how do I
        turn on light mode" used to be "change your operating system", and that reasoning is
        untouched: it is still here, still on the page the reader is on, still one press
        away. What changed is that it no longer sits in the row a reader scans for the way
        forward. A setting nobody touches twice a season does not belong beside the control
        they press on every frame (ADR-0058).
      */}
      <details
        className={styles.settings}
        /*
          `data-testid` as E2E-ACCEPTANCE-TESTING.md's DELIBERATE fallback, not a shortcut
          past role-and-name — the same reasoning `frame-view.tsx` records for the keyboard
          hint. A `<details>` takes its accessible name from nothing (a `<summary>` has no
          role of its own in the mapping every browser and Playwright agree on), and its
          only text is a bilingual label, so locating it by words would put a second copy of
          a translated string in the suite. `language-choice.spec.ts` refuses exactly that.
        */
        data-testid="reading-settings"
        lang={chrome.language}
      >
        <summary className={styles.settingsSummary}>{chrome.readingSettings}</summary>
        <div className={styles.settingsBody}>
          {/*
            Each setting under a heading of its own, at the same level, so the panel reads
            as a list of two things rather than as a control followed by a section. The
            theme's heading repeats the accessible name its own `role="group"` already
            carries — which is the right redundancy: the group's name is for a screen
            reader and this is for an eye, and a control labelled for one and not the other
            is the kind of asymmetry that looks like an oversight because it is one.
          */}
          <div className={styles.setting}>
            <h2 className={styles.settingHeading}>{chrome.themeLabel}</h2>
            <ThemeSwitch language={chrome.language} />
          </div>
          <div className={styles.setting}>
            {/*
              A heading rather than a nested `<details>`: two disclosures deep is a reader
              pressing twice to read a list of shortcuts, and the panel this sits in is
              already closed.
            */}
            <h2 className={styles.settingHeading}>{chrome.keysHeading}</h2>
            <KeyMap chrome={chrome} />
          </div>
        </div>
      </details>
    </>
  );
}
