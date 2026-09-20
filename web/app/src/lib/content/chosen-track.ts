import type { Bundle } from '@ab-ovo/web-kit';

/**
 * Which course the index is showing, when the platform carries more than one.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE SAME SHAPE AS `chosen-edition.ts`, ONE LEVEL UP, AND DELIBERATELY SO.
 *
 * A track is a whole course — its own content repository, its own compiled bundle, its own
 * tag (`PINS`, in `bundle.ts`). The index has stacked every pinned one since ADR-0036, in
 * pin order, which reads correctly while there is one and becomes a scroll of several
 * hundred tiles the day there are three. This is the narrowing: `/?track=<id>`, in the URL,
 * where a reader can see it, link to it and leave it.
 *
 * `undefined` is *every course*, not "fall back to the first one". ADR-0015 refused a default
 * edition because a lit position is an editorial claim the reader never made, and the claim
 * "this is the course ab-ovo is really about" is the same claim about a bigger thing. So
 * everything that is not a track the app actually serves — absent, repeated, unknown,
 * empty — collapses to the unnarrowed index, and none of it is an error: a typo in a query
 * string is a reader's slip, and `bundleFor`'s own stance on an unknown track (a 404 is for
 * a page that is missing, not for a page that is fine) is what this mirrors.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * WHY THE CODE SAYS *TRACK* AND THE READER READS *COURSE*. `track` is the content's own word:
 * it is in the schema, in `/read/<track>/<unit>/<lang>`, and in the MCP server's every tool
 * call. It is not a word this product has ever said to a reader, and it should not start
 * now — what a reader is choosing between is courses. The word for readers lives where every
 * other word for readers lives, `lib/i18n/chrome.ts`, in both editions.
 */

/**
 * Every track the served content carries, in the order the pins declare them.
 *
 * Read rather than sorted, for `editionsOffered`'s reason: the order is the deployment's
 * own statement about what comes first, and an alphabetical list would quietly re-rank the
 * courses behind its back.
 */
export function tracksOffered(bundles: readonly Bundle[]): readonly string[] {
  return bundles.map((bundle) => bundle.track.id);
}

/**
 * The course a reader has asked for, or `undefined` for the index that shows every one.
 *
 * `raw` is a Next search-parameter value, which is `string | string[] | undefined` — an
 * array when the query repeats the key. A repeat is refused rather than resolved to its
 * first element, exactly as `chosenEdition` refuses one: `?track=a&track=b` is a request
 * with two answers in it, and picking one silently is the whole failure mode both of these
 * functions exist to avoid.
 */
export function chosenTrack(
  bundles: readonly Bundle[],
  raw: string | readonly string[] | undefined,
): string | undefined {
  if (typeof raw !== 'string') return undefined;
  return tracksOffered(bundles).includes(raw) ? raw : undefined;
}

/**
 * The bundles the index renders: the chosen one, or all of them.
 *
 * It is a function rather than a `filter` at each call site because two pages narrow by the
 * same rule — the index renders the narrowed set, and the edition switch above it offers
 * the editions *that set* is published in. Those two answers disagreeing is how a switch
 * comes to offer an edition the visible course does not have.
 */
export function shownBundles(
  bundles: readonly Bundle[],
  chosen: string | undefined,
): readonly Bundle[] {
  if (chosen === undefined) return bundles;
  return bundles.filter((bundle) => bundle.track.id === chosen);
}
