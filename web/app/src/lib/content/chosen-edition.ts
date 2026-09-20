import { resolvedEdition } from '../language/store.ts';

import type { Bundle } from './schema.ts';

/**
 * Which edition the index is showing.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ADR-0048 REVERSED ADR-0015, AND THIS FILE IS WHERE THE REVERSAL IS VISIBLE.
 *
 * What stood here returned `undefined` for a reader who had not chosen, and the index
 * rendered every programme's title twice — once per edition, each half a link — so that no
 * default was ever applied. The argument was good and the result was not: a reader met the
 * language question on the index, again on the contents page, again on the summary and
 * again in every frame's place row, and answering it never stuck, because nothing kept the
 * answer. ADR-0048 has the full argument; the short of it is that a question asked on every
 * screen costs a reader more than a default they can change once and never see again.
 *
 * So this now always returns a language. English unless the reader has said otherwise —
 * in the URL, where a link they were sent can say it, or in what this browser remembers of
 * their own choice.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * THE PRECEDENCE IS NOT HERE. It is `lib/language/store.ts`'s `resolvedEdition`, which is
 * also what the browser side reasons about, so the rule is one function rather than one
 * function and one component that mostly agree. What this file still owns is the other
 * half: WHICH EDITIONS EXIST, which is the bundles' to declare and nothing else's.
 */

/**
 * Every edition the served content exists in, in the order the bundles declare them.
 *
 * `track.languages` is the bundle's own declaration and is read rather than sorted — the
 * reason ADR-0015 gave for the vertical order of two titles is the reason this list is not
 * alphabetised here. A second track contributes any edition the first did not, at the end,
 * because that is where it was first declared.
 */
export function editionsOffered(bundles: readonly Bundle[]): readonly string[] {
  const seen: string[] = [];
  for (const bundle of bundles) {
    for (const language of bundle.track.languages) {
      if (!seen.includes(language)) seen.push(language);
    }
  }
  return seen;
}

/**
 * The edition to render: what the URL asks for, else what the browser remembers, else
 * English.
 *
 * `asked` is a Next search-parameter value, which is `string | string[] | undefined` — an
 * array when the query repeats the key. A repeat is refused rather than resolved to its
 * first element: `?lang=pl&lang=en` is a request with two answers in it, and choosing one
 * is a silent editorial pick. It falls through to the remembered answer, which is a thing
 * the reader really did say.
 *
 * Everything else that is not a declared edition falls through the same way and none of it
 * is an error: `?lang=de`, `?lang=`, `?lang=<script>`, a cookie somebody edited, and a
 * perfectly good preference naming an edition this track has since dropped. That is
 * `bundleFor`'s own stance on an unknown track, applied one level up — a typo in a query
 * string is a reader's slip, and the honest response is a page that renders.
 */
export function chosenEdition(
  bundles: readonly Bundle[],
  asked: string | readonly string[] | undefined,
  remembered: string | undefined,
): string {
  return resolvedEdition(editionsOffered(bundles), asked, remembered);
}
