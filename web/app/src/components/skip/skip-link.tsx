import { DocumentLanguage } from '@/components/language/document-language';
import { chromeFor } from '@/lib/i18n/chrome';

import styles from './skip-link.module.css';

/**
 * Where every page's skip link lands: the element its own content begins at.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE `<main>` OF A READING SCREEN, AND THE `<h1>` OF EVERY OTHER PAGE — ONE RULE, NOT TWO.
 *
 * The rule is "past the masthead", and the two answers are where each kind of page puts it.
 * A reading screen's bar is OUTSIDE its `<main>` (`reading-screen.tsx`), so `<main>` is where
 * the frame begins. Every other page carries its masthead INSIDE `<main>` — the one masthead
 * (`components/masthead/masthead.tsx`, #169), the wordmark and whatever the page puts in its
 * row — so a target on `<main>` there would skip nothing at all, and the first element past the
 * masthead is the page's heading.
 *
 * NO `tabindex`, and that is measured rather than forgotten. Following an in-page link moves
 * the browser's sequential-focus starting point to the target, so the next Tab reaches the
 * first control in the content. A `tabindex="-1"` on `<main>` would buy nothing over that
 * and cost two things, both seen in Chromium: a focus ring drawn round the whole column when
 * the link is followed, and every click in a frame's text focusing the column — which takes
 * Enter away from `frame-keys.tsx`, since it opens the answer line only while nothing is
 * focused.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * The page's own id rather than a generated one: it appears in the address bar after the
 * link is followed, and `#content` is a fragment a reader can read.
 */
export const SKIP_TARGET_ID = 'content';

export interface SkipLinkProps {
  /**
   * The language this page speaks: the reader's edition on a page that follows one, and `en`
   * on the lab and the author's view, which are English only. It is also the document's
   * language (ADR-0069), which this component sets.
   */
  readonly language: string;
}

/**
 * THE FIRST THING TAB REACHES ON EVERY PAGE: A WAY PAST THE MASTHEAD (WCAG 2.4.1, issue #149).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHY IT IS RENDERED BY EACH PAGE AND NOT ONCE BY THE ROOT LAYOUT.
 *
 * The layout would be the obvious home, and it cannot write the link in the reader's
 * edition: it renders `<html lang="en">` for every page and knows nothing of the edition,
 * which each page reads from its own URL or cookie (ADR-0052). So the link is rendered by
 * the component that knows — `ReadingScreen` for every reading screen, and the masthead for
 * every other page (`components/masthead/masthead.tsx`, #169), with the edition the page
 * speaks — and a page that renders none is one a keyboard reader has to tab the whole masthead
 * of. Rendered with the masthead, it cannot be forgotten by a page that has one: the legal
 * documents' pages had none until they had the masthead.
 *
 * THE SAME REASON MAKES IT THE PLACE THE DOCUMENT'S LANGUAGE IS SET (ADR-0069). `<html lang>`
 * is the layout's, and it is the page that knows the answer; every page a reader meets renders
 * this component once, with exactly that answer — English on the legal documents' pages, as on
 * the lab's and the author's — so `DocumentLanguage` rides with it rather than being a second
 * thing each page must remember to render.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * A PLAIN `<a>`, NOT `next/link`: the destination is a fragment of this document, which
 * needs no router, no prefetch and no JavaScript — the link works before hydration and with
 * script switched off, as the reveal does (ADR-0060).
 *
 * Hidden until it has focus, and then drawn OVER the page rather than into it
 * (`skip-link.module.css`), so its arrival moves nothing a reader is looking at.
 */
export function SkipLink({ language }: SkipLinkProps): React.JSX.Element {
  const chrome = chromeFor(language);

  return (
    <>
      <a className={styles.skip} href={`#${SKIP_TARGET_ID}`} lang={chrome.language}>
        {chrome.skipToContent}
      </a>
      <DocumentLanguage language={language} />
    </>
  );
}
