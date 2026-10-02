/**
 * THE BOOK'S CREDIT — ADR-0066 §4, issue #172.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * EVERY ROUTE THAT PUTS THE PROSE IN FRONT OF A READER CREDITS IT THERE.
 *
 * The book's prose is CC BY-NC-SA 4.0 (its `LICENSE-CONTENT`, ADR-0033), and this server puts
 * it into a third-party host's conversation. The licence's attribution term, §3(a)(1), asks
 * for the creator, the copyright notice and the licence with its link, and, where reasonably
 * practicable, a reference to its disclaimer of warranties and a link to the material itself.
 * ADR-0066 §4 put the credit where a host shows the book's words before and around them: the
 * server instructions (`tools.ts`, `instructionsFor`) and `list_programs`, in words and as
 * data. The content bundle carries no author and no licence, so the credit is kept here.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * READ FROM THE BOOK, NOT REMEMBERED. The copyright notice is `LICENSE-CONTENT`'s own line,
 * and the titles are the ones the book's front matter sets (`main-en.tex`, `main-pl.tex`).
 * Both were read at the content pin, `e24a4919` (`web/content/book.lock.json`'s
 * `contentBundle`), on 2026-09-26, and the notice was read again at that revision on
 * 2026-10-02. `credit.test.ts` checks the titles against the pinned bundle. Nothing checks the
 * notice, because the fetch writes no licence file to check it against, so a relicense is an
 * edit somebody makes: ADR-0033's relicense table names this file.
 *
 * NOT TRANSLATED: the copyright notice, the licence's name and its link read the same in
 * every edition, being the book's and the licence's own. The sentence around them is the
 * reader's, and is `framing.ts`'s (#167).
 *
 * ONE ENTRY FOR EVERY TRACK THIS SERVER CAN CARRY. `credit.test.ts` fails on a pinned track
 * with none, because a server carrying it would serve that book uncredited. The reading
 * surface owes the same credit (ADR-0066's Consequences, #71); when it takes this table, the
 * table moves to `@ab-ovo/web-kit` (ADR-0053), as the wire shapes did.
 */
import type { BookCredit } from './framing.ts';

/** One book's credit, in every edition it is published in. */
export interface Credit {
  /** The book's own title in each edition, by language. */
  readonly titles: Readonly<Record<string, string>>;
  readonly author: string;
  /** The copyright notice, verbatim as `LICENSE-CONTENT` states it. */
  readonly copyright: string;
  /** The licence the prose is under, by the name it gives itself. */
  readonly licence: string;
  /** The licence's own address: its human-readable summary, which links the legal code. */
  readonly licenceUrl: string;
  /** Where the book itself is: its repository, the source every edition is compiled from. */
  readonly source: string;
}

/** The credit of each track this server can carry, by track id. */
export const CREDITS: Readonly<Record<string, Credit>> = {
  'math-for-ai-engineers': {
    titles: {
      en: 'Mathematics from Zero for the AI Engineer',
      pl: 'Matematyka od zera dla inżyniera AI',
    },
    author: 'Konrad Cinkusz',
    copyright: 'Copyright (c) 2026 Konrad Cinkusz',
    licence: 'CC BY-NC-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
    source: 'https://github.com/konradcinkusz/math-for-ai-engineers',
  },
};

/**
 * The credit of a track, or `undefined` for one this table does not know. An own entry only,
 * for the reason `framingFor()` gives: `CREDITS['constructor']` is an object's member.
 */
export function creditFor(track: string): Credit | undefined {
  return Object.hasOwn(CREDITS, track) ? CREDITS[track] : undefined;
}

/**
 * The credit as one edition's reader is shown it: the title in that edition, else the
 * English one, else the first there is. Everything else reads the same in every edition.
 */
export function creditIn(credit: Credit, language: string): BookCredit {
  const title =
    (Object.hasOwn(credit.titles, language) ? credit.titles[language] : undefined) ??
    credit.titles['en'] ??
    Object.values(credit.titles)[0] ??
    '';
  return {
    title,
    author: credit.author,
    copyright: credit.copyright,
    licence: credit.licence,
    licenceUrl: credit.licenceUrl,
    source: credit.source,
  };
}
