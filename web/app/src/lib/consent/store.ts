/**
 * Whether this reader has agreed to contribute to the instrument.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * OPT-IN, VERSIONED, DEFAULT OFF — AND CONSENT IS NOT AN ACCOUNT.
 *
 * Issue #14. ADR-0009 §1 decided what the instrument may record: an outcome against a
 * *frame in a bundle version*, an *attempt* and a *check run*, with no reader identifier on
 * any row. This module decides whether this browser sends one at all.
 *
 * It lives in `localStorage` beside progress, and for the same reason: **an anonymous
 * reader can consent too.** The reader loop works with no account (ADR-0004), so a consent
 * that needed one would make the anonymous path the degraded path — and would mean the
 * readers most worth hearing from are the ones who cannot answer.
 *
 * It is deliberately NOT synchronised to an account, and that is a decision rather than an
 * omission. See ADR-0022: an answer given on one machine is an answer about that machine's
 * contributions, and a consent that arrived on a device the reader never gave it on is not
 * consent.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * EVERYTHING READ BACK IS UNTRUSTED, exactly as in `progress/store.ts`: a text field a
 * reader can edit, a shape an older build wrote, a surface another script on the origin can
 * touch. Every failure — absent, unparseable, wrong version, wrong type, storage switched
 * off — resolves to `undecided`, which contributes nothing. **The failure mode of this
 * module is silence**, and that is the only safe direction for a consent record to fail in.
 */

/**
 * Bumped when WHAT IS RECORDED changes — never for a change of wording, layout or storage
 * shape.
 *
 * That distinction is the whole point of the number. Issue #14: *"consent to one thing is
 * not consent to the next thing: when what is recorded changes, the version changes and the
 * previous answer does not carry over."* Bumping it for a typo would re-ask every reader
 * for no reason and teach them the question is noise; not bumping it when a new field
 * starts being recorded would carry an answer to a question nobody was asked.
 *
 * Version 1 was: an outcome against a frame in a bundle version, an attempt and a check
 * run, where a check run meant a Python exercise in the lab. No reader identifier on any
 * row.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * VERSION 2 — THE WORKSHEET CONTRIBUTES, AND THAT IS A NEW KIND OF CONTRIBUTION.
 *
 * The lab reached one program of forty-seven and has left the reader loop (ADR-0040). What
 * replaced it is the worksheet, on every frame that asks the reader for something — so the
 * instrument's source changes from *a Python check in one program* to *the reader's own
 * answer, anywhere in the book*.
 *
 * That is exactly the case issue #14 wrote this number for. The ROWS have the same shape
 * and carry no more about a reader than version 1 did; what changed is **where they come
 * from and how many frames can produce one**, and a reader who agreed to a tally over one
 * lab did not thereby agree to a tally over every frame they read. Bumping re-asks them.
 *
 * Version 2 is: the same outcome against a frame in a bundle version and the same attempt,
 * from ONE worksheet source — `answer-<n>`, on the frames where the book's whole answer is
 * one printed number (85 of 1 036), carrying whether what the reader wrote matched it.
 *
 * **The reader is never shown a failure and the tally records one**, which is the asymmetry
 * ADR-0045 argues for: a rate that can only contain passes is 100% by construction and
 * measures nothing.
 *
 * A reveal with nothing written FAILS THAT SAME CELL rather than getting one of its own, and
 * only where the reader has a sheet on the frame — they opened the pad, or drew, or wrote and
 * cleared. A reader who works on paper, as the book prescribes, has no sheet and is never
 * counted at all. A draft gave the blank its own name and every report under it would have
 * carried `passed: false`, so its rate was 0% however the book was written; ADR-0045 §3 has
 * that and the eleven frames of P01 where it would also have polluted the score.
 *
 * Still no reader identifier on any row, and still nothing about WHAT they wrote: the text
 * never leaves the browser, only whether it matched.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export const CONSENT_VERSION = 2 as const;

/**
 * The version lives INSIDE the record, not in the key.
 *
 * `progress/store.ts` puts its version in the key (`ab-ovo:progress:v1`), which is right
 * there: a shape change orphans the old document and nobody wants it back.
 *
 * Here the rule is different and stronger — *a previous version's answer does not carry
 * over* — and putting the version in the key would make that rule true only by accident,
 * because two different key strings do not collide. A test written against it would be
 * asserting that `…:v1` and `…:v2` are different strings, which proves nothing about
 * consent. Inside the record it is an explicit comparison, and
 * `A_previous_version_s_answer_does_not_carry_over` asserts the thing the issue asks for.
 */
export const CONSENT_KEY = 'ab-ovo:consent';

/**
 * Three states, and the third one is not redundant.
 *
 * `undecided` and `declined` both contribute nothing, so a boolean would be enough to
 * decide what to SEND. They differ in whether the reader may be invited — and collapsing
 * them is exactly how a nag gets built: with one bit you cannot tell somebody who has never
 * been asked from somebody who said no, so you ask everybody, on every page, for ever.
 *
 * Issue #14: *"No degraded feature, no nag, no second ask on the next page."* That sentence
 * is unimplementable without this third state.
 */
export type Consent = 'undecided' | 'granted' | 'declined';

/** What a reader who has answered nothing contributes. */
export const DEFAULT: Consent = 'undecided';

/** The stored document. `decidedAt` is for the reader, never for an aggregate. */
export interface ConsentRecord {
  readonly version: number;
  readonly consent: Exclude<Consent, 'undecided'>;
  /**
   * When they answered, ISO-8601.
   *
   * It is written so that a reader inspecting their own storage can see what they agreed
   * to and when — which is the least a record of consent owes them. It is read by nothing:
   * no code branches on it, and `mayContribute` does not look at it. A timestamp nobody
   * reads cannot become a cohort.
   */
  readonly decidedAt: string;
}

/**
 * The narrow slice of `localStorage` this module uses.
 *
 * Declared rather than taken as `Storage` so the unit tier can hand it a plain object and a
 * throwing one — which is the only way to assert the behaviour that matters most, that a
 * browser refusing storage leaves a reader contributing nothing rather than contributing
 * by default.
 */
export interface Slot {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

/**
 * Read the answer, or `undecided`.
 *
 * It never throws and never returns a state it did not verify. Note the ORDER of the two
 * checks that matter: the version is compared before the answer is read, so a stored
 * `granted` at a stale version is `undecided` and not `granted`. Reading the answer first
 * and the version second is the same code with the failure pointing the other way.
 */
export function read(slot: Slot | undefined): Consent {
  if (!slot) return DEFAULT;

  let raw: string | null;
  try {
    raw = slot.getItem(CONSENT_KEY);
  } catch {
    // A private window, or storage switched off. Contributing nothing is the right answer
    // to "we cannot tell", and it is the same answer as "they have not been asked".
    return DEFAULT;
  }
  if (!raw) return DEFAULT;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT;
  }
  if (typeof parsed !== 'object' || parsed === null) return DEFAULT;

  const record = parsed as { version?: unknown; consent?: unknown };

  // The version first. An answer to a different question is not an answer to this one.
  if (record.version !== CONSENT_VERSION) return DEFAULT;

  // Matched positively against the two values this module writes. Anything else — `true`,
  // `"yes"`, `1`, a value an older build wrote — is not an answer, and the safe reading of
  // a thing that is not an answer is that nobody answered.
  if (record.consent === 'granted') return 'granted';
  if (record.consent === 'declined') return 'declined';

  return DEFAULT;
}

/**
 * THE ONE DOOR. Issue #15's recording path asks this and nothing else.
 *
 * It is a function rather than a comparison at each call site so that there is exactly one
 * place in the product that decides whether an outcome may be sent — and so that the
 * default, which is the whole ticket, is enforced in one line that a test can pin.
 */
export function mayContribute(slot: Slot | undefined): boolean {
  return read(slot) === 'granted';
}

/**
 * Record an answer, and return what now stands.
 *
 * A storage failure is not an error to the caller and is not reported to the reader: what
 * they lose is that the answer does not persist, which means they contribute nothing and
 * may be invited again in a later session. That is the same direction every other failure
 * here points in.
 */
export function decide(slot: Slot | undefined, consent: Exclude<Consent, 'undecided'>): Consent {
  const record: ConsentRecord = {
    version: CONSENT_VERSION,
    consent,
    decidedAt: new Date().toISOString(),
  };

  try {
    slot?.setItem(CONSENT_KEY, JSON.stringify(record));
  } catch {
    // Quota, a private window, storage switched off.
  }

  return read(slot);
}

/**
 * Remove the answer entirely, returning the reader to never-having-been-asked.
 *
 * This is NOT what the reader's withdraw control does — that writes `declined`, which is an
 * answer and is remembered, so they are not invited again. This exists so that "forget
 * everything about me in this browser" can mean it, and so a test can get back to a clean
 * state without knowing the key.
 */
export function forget(slot: Slot | undefined): void {
  try {
    slot?.removeItem(CONSENT_KEY);
  } catch {
    // Nothing to do and nothing to tell the reader: the answer is unreadable either way.
  }
}
