/**
 * What a reader writes at a frame, kept in their own browser and nowhere else.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THIS AMENDS ADR-0023 §3 BY NAME, AND THE AMENDMENT IS THE WHOLE OF WHY IT IS ALLOWED.
 *
 * That ADR says the reader's own storage holds "no time, no outcome, no history" — written
 * about `lib/progress`, which keeps a frame number per program so that nothing in it can be
 * turned into a score. A worksheet is a different kind of thing: it is CONTENT THE READER
 * WROTE, which is the book's own paper ("write your answer down — on paper — and only then
 * uncover"), and the product's job is to keep it rather than to measure it.
 *
 * So the rule is amended rather than bent, and the new one is narrower: this store holds
 * what the reader wrote and ONE FLAG saying it was committed before the reveal. No verdict,
 * no mark, no attempt count, no timestamp, no history. Nothing in it is ever counted,
 * listed, synced or sent — `lib/progress/sync.ts` carries positions and does not know this
 * module exists.
 *
 * The `revealed` flag is the one thing here that is not the reader's own words, and it
 * earns its place by protecting them: a line written before the answer appeared is the
 * commitment the whole method rests on, and silently letting it be edited afterwards would
 * turn every worksheet into a record of what the reader agreed with.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE BUNDLE TAG IS IN THE RECORD AND NOT IN THE KEY, and that is a measured choice.
 *
 * Frame numbers move between book releases: a frame inserted into F01 §3 shifts everything
 * after it, so a worksheet written against frame 12 of one release is about a different
 * question in the next. The tag has to be stored so a stale sheet can be recognised.
 *
 * Putting it in the KEY would recognise it by orphaning it. The interim pin is
 * `dev-<sha12>` (see `@ab-ovo/web-kit`'s `bundle.ts`), so a typo fix in P30 changes the tag for
 * every program — and every reader's notes in all 47 would silently become unreachable
 * while still occupying storage. In the record, a stale sheet is SHOWN with a quiet line
 * saying it was written for an earlier version — `earlierEdition` in `chrome.ts`, which
 * says *version* because *edition* on a screen is the language (issue #162) — and the
 * reader decides. `lib/progress`'s
 * own choice is the precedent: it clamps a position into a shortened program rather than
 * dropping it.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ONE KEY PER FRAME, unlike `lib/progress`'s single document. A reader may write on
 * hundreds of frames and only ever looks at one; reading and rewriting a whole document to
 * add a character to one answer is the shape that makes a text field lag. The cost is that
 * "clear everything" has to enumerate, which `clearAllSheets` does and which is the only
 * function here allowed to.
 *
 * EVERYTHING READ BACK IS UNTRUSTED, exactly as in `lib/progress/store.ts`: `localStorage`
 * is a text field a reader can edit, a place an older version of this application wrote a
 * different shape, and a surface another script on the origin can touch. Every read
 * validates and returns `undefined` rather than throwing or handing a component a number
 * where it expected a string.
 */

/** Bumped when the stored shape changes. An unrecognised version is discarded, not migrated. */
export const SHEET_VERSION = 1 as const;

/** The prefix every sheet key starts with — also what `clearAllSheets` enumerates on. */
export const SHEET_PREFIX = `ab-ovo:sheet:v${SHEET_VERSION}:`;

/** A frame, addressed the way the URL addresses it — without the edition. */
export interface FrameRef {
  readonly track: string;
  readonly unit: string;
  readonly n: number;
}

/**
 * THE EDITION IS NOT PART OF THE KEY, AND THAT IS THE DECISION RATHER THAN AN OVERSIGHT.
 *
 * `/read/<track>/<unit>/<lang>/<n>` names an edition and this does not. A reader who
 * switches to Polish at frame 12 is the same reader at the same question — the two editions
 * are frame-for-frame the same structure, which is what `tools/parity.py` exists in the book
 * to guarantee — so their answer, their working and their sketch follow them across. Keying
 * by edition would silently empty the page at the moment a reader reached for the other one.
 */
export const keyOf = (frame: FrameRef): string =>
  `${SHEET_PREFIX}${frame.track}/${frame.unit}/${frame.n}`;

export interface Sheet {
  /** The bundle tag this was written against — see the header. */
  readonly tag: string;
  /** What the reader wrote on the answer line. */
  readonly answer: string;
  /** The Working pad's own text. Separate from the answer: one is a commitment, one is scratch. */
  readonly working: string;
  /** Set once the reader has seen the book's answer. Locks a non-empty answer line. */
  readonly revealed?: boolean;
  /**
   * Whether a sketch exists for this frame, so a component can decide what to offer
   * WITHOUT waiting on IndexedDB. The strokes live there; this is the synchronous shadow of
   * their existence, and it is the only reason a flag about other storage lives here.
   */
  readonly hasSketch?: boolean;
  /** Which background the reader last chose for the sketch: grid, axes or none. */
  readonly background?: string;
}

/**
 * The narrow slice of `localStorage` this module uses.
 *
 * Declared rather than taken as `Storage` so the unit tier can hand it a plain object and a
 * throwing one — which is the only way to assert the behaviour that matters most here, that
 * a browser refusing storage costs a reader their notes and nothing else. `key` and `length`
 * are here for `clearAllSheets` alone; nothing else in this module may enumerate.
 */
export interface Slot {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  key: (index: number) => string | null;
  readonly length: number;
}

/** A hard ceiling on one frame's text, so a paste cannot fill a reader's quota. */
export const ANSWER_LIMIT = 500;
export const WORKING_LIMIT = 4000;

/**
 * A stored text field: absent is empty, present-and-not-a-string is a rejection.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE TWO CASES ARE DIFFERENT AND A FIRST DRAFT TREATED THEM ALIKE.
 *
 * It coerced anything non-string to `''`, so a record holding `{"answer": 7}` read back as
 * a perfectly valid sheet with a blank answer — and the reveal would then have told the
 * reader "you wrote:" and nothing, which is a claim about them that the store contradicts.
 * That also broke this module's own header, which says a read returns `undefined` rather
 * than handing a component a value it did not verify. A unit test caught the contradiction.
 *
 * Absent is genuinely empty, though, and must stay so: a field added in a later version is
 * missing from every record written before it, and rejecting those would throw away a
 * reader's notes to gain nothing.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
const REJECT = Symbol('not a string');

function textField(value: unknown, limit: number): string | typeof REJECT {
  if (value === undefined) return '';
  if (typeof value !== 'string') return REJECT;
  return value.slice(0, limit);
}

/**
 * Read one frame's sheet, or `undefined` when there is nothing usable there.
 *
 * `undefined` rather than an empty sheet, and the distinction is load-bearing: "this reader
 * has written nothing here" and "this reader wrote an empty string" are different, and only
 * the second should show a `You wrote:` row on the reveal.
 */
export function readSheet(slot: Slot | undefined, frame: FrameRef): Sheet | undefined {
  if (!slot) return undefined;

  let raw: string | null;
  try {
    raw = slot.getItem(keyOf(frame));
  } catch {
    return undefined;
  }
  if (!raw) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined;

  const record = parsed as {
    v?: unknown;
    tag?: unknown;
    answer?: unknown;
    working?: unknown;
    revealed?: unknown;
    hasSketch?: unknown;
    background?: unknown;
  };
  // A version this build does not know is discarded rather than guessed at. The reader
  // loses notes they wrote under a different shape, which is worse than migrating and much
  // better than rendering a field whose contents mean something else.
  if (record.v !== SHEET_VERSION) return undefined;
  if (typeof record.tag !== 'string' || record.tag.length === 0) return undefined;

  const answer = textField(record.answer, ANSWER_LIMIT);
  const working = textField(record.working, WORKING_LIMIT);
  if (answer === REJECT || working === REJECT) return undefined;

  return {
    tag: record.tag,
    answer,
    working,
    ...(record.revealed === true ? { revealed: true } : {}),
    ...(record.hasSketch === true ? { hasSketch: true } : {}),
    ...(typeof record.background === 'string' ? { background: record.background } : {}),
  };
}

/**
 * What a sheet holds BESIDE its answer line: the Working pad's text, a sketch, or both.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE REVEAL ASKS THIS OF THE FRAME BEFORE IT, AND NOTHING MORE (issue #168).
 *
 * The next frame opens with the book's answer and puts the reader's line beside it
 * (`you-wrote.tsx`). This is the rest of the reader's side of that comparison, named by
 * what there is, so the next frame's offer can say *working*, *sketch* or both — and say
 * nothing at all where there is neither, which is most frames.
 *
 * A pad holding only whitespace holds nothing. The sketch is answered by `hasSketch`, its
 * synchronous shadow, so this needs no database — which is what that flag is for
 * (`sketch-store.ts`): the strokes are read only when the reader asks to see them.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export type Kept = 'working' | 'sketch' | 'both';

export function keptOn(sheet: Sheet | undefined): Kept | undefined {
  const working = (sheet?.working.trim().length ?? 0) > 0;
  const sketch = sheet?.hasSketch === true;
  if (working && sketch) return 'both';
  if (working) return 'working';
  return sketch ? 'sketch' : undefined;
}

/**
 * Write one frame's sheet. Returns what was stored, so a caller can render from it without
 * a second read; returns `undefined` when there was nowhere to write.
 *
 * A quota error costs the sheet and never the page — the same rule `lib/progress/store.ts`
 * states, and for the same reason: a reader whose browser refuses storage must still be
 * able to read the book.
 */
export function writeSheet(
  slot: Slot | undefined,
  frame: FrameRef,
  sheet: Sheet,
): Sheet | undefined {
  if (!slot) return undefined;

  const stored: Sheet = {
    tag: sheet.tag,
    answer: sheet.answer.slice(0, ANSWER_LIMIT),
    working: sheet.working.slice(0, WORKING_LIMIT),
    ...(sheet.revealed ? { revealed: true } : {}),
    ...(sheet.hasSketch ? { hasSketch: true } : {}),
    ...(sheet.background ? { background: sheet.background } : {}),
  };

  try {
    slot.setItem(keyOf(frame), JSON.stringify({ v: SHEET_VERSION, ...stored }));
  } catch {
    return undefined;
  }
  return stored;
}

/**
 * Change part of a sheet THAT ALREADY EXISTS, and create nothing when it does not.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * PATCH-IF-PRESENT, and the "if present" is the whole point of the function.
 *
 * Arriving at frame n+1 marks frame n as revealed. A reader who DEEP-LINKS to n+1 has never
 * been to n — and a create-or-update would write a sheet for a frame they have not seen,
 * with `revealed` set, so pressing `←` would land them on an untouched frame whose answer
 * line was already locked. Measured on the first draft, which did exactly that.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function patchSheet(
  slot: Slot | undefined,
  frame: FrameRef,
  patch: Partial<Sheet>,
): Sheet | undefined {
  const current = readSheet(slot, frame);
  if (!current) return undefined;
  return writeSheet(slot, frame, { ...current, ...patch });
}

/**
 * Write some of a sheet, CREATING it when the reader has not written here before.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE COUNTERPART TO `patchSheet`, AND THE PAIR EXISTS BECAUSE THE TWO CASES ARE OPPOSITE.
 *
 * `patchSheet` refuses to create, so that arriving at frame n+1 cannot invent a sheet for
 * frame n that the reader never visited. That is right for `revealed`, which is a fact
 * ABOUT a sheet — and exactly wrong for anything the reader typed, which IS the sheet.
 *
 * The Working pad shipped using `patchSheet` and the consequence was measured rather than
 * reasoned about: a reader who opened Working on a frame before writing an answer, did
 * their arithmetic and moved on lost every character, silently, because there was no
 * record to patch. Nothing failed; the text was simply never stored.
 *
 * So: content upserts, flags patch. The two are named differently for that reason alone.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * THE MERGE LIVES HERE AND NOT IN THE THREE COMPONENTS THAT NEED IT. Each of them was
 * spelling out "keep the working, keep the reveal, keep the sketch flag, keep the
 * background" around the one field it owns — and the fourth copy of that list is where a
 * field added later gets forgotten by whoever writes it. `tag` is taken from the caller
 * because a write against the served bundle re-stamps a sheet written against an older one.
 */
export function upsertSheet(
  slot: Slot | undefined,
  frame: FrameRef,
  tag: string,
  fields: Partial<Omit<Sheet, 'tag'>>,
): Sheet | undefined {
  const current = readSheet(slot, frame);
  return writeSheet(slot, frame, {
    tag,
    answer: current?.answer ?? '',
    working: current?.working ?? '',
    ...(current?.revealed ? { revealed: true } : {}),
    ...(current?.hasSketch ? { hasSketch: true } : {}),
    ...(current?.background ? { background: current.background } : {}),
    ...fields,
  });
}

/**
 * Clear the ANSWER LINE of one frame, and keep everything else the reader wrote.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * NOT `clearSheet`, AND THE DIFFERENCE IS WHAT THE READER ASKED FOR.
 *
 * A reader who wants to rewrite an answer they committed has not asked to throw away the
 * arithmetic they did to reach it. So the answer and its lock go, and the Working pad's
 * text, the sketch flag and the chosen background stay — each of which has its own control
 * beside the thing it clears.
 *
 * When nothing else is left the key is REMOVED rather than left holding an empty record:
 * an empty sheet is not nothing (`readSheet` deliberately distinguishes "wrote nothing"
 * from "wrote an empty string"), so leaving one behind would make the reveal show an empty
 * `You wrote:` row for ever.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function clearAnswerOf(slot: Slot | undefined, frame: FrameRef): void {
  const current = readSheet(slot, frame);
  if (!current) return;

  const keeps = current.working.length > 0 || current.hasSketch === true;
  if (!keeps) {
    clearSheet(slot, frame);
    return;
  }

  writeSheet(slot, frame, {
    tag: current.tag,
    answer: '',
    working: current.working,
    ...(current.hasSketch ? { hasSketch: true } : {}),
    ...(current.background ? { background: current.background } : {}),
  });
}

/** Forget one frame's sheet. */
export function clearSheet(slot: Slot | undefined, frame: FrameRef): void {
  try {
    slot?.removeItem(keyOf(frame));
  } catch {
    // Nothing to do and nothing worth telling the reader: the sheet is already unreachable.
  }
}

/**
 * Forget every sheet in this browser.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ONE OF THE TWO FUNCTIONS HERE THAT WALK THE STORE, AND THE LIMIT IS WHAT THEY RETURN.
 *
 * `localStorage` is enumerable by any script on this origin, so no module can make a
 * scatter of keys private and saying otherwise would be a claim this code cannot keep.
 * What IS true is narrower and worth stating: the only two functions IN THIS FILE that
 * walk the store are this one and `hasAnySheet`, and NEITHER HANDS A CALLER A LIST OF
 * FRAMES OR A COUNT OF THEM — one returns nothing and the other returns a boolean.
 * `export.ts`'s `allSheets` is the one function anywhere in `lib/sheet` that does hand back
 * a list, built for exactly one job (ADR-0055) — the property ADR-0009 §1 needs is not
 * "nobody ever enumerates", it is that nothing here is synced, aggregated, ranked or fed to
 * the instrument, and a document handed to the reader's own download folder is none of
 * those.
 *
 * `void` rather than "how many were removed", and that is the same rule applied to this
 * function's own signature. A count would be honest, useful for a confirmation line, and a
 * per-reader measure on screen. The control re-reads `hasAnySheet` instead.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function clearAllSheets(slot: Slot | undefined): void {
  if (!slot) return;

  // Collected first, then removed: `removeItem` re-indexes the store, so removing inside
  // the walk skips every other match. Measured on the first draft, which left half of them.
  const doomed: string[] = [];
  try {
    for (let index = 0; index < slot.length; index += 1) {
      const key = slot.key(index);
      if (key?.startsWith(SHEET_PREFIX)) doomed.push(key);
    }
  } catch {
    return;
  }

  for (const key of doomed) {
    try {
      slot.removeItem(key);
    } catch {
      // One key refusing to go is not a reason to leave the rest.
    }
  }
}

/**
 * Whether this browser holds any worksheet at all — so a control that would do nothing is
 * not offered. A boolean, deliberately: see `clearAllSheets` above.
 */
export function hasAnySheet(slot: Slot | undefined): boolean {
  if (!slot) return false;
  try {
    for (let index = 0; index < slot.length; index += 1) {
      if (slot.key(index)?.startsWith(SHEET_PREFIX)) return true;
    }
  } catch {
    return false;
  }
  return false;
}
