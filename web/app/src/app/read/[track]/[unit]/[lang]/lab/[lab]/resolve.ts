import { bundleFor, languageIn, tagFor, unitIn } from '@/lib/content/bundle';
import type { Bundle, CheckRef, Unit } from '@/lib/content/schema';
import { LABS, labFor, type LabDescriptor } from '@/lib/lab/protocol';

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

/** Where the frame asking the question is, so the offer can open the lab beside IT. */
export interface FramePosition {
  readonly track: string;
  readonly unit: string;
  readonly language: string;
  readonly step: number;
}

/**
 * Where a frame's own `check` opens: this route, this lab, THIS frame.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE COMPOSED ROUTE AND NOT `/lab/<id>`, AND THE FRAME STAYING ON SCREEN IS THE WHOLE OF
 * THE REASON.
 *
 * The fixture's worked case says it out loud — frame 4's body is "Measure it yourself rather
 * than taking it from this page" — so the frame is the question and the exercise is how it
 * gets answered. `/lab/p01` renders the pane and nothing else, which would answer a frame by
 * navigating away from it; this address is the one UI-UX.md 1.5 describes, where the pane
 * sits beside the frame and never covers it. It also keeps the edition and the position,
 * because `<lang>` and `<step>` are segments of it: a reader reading in Polish opens the lab
 * in Polish, at the frame they were on, and can turn frames with the pane still mounted.
 *
 * THE EXERCISE IS NOT IN THIS ADDRESS, AND THAT IS A DECISION RATHER THAN AN OMISSION.
 * Both halves of the offer come out of one `check`, so they cannot disagree about which lab
 * and which exercise are meant — but nothing on the far end reads an exercise today. The
 * pane renders the whole of `<stem>.py`, in which an exercise is a region, and a list of
 * checks read out of the book's own test file at boot. So `?exercise=gap` would be a second
 * address for a page that renders identically, which is the defect `resolveComposed` above
 * refuses in the spelling of a path segment — "two spellings of one frame is the same defect
 * as two copies of one string" — and `#gap` would be a fragment pointing at an element
 * nobody renders. The exercise is named ON the control instead, where a reader can act on
 * it, and the segment arrives in the change that reads one.
 *
 * ON A PHONE THIS LANDS ABOVE THE PANE RATHER THAN AT IT, and that is known rather than
 * overlooked. #54 stacked the composition below the columns' dividing width, and
 * `frame-beside-lab.tsx` records the measurement: about 2,800 px tall at 360x640, with the
 * editor some 1,390 px down. So a reader who taps this arrives at the frame with the lab
 * under it.
 *
 * No fragment is added for it. The only id on that page is the editor's, which exists to
 * pair a `<label>` with a `<textarea>` rather than to be navigated to, and aiming at it from
 * here would make this route a thing that has EDITED `LabPane` instead of one that composes
 * it — which is the reasoning `frame-beside-lab.tsx` gives for putting its own "back to the
 * frame" anchor outside the pane rather than inside it. The mirror of that anchor, on the
 * pane's side, belongs in the file that owns the composition and not in a link built here.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function checkOpensAt(check: CheckRef, at: FramePosition): string | undefined {
  // `labFor` is where the two lists of labs are reconciled and where `undefined` is
  // justified; this function only turns its answer into an address.
  const lab = labFor(check.lab);
  if (!lab) return undefined;
  return `${composedBase(at.track, at.unit, lab.id)(at.language)}/${at.step}`;
}
