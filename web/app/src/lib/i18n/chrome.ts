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
  readonly answer: string;
  readonly keys: string;
  /**
   * The accessible name of the region the frame sits in when something else shares the
   * page with it — today the lab pane, on the composed route of UI-UX.md 1.5.
   *
   * It exists because that route has two landmarks and the frame is not the one carrying
   * `<main>`: the pane brings its own, and giving the reading column a second `<main>`
   * would be invalid rather than helpful. A named region is what lets a reader navigating
   * by landmark reach the frame at all, which is the requirement's own last clause read
   * through a screen reader.
   */
  readonly frameRegion: string;
  /**
   * The way back up, at the foot of the lab pane on a narrow screen — UI-UX.md 1.5, #54.
   *
   * It exists because the two halves are stacked rather than tabbed, and stacking's whole
   * defence is that both stay reachable. Measured at 360x640 the composed route is about
   * 2,800 px tall, so a reader who has read to the end of the checks is some four screens
   * below the question they are answering. The link is that distance in one tap, and it
   * has no job at all once the two halves sit side by side — which is why the stylesheet
   * takes it away at the same width the columns divide.
   */
  readonly backToFrame: string;
  readonly forget: string;
  readonly signIn: string;
  readonly signOut: string;
  readonly account: string;
  readonly deleteAccount: DeleteAccountStrings;
  readonly consent: ConsentStrings;
  /** The conflict rule, said where the conflict happened. See `raised-notice.tsx`. */
  readonly raised: (unit: string, step: number) => string;
  readonly dismiss: string;
  readonly cue: string;
  readonly reveal: string;
  readonly next: string;
  readonly lastFrame: string;
  readonly previous: string;
  /**
   * What a frame that carries a `check` offers, with the exercise NAMED in it.
   *
   * The name is the whole of what the sentence is for. A lab's exercise file holds all of
   * that program's exercises at once — `gap`, `epsilon`, `tenth` and the rest are regions
   * of one `<stem>.py` — so "open the lab" would land a reader in a file of functions with
   * nothing to say which one this frame was asking for. The id comes out of the step's own
   * `check`, beside the lab, so the two cannot name different things.
   *
   * A FUNCTION RATHER THAN A STRING WITH A SLOT, because the id does not sit in the same
   * place in both languages and a template assembled at the call site would put it in the
   * English one twice.
   */
  readonly checkOffer: (exercise: string) => string;
  readonly languageLabel: string;
  readonly programs: string;
  readonly contents: string;
  readonly opening: string;
  readonly position: (n: number, total: number) => string;
  readonly startAtFrame: (n: number) => string;
  readonly continueAtFrame: (n: number) => string;
  readonly frame: Plural;
  readonly section: Plural;
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
    answer: 'Answer',
    keys: '→ next frame · ← back',
    frameRegion: 'The frame',
    backToFrame: 'Back to the frame',
    forget: 'Forget where I am',
    signIn: 'Sign in',
    signOut: 'Sign out',
    account: 'Account',
    consent: {
      invitationTitle: 'Help fix the book?',
      invitationWhat:
        'The book has never been read by anybody, and its author cannot know which frames are wrong. ab-ovo can find out \u2014 by recording, for each frame, which version of the book it was in, which attempt this was, and what a check run said.',
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
        'This browser keeps its own copy of where you are in the book, and you can carry on reading with no account at all. If you want that cleared too, use \u2018Forget where I am\u2019 on the reading page \u2014 a separate control, because it is a separate thing.',
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
        'Your reading position could not be removed, so nothing else was attempted. Your account is untouched. Try again.',
      problemAccount:
        'The reading position stored on your account has been removed, but the account itself could not be. It is still yours, and this device still knows where you are in the book. Try again.',
      problemUnconfigured:
        'This deployment has no identity service, so there is no account to delete.',
    },
    raised: (unit, step) =>
      `${unit} moved to frame ${step}, read on another device. The furthest frame wins.`,
    dismiss: 'Got it',
    cue: 'The next frame answers this.',
    reveal: 'Reveal the answer',
    next: 'Next frame',
    lastFrame: 'That is the last frame of this program.',
    previous: 'Previous',
    checkOffer: (exercise) => `Work exercise ${exercise} in the lab, beside this frame`,
    languageLabel: 'Language',
    programs: 'Programs',
    contents: 'Contents',
    opening: 'Opening',
    position: (n, total) => `${n} of ${total}`,
    startAtFrame: (n) => `Start at frame ${n}`,
    continueAtFrame: (n) => `Continue at frame ${n}`,
    frame: { one: 'frame', other: 'frames' },
    section: { one: 'section', other: 'sections' },
  },
  pl: {
    answer: 'Odpowiedź',
    keys: '→ kolejna ramka · ← wstecz',
    frameRegion: 'Ramka',
    backToFrame: 'Wróć do ramki',
    forget: 'Zapomnij, gdzie jestem',
    signIn: 'Zaloguj się',
    signOut: 'Wyloguj się',
    account: 'Konto',
    consent: {
      invitationTitle: 'Pomo\u017cesz poprawi\u0107 ksi\u0105\u017ck\u0119?',
      invitationWhat:
        'Tej ksi\u0105\u017cki nikt jeszcze nie przeczyta\u0142, a jej autor nie wie, kt\u00f3re ramki s\u0105 z\u0142e. ab-ovo mo\u017ce si\u0119 tego dowiedzie\u0107 \u2014 zapisuj\u0105c dla ka\u017cdej ramki, w kt\u00f3rej wersji ksi\u0105\u017cki si\u0119 znajdowa\u0142a, kt\u00f3re to by\u0142o podej\u015bcie i co powiedzia\u0142o sprawdzenie.',
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
        'Ta przegl\u0105darka zachowuje w\u0142asn\u0105 kopi\u0119 tego, gdzie jeste\u015b w ksi\u0105\u017cce, i mo\u017cesz czyta\u0107 dalej bez konta. Je\u015bli chcesz wyczy\u015bci\u0107 tak\u017ce j\u0105, u\u017cyj \u201eZapomnij, gdzie jestem\u201d na stronie lektury \u2014 to osobny przycisk, bo to osobna rzecz.',
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
        'Zostaw puste, je\u015bli logujesz si\u0119 przez Google albo GitHub i nigdy nie ustawia\u0142e\u015b has\u0142a.',
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
        'Nie uda\u0142o si\u0119 usun\u0105\u0107 twojej pozycji w lekturze, wi\u0119c nic wi\u0119cej nie by\u0142o pr\u00f3bowane. Konto pozosta\u0142o nietkni\u0119te. Spr\u00f3buj ponownie.',
      problemAccount:
        'Pozycja w lekturze zapisana na koncie zosta\u0142a usuni\u0119ta, ale samego konta nie uda\u0142o si\u0119 usun\u0105\u0107. Nadal nale\u017cy do ciebie, a to urz\u0105dzenie nadal wie, gdzie jeste\u015b w ksi\u0105\u017cce. Spr\u00f3buj ponownie.',
      problemUnconfigured:
        'To wdro\u017cenie nie ma serwisu to\u017csamo\u015bci, wi\u0119c nie ma konta do usuni\u0119cia.',
    },
    raised: (unit, step) =>
      `${unit} przesunięto do ramki ${step}, czytanej na innym urządzeniu. Wygrywa najdalsza ramka.`,
    dismiss: 'Rozumiem',
    cue: 'Odpowiedź znajdziesz w kolejnej ramce.',
    reveal: 'Pokaż odpowiedź',
    next: 'Kolejna ramka',
    lastFrame: 'To ostatnia ramka tego programu.',
    previous: 'Poprzednia',
    checkOffer: (exercise) =>
      `Zrób ćwiczenie ${exercise} w laboratorium obok tej ramki`,
    languageLabel: 'Język',
    programs: 'Programy',
    contents: 'Spis treści',
    opening: 'Wstęp',
    position: (n, total) => `${n} z ${total}`,
    startAtFrame: (n) => `Zacznij od ramki ${n}`,
    continueAtFrame: (n) => `Wróć do ramki ${n}`,
    frame: { one: 'ramka', few: 'ramki', many: 'ramek', other: 'ramki' },
    section: { one: 'sekcja', few: 'sekcje', many: 'sekcji', other: 'sekcji' },
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
  readonly answer: string;
  readonly keys: string;
  readonly frameRegion: string;
  readonly backToFrame: string;
  readonly forget: string;
  readonly signIn: string;
  readonly signOut: string;
  readonly account: string;
  readonly deleteAccount: DeleteAccountStrings;
  readonly consent: ConsentStrings;
  readonly raised: (unit: string, step: number) => string;
  readonly dismiss: string;
  readonly cue: string;
  readonly reveal: string;
  readonly next: string;
  readonly lastFrame: string;
  readonly previous: string;
  readonly checkOffer: (exercise: string) => string;
  readonly languageLabel: string;
  readonly programs: string;
  readonly contents: string;
  readonly opening: string;
  readonly position: (n: number, total: number) => string;
  readonly startAtFrame: (n: number) => string;
  readonly continueAtFrame: (n: number) => string;
  readonly frames: (n: number) => string;
  readonly sections: (n: number) => string;
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
