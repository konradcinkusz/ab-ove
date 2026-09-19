import type { Bundle } from './schema.ts';

/**
 * Which edition the index is showing, when the index is a grid rather than a list.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ADR-0015 REFUSED A DEFAULT EDITION, AND THIS FILE IS WHAT KEEPS THAT REFUSAL TRUE
 * ONCE A SWITCH EXISTS (ADR-0036).
 *
 * The book has two editions and no primary one. So `undefined` here is not "nothing was
 * supplied yet, fall back to English" — it is a state the index renders deliberately, in
 * which every tile carries a title per edition and neither is chosen for the reader. A
 * language is returned only when the reader has asked for one, in the URL, where they can
 * see it and leave it.
 *
 * Everything that is not a declared edition therefore collapses to the same answer. An
 * absent parameter, a repeated one, `?lang=de`, `?lang=` and `?lang=<script>` are all "no
 * choice", and none of them is an error: a typo in a query string is a reader's mistake and
 * the honest response is the page that picks neither, not a 404 and not a throw. That is
 * `bundleFor`'s own stance on an unknown track, applied one level up.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * Every edition the served content exists in, in the order the bundles declare them.
 *
 * `track.languages` is the bundle's own declaration and is read rather than sorted — the
 * reason ADR-0015 gives for the vertical order of two titles is the reason this list is not
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
 * The edition a reader has asked for, or `undefined` for the index that picks neither.
 *
 * `raw` is a Next search-parameter value, which is `string | string[] | undefined` — an
 * array when the query repeats the key. A repeat is refused rather than resolved to its
 * first element: `?lang=pl&lang=en` is a request with two answers in it, and choosing one
 * is exactly the silent editorial pick this whole design is avoiding.
 */
export function chosenEdition(
  bundles: readonly Bundle[],
  raw: string | readonly string[] | undefined,
): string | undefined {
  if (typeof raw !== 'string') return undefined;
  return editionsOffered(bundles).includes(raw) ? raw : undefined;
}
