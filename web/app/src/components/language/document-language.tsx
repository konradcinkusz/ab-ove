'use client';

import { useLayoutEffect } from 'react';

import { FALLBACK_LANGUAGE } from '@/lib/i18n/chrome';
import { isLanguageTag } from '@/lib/language/store';

/**
 * The document's own language — `<html lang>` — made the language of the page on screen
 * (ADR-0067). It renders nothing.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * SET IN THE BROWSER, BY THE PAGE, BECAUSE THE ROOT LAYOUT CANNOT KNOW AND WOULD NOT STAY RIGHT.
 *
 * `<html>` is the root layout's, and a layout sees neither the query nor the path — the two
 * places an edition is named — and is not rendered again on a client navigation. So a
 * server-side `lang` would have needed the middleware to hand the layout the request, would
 * have cost every page its static rendering, and would STILL have been wrong the moment a
 * reader pressed the language control, which is a client navigation to the same layout.
 * ADR-0067 has the measurement. The page knows its language at every navigation, so the page
 * says it: `SkipLink` renders this, and every page a reader meets renders `SkipLink` once with
 * that language — except the legal documents' pages, which are English and render none, and
 * so keep the root layout's English here.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * What it buys is the voice of the two things `<main lang>` could not reach, both of which
 * sit under `<html>` alone: the tab's title, and Next's route announcer, which is appended to
 * `<body>` and reads the title out after every client navigation.
 *
 * A LAYOUT EFFECT, so the attribute changes in the same commit as the page it describes and
 * before the announcer's own effect reads the title. When the page goes the attribute goes
 * back to the root layout's `FALLBACK_LANGUAGE`, so a page that declares nothing is never left
 * speaking the previous page's language. The server's first paint, and a browser with script
 * switched off, keep the layout's English on `<html>`; `<main lang>` stays right for them.
 */
export function DocumentLanguage({ language }: { readonly language: string }): null {
  useLayoutEffect(() => {
    // It arrives from a page, which read it from an address or a cookie; a value that is not
    // the shape of a language tag is not written onto the document.
    if (!isLanguageTag(language)) return;
    const root = document.documentElement;
    root.lang = language;
    return () => {
      root.lang = FALLBACK_LANGUAGE;
    };
  }, [language]);

  return null;
}
