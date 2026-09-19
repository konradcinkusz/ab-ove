import { bundleFor, languageIn, tagFor, unitIn } from '@/lib/content/bundle';
import type { Bundle, Unit } from '@/lib/content/schema';
import { LABS, type LabDescriptor } from '@/lib/lab/protocol';

/**
 * The four segments a composed route shares, resolved once.
 *
 * The layout renders the pane and the page below it renders the frame, and both have to
 * agree about which program, which edition and which lab they are looking at. Two copies
 * of that would be two chances for the pane to be Lab P1 while the frame is another
 * program's — which nothing would report, because each half would be internally
 * consistent. The frame page's own file already makes the same argument one level down,
 * where one `resolve` feeds both the metadata and the body so a title cannot come to
 * describe a different frame from the page.
 */
export interface ComposedRouteParams {
  readonly track: string;
  readonly unit: string;
  readonly lang: string;
  readonly lab: string;
}

export interface Composed {
  readonly bundle: Bundle;
  readonly unit: Unit;
  readonly language: string;
  readonly lab: LabDescriptor;
  /** `undefined` for a track this build does not pin — the pane then reports nothing. */
  readonly tag: string | undefined;
}

/**
 * Everything but the step, or nothing.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE LAB SEGMENT IS MATCHED EXACTLY, IN THE SPELLING `LABS` USES.
 *
 * `p01`, not `P01`, and a case-insensitive match is deliberately not offered: it would give
 * one page several addresses, and the URL here IS the position — the property that lets a
 * deep link survive a reload with no session. Two spellings of one frame is the same defect
 * as two copies of one string.
 *
 * It is also why the lab is a URL segment rather than something read off the frame's own
 * `check`. Which exercise a frame sends a reader to is #55's decision and it needs this
 * route to exist to point at; a route that guessed would have made that decision first and
 * left #55 with nothing to decide.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * `undefined` for anything a reader could have mistyped, which the callers turn into a 404.
 * A pinned bundle that does not validate still throws out of `bundleFor` and is still a
 * 500: a reader's typo and a deployment defect are not the same failure, and that module's
 * own header records what it cost to learn.
 */
export function resolveComposed(params: ComposedRouteParams): Composed | undefined {
  const bundle = bundleFor(params.track);
  if (!bundle) return undefined;

  const unit = unitIn(bundle, params.unit);
  const language = languageIn(bundle, params.lang);
  if (!unit || !language) return undefined;

  const lab = LABS.find((candidate) => candidate.id === params.lab);
  if (!lab) return undefined;

  return { bundle, unit, language, lab, tag: tagFor(lab.track) };
}

/**
 * The prefix a frame number is appended to on this route, in a given edition.
 *
 * Handed to `FrameView` as `baseFor`, which is what keeps the reveal, the back link, the
 * keyboard shortcut and the edition switch INSIDE the composition. A reveal that pointed at
 * the plain reading route would unmount the pane on the first frame turn and take the
 * reader's exercise file with it — see the layout, where the persistence this depends on is
 * a property of where the segment sits rather than of anything React is asked to remember.
 */
export function composedBase(track: string, unit: string, lab: string) {
  return (edition: string): string => `/read/${track}/${unit}/${edition}/lab/${lab}`;
}
