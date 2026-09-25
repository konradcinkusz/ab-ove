/**
 * The reading controls, in the reader's language.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * TWO LANGUAGE SETS, AND THEY ARE NOT THE SAME SET.
 *
 * `track.languages` is what the CONTENT has been written in — a property of the bundle, and
 * the compiler's to declare. What is in this file is what the APPLICATION's controls have
 * been written in, which is a property of this repository. A track may perfectly well
 * publish a language nothing here has a word for, and the honest answer is English controls
 * around content in its own language rather than refusing to serve the content.
 *
 * Conflating the two is the defect this file exists to make impossible: a lookup that
 * assumed the sets were equal would either crash on an unknown language or render
 * `undefined` into a button. `chromeFor()` therefore reports the language it actually used,
 * and the components put that on a `lang` attribute — so a page whose content is Polish and
 * whose controls are English says exactly that, and a screen reader reads each in the right
 * voice.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * WHY THIS IS NOT IN THE BUNDLE. `content-schema.v1.json` deliberately knows nothing about
 * a reading UI (ADR-0014), and button labels in a content bundle would make every track's
 * compiler responsible for this application's chrome. The book compiles frames; it does not
 * compile the word for "Contents".
 */

/**
 * The forms a count takes. The keys are `Intl.PluralRules` categories, and `other` is
 * required because it is the only one every language has.
 *
 * ENGLISH NEEDS TWO AND POLISH NEEDS FOUR, which is why a count cannot be a string with a
 * number in front of it. Polish takes `ramka` at 1, `ramki` at 2–4, `ramek` at 5–21, and
 * `ramki` again at 22–24 — a rule with a modulo and an exception band in it. Hand-rolling
 * that produces "5 ramki" on some page nobody looks at; `Intl.PluralRules` is the platform's
 * own implementation of the CLDR rule and is correct for a language this file has never
 * heard of.
 */
interface Plural {
  readonly zero?: string;
  readonly one?: string;
  readonly two?: string;
  readonly few?: string;
  readonly many?: string;
  readonly other: string;
}

/**
 * One row of the keyboard map, shown in `Reading settings` and nowhere else.
 *
 * ADR-0063 took the one-line hint off the frame: the reading surface is worked with the
 * mouse and the finger first — every move has a labelled button in the pinned pager — and
 * the keys are an extra for whoever wants them, listed where a reader looks for settings
 * rather than under every question. So an entry no longer carries the states and flags the
 * hint line used to filter by; it is a key, what it does, and where that meaning applies.
 */
export interface KeyEntry {
  readonly key: string;
  /**
   * The same chord as an Apple keyboard spells it. Both spellings are in the markup and
   * the stylesheet shows one, from a flag `modifier-flag.tsx` sets on `<html>` — so the
   * page never rewrites a string after paint and never hydrates against a different one.
   */
  readonly macKey?: string;
  readonly does: string;
  /**
   * Where the key means this, when the list needs to say so — `Enter` in the frame number is
   * not `Enter` on the page.
   */
  readonly where?: string;
}

/**
 * The account-deletion screen.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THIS IS THE ONE SCREEN IN THE PRODUCT WHOSE WORDING IS THE FEATURE.
 *
 * Issue #13 — "It removes both, AND it says plainly that it cannot retract an anonymous
 * outcome already folded into a rate... A deletion screen that implies otherwise is
 * claiming a capability the schema was designed not to have."
 *
 * So there are four blocks and each answers a different question, because a deletion
 * screen that answers only the first is the one that misleads:
 *
 *   `removes*`      what goes.
 *   `stays`         what does not, and why that is not an oversight.
 *   `cannotReach`   what no deletion can reach, and why that is the privacy property
 *                   working rather than failing.
 *   `notImmediate`  that the account is marked and scheduled rather than erased.
 *
 * The last two are the ones a reader would otherwise have to discover afterwards, which
 * is the worst moment to discover either.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
interface DeleteAccountStrings {
  readonly title: string;
  readonly lead: string;
  readonly removesProgress: string;
  readonly removesAccount: string;
  readonly staysTitle: string;
  readonly stays: string;
  readonly cannotReachTitle: string;
  readonly cannotReach: string;
  readonly notImmediateTitle: string;
  readonly notImmediate: string;
  /**
   * The word the reader types to confirm, IN THEIR OWN LANGUAGE.
   *
   * authservice demands the literal `DELETE`; that literal is sent by the server and never
   * asked of the reader. Making a Polish reader type an English word to prove they meant
   * it would be this application's vocabulary leaking out of another repository.
   *
   * Compared with diacritics folded away, so `USUN` passes for `USUŃ`: the point of the
   * word is deliberateness, not orthography, and a reader on a keyboard without Ń is still
   * being every bit as deliberate.
   */
  readonly confirmWord: string;
  readonly confirmLabel: (word: string) => string;
  readonly passwordLabel: string;
  readonly passwordHint: string;
  readonly submit: string;
  readonly cancel: string;
  /** Shown after the deletion, on a page the reader is no longer signed in to. */
  readonly doneTitle: string;
  readonly done: string;
  readonly keepReading: string;
  readonly problemConfirm: string;
  readonly problemPasswordRequired: string;
  readonly problemPasswordRejected: string;
  readonly problemSignedOut: string;
  readonly problemProgress: string;
  readonly problemAccount: string;
  readonly problemUnconfigured: string;
}

/**
 * Consent to contribute to the instrument (issue #14).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE WORDING HAS TO CARRY THE WHOLE OF WHAT IS BEING AGREED TO, IN ONE READING.
 *
 * "Opt-in" means nothing if the thing being opted into is not stated (ADR-0009 §1), so the
 * invitation describes it concretely rather than as "usage data": which frame, in which
 * version of the book, which attempt, what a check run said — and no identifier for the
 * reader anywhere.
 *
 * There used to be an `invitationNothingYet` beside those, saying nothing was recorded yet
 * because the instrument was unbuilt. Issue #15 built it, and the .NET test that had been
 * holding that sentence to account failed the build and named this field. It is gone; what
 * it sat beside is what survives, and ADR-0009 §1 keeps that true however many rows exist.
 *
 * `invitationEitherWay` is the sentence that makes declining safe to do. Issue #14:
 * "Declining changes nothing a reader can perceive except the contribution itself. No
 * degraded feature, no nag, no second ask on the next page, no 'are you sure'." A reader
 * who is not told that will hesitate, and a hesitant yes is not consent.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
interface ConsentStrings {
  readonly invitationTitle: string;
  readonly invitationWhat: string;
  readonly invitationNoReader: string;
  readonly invitationEitherWay: string;
  readonly grant: string;
  readonly decline: string;
  /** The durable control, once an answer exists. */
  readonly statusGranted: string;
  readonly statusDeclined: string;
  readonly withdraw: string;
  readonly join: string;
  /**
   * What withdrawing cannot do — the deletion screen's sentence, arriving at the other end
   * of the same property. An outcome carries no reader, so nothing can find the ones that
   * were yours, so stopping stops the next one and retracts none.
   */
  readonly withdrawCannotRetract: string;
}

interface Strings {
  readonly forget: string;
  /**
   * The second press of *Forget where I am*, which is the one that destroys anything. It
   * names the reach — every device — because that is what changed when the record grew an
   * account copy (ADR-0047); a bare "are you sure" says nothing a reader can weigh.
   */
  readonly forgetConfirm: string;
  /**
   * What a screen reader hears when ANY two-press control is armed — its second label, then
   * how to go on or back. Said through a live region (`two-step-status.tsx`), because a
   * button renaming itself under focus is silent in most of them (#151).
   */
  readonly pressAgain: (action: string) => string;
  readonly signIn: string;
  readonly signOut: string;
  readonly account: string;
  readonly deleteAccount: DeleteAccountStrings;
  readonly consent: ConsentStrings;
  /** The conflict rule, said where the conflict happened. See `raised-notice.tsx`. */
  readonly raised: (unit: string, step: number) => string;
  readonly dismiss: string;
  readonly cue: string;
  /**
   * ────────────────────────────────────────────────────────────────────────────────────
   * THE PINNED PAGER'S TWO BUTTONS, AND THEY SAY THE SAME THING ON EVERY FRAME — ADR-0063.
   *
   * The owner's words: "there is no next and previous button to click with the mouse …
   * the button has to be there, and the keyboard is an option". The forward control used to
   * read *Reveal the answer* on a frame that asks and *Next frame* on one that teaches, and
   * sat in the text rather than beside *Previous*, so the pair a reader looks for never
   * existed. It is `Next` everywhere now. The mechanic is unchanged — pressing it on a frame
   * that asks is still what turns the page to the one that opens with the answer — and the
   * book's instruction is said where it applies, in the answer line's `writeItDown`.
   * ────────────────────────────────────────────────────────────────────────────────────
   */
  readonly next: string;
  readonly previous: string;
  readonly languageLabel: string;
  readonly programs: string;
  /**
   * The way to everything the index no longer says, and the reason the index can be a
   * grid of programs at all (ADR-0036).
   *
   * It is a link label rather than a heading because the page it names is not a step in
   * the reader loop: a reader who came to work a program never has to read it, and a
   * reader who wants to know what the instrument is for must be able to find it in one
   * move from the first screen.
   */
  readonly about: string;
  /**
   * ────────────────────────────────────────────────────────────────────────────────────
   * THE WORD FOR A TRACK, AND THE ONLY PLACE IT IS SAID TO A READER.
   *
   * ab-ovo carries several courses — a course is a whole work, compiled from its own
   * content repository at its own pin (`PINS`, in `@ab-ovo/web-kit`'s `bundle.ts`), and what a
   * reader chooses between on `/courses` is those. The content's own word for one is
   * *track*: it is in the schema, in `/read/<track>/<unit>/<lang>` and in every MCP tool
   * call, and it has never been on a screen. It should not start now — *track* names a
   * thing in a bundle, and a reader is choosing a course of study.
   *
   * IT IS DELIBERATELY NOT *PROGRAM*, which is the harder half of the choice. A reader
   * asking for this control is likely to call the thing a programme, and this
   * application's word for one of the forty-seven units of a course is `programs`, two
   * lines up — the book's own term, from programmed learning, and the word on the index's
   * heading and its every breadcrumb. One word cannot be both without a reader finding
   * out by pressing the wrong thing.
   * ────────────────────────────────────────────────────────────────────────────────────
   */
  readonly courses: string;
  /** One sentence on what a course is here, under the courses page's heading. */
  readonly coursesLead: string;
  /**
   * The way back from a narrowed index to the one that shows every course, because a
   * narrowing a reader cannot undo in the page is one they can only undo by editing the URL.
   *
   * It used to be described as the `?track=` counterpart of `bothEditions`, the edition
   * switch's third position. That position is gone (ADR-0052): the edition is always chosen
   * now and always changeable in one press, so there is nothing to go back OUT to. A course
   * narrowing is not like that — it hides programmes rather than choosing between titles of
   * the same one — which is why this label survives its former twin.
   */
  readonly allCourses: string;
  /**
   * And the way IN, beside a course's title on the index that is showing every one — so the
   * home page of a deployment carrying several is itself the way to one of them, and not
   * only a list to scroll past. Absent while there is one course, where it would lead to
   * the page it is on.
   */
  readonly onlyThisCourse: string;
  /**
   * ────────────────────────────────────────────────────────────────────────────────────
   * THE THEME SWITCH — three positions, and `themeSystem` is the one that makes it honest.
   *
   * ADR-0048. A two-position light/dark toggle has a default by construction, and that
   * default is invisible to the reader who happens to share it — which is ADR-0015's
   * objection to a default edition, met again one control along. So the reader's own
   * system is a position on the switch rather than the absence of a choice, and it is
   * somewhere to go back to after trying the other two.
   *
   * THE EDITION CONTROL NO LONGER WORKS THIS WAY, AND THE DIVERGENCE IS DELIBERATE
   * (ADR-0052). `themeSystem` is a real answer about a real signal — the browser reports
   * `prefers-color-scheme` — where nothing a browser sends says which EDITION of a book
   * somebody wants. The edition's third position was therefore not a preference but the
   * absence of one, so it is gone and English is the default. Where the machine can answer,
   * ask it; where nothing can, pick one and make it a press to change.
   *
   * The words are short on purpose: this control sits on a line of 0.8125rem furniture
   * beside the edition switch and the keyboard map, and a label reading "Match my system
   * setting" would be the loudest thing in the page's foot.
   * ────────────────────────────────────────────────────────────────────────────────────
   */
  readonly themeLabel: string;
  readonly themeSystem: string;
  readonly themeLight: string;
  readonly themeDark: string;
  readonly contents: string;
  readonly opening: string;
  readonly position: (n: number, total: number) => string;
  readonly startAtFrame: (n: number) => string;
  readonly continueAtFrame: (n: number) => string;
  readonly frame: Plural;
  readonly section: Plural;
  /**
   * How many programs a book has, on the books page. A count and not a heading, which is
   * why it is a `Plural` beside the other two rather than the `programs` string above:
   * Polish takes *program*, *programy* and *programów* in three different bands, and a
   * noun with a number in front of it is the one place that cannot be a fixed string.
   */
  readonly program: Plural;

  /**
   * PR3 — the place row, the jumper, the keys map, and `/summary`.
   *
   * These sit apart from the block above because they are new rather than because they
   * differ in kind; the separation is only so a reviewer can see what one pass added.
   */
  /**
   * ────────────────────────────────────────────────────────────────────────────────────
   * THE WORKSHEET — the answer line, and what the reveal says about it.
   *
   * The book's own instruction is "write your answer down — on paper — and only then
   * uncover", and the dotted row under a frame's question is where it says to write. These
   * are the words for doing that on a screen. Every one of them is about the READER'S text
   * and none is about whether it is right: the machine's only verdict is `matchesBook`, it
   * is positive-only, and `lib/sheet/number.ts` records why a negative one would be wrong
   * four times in five.
   * ────────────────────────────────────────────────────────────────────────────────────
   */
  /** The answer line's label, shown above the field since ADR-0063 as well as announced. */
  readonly yourAnswer: string;
  /** Its placeholder: the book's own instruction, in the edition's words. */
  readonly writeItDown: string;
  /** On the reveal, in front of what the reader committed. */
  readonly youWrote: string;
  /** The one thing the machine ever says about an answer, and only when it is certain. */
  readonly matchesBook: string;
  /** Under a locked line, saying why it cannot be edited. */
  readonly writtenBefore: string;
  /** Beside a sheet written against an earlier edition of the book. */
  readonly earlierEdition: string;
  /** The foot control, first press. */
  readonly clearAnswer: string;
  /** Its second press, which is the one that destroys anything. */
  readonly clearAnswerConfirm: string;
  /** The index's control for every worksheet in this browser, first press. */
  /**
   * THE TWO WORKSHEET PANES, NAMED BY THE ACT AND NOT BY THE OBJECT (ADR-0059).
   *
   * `working` and `sketch` are what a reader presses to OPEN a pane; `workingRun` is what
   * they press INSIDE one. The three may not share a sentence: the pad's opener and its run
   * button sit inches apart on the same frame, and two controls reading the same words is
   * the defect ADR-0057 named one row further down. `workingRun` moved when `working` took
   * the words it used to hold.
   */
  readonly working: string;
  readonly workingRun: string;
  readonly workingHint: string;
  readonly workingLabel: string;
  readonly sketch: string;
  /**
   * What the sketch's button says once THIS frame holds a drawing — decided from
   * `hasSketch` in the synchronous sheet and never from IndexedDB, which is the whole
   * reason that flag is duplicated into localStorage (`lib/sheet/sketch-store.ts`).
   */
  readonly showMySketch: string;
  readonly sketchLabel: string;
  readonly sketchGrid: string;
  readonly sketchAxes: string;
  readonly sketchNone: string;
  readonly sketchUndo: string;
  readonly sketchClear: string;
  /**
   * The sketch's `Clear`, armed — two presses since #151, because `Undo` takes back one
   * stroke and cannot take this back. It names the reach, `whole`, which is the difference.
   */
  readonly sketchClearConfirm: string;
  readonly sketchFull: string;
  /** Downloads every worksheet in this browser as one file. Not destructive, so no confirm. */
  readonly exportWorksheets: string;
  readonly clearWorksheets: string;
  /** Its second press — this one cannot be undone and says so. */
  readonly clearWorksheetsConfirm: string;
  /** `← Programs`, the contents page's own way back up — a NEW key rather than reusing
   * `programs`, because that string is also this application's index heading and an arrow
   * belongs on the crumb's link and nowhere near an `<h1>`. */
  readonly programsCrumb: string;
  /** The frame-jumper's label, in the program map: `Go to frame [ 12 ] of 45 [Go]`. */
  readonly goToFrame: string;
  /** The rest of that line: `of 45`. */
  readonly ofTotal: (total: number) => string;
  /** The jumper's button, which is the only thing that commits it (ADR-0063). */
  readonly go: string;
  /** A popover's own way shut, for the reader who does not know Esc or a click outside. */
  readonly close: string;
  /**
   * The program map's name — the popover the pager's position opens, with every section of
   * the program and the jump to a frame number in it (ADR-0063).
   */
  readonly programMap: string;
  /**
   * Beside a section the reader has not reached: a row in the map that is text rather than
   * a link, because the gate would refuse the frame it starts at (ADR-0060, ADR-0056).
   */
  readonly lockedSection: string;
  /**
   * The top bar's settings button and the popover it opens, holding every setting a reader
   * might want WHILE reading — the theme and the key map (ADR-0058, moved by ADR-0063).
   */
  readonly readingSettings: string;
  /** The heading over the key map inside that disclosure. */
  readonly keysHeading: string;
  /** The full keyboard map, in the order a reader would want to read it. */
  readonly keysMap: readonly KeyEntry[];
  /**
   * The accessible name of the foot's navigation landmark, on all three reading screens.
   *
   * Invisible, and it earns its place anyway: the language switch is already a labelled
   * `<nav>`, so an unlabelled second one leaves a screen-reader user with a landmark list
   * reading "navigation, navigation" — which is worse than one landmark would have been.
   * It says "where to next" rather than "in this program" because the summary's foot leads
   * OUT of the program, to the next one.
   */
  readonly footNav: string;
  /** Frame 1's own back button, replacing `previous` where there is nowhere to go back to. */
  readonly backToContents: string;
  /** The last frame's forward button, in `next`'s place: it opens `/summary`, not a frame. */
  readonly toSummary: string;
  /** The answer box's label: the answer it holds is to the PREVIOUS frame's question. */
  readonly answerTo: (n: number) => string;
  /**
   * A way to a frame named by its number: the "Not there yet" screen's way on, and the
   * program map's answer to a number typed past the reader's furthest frame. Deliberately
   * not `continueAtFrame`, which on the contents page means the frame this BROWSER last
   * opened — the gate's furthest frame is a different fact, and one phrase for both would
   * make a reader wonder which one they are looking at.
   */
  readonly goToFrameNumber: (n: number) => string;
  /** The program map's answer to a frame number the program does not have. */
  readonly frameRange: (last: number) => string;
  readonly summaryHeading: string;
  readonly canYouHeading: string;
  /** Honest, for now: schema v1 carries no Test exercises or Further problems to show. */
  readonly exercisesNotYet: string;
  readonly nextProgramLabel: string;
  /** Its mirror, on the contents page's foot: the program before this one. */
  readonly previousProgramLabel: string;
  /** The summary screen's way back to the program's last frame, in its pager's back cell. */
  readonly backToLastFrame: string;
  readonly labOptional: string;
  /**
   * THE INDEX FOR A READER WHO CAME BACK.
   *
   * The names for the id prefixes `groupsOf()` (`@ab-ovo/web-kit`'s `bundle.ts`) divides the
   * programs by — that function knows the letters and deliberately not the words, because
   * a word is in a language and the content library has none. A prefix with no entry here
   * is grouped without a heading, which is what a third track's `X07` should get.
   */
  readonly groupLabels: Readonly<Record<string, string>>;
  /**
   * The accessible name of the program map's list of headings — every heading of the program,
   * one hop from any frame (ADR-0041), in the panel the pager's position opens (ADR-0063).
   */
  readonly sectionsLabel: string;
  /**
   * On a tile whose program has a stored place: `at frame 12`. A POSITION and never a
   * progress (ADR-0041) — no fraction, no bar, no "12 of 45 read" — and text rather than
   * a link, because `progress.spec.ts` holds the index to exactly one link back into the
   * stored frame and that link is the resume control.
   */
  readonly atFrame: (n: number) => string;
  /**
   * On a tile the reader cannot enter yet: `opens after P06` (ADR-0051).
   *
   * IT NAMES THE PROGRAM THAT OPENS THIS ONE, which is the whole of what a shut door owes
   * a reader — one move, and it is a move they can make. A bare "locked" would say the
   * same thing and leave them looking for the key; a count of what is left to read would
   * be the progress ADR-0041 refuses, in the one slot that refusal is easiest to lose.
   *
   * It takes the program's ID and never its title: the id is what the tile beside it
   * already shows, it is language-neutral, and it is what the reader will scan the grid
   * for. Titles are the CONTENT's language and this sentence is the CHROME's, so a
   * mixed-edition line would read in two voices.
   */
  readonly opensAfter: (unit: string) => string;
  /**
   * THE SAME FACT, AT LENGTH, FOR THE READER WHO ASKS THE TILE WHAT IT MEANS.
   *
   * `opensAfter` is three words in a slot a line tall, which is the right size for a grid
   * of forty-seven and too small to say what a reader actually wants to know: whether the
   * program is missing, whether it is paid for, and what exactly unlocks it. This is that
   * sentence — the tile's `title`, and the description a screen reader announces with the
   * shut title (`tile-entry.tsx`), so neither reader has to guess from a grey colour.
   *
   * IT NAMES THE SIZE OF THE MOVE — *one frame is enough* — because the weakest gate that
   * still makes the order true (ADR-0051) is not what a reader assumes a locked tile means.
   * Left unsaid, "opens after F01" reads as "finish F01 first", which is a different and
   * much larger promise than the one the code keeps.
   */
  readonly shutExplain: (previous: string) => string;
  /**
   * WHAT HAPPENED, said where the reader landed — the sentence `shut-notice.tsx` renders
   * when the gate has just moved somebody off a program they asked for (ADR-0051, and
   * `program-gate.tsx` for why the move cannot be a server redirect).
   *
   * It answers four questions in the order a reader asks them: what was refused, why this
   * page is on screen instead, what opens it, and where the program they asked for is on
   * the page they are now looking at. The tile's own note used to be the whole of the
   * explanation, which assumed a reader who noticed a navigation they did not ask for and
   * then found one tile in forty-seven.
   */
  readonly shutNotice: (unit: string, previous: string) => string;
  /**
   * The contents page's foot, where the next program is shut.
   *
   * `when-open.tsx` renders the way on only while the reader may take it — a control that
   * is reliably refused is worse than no control — and rendered NOTHING in its place, so
   * the foot of F01 simply had no right-hand side and no reason. This is a sentence rather
   * than a disabled link: it says what opens the next program, and the answer happens to
   * be the page the reader is already on.
   */
  readonly shutNextProgram: (unit: string) => string;
  /**
   * ADR-0060 — the FRAME-level refusal, answered by the same live call that serves the
   * frame rather than by a client-side redirect. `shutNotice` above is the PROGRAM-level
   * gate's sentence and a different mechanism (`ProgramGate`, localStorage, a client
   * navigation); this is what `AbOvo.Api`'s reveal gate refuses within an already-open
   * program, rendered directly by the page the reader asked for rather than one they were
   * moved to.
   */
  readonly notReachedHeading: string;
  readonly notReachedBody: (furthest: number) => string;
}

/**
 * The table. One entry per language this application's controls have been written in.
 *
 * EXPORTED FOR ONE REASON: the completeness gate in `chrome.test.ts` has to read the forms
 * to say whether they cover what the language needs, and a gate over data cannot be written
 * against the rendering API alone. It is not part of that API — render through `chromeFor`,
 * which is what applies the plural rule and reports the language it fell back to.
 *
 * The English entry is the fallback and therefore the only one that may never be absent;
 * `chrome.test.ts` asserts that every entry covers every plural category its own language
 * can produce, which is what stops a missing Polish `many` becoming "5 ramki" on a page
 * nobody reviews in Polish.
 */
export const TABLE: Readonly<Record<string, Strings>> = {
  en: {
    forget: 'Forget where I am',
    forgetConfirm: 'Forget it \u2014 on every device',
    pressAgain: (action) => `${action}. Press again to confirm, or Esc to cancel.`,
    signIn: 'Sign in',
    signOut: 'Sign out',
    account: 'Account',
    consent: {
      invitationTitle: 'Help fix the book?',
      invitationWhat:
        'The book has never been read by anybody, and its author cannot know which frames are wrong. ab-ovo can find out \u2014 by recording, for each frame you answer, which version of the book it was in, which attempt this was, and whether your answer matched the book\u2019s own. Never the answer itself: your words stay in this browser.',
      invitationNoReader:
        'No identifier for you goes on any of it: not a column, not a hash, not a join away. That is what makes the result safe to publish, and it is why nothing recorded here can be turned into a score about you.',
      invitationEitherWay:
        'Either answer leaves the book, the lab and your place in it exactly as they are. You will not be asked again.',
      grant: 'Yes, use my outcomes',
      decline: 'No thanks',
      statusGranted: 'You are helping measure the book.',
      statusDeclined: 'You are not contributing to the book\u2019s measurements.',
      withdraw: 'Stop contributing',
      join: 'Start contributing',
      withdrawCannotRetract:
        'Stopping stops the next one. It cannot take back an outcome already counted, because nothing knows which of them were yours.',
    },
    deleteAccount: {
      title: 'Delete your account',
      lead: 'This removes two things.',
      removesProgress:
        'The reading position stored on your account — every program, on every device that syncs.',
      removesAccount: 'The account itself, at the identity service.',
      staysTitle: 'What stays',
      stays:
        'This browser keeps its own copy of where you are in the book, and you can carry on reading with no account at all. If you want that cleared too, use \u2018Forget where I am\u2019 on the programs page \u2014 a separate control, because it is a separate thing.',
      cannotReachTitle: 'What this cannot reach',
      cannotReach:
        'The instrument measures how a frame does, never how a reader does: an outcome carries no reader on it, so no row of it knows it was yours and no deletion can find one. That is deliberate \u2014 it is what makes a rate safe to publish \u2014 and the price is that a contribution already folded into a rate cannot be taken back out.',
      notImmediateTitle: 'The account is not erased on the spot',
      notImmediate:
        'The identity service marks it deleted, revokes the tokens that would refresh your session, and schedules the permanent erasure for the end of its retention period. You will not be able to sign in during that time. ab-ovo is not told how long the period is \u2014 that is the identity service\u2019s to state, and copying a number out of it would be a figure nothing here could check.',
      confirmWord: 'DELETE',
      confirmLabel: (word) => `Type ${word} to confirm`,
      passwordLabel: 'Your password',
      passwordHint:
        'Leave this empty if you sign in with Google or GitHub and have never set a password.',
      submit: 'Delete my account',
      cancel: 'Keep my account',
      doneTitle: 'Your account is gone',
      done: 'The reading position stored on it has been removed, and the identity service has marked the account deleted and scheduled its erasure.',
      keepReading: 'Carry on reading',
      problemConfirm: 'That is not the confirmation word. Nothing has been deleted.',
      problemPasswordRequired: 'This account has a password, and the field was empty.',
      problemPasswordRejected: 'That password was not accepted.',
      problemSignedOut: 'Your session ended before this could finish. Sign in and try again.',
      problemProgress:
        'What your account had stored — your reading position, the edition you chose — could not be removed, so nothing else was attempted. Your account is untouched. Try again.',
      problemAccount:
        'What your account had stored has been removed, but the account itself could not be. It is still yours, and this device still knows where you are in the book. Try again.',
      problemUnconfigured:
        'This deployment has no identity service, so there is no account to delete.',
    },
    raised: (unit, step) =>
      `${unit} moved to frame ${step}, read on another device. The furthest frame wins.`,
    dismiss: 'Got it',
    cue: 'The next frame answers this.',
    next: 'Next',
    previous: 'Previous',
    languageLabel: 'Language',
    programs: 'Programs',
    about: 'About ab-ovo',
    courses: 'Courses',
    coursesLead:
      'Every course ab-ovo carries, each one a sequence of programs worked a frame at a time. Opening one narrows the index to it; the index shows them all until you do.',
    allCourses: 'All courses',
    onlyThisCourse: 'Only this course',
    themeLabel: 'Theme',
    themeSystem: 'System',
    themeLight: 'Light',
    themeDark: 'Dark',
    contents: 'Contents',
    opening: 'Opening',
    position: (n, total) => `${n} of ${total}`,
    startAtFrame: (n) => `Start at frame ${n}`,
    continueAtFrame: (n) => `Continue at frame ${n}`,
    frame: { one: 'frame', other: 'frames' },
    section: { one: 'section', other: 'sections' },
    program: { one: 'program', other: 'programs' },
    yourAnswer: 'Your answer',
    writeItDown: 'Write it down before you read on',
    youWrote: 'You wrote',
    matchesBook: 'Matches the book',
    writtenBefore: 'written before the reveal',
    earlierEdition: 'written against an earlier edition',
    clearAnswer: 'Clear my answer',
    clearAnswerConfirm: 'Clear it',
    working: 'Work it out',
    workingRun: 'Do the sums',
    workingHint: 'One line at a time. A name can be given a value: w = 0.5',
    workingLabel: 'Your working',
    sketch: 'Draw it',
    showMySketch: 'Show my sketch',
    sketchLabel: 'Draw your answer',
    sketchGrid: 'Grid',
    sketchAxes: 'Axes',
    sketchNone: 'Plain',
    sketchUndo: 'Undo',
    sketchClear: 'Clear',
    sketchClearConfirm: 'Clear the whole sketch',
    sketchFull: 'This sketch is now too large to keep. What is on screen stays until you leave the frame.',
    exportWorksheets: 'Export my worksheets',
    clearWorksheets: 'Clear my worksheets',
    clearWorksheetsConfirm: 'Clear them — this cannot be undone',
    programsCrumb: '← Programs',
    goToFrame: 'Go to frame',
    ofTotal: (total) => `of ${total}`,
    go: 'Go',
    close: 'Close',
    programMap: 'Sections and frames',
    lockedSection: 'not reached yet',
    readingSettings: 'Reading settings',
    keysHeading: 'Keys',
    keysMap: [
      { key: '→', does: 'next frame' },
      { key: '←', does: 'previous frame' },
      { key: 'Enter', does: 'write an answer' },
      { key: 'g', does: 'sections and frames' },
      { key: 'Ctrl+Enter', macKey: '⌘+Enter', does: 'keep your answer and go on', where: 'in your answer' },
      { key: 'Ctrl+Enter', macKey: '⌘+Enter', does: 'work it out', where: 'in the pad' },
      { key: 'Enter', does: 'go to that frame', where: 'in the frame number' },
      { key: 'Esc', does: 'back to reading', where: 'in a field or a panel' },
    ],
    footNav: 'Where to next',
    backToContents: 'Contents',
    toSummary: 'Summary',
    answerTo: (n) => `Answer to frame ${n}`,
    goToFrameNumber: (n) => `Go to frame ${n}`,
    frameRange: (last) => `Enter a frame from 1 to ${last}.`,
    summaryHeading: 'Summary',
    canYouHeading: 'Can you?',
    exercisesNotYet:
      'The Test exercises and Further problems for this program are not in this edition of the app yet.',
    nextProgramLabel: 'Next program',
    previousProgramLabel: 'Previous program',
    groupLabels: { F: 'Foundation', P: 'Main sequence' },
    sectionsLabel: 'Sections',
    atFrame: (n) => `at frame ${n}`,
    opensAfter: (unit) => `opens after ${unit}`,
    shutExplain: (previous) =>
      `Not open yet. It opens as soon as you have read any frame of ${previous} — one frame ` +
      `is enough, and nothing here is paid for or hidden.`,
    shutNotice: (unit, previous) =>
      `${unit} is not open yet, so this page opened instead of it. The book is read in ` +
      `order: ${unit} opens as soon as you have a place in ${previous}, and one frame of ` +
      `${previous} is enough. ${unit} is marked in the list below.`,
    shutNextProgram: (unit) => `${unit} opens once you have read any frame of this program.`,
    notReachedHeading: 'Not there yet',
    notReachedBody: (furthest) =>
      `This frame has not been reached yet. The furthest read frame in this program is ${furthest}.`,
    backToLastFrame: 'Back to the frame',
    labOptional: 'This program also has computer exercises in Python, optional',
  },
  pl: {
    forget: 'Zapomnij, gdzie jestem',
    forgetConfirm: 'Zapomnij \u2014 na ka\u017cdym urz\u0105dzeniu',
    pressAgain: (action) => `${action}. Naciśnij ponownie, aby potwierdzić, albo Esc, aby anulować.`,
    signIn: 'Zaloguj się',
    signOut: 'Wyloguj się',
    account: 'Konto',
    consent: {
      invitationTitle: 'Pomo\u017cesz poprawi\u0107 ksi\u0105\u017ck\u0119?',
      invitationWhat:
        'Tej ksi\u0105\u017cki nikt jeszcze nie przeczyta\u0142, a jej autor nie wie, kt\u00f3re ramki s\u0105 z\u0142e. ab-ovo mo\u017ce si\u0119 tego dowiedzie\u0107 \u2014 zapisuj\u0105c dla ka\u017cdej ramki, na kt\u00f3r\u0105 odpowiesz, w kt\u00f3rej wersji ksi\u0105\u017cki si\u0119 znajdowa\u0142a, kt\u00f3re to by\u0142o podej\u015bcie i czy twoja odpowied\u017a zgadza si\u0119 z t\u0105 z ksi\u0105\u017cki. Nigdy samej odpowiedzi: twoje s\u0142owa zostaj\u0105 w tej przegl\u0105darce.',
      invitationNoReader:
        '\u017baden identyfikator ciebie tam nie trafia: ani kolumna, ani skr\u00f3t, ani z\u0142\u0105czenie. W\u0142a\u015bnie dlatego wynik mo\u017cna bezpiecznie publikowa\u0107 i dlatego nic z tego, co si\u0119 tu zapisuje, nie zamieni si\u0119 w ocen\u0119 ciebie.',
      invitationEitherWay:
        'Ka\u017cda z odpowiedzi zostawia ksi\u0105\u017ck\u0119, laboratorium i twoje miejsce w nich dok\u0142adnie takimi, jakie s\u0105. Nie zapytamy ponownie.',
      grant: 'Tak, korzystajcie z moich wynik\u00f3w',
      decline: 'Nie, dzi\u0119kuj\u0119',
      statusGranted: 'Pomagasz mierzy\u0107 ksi\u0105\u017ck\u0119.',
      statusDeclined: 'Nie uczestniczysz w pomiarach ksi\u0105\u017cki.',
      withdraw: 'Przesta\u0144 uczestniczy\u0107',
      join: 'Zacznij uczestniczy\u0107',
      withdrawCannotRetract:
        'Rezygnacja zatrzymuje kolejny wynik. Nie cofnie tych ju\u017c policzonych, bo nic nie wie, kt\u00f3re by\u0142y twoje.',
    },
    deleteAccount: {
      title: 'Usu\u0144 konto',
      lead: 'To usuwa dwie rzeczy.',
      removesProgress:
        'Pozycj\u0119 w lekturze zapisan\u0105 na koncie \u2014 ka\u017cdy program, na ka\u017cdym urz\u0105dzeniu, kt\u00f3re si\u0119 synchronizuje.',
      removesAccount: 'Samo konto, w serwisie to\u017csamo\u015bci.',
      staysTitle: 'Co zostaje',
      stays:
        'Ta przegl\u0105darka zachowuje w\u0142asn\u0105 kopi\u0119 tego, gdzie jeste\u015b w ksi\u0105\u017cce, i mo\u017cesz czyta\u0107 dalej bez konta. Je\u015bli chcesz wyczy\u015bci\u0107 tak\u017ce j\u0105, u\u017cyj \u201eZapomnij, gdzie jestem\u201d na stronie program\u00f3w \u2014 to osobny przycisk, bo to osobna rzecz.',
      cannotReachTitle: 'Czego to nie dosi\u0119gnie',
      cannotReach:
        'Instrument mierzy, jak radzi sobie ramka, nigdy jak radzi sobie czytelnik: wynik nie niesie ze sob\u0105 \u017cadnego czytelnika, wi\u0119c \u017caden jego wiersz nie wie, \u017ce by\u0142 tw\u00f3j, i \u017cadne usuni\u0119cie go nie znajdzie. Tak to zaprojektowano \u2014 dzi\u0119ki temu wska\u017anik mo\u017cna bezpiecznie publikowa\u0107 \u2014 a cen\u0105 jest to, \u017ce wk\u0142adu wliczonego ju\u017c do wska\u017anika nie da si\u0119 z niego wycofa\u0107.',
      notImmediateTitle: 'Konto nie znika od razu',
      notImmediate:
        'Serwis to\u017csamo\u015bci oznacza je jako usuni\u0119te, uniewa\u017cnia tokeny, kt\u00f3re odnawia\u0142yby sesj\u0119, i planuje trwa\u0142e usuni\u0119cie na koniec swojego okresu przechowywania. Przez ten czas si\u0119 nie zalogujesz. ab-ovo nie wie, jak d\u0142ugo trwa ten okres \u2014 to informacja po stronie serwisu to\u017csamo\u015bci, a przepisanie st\u0105d liczby by\u0142oby podaniem warto\u015bci, kt\u00f3rej nic tutaj nie mo\u017ce sprawdzi\u0107.',
      confirmWord: 'USU\u0143',
      confirmLabel: (word) => `Wpisz ${word}, aby potwierdzi\u0107`,
      passwordLabel: 'Twoje has\u0142o',
      passwordHint:
        'Zostaw puste, je\u015bli logujesz si\u0119 przez Google albo GitHub i has\u0142o nigdy nie zosta\u0142o ustawione.',
      submit: 'Usu\u0144 moje konto',
      cancel: 'Zostaw moje konto',
      doneTitle: 'Twojego konta ju\u017c nie ma',
      done: 'Zapisana na nim pozycja w lekturze zosta\u0142a usuni\u0119ta, a serwis to\u017csamo\u015bci oznaczy\u0142 konto jako usuni\u0119te i zaplanowa\u0142 jego wymazanie.',
      keepReading: 'Czytaj dalej',
      problemConfirm: 'To nie jest s\u0142owo potwierdzenia. Nic nie zosta\u0142o usuni\u0119te.',
      problemPasswordRequired: 'To konto ma has\u0142o, a pole by\u0142o puste.',
      problemPasswordRejected: 'To has\u0142o nie zosta\u0142o przyj\u0119te.',
      problemSignedOut:
        'Twoja sesja zako\u0144czy\u0142a si\u0119, zanim to si\u0119 uda\u0142o doko\u0144czy\u0107. Zaloguj si\u0119 i spr\u00f3buj ponownie.',
      problemProgress:
        'Nie uda\u0142o si\u0119 usun\u0105\u0107 tego, co przechowywa\u0142o twoje konto \u2014 pozycji w lekturze i wybranego wydania \u2014 wi\u0119c nic wi\u0119cej nie by\u0142o pr\u00f3bowane. Konto pozosta\u0142o nietkni\u0119te. Spr\u00f3buj ponownie.',
      problemAccount:
        'To, co przechowywa\u0142o twoje konto, zosta\u0142o usuni\u0119te, ale samego konta nie uda\u0142o si\u0119 usun\u0105\u0107. Nadal nale\u017cy do ciebie, a to urz\u0105dzenie nadal wie, gdzie jeste\u015b w ksi\u0105\u017cce. Spr\u00f3buj ponownie.',
      problemUnconfigured:
        'To wdro\u017cenie nie ma serwisu to\u017csamo\u015bci, wi\u0119c nie ma konta do usuni\u0119cia.',
    },
    raised: (unit, step) =>
      `${unit} przesunięto do ramki ${step}, czytanej na innym urządzeniu. Wygrywa najdalsza ramka.`,
    dismiss: 'Rozumiem',
    cue: 'Odpowiedź znajdziesz w kolejnej ramce.',
    // `Dalej` / `Wstecz` — the pair a Polish reader already knows from every wizard and form
    // that has a Next and a Back, and short enough that both keep their words on a phone's
    // third of the pager (ADR-0063), where `Poprzednia` / `Następna` did not quite.
    next: 'Dalej',
    previous: 'Wstecz',
    languageLabel: 'Język',
    programs: 'Programy',
    about: 'O ab-ovo',
    courses: 'Kursy',
    coursesLead:
      'Wszystkie kursy, kt\u00f3re niesie ab-ovo \u2014 ka\u017cdy to ci\u0105g program\u00f3w przerabianych ramka po ramce. Otwarcie jednego zaw\u0119\u017ca do niego spis; dop\u00f3ki tego nie zrobisz, spis pokazuje wszystkie.',
    allCourses: 'Wszystkie kursy',
    onlyThisCourse: 'Tylko ten kurs',
    // `Tryb` rather than `Motyw`: docs/SCREENSHOTS.pl.md already calls this
    // ‘tryb ciemny’, and a product that names one concept twice teaches a reader
    // that the two words are two things (docs/how-to/translate-a-document.md).
    themeLabel: 'Tryb',
    themeSystem: 'Systemowy',
    themeLight: 'Jasny',
    themeDark: 'Ciemny',
    contents: 'Spis treści',
    opening: 'Wstęp',
    position: (n, total) => `${n} z ${total}`,
    startAtFrame: (n) => `Zacznij od ramki ${n}`,
    continueAtFrame: (n) => `Wróć do ramki ${n}`,
    frame: { one: 'ramka', few: 'ramki', many: 'ramek', other: 'ramki' },
    section: { one: 'sekcja', few: 'sekcje', many: 'sekcji', other: 'sekcji' },
    // `other` is the genitive singular, as it is for the two nouns above: it is the form a
    // fraction takes ('0,5 programu'), which is the only band `other` selects in Polish.
    program: { one: 'program', few: 'programy', many: 'program\u00f3w', other: 'programu' },
    yourAnswer: 'Twoja odpowiedź',
    writeItDown: 'Zapisz, zanim pójdziesz dalej',
    // Impersonal on purpose: a second-person past tense in Polish has to pick a gender,
    // and "Zapisałeś" picked one for every reader. "Zapisano" — recorded — picks none.
    youWrote: 'Zapisano',
    matchesBook: 'Tak jak w książce',
    writtenBefore: 'zapisane przed odsłonięciem',
    earlierEdition: 'zapisane przy wcześniejszym wydaniu',
    clearAnswer: 'Wyczyść moją odpowiedź',
    clearAnswerConfirm: 'Wyczyść',
    working: 'Policz to',
    /*
      `Oblicz` and not a Polish idiom for `Do the sums`: the English names the act the way
      an English speaker would say it out loud, and there is no Polish phrase that is both
      idiomatic and the same length. So this says THE THING instead of the idiom, which is
      docs/how-to/translate-a-document.md's own rule. It is distinct from `working`'s
      `Policz to` for the reason the English pair is distinct — the opener and the button
      inside it may not read as one control.
    */
    workingRun: 'Oblicz',
    workingHint: 'Po jednej linii. Nazwie można nadać wartość: w = 0,5',
    workingLabel: 'Twoje obliczenia',
    sketch: 'Narysuj to',
    // `Pokaż` is this table's word for *show*, so nothing here invents a second word for a
    // concept the product already names.
    showMySketch: 'Pokaż mój szkic',
    sketchLabel: 'Narysuj swoją odpowiedź',
    sketchGrid: 'Siatka',
    sketchAxes: 'Osie',
    sketchNone: 'Bez tła',
    sketchUndo: 'Cofnij',
    sketchClear: 'Wyczyść',
    sketchClearConfirm: 'Wyczyść cały szkic',
    sketchFull: 'Ten szkic jest już za duży, żeby go zapisać. To, co widać, zostaje do wyjścia z ramki.',
    exportWorksheets: 'Pobierz moje notatki',
    clearWorksheets: 'Wyczyść moje notatki',
    clearWorksheetsConfirm: 'Wyczyść — nie da się cofnąć',
    programsCrumb: '← Programy',
    goToFrame: 'Przejdź do ramki',
    ofTotal: (total) => `z ${total}`,
    go: 'Przejdź',
    close: 'Zamknij',
    programMap: 'Sekcje i ramki',
    // Impersonal, like `youWrote`: a second-person "you have not reached" would have to pick
    // a gender in Polish.
    lockedSection: 'jeszcze niedostępna',
    readingSettings: 'Ustawienia czytania',
    keysHeading: 'Klawisze',
    keysMap: [
      { key: '→', does: 'następna ramka' },
      { key: '←', does: 'poprzednia ramka' },
      { key: 'Enter', does: 'wpisz odpowiedź' },
      { key: 'g', does: 'sekcje i ramki' },
      { key: 'Ctrl+Enter', macKey: '⌘+Enter', does: 'zapisz odpowiedź i dalej', where: 'w odpowiedzi' },
      { key: 'Ctrl+Enter', macKey: '⌘+Enter', does: 'policz', where: 'w obliczeniach' },
      { key: 'Enter', does: 'przejdź do tej ramki', where: 'w numerze ramki' },
      { key: 'Esc', does: 'wróć do czytania', where: 'w polu lub panelu' },
    ],
    footNav: 'Dokąd dalej',
    backToContents: 'Spis treści',
    toSummary: 'Podsumowanie',
    answerTo: (n) => `Odpowiedź do ramki ${n}`,
    goToFrameNumber: (n) => `Przejdź do ramki ${n}`,
    frameRange: (last) => `Wpisz numer ramki od 1 do ${last}.`,
    summaryHeading: 'Podsumowanie',
    canYouHeading: 'Czy potrafisz?',
    exercisesNotYet:
      'Zadania testowe i Dalsze zadania tego programu nie są jeszcze w tej wersji aplikacji.',
    nextProgramLabel: 'Następny program',
    previousProgramLabel: 'Poprzedni program',
    groupLabels: { F: 'Podstawy', P: 'Część główna' },
    sectionsLabel: 'Sekcje',
    atFrame: (n) => `na ramce ${n}`,
    opensAfter: (unit) => `dostępne po ${unit}`,
    shutExplain: (previous) =>
      `Jeszcze nieotwarty. Otworzy się, gdy przeczytasz dowolną ramkę ${previous} — wystarczy ` +
      `jedna, nic tu nie jest płatne ani ukryte.`,
    shutNotice: (unit, previous) =>
      `${unit} nie jest jeszcze otwarty, dlatego zamiast niego otworzyła się ta strona. ` +
      `Książkę czyta się po kolei: ${unit} otworzy się, gdy będzie zapisane miejsce w ` +
      `${previous} — wystarczy jedna ramka ${previous}. ${unit} jest zaznaczony na liście niżej.`,
    shutNextProgram: (unit) =>
      `${unit} otworzy się, gdy przeczytasz dowolną ramkę tego programu.`,
    notReachedHeading: 'Jeszcze nie tutaj',
    notReachedBody: (furthest) =>
      `Ta ramka nie jest jeszcze dostępna. Najdalsza przeczytana ramka w tym programie: ${furthest}.`,
    backToLastFrame: 'Wróć do ramki',
    labOptional: 'Ten program ma też ćwiczenia komputerowe w Pythonie, opcjonalne',
  },
};

/** The language whose controls are used when the content's language has none here. */
export const FALLBACK_LANGUAGE = 'en';

/** Every language this application's controls exist in. Not the languages content exists in. */
export const CHROME_LANGUAGES: readonly string[] = Object.keys(TABLE);

/**
 * Fold a typed confirmation down to what is being compared: case and diacritics are not
 * the point, deliberateness is. `usun` passes for `USUŃ`.
 *
 * NFD splits a letter into its base and its combining mark; the property escape then
 * removes the marks. Written this way rather than as a table of substitutions because a
 * table only knows the languages somebody thought of, and this file is explicitly a set
 * that can grow.
 */
const fold = (value: string): string =>
  value
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase();

/**
 * Whether what the reader typed confirms a deletion.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IT ACCEPTS ANY LANGUAGE'S WORD, AND TAKES NO LANGUAGE PARAMETER.
 *
 * The obvious design passes the language the reader was shown and compares against that
 * one entry. It is worse in both directions: a caller that got the parameter wrong would
 * refuse a reader who typed exactly what was on their screen, and a caller that took the
 * language from the request body would be letting the caller choose which word to check
 * against — which is not a check.
 *
 * The question this is actually asking is "did somebody deliberately type a word meaning
 * delete", and every entry in the table is an equally good answer to it. There is nothing
 * to get wrong.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function isConfirmationWord(typed: string): boolean {
  const folded = fold(typed);
  if (folded.length === 0) return false;
  return Object.values(TABLE).some((strings) => fold(strings.deleteAccount.confirmWord) === folded);
}

const pluralise = (language: string, n: number, forms: Plural): string => {
  const category = new Intl.PluralRules(language).select(n);
  return `${n} ${forms[category] ?? forms.other}`;
};

export interface Chrome {
  /**
   * The language these strings are actually in, which is NOT necessarily the language
   * asked for. Put it on a `lang` attribute; that is the whole reason it is returned.
   */
  readonly language: string;
  readonly forget: string;
  /**
   * The second press of *Forget where I am*, which is the one that destroys anything. It
   * names the reach — every device — because that is what changed when the record grew an
   * account copy (ADR-0047); a bare "are you sure" says nothing a reader can weigh.
   */
  readonly forgetConfirm: string;
  /**
   * What a screen reader hears when ANY two-press control is armed — its second label, then
   * how to go on or back. Said through a live region (`two-step-status.tsx`), because a
   * button renaming itself under focus is silent in most of them (#151).
   */
  readonly pressAgain: (action: string) => string;
  readonly signIn: string;
  readonly signOut: string;
  readonly account: string;
  readonly deleteAccount: DeleteAccountStrings;
  readonly consent: ConsentStrings;
  readonly raised: (unit: string, step: number) => string;
  readonly dismiss: string;
  readonly cue: string;
  readonly next: string;
  readonly previous: string;
  readonly languageLabel: string;
  readonly programs: string;
  readonly about: string;
  readonly courses: string;
  readonly coursesLead: string;
  readonly allCourses: string;
  readonly onlyThisCourse: string;
  readonly themeLabel: string;
  readonly themeSystem: string;
  readonly themeLight: string;
  readonly themeDark: string;
  readonly contents: string;
  readonly opening: string;
  readonly position: (n: number, total: number) => string;
  readonly startAtFrame: (n: number) => string;
  readonly continueAtFrame: (n: number) => string;
  readonly frames: (n: number) => string;
  readonly sections: (n: number) => string;
  /**
   * `47 programs`. NOT called `programs`, which is already this table's word for the index
   * heading and the breadcrumb — one name for a heading and a counter would be a key whose
   * meaning depends on where it is read, and the compiler would not have a word to say.
   */
  readonly programCount: (n: number) => string;
  readonly yourAnswer: string;
  readonly writeItDown: string;
  readonly youWrote: string;
  readonly matchesBook: string;
  readonly writtenBefore: string;
  readonly earlierEdition: string;
  readonly clearAnswer: string;
  readonly clearAnswerConfirm: string;
  /** The Working pad — a place to try a line of arithmetic beside the frame. */
  readonly working: string;
  readonly workingRun: string;
  readonly workingHint: string;
  readonly workingLabel: string;
  readonly sketch: string;
  readonly showMySketch: string;
  readonly sketchLabel: string;
  readonly sketchGrid: string;
  readonly sketchAxes: string;
  readonly sketchNone: string;
  readonly sketchUndo: string;
  readonly sketchClear: string;
  readonly sketchClearConfirm: string;
  readonly sketchFull: string;
  readonly exportWorksheets: string;
  readonly clearWorksheets: string;
  readonly clearWorksheetsConfirm: string;
  readonly programsCrumb: string;
  readonly goToFrame: string;
  readonly ofTotal: (total: number) => string;
  readonly go: string;
  readonly close: string;
  readonly programMap: string;
  readonly lockedSection: string;
  readonly readingSettings: string;
  readonly keysHeading: string;
  readonly keysMap: readonly KeyEntry[];
  readonly footNav: string;
  readonly backToContents: string;
  readonly toSummary: string;
  readonly answerTo: (n: number) => string;
  readonly goToFrameNumber: (n: number) => string;
  readonly frameRange: (last: number) => string;
  readonly summaryHeading: string;
  readonly canYouHeading: string;
  readonly exercisesNotYet: string;
  readonly nextProgramLabel: string;
  readonly previousProgramLabel: string;
  readonly backToLastFrame: string;
  readonly labOptional: string;
  readonly groupLabels: Readonly<Record<string, string>>;
  readonly sectionsLabel: string;
  readonly atFrame: (n: number) => string;
  readonly opensAfter: (unit: string) => string;
  readonly shutExplain: (previous: string) => string;
  readonly shutNotice: (unit: string, previous: string) => string;
  readonly shutNextProgram: (unit: string) => string;
  readonly notReachedHeading: string;
  readonly notReachedBody: (furthest: number) => string;
}

/** The controls for a reader of `language`, falling back to English rather than failing. */
export function chromeFor(language: string): Chrome {
  const found = TABLE[language];
  const used = found ? language : FALLBACK_LANGUAGE;
  // Non-null: the fallback entry is required to exist, and chrome.test.ts asserts it.
  const strings = found ?? TABLE[FALLBACK_LANGUAGE]!;

  return {
    language: used,
    ...strings,
    frames: (n) => pluralise(used, n, strings.frame),
    sections: (n) => pluralise(used, n, strings.section),
    programCount: (n) => pluralise(used, n, strings.program),
  };
}

/**
 * A language's name in its own language — "English", "polski".
 *
 * A language is always named in itself: a reader who cannot read the current page is
 * exactly the reader reaching for this control, so labelling the Polish link "Polish"
 * would put the one word they need in the language they are trying to leave. `Intl` knows
 * the endonym for every language a track could declare, so there is no list here to fall
 * out of date — and `polski` really is lower case, because Polish does not capitalise the
 * names of languages.
 */
export function endonym(language: string): string {
  try {
    return new Intl.DisplayNames([language], { type: 'language' }).of(language) ?? language;
  } catch {
    // An invalid tag reaches here from a URL segment. The code itself is a worse label
    // than a name and a better one than a crash.
    return language;
  }
}
