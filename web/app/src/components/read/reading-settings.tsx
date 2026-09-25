import { ThemeSwitch } from '@/components/theme/theme-switch';
import type { Chrome } from '@/lib/i18n/chrome';

import controls from './controls.module.css';
import { Close } from './icons.tsx';
import { KeyMap } from './keys-details.tsx';
import { READING_SETTINGS_ID } from './popover.ts';
import { SettingsKey } from './settings-key.tsx';
import styles from './sheet.module.css';

/**
 * EVERY SETTING A READER MIGHT WANT WHILE READING, BEHIND ONE BUTTON IN THE TOP BAR —
 * ADR-0063, moving what ADR-0058 put in a disclosure at the foot of the page.
 *
 * The contents are unchanged: the theme (ADR-0048 — it is this product's to offer, not the
 * operating system's) and the whole key map. What moved is the door. The disclosure sat
 * below the pager, and the pager is pinned to the bottom edge now, so a panel opening beneath
 * it would open off the screen; and a setting a reader touches twice a season does not belong
 * in the one bar they press on every frame (ADR-0058's own argument, one step further).
 *
 * A POPOVER, NOT A DIALOG: nothing here needs an answer before the reader can go on, so it
 * closes on Esc, on a click anywhere else and on its own ✕, and focus goes back to the button
 * that opened it — all of it the browser's, with no JavaScript of this application's.
 *
 * `?` opens it from the keyboard as well, on every screen that has it (`settings-key.tsx`,
 * #159), and puts focus on the panel itself — which is why it takes `tabIndex={-1}`, and why it
 * carries the `dialog` role the program map carries, so a screen reader arriving in it hears
 * its name. A role and not a modal: everything above about closing it still holds.
 *
 * `data-testid` as E2E-ACCEPTANCE-TESTING.md's deliberate fallback, on the reasoning
 * ADR-0058 gave for the disclosure it replaces: the panel's only text is translated, and
 * locating it by its words would put a second copy of a translated string in the suite.
 */
export function ReadingSettings({ chrome }: { readonly chrome: Chrome }): React.JSX.Element {
  return (
    <div
      aria-labelledby={`${READING_SETTINGS_ID}-title`}
      className={`${styles.sheet} ${styles.top}`}
      data-testid="reading-settings"
      id={READING_SETTINGS_ID}
      lang={chrome.language}
      popover="auto"
      role="dialog"
      tabIndex={-1}
    >
      <SettingsKey />
      <div className={styles.head}>
        <h2 className={styles.title} id={`${READING_SETTINGS_ID}-title`}>
          {chrome.readingSettings}
        </h2>
        <button
          aria-label={chrome.close}
          className={`${controls.ghost} ${styles.close}`}
          popoverTarget={READING_SETTINGS_ID}
          popoverTargetAction="hide"
          type="button"
        >
          <Close className={controls.icon} />
        </button>
      </div>
      <div className={styles.body}>
        <section className={styles.group}>
          {/*
            A heading as well as the group's own accessible name: the name is for a screen
            reader and this is for an eye, and a control labelled for one and not the other
            looks like the oversight it would be.
          */}
          <h3 className={styles.groupHeading}>{chrome.themeLabel}</h3>
          <ThemeSwitch language={chrome.language} />
        </section>
        <section className={styles.group}>
          <h3 className={styles.groupHeading}>{chrome.keysHeading}</h3>
          <KeyMap chrome={chrome} />
        </section>
      </div>
    </div>
  );
}
