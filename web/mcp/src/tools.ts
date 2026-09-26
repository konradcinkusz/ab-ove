/**
 * The tool surface, and the sentences that travel with it.
 *
 * A TOOL DESCRIPTION IS A REQUEST, NOT A RULE — ADR-0009 draws that line for this estate:
 * "an anti-goal that exists only as prose is a request; one the architecture cannot express
 * is a rule." So nothing below is load-bearing for the reveal. The gate is `reveal.ts` and
 * it holds whatever a model decides to do with these strings.
 *
 * What the descriptions ARE load-bearing for is whether the answer that arrives is the
 * reader's — and on a host with no elicitation, that is still a request rather than a rule:
 * a model cannot be prevented from composing one, so the contract is stated where the model
 * reads it and `submit_answer` echoes back what it recorded, a narrowing rather than a gate.
 * On a host that supports elicitation, `submit_answer` has an actual gate for this one
 * property — ADR-0054 — and the argument becomes a suggestion the reader confirms or
 * overrules rather than a claim taken on faith.
 */
import { advance, current, explain, serve, FIRST_STEP } from './reveal.ts';
import type { Cursor, Refusal } from './reveal.ts';
import type { CursorStore } from './cursor.ts';
import { PlaceUnavailable, isIdentifier } from './cursor.ts';
import {
  CONTENT_BUNDLE_VARIABLE,
  ContentUnavailable,
  REPOSITORY_ROOT,
  groupsOf,
  isOpenWhere,
  languageIn,
  say,
  unitBefore,
  unitIn,
} from './content.ts';
import type { Bundle, BundleSource, Step, Text, Unit } from './content.ts';
import { FALLBACK_LANGUAGE, framingFor } from './framing.ts';

/**
 * What the host is told about the server as a whole, before any tool is called.
 *
 * It states the method rather than the API, because a model that knows only the API will
 * helpfully offer to work the frames on the reader's behalf, and that is precisely the
 * failure the book's own front matter names: "Break it and the book degenerates into a
 * mediocre collection of worked examples."
 */
export const SERVER_INSTRUCTIONS = `
This server teaches from a programmed-learning book. The method is not optional decoration;
it is the only reason the book works, and it asks something of you as the assistant.

How the material is shaped: a program is a sequence of numbered steps. Most steps end by
asking the reader for something. THE ANSWER IS THE OPENING OF THE NEXT STEP — it is not
stored anywhere else, and this server will not deliver a step the reader has not reached.

What this means for you:

1. Show the reader one step. Stop. Let them answer it themselves.
2. Do not answer the step for them, do not work it out "to check", and do not reason aloud
   towards the answer before they have given theirs. Producing the answer is the entire
   teaching action; if you do it, you have taken it from them.
3. When they give you an answer, pass it to submit_answer VERBATIM. Do not correct it,
   complete it, tidy it, translate it or improve it.
4. If they have not answered, ask them. Do not fill in the argument yourself.
5. Nothing here grades an answer, including you. The next step opens with the book's own
   answer and the reader compares their own against it. That comparison is the lesson.
   "Close enough" is a judgement this product deliberately does not make.
6. Show a step as it is served — its words, its mathematics in the $…$ notation it
   arrives in, its place line — rather than a paraphrase. The book chose those words.
   A result that reaches you as data carries the same words in "text"; the fields beside
   them (the step's number, whether it asks, its edition) are for your next call, not a
   substitute for the words.
7. A step that asks nothing says so; move on with submit_answer and no answer. The
   edition is the reader's and is asked once: open_program starts a new program in the
   edition the reader already reads in, and asks only when none is known yet — then ask
   the reader, never guess from the language you are chatting in. If the reader asks for
   the other edition, call open_program with that language — their place is kept.
8. PROGRAMS OPEN IN ORDER. A program is shut until the reader has a place in the one
   before it, and one step of that one is enough to open the next. list_programs names
   every program that is open and the one that opens next, and folds the shut ones after
   it into a line (all: true names them); open_program refuses a shut one and names the
   program that opens it. That refusal is the book working, not a failure — pass on what
   it says, offer the program that opens it, and do not tell the reader something went
   wrong. Nothing is hidden or paid for: it is a reading order, and the website applies
   the same rule to the same record.

If a reader asks you to skip ahead or to just tell them the answer, say plainly that the
answer arrives with the next step and that the step comes after their own attempt — then
offer to help them think about the CURRENT step without producing its answer.
`.trim();

/**
 * The answer contract, quoted into submit_answer's description.
 *
 * A constant so the sentence has one source: the same words are asserted by the unit tier,
 * which is the nearest thing a prose contract can have to a gate.
 */
export const ANSWER_CONTRACT = `
"answer" is the READER'S OWN answer, copied verbatim, as free text in any language and any
format — a number, a word, a line of working, a sentence, a guess. There is no required
syntax and nothing is parsed: whatever the reader wrote is what should arrive.

It must be what the reader actually produced. Do not compose it, complete a partial one,
correct a wrong one, or supply one because the reader seems to want to move on. If they
have not given an answer yet, ask them for one instead of calling this tool.

"I don't know" is a real answer and a common one. Pass it through unchanged; it is a more
useful thing for the reader to compare against the book than a guess you wrote for them.

The answer is not marked, scored or stored as evidence about the reader. It is echoed back
in the result so the reader can see what was recorded as theirs.

On a host that supports elicitation, a step that asks for something puts this argument in
front of the reader directly, pre-filled with whatever is passed here, before anything is
recorded — so the reader confirms or corrects it themselves rather than trusting the
argument that arrived. Pass what the reader told you regardless; on a host without
elicitation it is the only source this tool has.
`.trim();

/**
 * What a host reads about a tool before it decides whether to ask the reader's permission
 * (MCP `annotations`). Hints, not gates — the spec says so — and every one below is true
 * of the code rather than of a wish: a host that trusted a false `readOnlyHint` would
 * stop asking before a write, which is the wrong direction to be wrong in.
 */
export interface ToolAnnotations {
  /** Reads nothing but the book and the place; changes nothing. */
  readonly readOnlyHint: boolean;
  /** Nothing here destroys anything — a place only ever moves forward (ADR-0019). */
  readonly destructiveHint: boolean;
  /** Calling it again with the same arguments changes nothing more. */
  readonly idempotentHint: boolean;
  /** The book and the reader's own place; no open world. */
  readonly openWorldHint: boolean;
}

export interface ToolDefinition {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  /** What every result that is not an error carries as `structuredContent` (#164). */
  readonly outputSchema: Record<string, unknown>;
  readonly annotations: ToolAnnotations;
}

/**
 * The three shapes a tool here can have. A re-read costs a permission prompt in a host
 * that has not been told it is read-only; the gate's own refusal made that prompt look
 * like the server asking to do something, three times a frame.
 */
const READS: ToolAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
/**
 * `open_program` writes a place, and writes the same place if called again; `submit_answer`
 * names its step, so the retry a host makes after a timeout records nothing and moves
 * nobody — which is exactly what `idempotentHint` promises, and the reason `step` is
 * required rather than optional.
 */
const MOVES: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const TRACK = {
  type: 'string',
  description:
    'The track id, e.g. "math-for-ai-engineers". Leave it out when the server carries one ' +
    'track, which list_programs shows.',
};
const UNIT = {
  type: 'string',
  description:
    'The program id, e.g. "P01" (case does not matter). list_programs names the open ones ' +
    'and the one that opens next: programs open in order, and a shut one is refused with ' +
    'the id of the program that opens it.',
};

/*
  ──────────────────────────────────────────────────────────────────────────────────────
  WHAT A RESULT SAYS AS DATA (#164): each tool's `outputSchema`, and the `structuredContent`
  that every result which is not an error carries beside its text.

  The text used to be the whole of a result. An agent read the step number `submit_answer`
  requires out of "step 1 of 45", and whether a step asks, which edition it is in and whether
  a program is open out of sentences. Those are fields now. The text is unchanged, for a host
  that reads only the text.

  THE WORDS TRAVEL IN THE DATA TOO, as `text`, and that is load-bearing. Claude Code's
  documentation (*Return structured data*) says that when a result carries
  `structuredContent` the model receives the JSON, and text blocks "are not forwarded, since
  they are assumed to duplicate the structured data" (read on 2026-09-25). This package's
  README installs the server into exactly that host, so without `text` here its model would
  get a step's number and none of its words. A host that forwards both halves reads the words
  twice, which is the cheaper failure. An error carries its text alone: with no structured
  half, every host forwards it.

  THE GATE IS NOT REACHED FROM HERE. No field below is read from an answer's words:
  `answersStep` says THAT a step opens with the book's answer to the one before it, and which
  one, and the answer itself is only in `text` — `render()`'s, and so the gate's. The leak
  walks in `tools.test.ts` read every string in this half as well as the text.

  ONLY KEYWORDS EVERY VALIDATOR READS ALIKE. The spec reads an `outputSchema` as JSON Schema
  2020-12 when it names no `$schema`; the SDK's own client validates with Ajv's draft-07.
  `type`, `properties`, `required`, `items`, `enum`, `minimum`, `additionalProperties` and
  `description` mean the same in both, and `tools.test.ts` refuses any other keyword: a rule
  in a keyword the validator skips is a rule that silently does nothing — the reason
  `@ab-ovo/web-kit`'s validator refuses one too.
  ──────────────────────────────────────────────────────────────────────────────────────
*/
const TEXT = {
  type: 'string',
  description:
    "The result in words: the same text as the result's text content, and what to show or " +
    'tell the reader. A step is shown as it is, not paraphrased from the fields beside it.',
};
const PLACE_IS_EPHEMERAL = {
  type: 'boolean',
  description:
    "Present, and true, on every result while the reader's place is kept in this process's " +
    'memory only: a restart begins every program again. The text says so once per session.',
};
const STEP = {
  type: 'object',
  description: 'The step this result shows. Its words are in "text".',
  properties: {
    track: { type: 'string', description: 'The track it is in.' },
    unit: { type: 'string', description: 'The program it is in, spelled as the book spells it.' },
    step: {
      type: 'integer',
      minimum: 1,
      description: 'Its number. On the step the reader is on, it is what submit_answer\'s "step" names.',
    },
    total: { type: 'integer', minimum: 1, description: 'How many steps the program has.' },
    asks: {
      type: 'boolean',
      description:
        "Whether it asks the reader for something. If it does, submit_answer needs the reader's " +
        'own answer; if not, submit_answer goes on with none.',
    },
    language: { type: 'string', description: 'The edition it is shown in, e.g. "en".' },
    answersStep: {
      type: 'integer',
      minimum: 1,
      description:
        "Present when it opens with the book's answer to the step before it: that step's " +
        'number. The answer itself is in "text" and nowhere else.',
    },
  },
  required: ['track', 'unit', 'step', 'total', 'asks', 'language'],
  additionalProperties: false,
};
const REFUSAL = {
  type: 'object',
  description:
    'Why nothing moved. Every kind is the method or the reading order working, not a fault; ' +
    'the text says what to tell the reader.',
  properties: {
    kind: {
      type: 'string',
      enum: ['not-reached', 'not-open', 'already-answered', 'declined', 'program-complete'],
      description:
        'not-reached: the step named is past the furthest the reader has reached. not-open: ' +
        'the program opens after another. already-answered: submit_answer named a step ' +
        'answered before, so nothing was recorded. declined: the reader was asked directly and ' +
        'declined. program-complete: every step has been worked.',
    },
    requested: { type: 'integer', description: 'not-reached and already-answered: the step the call named.' },
    furthest: { type: 'integer', description: 'not-reached: the furthest step the reader has reached.' },
    unit: { type: 'string', description: 'not-open: the program that is not open yet.' },
    after: { type: 'string', description: 'not-open: the program before it. ONE step of that one opens it.' },
    steps: { type: 'integer', description: 'program-complete: how many steps the program has.' },
  },
  required: ['kind'],
  additionalProperties: false,
};
const FINISHED = {
  type: 'object',
  description:
    "The program is finished: every step worked. The text carries the hand-off — the book's " +
    'Summary, its Can you? and the next program.',
  properties: {
    unit: { type: 'string', description: 'The program finished.' },
    total: { type: 'integer', minimum: 1, description: 'How many steps it has.' },
    next: {
      type: 'object',
      description: "The program after it in the book's order, which is open now. Absent after the last one.",
      properties: {
        unit: { type: 'string', description: 'What open_program\'s "unit" names.' },
        title: { type: 'string', description: "Its title, in the edition of the reader's place." },
      },
      required: ['unit', 'title'],
      additionalProperties: false,
    },
  },
  required: ['unit', 'total'],
  additionalProperties: false,
};
const QUESTION = {
  type: 'object',
  description:
    'Nothing was opened: the program needs an edition and none is known for this reader. Ask ' +
    'the reader which, never inferring it from the conversation, and call open_program again ' +
    'with "language". It is asked once per reader.',
  properties: {
    kind: { type: 'string', enum: ['edition'], description: 'What is asked.' },
    offered: {
      type: 'array',
      description: "The editions the track is published in, each with the track's own title in it.",
      items: {
        type: 'object',
        properties: { language: { type: 'string' }, title: { type: 'string' } },
        required: ['language', 'title'],
        additionalProperties: false,
      },
    },
    declined: {
      type: 'boolean',
      description: 'True when the reader was asked directly, through the host, and declined: ask in the conversation.',
    },
  },
  required: ['kind', 'offered', 'declined'],
  additionalProperties: false,
};
const PROGRAM = {
  type: 'object',
  properties: {
    track: { type: 'string', description: 'The track it is in.' },
    id: { type: 'string', description: 'What open_program\'s "unit" names.' },
    title: { type: 'string', description: 'In the edition the list is in.' },
    total: { type: 'integer', minimum: 1, description: 'How many steps it has.' },
    open: {
      type: 'boolean',
      description: 'Whether the reader can open it now. Programs open in order.',
    },
    place: {
      type: ['integer', 'null'],
      description: 'The furthest step the reader has reached in it, or null for none. Equal to total when finished.',
    },
    after: { type: 'string', description: 'On a shut program: the program before it. ONE step of that one opens it.' },
  },
  required: ['track', 'id', 'title', 'total', 'open', 'place'],
  additionalProperties: false,
};

/** A tool that shows a step: the step, or why none moved, with what else that tool can say. */
const stepResult = (also: Readonly<Record<string, unknown>>): Record<string, unknown> => ({
  type: 'object',
  properties: { text: TEXT, step: STEP, ...also, refusal: REFUSAL, placeIsEphemeral: PLACE_IS_EPHEMERAL },
  required: ['text'],
  additionalProperties: false,
});

export const TOOLS: readonly ToolDefinition[] = [
  {
    name: 'list_programs',
    title: 'List the programs available',
    description:
      'The tracks this server carries and the editions they are published in, and in each, ' +
      'by title: every program the reader has a place in and how far they have got, every ' +
      'one open to them now, and the one that opens next. Programs open in order, so the ' +
      'rest are shut, and each run of them is folded into one line. Titles are in one ' +
      'edition: the reader\'s, or English until they have one. Call this first when the ' +
      'reader has not named a program, and to see what is open before offering one.',
    inputSchema: {
      type: 'object',
      properties: {
        all: {
          type: 'boolean',
          description:
            'Name every program, the shut ones too, instead of folding each run of shut ' +
            'programs into one line. For when the reader asks what the whole book covers.',
        },
        language: {
          type: 'string',
          description: 'The edition to give the titles in, e.g. "pl". Leave it out for the reader\'s own.',
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        text: TEXT,
        programs: {
          type: 'array',
          description:
            "Every program the text names, in the book's order: those the reader has a place " +
            'in, those open now and the one that opens next. A run of shut programs after that ' +
            'is folded, as in the text, unless the call said "all": true.',
          items: PROGRAM,
        },
        folded: {
          type: 'boolean',
          description: 'True when a run of shut programs was left out of "programs"; "all": true names them.',
        },
        placeIsEphemeral: PLACE_IS_EPHEMERAL,
      },
      required: ['text', 'programs', 'folded'],
      additionalProperties: false,
    },
    annotations: READS,
  },
  {
    name: 'open_program',
    title: 'Open or resume a program',
    description:
      'Start a program, or resume it where the reader left off, and return the step they ' +
      'are on. Show that step to the reader and let them answer it. This does not move ' +
      'them forward — only submit_answer does.\n\n' +
      'PROGRAMS OPEN IN ORDER: a program is shut until the reader has a place in the one ' +
      'before it, and one step of that one is enough. A shut program is refused here, in ' +
      'plain words, naming the program to open instead — that is the reading order rather ' +
      'than an error, and it is what the reader should be told.',
    inputSchema: {
      type: 'object',
      properties: {
        track: TRACK,
        unit: UNIT,
        language: {
          type: 'string',
          description:
            'The edition to read, e.g. "en" or "pl". Usually left out: a program resumes in ' +
            'the edition it was read in, and a program opened for the first time starts in ' +
            'the edition the reader already reads in. Only when no edition is known for the ' +
            'reader at all does open_program ask for one, in an ordinary result — then ask ' +
            'the reader rather than inferring it from the language they happen to be chatting ' +
            'in, and pass what they chose. Give a different one to switch editions, which ' +
            'keeps their place.',
        },
      },
      required: ['unit'],
      additionalProperties: false,
    },
    outputSchema: stepResult({ finished: FINISHED, question: QUESTION }),
    annotations: MOVES,
  },
  {
    name: 'current_step',
    title: 'Re-read the current step',
    description:
      'The step the reader is on, again, without moving. Use this to re-show a step rather ' +
      'than reconstructing it from earlier in the conversation, which drifts.',
    inputSchema: {
      type: 'object',
      properties: { track: TRACK, unit: UNIT },
      required: ['unit'],
      additionalProperties: false,
    },
    outputSchema: stepResult({}),
    annotations: READS,
  },
  {
    name: 'submit_answer',
    title: "Submit the reader's answer and receive the next step",
    description:
      "Record the reader's answer to the current step and return the next one. The next " +
      "step OPENS WITH THE BOOK'S ANSWER to the step just answered, which is how the " +
      'reader checks themselves — so this is the only tool that moves forward, and it is ' +
      'the point at which the answer becomes available.\n\n' +
      ANSWER_CONTRACT,
    inputSchema: {
      type: 'object',
      properties: {
        track: TRACK,
        unit: UNIT,
        step: {
          type: 'integer',
          minimum: 1,
          description:
            'The step being answered — the number on the step that was shown, which its ' +
            'result also carries as step.step. A submit for a step the reader is no longer on ' +
            'is refused and the current step returned, so a call that is retried never moves ' +
            'them twice.',
        },
        answer: {
          type: 'string',
          description:
            "The reader's own answer, verbatim. Free text, any language, any format. Not " +
            'composed or corrected by the assistant. Ask the reader if they have not given ' +
            'one. On a step that asks nothing — it says so — leave this out.',
        },
      },
      required: ['unit', 'step'],
      additionalProperties: false,
    },
    outputSchema: stepResult({ finished: FINISHED }),
    annotations: MOVES,
  },
  {
    name: 'review_step',
    title: 'Re-read an earlier step',
    description:
      'An earlier step of a program the reader has already worked through. Refused for any ' +
      'step beyond the furthest they have reached — that is the method, not a fault.',
    inputSchema: {
      type: 'object',
      properties: {
        track: TRACK,
        unit: UNIT,
        step: { type: 'integer', minimum: 1, description: 'The step number to re-read.' },
      },
      required: ['unit', 'step'],
      additionalProperties: false,
    },
    outputSchema: stepResult({}),
    annotations: READS,
  },
];

/** A step as data — `STEP` above, and `stepData()` below builds it. */
export interface StepData {
  readonly track: string;
  readonly unit: string;
  readonly step: number;
  readonly total: number;
  readonly asks: boolean;
  readonly language: string;
  readonly answersStep?: number;
}

/**
 * Why nothing moved, as data — `REFUSAL` above. The gate's own refusals travel as they are,
 * all but `no-such-step`, which is an error and so carries no data; the other two are this
 * file's, both from `submit_answer`.
 */
export type RefusalData =
  | Exclude<Refusal, { readonly kind: 'no-such-step' }>
  | { readonly kind: 'already-answered'; readonly requested: number }
  | { readonly kind: 'declined' };

/** A program finished, as data — `FINISHED` above; `completion()` is its words. */
export interface FinishedData {
  readonly unit: string;
  readonly total: number;
  readonly next?: { readonly unit: string; readonly title: string };
}

/** The edition question, as data — `QUESTION` above; `editionQuestion()` is its words. */
export interface EditionQuestionData {
  readonly kind: 'edition';
  readonly offered: readonly EditionOffered[];
  readonly declined: boolean;
}

/** One program of the list, as data — `PROGRAM` above; `programLine()` is its words. */
export interface ProgramData {
  readonly track: string;
  readonly id: string;
  readonly title: string;
  readonly total: number;
  readonly open: boolean;
  readonly place: number | null;
  readonly after?: string;
}

/**
 * A result as data: the `structuredContent` each tool's `outputSchema` describes. Which of
 * the optional members a tool can send is that schema's to say.
 */
export type Structured = {
  readonly text: string;
  readonly step?: StepData;
  readonly finished?: FinishedData;
  readonly question?: EditionQuestionData;
  readonly refusal?: RefusalData;
  readonly programs?: readonly ProgramData[];
  readonly folded?: boolean;
  readonly placeIsEphemeral?: true;
};

/**
 * What a call answers: its words, and — unless it is an error — the same result as data.
 * An error's text is the whole of it: it says what to fix, and with no structured half every
 * host forwards it as it always has.
 */
export type ToolResult =
  | { readonly text: string; readonly isError: true; readonly structured?: undefined }
  | { readonly text: string; readonly isError?: undefined; readonly structured: Structured };

/** An error: its words, and nothing else. */
type Failed = { readonly text: string; readonly isError: true };

/**
 * A result as the handlers build it: its words, and its data less the two members
 * `handle()` adds to every result alike — the words themselves, and the in-memory flag.
 */
type Built =
  | Failed
  | {
      readonly text: string;
      readonly isError?: undefined;
      /**
       * The edition its words to the reader are in (#167), which the in-memory note is said
       * in too. Absent from a result that speaks no edition: the edition question, asked
       * because no edition is known, and a list with no track to title.
       */
      readonly language?: string;
      readonly data: Omit<Structured, 'text' | 'placeIsEphemeral'>;
    };

/** Bad input: a track, a program, an edition or a step number that names nothing. */
const problem = (text: string): Failed => ({ text, isError: true });

/**
 * THE GATE'S OWN VOICE, WHICH IS NOT AN ERROR'S.
 *
 * `reveal.ts` says it in as many words — "`not-reached` is the gate doing its job and is
 * NOT an error … or a model will report the refusal as a fault and the reader will think
 * the server is broken" — and the first version of this file then sent every refusal with
 * `isError: true` anyway. A host paints that red; a model apologises for it; a reader who
 * has just finished a program was told the server had failed. So a refusal that is the
 * method working is an ordinary result carrying its sentence, and `isError` is kept for
 * what it means: an argument that names nothing.
 *
 * Its kind travels as data (#164), and the step the reader is on with it when the text
 * shows that step.
 */
const refused = (text: string, refusal: RefusalData, language: string, step?: StepData): Built => ({
  text,
  language,
  data: { ...(step ? { step } : {}), refusal },
});

/** The gate's refusal in the reader's edition (#167); `explain()` is where its sentences are chosen. */
function refusalResult(refusal: Refusal, language: string): Built {
  const said = explain(refusal, language);
  return refusal.kind === 'no-such-step' ? problem(said) : refused(said, refusal, language);
}

/**
 * What a reader is told when the place is kept in memory — IN THE RESULT, where they can
 * read it. `server.ts` says the same on stderr, which no reader of an MCP host ever sees;
 * finding out by losing one's place is the worst available way to be told (P8).
 *
 * ONCE PER SESSION IN THE TEXT, AND ON EVERY RESULT AS DATA (#164). It used to end every
 * `list_programs` and `open_program` result, so a reader who checked the list and opened a
 * program read it at each, and again at every re-check of the list. It now ends the first
 * result of a session that is not an error, and every result carries `placeIsEphemeral` in
 * its structured half — the fact, for whatever reads the data, without the sentence again.
 * `handle()` decides which; `Session` is what it remembers.
 *
 * IN THE EDITION OF THE RESULT IT ENDS (#167). The words are `framing.ts`'s: the note is
 * addressed to the reader, so a Polish step is not followed by an English sentence about
 * the reader's own place.
 */
export const ephemeralNote = (language: string): string => framingFor(language).placeIsEphemeral;

/**
 * What a reader is told when the deployment has no book, and what fixes it — which depends
 * on WHY there is none, so it is built from what the loader found rather than fixed.
 *
 * The first version was one constant for every case: the bundle "is not on this machine",
 * run the fetch script. Started from `/` by a host, the server said that with the bundle
 * sitting in the checkout, and sent whoever ran it to a script that could not help (#136).
 * The loader now looks in this checkout whatever the working directory (`content.ts`'s
 * `WEB_DIR`), which leaves three cases, and each has its own fix:
 *
 * - NEVER FETCHED into this checkout: the fetch script, run from the root named here —
 *   a host's working directory says nothing about which checkout the server is in.
 * - FETCHED, BUT NOT WHERE THIS PROCESS WAS TOLD TO LOOK: `AB_OVO_CONTENT_BUNDLE` names a
 *   file that is not there. The variable is the fix, not the script.
 * - FOUND AND REFUSED: a bundle that does not validate is not missing, and saying so
 *   would send somebody looking for a file they can see.
 *
 * Every path tried is named, because that is the one thing whoever runs the server can
 * check for themselves.
 *
 * ENGLISH IN EVERY EDITION, unlike the note below (#167). Every sentence of it is for
 * whoever runs the server, whose fix is a script, a variable or a path in an English-only
 * repository — and with no book there is no edition to speak: the editions are the book's.
 */
export function noContentNote(missing: ContentUnavailable): string {
  const fetch =
    `run \`bash scripts/fetch-book-content.sh\` once, from ${REPOSITORY_ROOT}, and start the ` +
    'server again';

  if (missing.checked === undefined) {
    return (
      'This server found its book and cannot load it: the compiled content bundle is on ' +
      'disk and does not validate, and a book is served whole or not at all. Whoever runs ' +
      `the server should ${fetch}; the script compiles the bundle again at the revision this ` +
      `checkout pins.\n\n${missing.message}`
    );
  }

  const looked = missing.checked.map((path) => `  ${path}`).join('\n');
  if (missing.override !== undefined) {
    return (
      `This server has no book to serve: ${CONTENT_BUNDLE_VARIABLE} says the compiled content ` +
      `bundle is at ${missing.override}, and there is no file there. The book may well be on ` +
      `this machine, just not where this process was told to look. It looked at:\n${looked}\n` +
      `Whoever runs the server should set ${CONTENT_BUNDLE_VARIABLE} to the path of the ` +
      `bundle.json file itself, or remove it and ${fetch}.`
    );
  }

  return (
    'This server has no book to serve: the compiled content bundle has never been fetched ' +
    `into the checkout it runs from. It looked at:\n${looked}\n` +
    `Whoever runs the server should ${fetch}. A book compiled somewhere else can be named ` +
    `instead: set ${CONTENT_BUNDLE_VARIABLE} to its bundle.json in the environment the host ` +
    'starts this server with.'
  );
}

/**
 * What a reader is told when their place could not be reached — a result they can read,
 * where there used to be a JSON-RPC error they could not (#137).
 *
 * Two things, in the order a reader needs them. First that NOTHING IS LOST: the place is
 * the account's, and a failed read did not move it. A failed WRITE may or may not have been
 * committed — a 5xx or a dropped connection can follow the commit — so the note does not
 * claim either; what it can say is that making the same call again is safe, because
 * `open_program` writes the same place twice and `submit_answer` names its step. Then what
 * fixes it, which is different for each
 * `PlaceProblem`: a fresh token, a moment's wait, or a look at the address. The model gets
 * the same sentence and so has something true to relay instead of `fetch failed`.
 *
 * `isError`, unlike the gate's refusals: this is not the book working, it is a call that
 * did not do what it was asked.
 *
 * WHAT THE READER IS TOLD FOLLOWS THEIR EDITION; WHAT FIXES THE DEPLOYMENT DOES NOT (#167).
 * That nothing is lost, that a failed write is safe to repeat, and to try again shortly
 * are the reader's, and are `framing.ts`'s. A fresh token and a corrected address are for
 * whoever runs the server, and stay English with the variables they name. The edition is
 * `handle()`'s to choose, because the place that says which edition the reader reads in is
 * the thing that could not be reached.
 */
export function placeUnavailableNote(failure: PlaceUnavailable, language: string = FALLBACK_LANGUAGE): string {
  const framing = framingFor(language);
  const status = failure.status === undefined ? '' : ` (HTTP ${failure.status})`;
  const kept = framing.placeUnreachable + (failure.writing ? ` ${framing.placeMaybeRecorded}` : '');

  switch (failure.reason) {
    case 'unauthorised':
      return (
        `${kept}\n\nThe service that keeps it would not let this server in${status}: the reader ` +
        'token it was started with has expired or is not valid. Whoever runs the server should ' +
        'give it a fresh AB_OVO_READER_TOKEN and start it again; trying again before that will ' +
        'not help.'
      );
    case 'unreachable':
      return `${kept}\n\n${framing.placeOutOfReach(status)}`;
    case 'refused':
      // No status is the one `refused` where nothing was asked: the address itself is not one.
      return failure.status === undefined
        ? `${kept}\n\nAB_OVO_API_URL is not an http or https address, so nothing was asked of ` +
            'the service that keeps it. Whoever runs the server should set AB_OVO_API_URL to the ab-ovo API\'s ' +
            'address and start it again; trying again will not change the answer.'
        : `${kept}\n\nWhat answered at AB_OVO_API_URL refused the request${status}, or answered ` +
            'with something that is not a place. Whoever runs the server should check that ' +
            'AB_OVO_API_URL names the ab-ovo API; trying again will not change the answer.';
  }
}

/**
 * Where a step is: `P01 · How a computer stores a number › Scientific notation · step 5 of 48`,
 * and in the Polish edition `… · ramka 5 z 48` (#167).
 *
 * What the reading surface's top bar and pager say, one transport over — the program's id
 * and title, the section the step is under, the position; the surface said it in one place
 * row until ADR-0063 split it between the two bars. The first version of this file printed
 * `## Step 5 of 48` and nothing else, so a reader thirty steps in had a number and no
 * name, and a reader choosing a program in `list_programs` had forty-seven ids to choose
 * among. The title lives in the bundle; it was never emitted.
 */
export function placeLine(unit: Unit, step: Step, language: string): string {
  const section = unit.sections?.find((candidate) => candidate.id === step.section);
  const where = section ? ` › ${say(section.titles, language)}` : '';
  return `${unit.id} · ${say(unit.titles, language)}${where} · ${framingFor(language).position(step.n, unit.steps.length)}`;
}

/**
 * Render one step for a reader, in their edition — the book's words and the server's alike.
 *
 * Everything here is the reader's, so every sentence around the step is `framing.ts`'s and
 * follows the edition the step is in (#167). Until then only the step did, and a Polish
 * step arrived between English banners that the host's model translated, against the
 * instruction to show a step as it is served.
 */
export function render(unit: Unit, step: Step, language: string): string {
  const framing = framingFor(language);
  const parts: string[] = [`## ${placeLine(unit, step, language)}`];

  if (step.answer) {
    parts.push(
      `--- ${framing.bookAnswer(step.n - 1)} ---\n${say(step.answer, language)}\n--- ${framing.compare} ---`,
    );
  }

  const title = step.titles ? say(step.titles, language) : undefined;
  parts.push(`${title ? `**${title}**\n\n` : ''}${say(step.body, language)}`);

  if (step.check) parts.push(framing.exercise(step.check.lab, step.check.exercise));

  /*
    Reader-facing, and so naming no tool. The first version told the reader the next step
    "arrives through submit_answer", which is a sentence for the assistant; the assistant
    has the tool's own description for that. What the reader needs is the method's one
    instruction, or to know that this step asks nothing of them.
  */
  parts.push(step.cue ? framing.asks : framing.asksNothing);

  return parts.join('\n\n');
}

/**
 * `render()`'s twin: the same step as data (#164), which is what an agent used to read out
 * of the place line and the closing sentence.
 *
 * NOTHING HERE IS READ FROM THE STEP'S WORDS, and least of all from `step.answer`, of which
 * only the fact of it is used. The answer to step k is still where the gate put it — in the
 * words of step k + 1, which `render()` writes — and `answersStep` says only that this step
 * opens with it, which the banner above says too.
 */
export function stepData(track: string, unit: Unit, step: Step, language: string): StepData {
  return {
    track,
    unit: unit.id,
    step: step.n,
    total: unit.steps.length,
    asks: step.cue === true,
    language,
    ...(step.answer ? { answersStep: step.n - 1 } : {}),
  };
}

/** One step shown: its words and its data, from the one `Step`, so the two cannot name different steps. */
function show(
  track: string,
  unit: Unit,
  step: Step,
  language: string,
): { readonly text: string; readonly step: StepData } {
  return { text: render(unit, step, language), step: stepData(track, unit, step, language) };
}

/**
 * THE HAND-OFF, when a program is finished — the reading surface's `/summary`, one
 * transport over.
 *
 * The first version ended a program on an error: the last `submit_answer` was refused as
 * `program-complete`, with `isError` set, and a reader who had just worked forty-eight
 * steps was told the server had failed and given nowhere to go. The web ends a program on
 * a screen: the book's own Summary, its *Can you?* list, and the next program. This is
 * that screen.
 *
 * ONLY THE ROUTES' LABELS, NEVER `route.answer`. A Summary item paraphrases what a run of
 * frames concluded — the book's own rule is that a label may name the skill and may not
 * carry the finding — and the quiz's `answer` is an answer, which the leak walk in
 * `tools.test.ts` asserts is never emitted at any cursor, this block included.
 *
 * IN THE READER'S EDITION, EXCEPT THE CALLS (#167). The heading, the Summary, *Can you?*
 * and the next program's name are the reader's, and `framing.ts`'s; the `open_program` call
 * that opens the next program and the pointer to `list_programs` tell the model what to do,
 * and stay English after the reader's sentence they follow.
 */
export function completion(unit: Unit, language: string, next: Unit | undefined): string {
  const framing = framingFor(language);
  const routes = unit.routes ?? [];
  const summary = routes.filter((route) => route.kind === 'summary');
  const outcomes = routes.filter((route) => route.kind === 'outcome');
  const item = (route: { labels?: Text; from: number; to: number }): string =>
    `- ${route.labels ? say(route.labels, language) : ''} (${framing.range(route.from, route.to)})`;

  const parts: string[] = [
    `## ${unit.id} · ${say(unit.titles, language)} · ${framing.finished(framing.steps(unit.steps.length))}`,
  ];
  if (summary.length > 0) parts.push(`${framing.summary}\n${summary.map(item).join('\n')}`);
  if (outcomes.length > 0) parts.push(`${framing.canYou}\n${outcomes.map(item).join('\n')}`);
  parts.push(
    next
      ? `${framing.nextProgram(next.id, say(next.titles, language))} To open it, call open_program with unit "${next.id}" (edition "${language}").`
      : `${framing.lastProgram} list_programs shows them all.`,
  );
  return parts.join('\n\n');
}

/**
 * The hand-off shown: `completion()`'s words and the same as data (#164). The data names the
 * program and the next one and nothing of the Summary, whose labels are for the reader.
 */
function handOff(
  unit: Unit,
  language: string,
  next: Unit | undefined,
): { readonly text: string; readonly finished: FinishedData } {
  return {
    text: completion(unit, language, next),
    finished: {
      unit: unit.id,
      total: unit.steps.length,
      ...(next ? { next: { unit: next.id, title: say(next.titles, language) } } : {}),
    },
  };
}

/**
 * THE ONE QUESTION `open_program` ASKS, AS AN ORDINARY RESULT.
 *
 * Asked only when no edition is known for this reader at all, which is once: the answer
 * becomes a place, and every program after it starts in the edition that place is in. So
 * it is not an error — nothing was wrong with the call, the reader simply has not said yet
 * — and a result flagged as one is painted red by a host and apologised for by a model.
 * `isError` stays for an edition the track does not have, which names nothing.
 *
 * English, and not only because it tells the assistant what to ask (#167): it is asked
 * because no edition is known, so there is none to say it in. Each edition is offered by
 * the track's own title in it, which is the part the reader reads.
 */
function editionQuestion(unit: Unit, editions: readonly EditionOffered[], declined: boolean): string {
  const choices = editions.map((edition) => `"${edition.language}" (${edition.title})`);
  const list =
    choices.length > 1 ? `${choices.slice(0, -1).join(', ')} or ${choices.at(-1)}` : (choices[0] ?? 'none');
  return (
    (declined
      ? `Nothing opened: the reader was asked directly which edition to read "${unit.id}" in, and ` +
        'declined or cancelled. Ask them in the conversation instead: '
      : `"${unit.id}" needs an edition, and none is known for this reader yet. Ask them which ` +
        'to read: ') +
    `${list}. Do not infer it from the language the conversation is in. Then call ` +
    'open_program again with "language". It is asked once: every program they open after ' +
    'this one starts in the same edition.'
  );
}

/**
 * Where a program stands for this reader, as `list_programs` needs it: with a place, open,
 * shut and NEXT (the program before it is open, so one step there opens this one), or shut
 * BEHIND another shut program — the ones a list can fold, because nothing the reader does
 * today opens them.
 */
type Door =
  | { readonly kind: 'placed'; readonly cursor: Cursor }
  | { readonly kind: 'open' }
  | { readonly kind: 'next'; readonly after: string }
  | { readonly kind: 'behind'; readonly after: string };

/**
 * Every program's door, in the manifest's order, asked of the places already in hand.
 *
 * `isOpenWhere` is the shared rule (`@ab-ovo/web-kit`'s `gate.ts`) and `shutBehind` is the
 * same question over the cursor store; this is the third caller, and it reads the list
 * `readAll()` already fetched rather than fetching again. Whether a shut program is next or
 * behind is a question about the program before it, which the manifest's order has already
 * answered by the time it is asked.
 */
function doorsOf(
  bundle: Bundle,
  placeOf: (track: string, unit: string) => Cursor | undefined,
): ReadonlyMap<string, Door> {
  const doors = new Map<string, Door>();
  for (const program of bundle.units) {
    const cursor = placeOf(bundle.track.id, program.id);
    const previous = unitBefore(bundle, program.id);
    const shut =
      previous !== undefined &&
      !isOpenWhere((asked) => placeOf(bundle.track.id, asked) !== undefined, {
        unit: program.id,
        previous: previous.id,
      });
    const before = previous ? doors.get(previous.id) : undefined;
    doors.set(
      program.id,
      cursor
        ? { kind: 'placed', cursor }
        : !shut || !previous
          ? { kind: 'open' }
          : before?.kind === 'next' || before?.kind === 'behind'
            ? { kind: 'behind', after: previous.id }
            : { kind: 'next', after: previous.id },
    );
  }
  return doors;
}

/** One program's line: its id, its title in the listing's edition, its length, and its door. */
function programLine(program: Unit, door: Door, edition: string): string {
  const total = program.steps.length;
  /*
    A place on the last step is "finished": no last step of this book asks anything
    (measured on the pinned bundle), so reaching it is reaching the end, and the hand-off
    is what open_program returns there.
  */
  const where =
    door.kind === 'placed'
      ? door.cursor.step === total
        ? `finished (${total} steps)`
        : `at step ${door.cursor.step} of ${total}`
      : door.kind === 'open'
        ? 'open to the reader now'
        : `SHUT, opens after ${door.after}`;
  return `${program.id} · ${say(program.titles, edition)} — ${total} steps — ${where}`;
}

/** `programLine()`'s twin: the same program and door as data (#164). */
function programData(track: string, program: Unit, door: Door, edition: string): ProgramData {
  return {
    track,
    id: program.id,
    title: say(program.titles, edition),
    total: program.steps.length,
    open: door.kind === 'placed' || door.kind === 'open',
    place: door.kind === 'placed' ? door.cursor.step : null,
    ...(door.kind === 'next' || door.kind === 'behind' ? { after: door.after } : {}),
  };
}

/**
 * The edition `list_programs` gives titles in when none is named: the reader's, if the
 * track has it; else English, the website's default (ADR-0052); else the track's first.
 */
function listingEdition(bundle: Bundle, reader: string | undefined): string {
  return (
    (reader !== undefined ? languageIn(bundle, reader) : undefined) ??
    languageIn(bundle, 'en') ??
    bundle.track.languages[0] ??
    'en'
  );
}

/**
 * The edition a shut program is refused in (#167). No place in the program can say it — a
 * program with a place is open by that fact alone (`gate.ts`'s valve) — so it is the one
 * the call named, if the track has it, else the one `list_programs` titles in for this
 * reader. Asked only once the refusal is certain, so an open program pays no read for it.
 */
async function refusalEdition(deps: Deps, bundle: Bundle | undefined, asked: string | undefined): Promise<string> {
  const named = asked !== undefined && bundle ? languageIn(bundle, asked) : undefined;
  if (named) return named;
  return bundle ? listingEdition(bundle, await deps.cursors.edition()) : FALLBACK_LANGUAGE;
}

/**
 * The track a call means when it names none: the only one, if there is only one.
 *
 * Every call used to require the track id, and a server that carries one track was making
 * the model carry `math-for-ai-engineers` through every turn for nothing. A server with
 * several still asks.
 */
function soleTrack(bundles: BundleSource): string | Built {
  const all = bundles.all();
  const only = all.length === 1 ? all[0] : undefined;
  if (only) return only.track.id;
  return problem(
    `This server carries ${all.length === 0 ? 'no tracks' : 'several tracks'}; name one with "track"` +
      (all.length > 1 ? `: ${all.map((bundle) => bundle.track.id).join(', ')}.` : '.'),
  );
}

interface Located {
  readonly track: string;
  readonly unit: Unit;
}

/**
 * The program after this one, by ADJACENCY in `bundle.units` — the order the book's own
 * manifest declares — and never by adding one to a parsed id: the book renumbered its own
 * main sequence once already when P07 was inserted (program-contents.tsx records it).
 */
function nextUnit(bundle: Bundle | undefined, unit: Unit): Unit | undefined {
  if (!bundle) return undefined;
  const index = bundle.units.findIndex((candidate) => candidate.id === unit.id);
  return index >= 0 ? bundle.units[index + 1] : undefined;
}

/**
 * Resolve a call's track and program. The program id is matched in any case — a reader
 * says "p01" — and what comes back is the bundle's own spelling, which is what the cursor
 * is filed under: a place keyed by "p01" would be a second place for P01.
 */
function locate(bundles: BundleSource, track: string, unit: string): Located | Built {
  const resolvedTrack = track === '' ? soleTrack(bundles) : track;
  if (isResult(resolvedTrack)) return resolvedTrack;

  if (!isIdentifier(resolvedTrack)) {
    return problem(`"${resolvedTrack}" is not a track id: letters, digits, dot, dash or underscore. Try list_programs.`);
  }
  if (!isIdentifier(unit)) {
    return problem(`"${unit}" is not a program id: letters, digits, dot, dash or underscore. Try list_programs.`);
  }

  const bundle = bundles.for(resolvedTrack);
  if (!bundle) return problem(`This server does not carry the track "${resolvedTrack}". Try list_programs.`);

  const found =
    unitIn(bundle, unit) ??
    bundle.units.find((candidate) => candidate.id.toLowerCase() === unit.toLowerCase());
  if (!found) return problem(`The track "${resolvedTrack}" has no program "${unit}". Try list_programs.`);

  return { track: resolvedTrack, unit: found };
}

const isResult = (value: unknown): value is Built =>
  typeof value === 'object' && value !== null && 'text' in value;

/**
 * THE READING ORDER, ASKED OF THE READER'S OWN RECORD — the second gate every call passes.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THIS SERVER USED TO HAVE NO SUCH GATE, WHICH MADE THE TWO SURFACES DISAGREE ABOUT ONE
 * READER.
 *
 * ADR-0051 shuts a program until the reader has a place in the one before it, and until
 * now that rule was the website's alone: `open_program` would start F02 for a reader the
 * index would have refused, both reading the SAME `ReaderProgress` row (`cursor.ts` — "a
 * second table keyed by reader would be a second answer to where is this person"). A reader
 * could be inside a program in one window that the other window says does not open yet, and
 * nothing in either could explain it.
 *
 * THE RULE IS NOT RESTATED HERE. `isOpenWhere` (`@ab-ovo/web-kit`'s `gate.ts`) is the one
 * copy, shared with the reading surface for the reason `unitBefore` gives one door down.
 * What is here is this transport's half: which two places to fetch, and the refusal.
 *
 * TWO READS AT MOST, and never a scan: the rule asks about this program and the one before
 * it and about nothing else, so the places are fetched by name. A `readAll()` here would be
 * forty-seven rows fetched to answer a question about two.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * `undefined` MEANS OPEN, and it is also the honest answer for a program with nothing
 * before it: `unitBefore` returns `undefined` both for the first program of a track and for
 * a unit the bundle does not carry, and `gate.ts` takes both to mean "nothing here precedes
 * it" — a program the book does not list is not a program a reader can be sent back from.
 */
async function shutBehind(
  cursors: CursorStore,
  bundle: Bundle | undefined,
  track: string,
  unit: Unit,
  /** The place in THIS program, already fetched by the caller — never fetched twice. */
  here: Cursor | undefined,
): Promise<Refusal | undefined> {
  const previous = bundle ? unitBefore(bundle, unit.id) : undefined;
  if (!previous) return undefined;

  // Asked only when the answer can still matter: a reader who is already inside this
  // program opens it by that fact alone (the valve in `gate.ts`), and fetching the
  // program before it would be a round trip whose answer is discarded.
  const before = here ? undefined : await cursors.read(track, previous.id);

  const open = isOpenWhere(
    (asked) => (asked === unit.id ? here !== undefined : before !== undefined),
    { unit: unit.id, previous: previous.id },
  );

  return open ? undefined : { kind: 'not-open', unit: unit.id, after: previous.id };
}

/**
 * What came back from asking the reader directly, through the host's own UI rather than
 * through the model's text. `unavailable` covers both "this host does not support
 * elicitation" and "it claimed to and the call failed anyway" — `submit_answer` treats the
 * two identically, by falling back to the argument the model supplied, so a transport hiccup
 * degrades to today's behaviour rather than failing the call.
 */
export type ElicitOutcome =
  | { readonly kind: 'confirmed'; readonly answer: string }
  | { readonly kind: 'declined' }
  | { readonly kind: 'unavailable' };

/** An edition a track is published in, with the track's own title in it — what a reader picks by. */
export interface EditionOffered {
  readonly language: string;
  readonly title: string;
}

/**
 * What came back from asking the reader which edition to read, through the host's own UI.
 * `unavailable` is `ElicitOutcome`'s: no support, or a call that failed anyway — and
 * `open_program` then asks in its result, exactly as it does on a host with no elicitation.
 */
export type EditionOutcome =
  | { readonly kind: 'chosen'; readonly language: string }
  | { readonly kind: 'declined' }
  | { readonly kind: 'unavailable' };

/**
 * What one MCP session has said already. `server.ts` makes one per server, which over stdio
 * is one per connection; it remembers whether the reader has been told `ephemeralNote()`
 * yet, and which edition it last spoke to them in.
 */
export interface Session {
  ephemeralNoteSaid: boolean;
  /**
   * The edition of the last result that spoke one (#167). When the reader's place cannot be
   * reached — the place being where an edition is otherwise read from — `handle()` says
   * `placeUnavailableNote()` in the edition the call named if the track has it, else in this
   * one (`unreachableEdition()`). Nothing else reads it.
   */
  spokenIn?: string;
}

export interface Deps {
  readonly cursors: CursorStore;
  /** Injected so the unit tier runs against the committed fixture, never through bundleFor(). */
  readonly bundles: BundleSource;
  /**
   * True when the place is kept in this process's memory and forgotten at restart — the
   * store `server.ts` falls back to with no API to talk to. The first result of the session
   * that is not an error then says so, and every result carries it as data; a reader is told
   * in the channel they can read.
   */
  readonly placeIsEphemeral?: boolean;
  /**
   * What this session has said already. Absent, every call is a session of its own and every
   * result that is not an error says the note: told too often, never too late.
   */
  readonly session?: Session;
  /**
   * Ask the reader to confirm or correct a step's answer directly, through the host's UI,
   * bypassing the model — MCP elicitation. Absent on a host that does not support it, which
   * `submit_answer` treats exactly like an `unavailable` outcome: trust the argument, as
   * before. Never called for a step with no cue, because there is nothing to confirm.
   * `language` is the step's edition, which the form is written in (#167): a host shows it
   * to the reader with no model in between to translate it.
   */
  readonly elicit?: (step: number, proposed: string, language: string) => Promise<ElicitOutcome>;
  /**
   * Ask the reader which edition to read, through the host's UI, with the track's editions
   * as the only choices — the same MCP elicitation as `elicit`, and ADR-0054's reason for
   * it: the reader answers, not the model. Called only when no edition is known for the
   * reader at all, which is once; absent on a host that cannot, which asks in the result.
   */
  readonly chooseEdition?: (unit: string, offered: readonly EditionOffered[]) => Promise<EditionOutcome>;
}

/**
 * Answer one tool call. Two things are wrapped here, and they are the two a deployment can
 * get wrong under a reader who did nothing wrong: the content going missing — a bundle that
 * was never fetched throws out of the loader — and the reader's place going out of reach —
 * a token that expired, an API that is down. Each used to reach the host as a JSON-RPC
 * error carrying a developer's string. Each is a tool result now, with what fixes it.
 *
 * Anything else still throws, on purpose: an error this file cannot name is a defect in
 * this package, and a sentence would dress it up as the deployment's.
 *
 * A PLACE OUT OF REACH IS TOLD IN AN EDITION THE STORE DID NOT HAVE TO SAY (#167) —
 * `unreachableEdition()`'s. Asking the store which edition the reader reads in would be
 * asking the thing that has just failed.
 */
export async function handle(
  name: string,
  args: Record<string, unknown>,
  deps: Deps,
): Promise<ToolResult> {
  let built: Built;
  try {
    built = await dispatch(name, args, deps);
  } catch (error) {
    if (error instanceof ContentUnavailable) return problem(noContentNote(error));
    if (error instanceof PlaceUnavailable) return problem(placeUnavailableNote(error, unreachableEdition(args, deps)));
    throw error;
  }
  return delivered(built, deps);
}

/**
 * The edition a place out of reach is told in (#167): the one the call named, if a track the
 * call can mean is published in it; else the one this session last spoke in; else English.
 *
 * RESOLVED, NEVER TAKEN AS SENT. The SDK's low-level `Server` checks no argument against a
 * tool's schema, so `language` is whatever the host passed, and the first version handed it
 * to `placeUnavailableNote()` as it came: `constructor` threw out of `handle()` on the path
 * #137 exists to keep a result, and `PL`, or an edition the track does not have, was
 * honoured where every other call refuses it. So it passes `languageIn`, as an edition a
 * call names does everywhere else here — and `framingFor()` is total besides.
 *
 * THE BOOK IS ASKED, AND MAY BE MISSING TOO. A deployment can lose its book and its store at
 * once; the note owed is still the place's, and with no book no edition can be named, since
 * the editions are the book's.
 */
function unreachableEdition(args: Record<string, unknown>, deps: Deps): string {
  const asked = typeof args.language === 'string' && args.language !== '' ? args.language : undefined;
  let named: string | undefined;
  if (asked !== undefined) {
    let carried: readonly Bundle[] = [];
    try {
      carried = deps.bundles.all();
    } catch (error) {
      if (!(error instanceof ContentUnavailable)) throw error;
    }
    // The track the call names, or any this server carries when it names none (`list_programs`).
    const track = typeof args.track === 'string' && args.track !== '' ? args.track : undefined;
    const meant = track === undefined ? carried : carried.filter((bundle) => bundle.track.id === track);
    named = meant.map((bundle) => languageIn(bundle, asked)).find((edition) => edition !== undefined);
  }
  return named ?? deps.session?.spokenIn ?? FALLBACK_LANGUAGE;
}

/**
 * The last thing every result passes (#164): its words go into its data, and the in-memory
 * note is said — once per session in the words, on every result in the data.
 *
 * NOT ON AN ERROR. An error's text is the fix for the call, and it is the result a model is
 * likeliest to act on without relaying, by correcting its arguments and calling again; a
 * note spent there may never reach the reader. So the note goes on the first result that is
 * not an error, whichever tool gives it — and an error carries no data to flag it in.
 *
 * In the result's own edition (#167), and English on a result that speaks none; the session
 * keeps that edition for the error that is told in it, a place out of reach (`handle()`).
 */
function delivered(built: Built, deps: Deps): ToolResult {
  if (built.isError) return built;
  if (deps.session && built.language !== undefined) deps.session.spokenIn = built.language;
  const ephemeral = deps.placeIsEphemeral === true;
  const tell = ephemeral && deps.session?.ephemeralNoteSaid !== true;
  if (tell && deps.session) deps.session.ephemeralNoteSaid = true;
  const text = tell ? `${built.text}\n\n${ephemeralNote(built.language ?? FALLBACK_LANGUAGE)}` : built.text;
  return {
    text,
    structured: { text, ...built.data, ...(ephemeral ? { placeIsEphemeral: true as const } : {}) },
  };
}

async function dispatch(
  name: string,
  args: Record<string, unknown>,
  deps: Deps,
): Promise<Built> {
  const askedTrack = typeof args.track === 'string' ? args.track : '';
  const askedUnit = typeof args.unit === 'string' ? args.unit : '';

  if (name === 'list_programs') {
    const asked = typeof args.language === 'string' && args.language !== '' ? args.language : undefined;
    const every = args.all === true;
    const places = await deps.cursors.readAll();
    const placeOf = (track: string, unit: string): Cursor | undefined =>
      places.find((cursor) => cursor.track === track && cursor.unit === unit);
    const readerEdition = asked ? undefined : await deps.cursors.edition();

    const lines: string[] = [];
    const programs: ProgramData[] = [];
    const otherEditions = new Set<string>();
    let listedIn: string | undefined;
    let folded = false;
    for (const bundle of deps.bundles.all()) {
      /*
        ONE EDITION'S TITLES, NOT BOTH (#145). Every unopened program used to carry its
        title in every edition, which is most of what made a new reader's list about 7 KB.
        The reader's edition when one is known, English until then — the website's default
        (ADR-0052) — and any other on request, by `language`.
      */
      const edition = asked ? languageIn(bundle, asked) : listingEdition(bundle, readerEdition);
      if (!edition) {
        return problem(
          `The track "${bundle.track.id}" is not published in "${asked}". It has: ${bundle.track.languages.join(', ')}.`,
        );
      }
      listedIn = edition;
      for (const other of bundle.track.languages) if (other !== edition) otherEditions.add(other);

      lines.push(
        `Track "${bundle.track.id}" — ${say(bundle.track.titles, edition)} — editions: ` +
          `${bundle.track.languages.join(', ')} — content tag: ${bundle.tag}`,
      );
      /*
        THE RULE, ONCE PER TRACK, SO THE LIST BELOW CAN BE READ WITHOUT GUESSING.

        Every program used to end in `not opened`, whether the reader could open it or not,
        and a model reading that list had no way to know which of the forty-seven were
        actually available — so it would pick one, be refused, and tell the reader the
        server had failed. The state is now on each line and the rule is stated here rather
        than forty-seven times.
      */
      lines.push(
        '  Programs open in order: each is shut until the reader has a place in the one ' +
          'before it, and ONE step of that one is enough. open_program refuses a shut one and ' +
          'names what opens it — the reading order, not an error and not a permission.',
      );

      const doors = doorsOf(bundle, placeOf);
      /*
        Grouped where the book is — its parts, or the id prefix — by the same function the
        index uses, so the two surfaces never divide the book two ways. One group is a
        list, and gets no heading.

        A HEADING IS A TITLE, AND FOLLOWS THE TITLES' EDITION (#167). A part's title always
        did, being the book's; a prefix's name is the server's — the reading surface's
        `groupLabels`, from `framing.ts` — and was English over Polish titles. Nothing else
        in this list moved: its rule, its states and its notes are what the model reads to
        choose and offer a program, and they are addressed to it, `open_program` and all.
        A prefix with no name is listed without a heading.
      */
      const groupLabels = framingFor(edition).groupLabels;
      for (const group of groupsOf(bundle)) {
        const heading = group.part
          ? say(group.part.titles, edition)
          : group.prefix
            ? groupLabels[group.prefix]
            : undefined;
        if (heading) lines.push(`  ${heading}`);
        const indent = heading ? '    ' : '  ';
        // A program the text names is a program the data names, and no other (#164).
        const named = (program: Unit, door: Door): void => {
          lines.push(`${indent}${programLine(program, door, edition)}`);
          programs.push(programData(bundle.track.id, program, door, edition));
        };

        /*
          A RUN OF SHUT PROGRAMS IS ONE LINE (#145). Every program the reader can act on is
          named — the ones they have a place in, the ones open now, and the one that opens
          next — and what follows it, shut behind a program that is itself shut, is folded:
          the rule above already says how each of them opens, and saying it again per
          program was most of the rest of the 7 KB. `all` names them anyway. A run of one
          is simply its line, which is no longer than the fold.
        */
        let run: Unit[] = [];
        const fold = (): void => {
          const [first] = run;
          if (first && run.length === 1) {
            named(first, doors.get(first.id)!);
          } else if (first) {
            lines.push(
              `${indent}${first.id}–${run.at(-1)!.id} — ${run.length} programs, shut: each opens ` +
                'after the one before it',
            );
            folded = true;
          }
          run = [];
        };
        for (const program of group.units) {
          const door = doors.get(program.id)!;
          if (door.kind === 'behind' && !every) {
            run.push(program);
            continue;
          }
          fold();
          named(program, door);
        }
        fold();
      }
    }

    const notes: string[] = [];
    if (listedIn && otherEditions.size > 0) {
      notes.push(
        `Titles are in the "${listedIn}" edition; list_programs with "language" gives them in ` +
          `another (${[...otherEditions].join(', ')}).`,
      );
    }
    if (folded) notes.push('A folded run is shut; list_programs with "all": true names every program in it.');
    if (notes.length > 0) lines.push(notes.join(' '));

    return {
      text: lines.join('\n'),
      ...(listedIn !== undefined ? { language: listedIn } : {}),
      data: { programs, folded },
    };
  }

  const located = locate(deps.bundles, askedTrack, askedUnit);
  if (isResult(located)) return located;
  const { track, unit } = located;

  if (name === 'open_program') {
    const bundle = deps.bundles.for(track);
    const asked = typeof args.language === 'string' && args.language !== '' ? args.language : undefined;
    const existing = await deps.cursors.read(track, unit.id);

    /*
      BEFORE THE EDITION IS ASKED FOR, AND THAT ORDER IS THE POINT. A first opening needs an
      edition and the model is told to ask the reader for one; putting the gate after that
      would have the assistant ask "English or Polish?", wait for the answer, and only then
      say the program is not open — a question asked for nothing, in the reader's time.
    */
    const shut = await shutBehind(deps.cursors, bundle, track, unit, existing);
    if (shut) return refusalResult(shut, await refusalEdition(deps, bundle, asked));

    /*
      THE EDITION, ASKED ONCE PER READER AND NOT ONCE PER PROGRAM (#144): the one named, else
      the one this program was read in, else the one the READER reads in — and only when
      none of those is known, a question.

      A reader who resumes is not asked again — the first version required the argument on
      every call and then discarded it whenever a cursor existed, so the model asked a
      question whose answer went nowhere. The second version still asked at the first
      opening of EVERY program, so an agent put "English or Polish?" at the start of each of
      forty-seven, and with `isError` set, so the host painted an ordinary step of the
      conversation red — the mistake ADR-0056 had already corrected for refusals. The
      website keeps one edition per reader (ADR-0052); `CursorStore.edition()` reads the
      same record. A named edition the track does not have is still an error: it names
      nothing.
    */
    const offered = bundle?.track.languages ?? [];
    let language: string | undefined;
    let how: 'named' | 'kept' | 'remembered' | 'chosen';
    if (asked) {
      language = bundle ? languageIn(bundle, asked) : undefined;
      if (!language) return problem(`The track "${track}" is not published in "${asked}". It has: ${offered.join(', ')}.`);
      how = 'named';
    } else if (existing) {
      language = existing.language;
      how = 'kept';
    } else {
      const known = await deps.cursors.edition();
      language = known !== undefined && bundle ? languageIn(bundle, known) : undefined;
      how = 'remembered';
      if (!language) {
        const editions: readonly EditionOffered[] = bundle
          ? offered.map((edition) => ({ language: edition, title: say(bundle.track.titles, edition) }))
          : [];
        const outcome: EditionOutcome = deps.chooseEdition
          ? await deps.chooseEdition(unit.id, editions)
          : { kind: 'unavailable' };
        language = outcome.kind === 'chosen' && bundle ? languageIn(bundle, outcome.language) : undefined;
        how = 'chosen';
        if (!language) {
          const declined = outcome.kind === 'declined';
          return {
            text: editionQuestion(unit, editions, declined),
            data: { question: { kind: 'edition', offered: editions, declined } },
          };
        }
      }
    }

    const cursor: Cursor = existing ? { ...existing, language } : { track, unit: unit.id, language, step: FIRST_STEP };
    const saved = await deps.cursors.save(cursor);

    const served = current(unit, saved);
    if (!served.ok) return refusalResult(served.refusal, saved.language);

    /*
      THE MODEL'S LINE, AND ENGLISH IN EVERY EDITION (#167): what this call did — started,
      resumed, switched — told to the assistant, which then shows the step below it. The
      step, and the hand-off after it, are the reader's, and speak the edition they are in.
    */
    const opening = !existing
      ? how === 'remembered'
        ? `Starting "${unit.id}" in the "${saved.language}" edition, the one the reader already reads in. ` +
          'Naming another edition switches, at the same step.'
        : how === 'chosen'
          ? `Starting "${unit.id}" in the "${saved.language}" edition, chosen directly by the reader.`
          : `Starting "${unit.id}".`
      : existing.language !== saved.language
        ? `Resuming "${unit.id}" at step ${saved.step}, switched to the "${saved.language}" edition.`
        : `Resuming "${unit.id}" at step ${saved.step}.`;
    // On the last step the program is finished; the step is shown, and then where to next.
    const shown = show(track, unit, served.step, saved.language);
    const done = saved.step === unit.steps.length ? handOff(unit, saved.language, nextUnit(bundle, unit)) : undefined;
    return {
      text: `${opening}\n\n${shown.text}${done ? `\n\n${done.text}` : ''}`,
      language: saved.language,
      data: { step: shown.step, ...(done ? { finished: done.finished } : {}) },
    };
  }

  const cursor = await deps.cursors.read(track, unit.id);
  if (!cursor) {
    /*
      TWO REASONS FOR AN EMPTY PLACE, AND THEY ARE NOT THE SAME ANSWER. Either the reader
      simply has not started this program — open_program is the next call, and the model can
      make it — or the book will not let them start it yet, in which case "call open_program
      first" is advice that leads straight into a refusal. Asking the gate here is what keeps
      the model from taking a reader round that loop and then reporting a failure.
    */
    const bundle = deps.bundles.for(track);
    const shut = await shutBehind(deps.cursors, bundle, track, unit, undefined);
    if (shut) return refusalResult(shut, await refusalEdition(deps, bundle, undefined));
    return problem(`The reader has not opened "${unit.id}" yet. Call open_program first.`);
  }

  if (name === 'current_step') {
    const served = current(unit, cursor);
    if (!served.ok) return refusalResult(served.refusal, cursor.language);
    const shown = show(track, unit, served.step, cursor.language);
    return { text: shown.text, language: cursor.language, data: { step: shown.step } };
  }

  if (name === 'review_step') {
    const n = typeof args.step === 'number' ? args.step : Number.NaN;
    const served = serve(unit, cursor, n);
    if (!served.ok) return refusalResult(served.refusal, cursor.language);
    const shown = show(track, unit, served.step, cursor.language);
    return { text: shown.text, language: cursor.language, data: { step: shown.step } };
  }

  if (name === 'submit_answer') {
    /*
      THE STEP BEING ANSWERED, SO A RETRY CANNOT ADVANCE TWICE. A host that times out and
      calls again, or a model that calls twice, used to move the reader two steps: the
      skipped step's body was never shown while its answer arrived in the next step's
      banner. Naming the step makes the second call a no-op that hands back where the
      reader actually is.
    */
    const answering = typeof args.step === 'number' ? args.step : Number.NaN;
    if (!Number.isInteger(answering)) {
      return problem('submit_answer needs "step": the number of the step being answered, from the step that was shown.');
    }
    // Through the gate before anything else, so the step a refusal hands back is one it served.
    const here = current(unit, cursor);
    if (!here.ok) return refusalResult(here.refusal, cursor.language);

    /*
      WHAT A CALL RECORDED IS THE MODEL'S TO KNOW, AND ENGLISH IN EVERY EDITION (#167) — the
      retry below, a declined form, the echo of an answer, a step that asked nothing. Each
      tells the assistant what became of its call and what to do next; the step each shows
      after it is the reader's, and in the reader's edition.
    */
    if (answering !== cursor.step) {
      const shown = show(track, unit, here.step, cursor.language);
      return refused(
        `Nothing recorded: the reader is on step ${cursor.step}, not step ${answering}` +
          (answering < cursor.step ? ' — that one was already answered.' : '.') +
          ` Here is the step they are on:\n\n${shown.text}`,
        answering < cursor.step
          ? { kind: 'already-answered', requested: answering }
          : { kind: 'not-reached', requested: answering, furthest: cursor.step },
        cursor.language,
        shown.step,
      );
    }

    /*
      An answer is required where something was asked, and only there. A step with no cue
      asks nothing — the book's teaching frames — and the first version demanded a
      non-empty answer to go on from one, so the assistant invented a word or asked the
      reader to answer a question nobody put.
    */
    const proposed = typeof args.answer === 'string' ? args.answer.trim() : '';

    /*
      THE ELICITED ANSWER REPLACES THE ARGUMENT; IT DOES NOT JUST CONFIRM IT.

      `ANSWER_CONTRACT` is prose, and prose is a request — no gate can decide whether the
      argument that arrived is the reader's, because the model fills it in either way. Where
      the host can put a form in front of the reader directly, this is the gate: `answer`
      below is what came back from THAT, not from the model's own argument, so an assistant
      that composed one gets overruled by whatever the reader actually typed or accepted.
      Never attempted on a step with no cue — there is nothing to confirm.
    */
    let answer = proposed;
    let confirmedByReader = false;
    if (here.step.cue && deps.elicit) {
      const outcome = await deps.elicit(cursor.step, proposed, cursor.language);
      if (outcome.kind === 'confirmed') {
        answer = outcome.answer.trim();
        confirmedByReader = true;
      } else if (outcome.kind === 'declined') {
        return refused(
          `Nothing recorded: asked the reader directly to confirm step ${cursor.step}'s answer ` +
            'and they declined or cancelled. Ask them in the conversation instead, and call ' +
            'submit_answer again once they have.',
          { kind: 'declined' },
          cursor.language,
        );
      }
      // 'unavailable' falls through: trust the argument, exactly as a host with no
      // elicitation support always has.
    }

    if (here.step.cue && !answer) {
      return problem(
        'No answer was supplied. Ask the reader what they wrote — do not answer the step for them. ' +
          `"I don't know" is a valid answer and should be passed through as it stands.`,
      );
    }

    const recorded = answer
      ? `Recorded as the reader's answer to step ${cursor.step}${confirmedByReader ? ', confirmed directly with the reader' : ''}:\n"${answer}"\n` +
        '(Not marked, and not kept as evidence about the reader. If that is not what they ' +
        'wrote, say so and re-read the step rather than moving on.)\n\n'
      : `Step ${cursor.step} asked nothing, so nothing was recorded.\n\n`;

    const moved = advance(unit, cursor);
    if (!moved.ok) {
      /*
        The last step: there is no next one to open, and the first version said so with
        `isError` and a sentence — a reader who had just finished the book was told the
        server had failed. The hand-off instead, as the reading surface's `/summary`: the
        book's Summary, its *Can you?*, and the next program. The cursor is unchanged, and
        nothing is destroyed; opening the program again shows the same.
      */
      if (moved.refusal.kind === 'program-complete') {
        const done = handOff(unit, cursor.language, nextUnit(deps.bundles.for(track), unit));
        return { text: recorded + done.text, language: cursor.language, data: { finished: done.finished } };
      }
      return refusalResult(moved.refusal, cursor.language);
    }

    const saved = await deps.cursors.save(moved.cursor);
    const served = current(unit, saved);
    if (!served.ok) return refusalResult(served.refusal, saved.language);

    const shown = show(track, unit, served.step, saved.language);
    return { text: recorded + shown.text, language: saved.language, data: { step: shown.step } };
  }

  return problem(`No such tool: ${name}`);
}
