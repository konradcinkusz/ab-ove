/**
 * What this server says to a reader in its own words, in the reader's edition (#167).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE BOOK'S WORDS ARRIVE IN THE EDITION; UNTIL #167 THESE DID NOT.
 *
 * Measured on 2026-09-24 through a real MCP client: in the Polish edition the step itself
 * was Polish, and everything around it was English — `step 1 of 45`, the banner over the
 * book's answer, the closing line, the refusals, the hand-off, the in-memory note. The
 * host's model then translated them, which is exactly what `SERVER_INSTRUCTIONS` §6 asks
 * it not to do to a step: show it "as it is served". So the framing is served in the
 * edition, as the reading surface's controls are (ADR-0016), and a Polish step now arrives
 * inside Polish framing, with nothing left to translate.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ONLY WHAT THE READER IS SHOWN. A sentence lives here when the model is to show it or
 * pass it on as it stands: the step as rendered, the gate's refusals (`explain()`), the
 * hand-off at the end of a program, the notes about the reader's place, the list's group
 * headings, and the form a host puts in front of the reader to confirm an answer. What is
 * addressed to the assistant stays English and stays beside the code that says it: the
 * tool descriptions, `SERVER_INSTRUCTIONS`, the output schemas' descriptions, the prompt,
 * and every sentence of a result that tells the model about its call — which tool opens
 * the next program, what was recorded, what to ask the reader. `framing.test.ts` holds the
 * line from this side: no sentence here names a tool, because a sentence that names one is
 * the assistant's.
 *
 * THE PATTERN IS `web/app/src/lib/i18n/chrome.ts`'s: one entry per language this server's
 * sentences are written in, English as the fallback that may never be absent, and a count
 * through `Intl.PluralRules` rather than a number in front of a noun. Its words too, where
 * the two surfaces say the same thing — `Napisz odpowiedź, zanim przejdziesz dalej`, `Czy
 * potrafisz?`, `Następny program`, `Podstawy` — COPIED rather than imported, because this
 * package reaches into `@ab-ovo/app` for nothing (ADR-0053).
 * `docs/how-to/translate-a-document.md` is the vocabulary both copies are held to, and it
 * names both tables. NOTHING CHECKS ONE COPY AGAINST THE OTHER, so a shared word changed in
 * either is changed in both, in the same commit (MCP-SERVER-SKETCH.md §7 names the gate).
 *
 * THE POLISH SAYS `ramka` WHERE THE ENGLISH SAYS `step`. This server's English calls the
 * numbered unit a step, after the schema's `steps` and its own tool names; the book and
 * the reading surface call it a frame, and in Polish both call it `ramka` — the book's own
 * sentences say `Zasłoń następną ramkę`. A second Polish word for the one numbered thing
 * would be the drift the vocabulary table exists to stop, and `krok` is taken besides: the
 * book's Polish uses it for a step of an argument, `Ten krok normalizacji`, and never for a
 * frame. So `ramka` here, as in the book and on the reading surface. The data keeps `step`
 * (#164), which is the assistant's word and a field, not a sentence.
 *
 * POLISH CHOOSES NO GENDER FOR THE READER (ADR-0016): an imperative, a future tense or an
 * impersonal form, never a second-person past tense that would have to be `-łeś` or `-łaś`.
 * `framing.test.ts` checks for both endings.
 *
 * A TRACK IN AN EDITION WITH NO ENTRY HERE is framed in English, as the reading surface's
 * controls are; `framingFor()` reports the language it used. Nothing here imports anything,
 * so `reveal.ts` can read its refusals from this table and still be tested with no install.
 */

/**
 * The forms a count takes — `chrome.ts`'s `Plural`, for the same reason: English needs two
 * and Polish needs four, and `Intl.PluralRules` is the platform's own CLDR rule.
 */
export interface Plural {
  readonly zero?: string;
  readonly one?: string;
  readonly two?: string;
  readonly few?: string;
  readonly many?: string;
  readonly other: string;
}

/** One language's entry. Exported for `framing.test.ts`'s gates over the data; render through `framingFor`. */
export interface Strings {
  /** The numbered unit, as a count takes it — `steps()` in `framingFor`. */
  readonly step: Plural;

  /** Where a step is, after the program and section: `step 5 of 48`. */
  readonly position: (n: number, total: number) => string;
  /** The banner over the book's answer that opens a step, naming the step it answers. */
  readonly bookAnswer: (n: number) => string;
  /** The banner under that answer. */
  readonly compare: string;
  /** A step that carries a lab check, which only the reading surface can run. */
  readonly exercise: (lab: string, exercise: string) => string;
  /** The closing line of a step that asks something: the method's one instruction. */
  readonly asks: string;
  /** The closing line of a step that asks nothing. */
  readonly asksNothing: string;

  /** The hand-off's heading, after the program's id and title. `steps` is `steps(total)`. */
  readonly finished: (steps: string) => string;
  /** What leads the book's Summary, one transport over from the reading surface's `/summary`. */
  readonly summary: string;
  /** What leads the book's *Can you?* list. */
  readonly canYou: string;
  /** The steps a Summary or *Can you?* item names. */
  readonly range: (from: number, to: number) => string;
  /** The next program, by id and title. The call that opens it is the assistant's, and English. */
  readonly nextProgram: (unit: string, title: string) => string;
  /** The end of the last program. */
  readonly lastProgram: string;

  /** `explain()`'s refusals, one per kind (`reveal.ts`). */
  readonly notReached: (requested: number, furthest: number) => string;
  readonly noSuchStep: (requested: number, total: number) => string;
  /** `steps` is `steps(total)`. */
  readonly programComplete: (steps: string) => string;
  /** The reader's half of the reading order's refusal; the call that opens it follows in English. */
  readonly notOpen: (unit: string, after: string) => string;

  /** The note on a place kept in this process's memory (`tools.ts`, `delivered()`). */
  readonly placeIsEphemeral: string;
  /** The reader's half of the note on a place that could not be reached (`placeUnavailableNote()`). */
  readonly placeUnreachable: string;
  /** Added to it when a write failed: it may or may not have been recorded. */
  readonly placeMaybeRecorded: string;
  /** The fix for a service out of reach, which is the reader's to try. `status` is ` (HTTP 503)` or empty. */
  readonly placeOutOfReach: (status: string) => string;

  /** The list's group headings by id prefix — the reading surface's `groupLabels`. */
  readonly groupLabels: Readonly<Record<string, string>>;

  /** The form a host shows the reader before an answer is recorded (ADR-0054): its message… */
  readonly confirmAnswer: (n: number) => string;
  /** …what it adds when the assistant sent no answer to pre-fill… */
  readonly nothingSent: string;
  /** …and the field's title and description. */
  readonly answerLabel: string;
  readonly answerHint: string;
}

/** What `framingFor()` answers: a language's entry, the language it is in, and its counts. */
export interface Framing extends Omit<Strings, 'step'> {
  /** The language these sentences are in — the one asked for, or the fallback. */
  readonly language: string;
  /** `48 steps`, `48 ramek`. */
  readonly steps: (n: number) => string;
}

/**
 * The table. One entry per language this server's own sentences are written in.
 *
 * The English is what the server said before #167, with two differences: a count of one
 * says `step`, and the reading order's refusal names its `open_program` call after its
 * sentences to the reader rather than between them, so that the call can stay English in
 * every edition (`reveal.ts`).
 */
export const TABLE: Readonly<Record<string, Strings>> = {
  en: {
    step: { one: 'step', other: 'steps' },

    position: (n, total) => `step ${n} of ${total}`,
    bookAnswer: (n) => `The book's answer to step ${n}`,
    compare: 'Compare your own answer with that before reading on',
    exercise: (lab, exercise) =>
      `This step has an exercise: lab "${lab}", exercise "${exercise}". ` +
      "The exercises run in the reader's browser and are not available through this server; " +
      'the reading surface has them.',
    asks: 'Write your answer down before going on. The next step opens with the answer to this one.',
    asksNothing: 'This step asks nothing; go on when you are ready.',

    finished: (steps) => `finished — all ${steps} worked.`,
    summary:
      "**Summary** — the book's own return index; each item names what a run of steps " +
      'established, and the steps to re-read for it:',
    canYou: '**Can you?** — what the reader should now be able to do:',
    range: (from, to) => (from === to ? `step ${from}` : `steps ${from}–${to}`),
    nextProgram: (unit, title) => `**Next program:** ${unit} · ${title}.`,
    lastProgram: 'This was the last program in the track.',

    notReached: (requested, furthest) =>
      `Step ${requested} has not been reached yet; the furthest is ${furthest}. ` +
      'This is the method working, not a fault: the answer to a step is the opening of the ' +
      'next one, so the next step arrives when an answer has been submitted for this one.',
    noSuchStep: (requested, total) => `This program has ${total} steps; step ${requested} is not one of them.`,
    programComplete: (steps) => `This program is finished — all ${steps} have been worked.`,
    notOpen: (unit, after) =>
      `"${unit}" is not open to this reader yet, and that is the book's order rather than a ` +
      'fault. A program opens as soon as the reader has a place in the one before it: ' +
      `"${after}" is what opens "${unit}", and there is no place recorded in "${after}". ONE ` +
      `step of it is enough — not the whole program — and "${unit}" is open from that moment, ` +
      'in this conversation and on the website, because both read the same record.\n\n' +
      'Nothing is hidden, missing or paid for: this is a reading order, not a permission.',

    placeIsEphemeral:
      'Your place in the book is kept for this session only: this server has no account to ' +
      'write it to, so a restart begins the program again. Fine for reading; not a bookmark.',
    placeUnreachable:
      'Your place in the book could not be reached just now, and nothing is lost: it is kept ' +
      'on your account, exactly where you left it.',
    placeMaybeRecorded:
      'This call may not have been recorded; either way, the same call is safe to make again ' +
      'once the place can be reached — it will not move you twice.',
    placeOutOfReach: (status) =>
      `The service that keeps it is out of reach or not answering right now${status}. Try again shortly.`,

    groupLabels: { F: 'Foundation', P: 'Main sequence' },

    confirmAnswer: (n) => `Step ${n}: check this before it is recorded as your answer.`,
    nothingSent: 'Type what you wrote — the assistant sent nothing.',
    answerLabel: 'Your answer',
    answerHint: 'Edit this if it is not what you wrote, then confirm.',
  },
  pl: {
    // `chrome.ts`'s `frame`, form for form: the same noun in the same four bands.
    step: { one: 'ramka', few: 'ramki', many: 'ramek', other: 'ramki' },

    // `chrome.ts`'s `frameNumbered` and `ofTotal`, which a frame's page description says
    // together: `Ramka 5 z 48`.
    position: (n, total) => `ramka ${n} z ${total}`,
    // `chrome.ts`'s `answerTo`, `Odpowiedź do ramki n`, with the book named as the English
    // names it: the reader's own answer is the other one of the two being compared.
    bookAnswer: (n) => `Odpowiedź książki do ramki ${n}`,
    // `zanim przejdziesz dalej` is `writeItDown`'s own clause, and a future tense: it chooses
    // no gender for the reader. `z nią` is the book's answer, named in the banner above.
    compare: 'Porównaj z nią swoją odpowiedź, zanim przejdziesz dalej',
    // `ćwiczenia komputerowe` is `labOptional`'s name for what a lab holds; `zestaw` names
    // the lab by its id, which the English quotes as `lab "P01"`. `na stronie internetowej`
    // rather than `na stronie`, which would also read as "on this page".
    exercise: (lab, exercise) =>
      `Ta ramka ma ćwiczenie komputerowe: zestaw „${lab}”, ćwiczenie „${exercise}”. ` +
      'Ćwiczenia komputerowe działają w przeglądarce i przez ten serwer nie są dostępne — ' +
      'są na stronie internetowej.',
    // `writeItDown` whole, `napisz` and not `zapisz` for its reason (issue #152), then
    // `programsLead`'s own account of the method: the next frame opens with the answer.
    asks: 'Napisz odpowiedź, zanim przejdziesz dalej. Następna ramka zaczyna się od odpowiedzi na tę.',
    // `kiedy zechcesz` rather than *kiedy będziesz gotowy*, whose adjective takes a gender.
    asksNothing: 'Ta ramka o nic nie pyta — przejdź dalej, kiedy zechcesz.',

    // `ukończony` agrees with the program, which the heading has just named; `każda
    // przerobiona` with the frames, whatever the count's band. `przerabiać` is `coursesLead`'s
    // verb for working through a program a frame at a time.
    finished: (steps) => `ukończony — ${steps}, każda przerobiona.`,
    // `Podsumowanie` and `Czy potrafisz?` are the reading surface's `summaryHeading` and
    // `canYouHeading`. The English idiom *return index* is said as the thing it is: frames
    // to read again. `co po tym programie powinno się umieć` is impersonal, where *what the
    // reader should now be able to do* would have to pick the reader's gender in Polish. An
    // item of the list is a `punkt`: `pozycja` is the vocabulary's word for the reader's
    // place (`placeIsEphemeral` below), and one word naming two things is the drift
    // translate-a-document.md exists to stop.
    summary:
      '**Podsumowanie** z samej książki — każdy punkt mówi, co ustalił ciąg ramek, i ' +
      'wskazuje ramki do ponownego przeczytania:',
    canYou: '**Czy potrafisz?** — co po tym programie powinno się umieć:',
    range: (from, to) => (from === to ? `ramka ${from}` : `ramki ${from}–${to}`),
    // `nextProgramLabel`. A track is a `kurs` in the vocabulary (translate-a-document.md).
    nextProgram: (unit, title) => `**Następny program:** ${unit} · ${title}.`,
    lastProgram: 'To był ostatni program tego kursu.',

    // `notReachedBody`'s two sentences, with the frame named because this refusal can name
    // any frame and not only the one on the screen; then why, as the English says it.
    notReached: (requested, furthest) =>
      `Ramka ${requested} nie jest jeszcze dostępna. Najdalsza przeczytana ramka w tym ` +
      `programie: ${furthest}. To nie błąd, tylko metoda: odpowiedź na ramkę jest początkiem ` +
      'następnej, więc następna ramka przychodzi dopiero po odpowiedzi na bieżącą.',
    // Said as where the program ends, which needs no count and so no plural at all.
    noSuchStep: (requested, total) => `Ten program kończy się na ramce ${total} — ramki ${requested} w nim nie ma.`,
    programComplete: (steps) => `Ten program jest ukończony — ${steps}, każda przerobiona.`,
    // `shutNotice`'s account of the order — `Książkę czyta się po kolei`, `zapisane miejsce`,
    // `wystarczy jedna ramka` — and `shutExplain`'s `nic tu nie jest płatne ani ukryte`, with
    // the English's *missing* added. The ids are bare, as on the reading surface; a Polish
    // sentence carries no capitals for emphasis, which the English `ONE` is for the model
    // rather than for the reader. `obie` are the conversation and the website.
    notOpen: (unit, after) =>
      `${unit} nie jest jeszcze otwarty — to kolejność książki, a nie błąd. Książkę czyta się ` +
      `po kolei: ${unit} otworzy się, gdy będzie zapisane miejsce w ${after}, a w ${after} ` +
      `jeszcze go nie ma. Wystarczy jedna ramka ${after}, nie cały program — od tej chwili ` +
      `${unit} jest otwarty, w tej rozmowie i na stronie internetowej, bo obie czytają ten sam ` +
      'zapis.\n\n' +
      'Nic tu nie jest ukryte, brakujące ani płatne: to kolejność czytania, a nie uprawnienie.',

    // `pozycja w lekturze` is the vocabulary's word for the reader's place in the book.
    placeIsEphemeral:
      'Twoja pozycja w lekturze jest zapamiętana tylko na czas tej sesji: ten serwer nie ma ' +
      'konta, na którym mógłby ją zapisać, więc po jego ponownym uruchomieniu program zaczyna ' +
      'się od nowa. Do czytania wystarczy; zakładką nie jest.',
    // `accountOverview.placesUnavailable`'s claim — nothing is lost — with `revealUnreachable`'s
    // verb; `zostawiono` is impersonal where *zostawiłeś* would choose a gender.
    placeUnreachable:
      'Nie udało się teraz dotrzeć do twojej pozycji w lekturze, ale nic nie przepadło: jest ' +
      'zapisana na twoim koncie, dokładnie tam, gdzie ją zostawiono.',
    // *This call* is the assistant's word; the reader made a change, and may make it again.
    placeMaybeRecorded:
      'Nie wiadomo, czy ta zmiana została zapisana; tak czy inaczej można ją bezpiecznie ' +
      'powtórzyć, gdy pozycja znów będzie osiągalna — nie przesunie cię dwa razy.',
    // `serwer książki` is the reading surface's name for `AbOvo.Api`
    // (`renderError.unavailableTitle`); `Spróbuj ponownie za chwilę` is `renderError.tryLater`.
    placeOutOfReach: (status) =>
      `Serwer książki, który ją przechowuje, jest teraz nieosiągalny albo nie odpowiada${status}. ` +
      'Spróbuj ponownie za chwilę.',

    groupLabels: { F: 'Podstawy', P: 'Część główna' },

    // `Twoja odpowiedź` is `yourAnswer`. Nothing here asks what the reader *wrote* in a past
    // tense (`napisałeś`), for ADR-0016's reason.
    confirmAnswer: (n) => `Ramka ${n}: sprawdź to, zanim zostanie zapisane jako twoja odpowiedź.`,
    nothingSent: 'Wpisz swoją odpowiedź — asystent nic nie przesłał.',
    answerLabel: 'Twoja odpowiedź',
    answerHint: 'Popraw, jeśli to nie jest twoja odpowiedź, a potem potwierdź.',
  },
};

/** The language whose sentences are used when the reader's edition has none here. */
export const FALLBACK_LANGUAGE = 'en';

/** Every language this server's own sentences exist in. Not the languages content exists in. */
export const FRAMING_LANGUAGES: readonly string[] = Object.keys(TABLE);

const count = (language: string, n: number, forms: Plural): string =>
  `${n} ${forms[new Intl.PluralRules(language).select(n)] ?? forms.other}`;

/** The sentences for a reader of `language`, falling back to English rather than failing. */
export function framingFor(language: string): Framing {
  /*
    AN ENTRY OF THE TABLE'S OWN, NEVER ONE IT INHERITS. `TABLE` is an object literal, so
    `TABLE['constructor']`, `TABLE['__proto__']` and `TABLE['toString']` answer with
    `Object.prototype`'s members, and the first version built a Framing from them whose
    every sentence was `undefined`: thrown out of `handle()` as `placeOutOfReach is not a
    function`, or said to the reader as the word "undefined" — #137's note, broken by the
    lookup meant to translate it (#167). The fallback promises a Framing for any string, so
    the lookup is `Object.hasOwn`, as `sign-in-problem.ts` looks up a code off a URL.
  */
  const found = Object.hasOwn(TABLE, language) ? TABLE[language] : undefined;
  const used = found ? language : FALLBACK_LANGUAGE;
  // Non-null: the fallback entry is required to exist, and framing.test.ts asserts it.
  const { step, ...strings } = found ?? TABLE[FALLBACK_LANGUAGE]!;
  return { ...strings, language: used, steps: (n) => count(used, n, step) };
}
