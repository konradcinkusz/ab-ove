/**
 * The tool surface, and the sentences that travel with it.
 *
 * A TOOL DESCRIPTION IS A REQUEST, NOT A RULE — ADR-0009 draws that line for this estate:
 * "an anti-goal that exists only as prose is a request; one the architecture cannot express
 * is a rule." So nothing below is load-bearing for the reveal. The gate is `AbOvo.Api`'s
 * (`Reveal.cs`, ADR-0060), which this server asks for every step through `api.ts`, and it
 * holds whatever a model decides to do with these strings.
 *
 * What the descriptions ARE load-bearing for is whether the answer that arrives is the
 * reader's — and on a host with no elicitation, that is still a request rather than a rule:
 * a model cannot be prevented from composing one, so the contract is stated where the model
 * reads it and `submit_answer` echoes back what it recorded, a narrowing rather than a gate.
 * On a host that supports elicitation, `submit_answer` has an actual gate for this one
 * property — ADR-0054 — and the argument becomes a suggestion the reader confirms or
 * overrules rather than a claim taken on faith.
 */
import { groupsOf, isOpenWhere, say, unitBefore } from '@ab-ovo/web-kit';
import type {
  ProgramSummary,
  ReturnIndex,
  StepContent,
  TrackContent,
  UnitSummary,
} from '@ab-ovo/web-kit/wire';

import { ApiUnavailable, NoBook, isIdentifier } from './api.ts';
import type { AbOvoApi, Cursor, Place } from './api.ts';
import { creditFor, creditIn } from './credit.ts';
import { FALLBACK_LANGUAGE, framingFor } from './framing.ts';
import type { BookCredit } from './framing.ts';
import { explain, fromGate } from './refusal.ts';
import type { Refusal } from './refusal.ts';

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
 * What a server carrying `tracks` tells the host before any tool is called: the method, and
 * then the credit of each book it carries (ADR-0066 §4, #172).
 *
 * THE CREDIT GOES WHERE THE PROSE GOES. A host shows these instructions to its model, and the
 * model is what puts the book's words in front of the reader, so the model is told whose words
 * they are, under which licence, and to pass the credit on. `list_programs` carries the same
 * credit in the reader's edition, in its words and as data. The credit here is English, as
 * everything said to the assistant is (#167): its words are `framing.ts`'s English credit, so
 * the two cannot say different things. A track with no credit (`credit.ts`) adds nothing, and
 * `credit.test.ts` fails on a pinned one.
 */
export function instructionsFor(tracks: readonly string[]): string {
  const credits = tracks.flatMap((track) => {
    const credit = creditFor(track);
    return credit ? [framingFor(FALLBACK_LANGUAGE).credit(creditIn(credit, FALLBACK_LANGUAGE))] : [];
  });
  if (credits.length === 0) return SERVER_INSTRUCTIONS;
  return (
    `${SERVER_INSTRUCTIONS}\n\n` +
    'THE BOOK IS CREDITED WHEREVER ITS WORDS REACH THE READER, and you are where they reach them. ' +
    `${credits.join(' ')} list_programs gives the same credit in the reader's edition: pass it ` +
    'on to the reader as it stands, with the list or with the first step you show them, and ' +
    "never present the words of a step as yours or as this server's."
  );
}

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
/**
 * The book's credit, as data (#172): the fields of the sentence the list's text gives under
 * each track, so a host that reads fields can show the credit and link the licence.
 */
const CREDIT = {
  type: 'object',
  description:
    "The credit of a book this server carries (ADR-0066 §4). Pass it on to the reader with the " +
    'list, as the text gives it.',
  properties: {
    track: { type: 'string', description: 'The track whose book it credits.' },
    title: { type: 'string', description: "The book's title, in the edition the list is in." },
    author: { type: 'string', description: "The book's author." },
    copyright: { type: 'string', description: "The copyright notice, as the book's licence file states it." },
    licence: { type: 'string', description: 'The licence the text is under, e.g. "CC BY-NC-SA 4.0".' },
    licenceUrl: { type: 'string', description: "The licence's address." },
    source: { type: 'string', description: 'Where the book itself is.' },
  },
  required: ['track', 'title', 'author', 'copyright', 'licence', 'licenceUrl', 'source'],
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
      'The tracks this server carries, the editions they are published in and the credit of ' +
      'each book, and in each, ' +
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
        credits: {
          type: 'array',
          description: "The credit of each track's book, as the text gives it under the track.",
          items: CREDIT,
        },
        placeIsEphemeral: PLACE_IS_EPHEMERAL,
      },
      required: ['text', 'programs', 'folded', 'credits'],
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

/** One book's credit, as data — `CREDIT` above; `framing.ts`'s `credit` is its words. */
export interface CreditData extends BookCredit {
  readonly track: string;
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
  readonly credits?: readonly CreditData[];
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
 * `refusal.ts` says it in as many words — "`not-reached` is the gate doing its job and is
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
 * What a reader is told when their place is found only while this process runs — the id it
 * is filed under could not be kept on this computer (`identity.ts`) — IN THE RESULT, where
 * they can read it. `server.ts` says why on stderr, which no reader of an MCP host ever sees;
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
 * What a reader is told when this server has no book to serve, and what fixes it — which
 * depends on WHY there is none, so it is built from what the API client found.
 *
 * The book was the compiled bundle in the checkout until #171, and this note named the fetch
 * script, the checkout and every path it looked at (#136). It comes from `AbOvo.Api` now, so
 * there are two cases, and each has its own fix:
 *
 * - NO API TO ASK: `AB_OVO_API_URL` is not set. The variable is the fix.
 * - AN API THAT HOLDS NO BOOK for a track this server carries: it answered 404 for the
 *   track's listing. Either nothing was ingested into it, or what answers at that address is
 *   not the ab-ovo API, and the note names both, since a 404 cannot tell them apart.
 *
 * ENGLISH IN EVERY EDITION, unlike the note below (#167). Every sentence of it is for whoever
 * runs the server, whose fix is a variable or an ingest in an English-only repository — and
 * with no book there is no edition to speak: the editions are the book's.
 */
export function noBookNote(missing: NoBook): string {
  if (missing.kind === 'unconfigured') {
    return (
      'This server has no book to serve: it reads the book, and keeps the reader\'s place, ' +
      'through the ab-ovo API, and AB_OVO_API_URL is not set. Whoever runs the server should ' +
      'set AB_OVO_API_URL to the API\'s address in the environment the host starts this server ' +
      'with, and start it again.'
    );
  }
  return (
    'This server has no book to serve: the ab-ovo API at AB_OVO_API_URL holds no content for ' +
    `the track "${missing.track ?? ''}", or what answers there is not the ab-ovo API. Whoever ` +
    'runs the API should ingest the compiled book into it (POST /api/v1/admin/content/bundles, ' +
    'which docs/tutorials/01-first-run.md walks through), or point AB_OVO_API_URL at an API ' +
    'that holds it.'
  );
}

/**
 * What a reader is told when the book's server could not be used — a result they can read,
 * where there used to be a JSON-RPC error they could not (#137).
 *
 * Two things, in the order a reader needs them. First that NOTHING IS LOST: the place is the
 * API's, and a failed read did not move it. A failed WRITE may or may not have been
 * committed — a 5xx or a dropped connection can follow the commit — so the note does not
 * claim either; what it can say is that making the same call again is safe, because
 * `open_program` records the same place twice and `submit_answer` names its step. Then what
 * fixes it, which is different for each `ApiProblem`: a fresh token, a moment's wait, or a
 * look at the address. The model gets the same sentence and so has something true to relay
 * instead of `fetch failed`.
 *
 * `isError`, unlike the gate's refusals: this is not the book working, it is a call that
 * did not do what it was asked.
 *
 * WHAT THE READER IS TOLD FOLLOWS THEIR EDITION; WHAT FIXES THE DEPLOYMENT DOES NOT (#167).
 * That nothing is lost, that a failed write is safe to repeat, and to try again shortly are
 * the reader's, and are `framing.ts`'s. A fresh token and a corrected address are for whoever
 * runs the server, and stay English with the variables they name. The edition is `handle()`'s
 * to choose, because the API that says which editions a track has is the thing out of reach.
 *
 * A 401 OR A 403 NAMES THE TOKEN ONLY WHEN THERE IS ONE. A reader with no account sends an id
 * to endpoints that need no account (#171), so a refusal to let this server in is not about
 * a token it does not have; it is an address that is not the ab-ovo API.
 */
export function apiUnavailableNote(failure: ApiUnavailable, language: string = FALLBACK_LANGUAGE): string {
  const framing = framingFor(language);
  const status = failure.status === undefined ? '' : ` (HTTP ${failure.status})`;
  const kept = framing.placeUnreachable + (failure.writing ? ` ${framing.placeMaybeRecorded}` : '');

  switch (failure.reason) {
    case 'unauthorised':
      return failure.withToken
        ? `${kept}\n\nThe service that keeps it would not let this server in${status}: the reader ` +
            'token it was started with has expired or is not valid. Whoever runs the server should ' +
            'give it a fresh AB_OVO_READER_TOKEN and start it again; trying again before that will ' +
            'not help.'
        : `${kept}\n\nWhat answered at AB_OVO_API_URL would not let this server in${status}, and ` +
            'this server reads without an account, which the ab-ovo API never refuses. Whoever runs ' +
            'the server should check that AB_OVO_API_URL names the ab-ovo API; trying again will ' +
            'not change the answer.';
    case 'unreachable':
      return `${kept}\n\n${framing.placeOutOfReach(status)}`;
    case 'refused':
      // No status is the one `refused` where nothing was asked: the address itself is not one.
      return failure.status === undefined
        ? `${kept}\n\nAB_OVO_API_URL is not an http or https address, so nothing was asked of ` +
            'the service that keeps it. Whoever runs the server should set AB_OVO_API_URL to the ab-ovo API\'s ' +
            'address and start it again; trying again will not change the answer.'
        : `${kept}\n\nWhat answered at AB_OVO_API_URL refused the request${status}, or answered ` +
            'with something that is not the book or a place. Whoever runs the server should check ' +
            'that AB_OVO_API_URL names the ab-ovo API; trying again will not change the answer.';
  }
}

/**
 * The heading a step falls under: the last one to start at or before it, and none for a step
 * before the first. A heading's span runs to the step before the next heading's — the order of
 * `UnitSummary.sections` is the data, and the reading surface finds a step's heading the same
 * way (`web/app`'s `place.ts`), since the content API sends no section on a step.
 */
function sectionOf(unit: UnitSummary, n: number): UnitSummary['sections'][number] | undefined {
  let found: UnitSummary['sections'][number] | undefined;
  for (const section of unit.sections) if (section.firstStep <= n) found = section;
  return found;
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
 * among.
 */
export function placeLine(unit: UnitSummary, step: StepContent, language: string): string {
  const section = sectionOf(unit, step.n);
  const where = section ? ` › ${say(section.titles, language)}` : '';
  return `${unit.id} · ${say(unit.titles, language)}${where} · ${framingFor(language).position(step.n, unit.stepCount)}`;
}

/**
 * Render one step for a reader, in their edition — the book's words and the server's alike.
 *
 * Everything here is the reader's, so every sentence around the step is `framing.ts`'s and
 * follows the edition the step is in (#167). Until then only the step did, and a Polish
 * step arrived between English banners that the host's model translated, against the
 * instruction to show a step as it is served.
 */
export function render(unit: UnitSummary, step: StepContent, language: string): string {
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
export function stepData(track: string, unit: UnitSummary, step: StepContent, language: string): StepData {
  return {
    track,
    unit: unit.id,
    step: step.n,
    total: unit.stepCount,
    asks: step.cue === true,
    language,
    ...(step.answer ? { answersStep: step.n - 1 } : {}),
  };
}

/** One step shown: its words and its data, from the one `StepContent`, so the two cannot name different steps. */
function show(
  track: string,
  unit: UnitSummary,
  step: StepContent,
  language: string,
): { readonly text: string; readonly step: StepData } {
  return { text: render(unit, step, language), step: stepData(track, unit, step, language) };
}

/**
 * THE HAND-OFF, when a program is finished — the reading surface's `/summary`, one
 * transport over, and from the same place: the API's return index, which it serves only to
 * a reader at the program's last step (#158).
 *
 * The first version ended a program on an error: the last `submit_answer` was refused as
 * `program-complete`, with `isError` set, and a reader who had just worked forty-eight
 * steps was told the server had failed and given nowhere to go. The web ends a program on
 * a screen: the book's own Summary, its *Can you?* list, and the next program. This is
 * that screen.
 *
 * ONLY THE ROUTES' LABELS, NEVER A QUIZ'S ANSWER. A Summary item paraphrases what a run of
 * frames concluded — the book's own rule is that a label may name the skill and may not carry
 * the finding — and the return index has no field for a route's `answer` to arrive in
 * (`ReturnRoute`, ADR-0014). The leak walk in `tools.test.ts` asserts none is emitted at any
 * cursor, this block included.
 *
 * IN THE READER'S EDITION, EXCEPT THE CALLS (#167). The heading, the Summary, *Can you?*
 * and the next program's name are the reader's, and `framing.ts`'s; the `open_program` call
 * that opens the next program and the pointer to `list_programs` tell the model what to do,
 * and stay English after the reader's sentence they follow.
 */
export function completion(
  unit: UnitSummary,
  index: ReturnIndex | undefined,
  language: string,
  next: ProgramSummary | undefined,
): string {
  const framing = framingFor(language);
  const item = (route: ReturnIndex['summary'][number]): string =>
    `- ${route.labels[language] ?? ''} (${framing.range(route.from, route.to)})`;

  const parts: string[] = [
    `## ${unit.id} · ${say(unit.titles, language)} · ${framing.finished(framing.steps(unit.stepCount))}`,
  ];
  const summary = index?.summary ?? [];
  const outcomes = index?.outcomes ?? [];
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
  unit: UnitSummary,
  index: ReturnIndex | undefined,
  language: string,
  next: ProgramSummary | undefined,
): { readonly text: string; readonly finished: FinishedData } {
  return {
    text: completion(unit, index, language, next),
    finished: {
      unit: unit.id,
      total: unit.stepCount,
      ...(next ? { next: { unit: next.id, title: say(next.titles, language) } } : {}),
    },
  };
}

/**
 * The hand-off for a program the reader is at the end of: its return index asked of the API,
 * which serves it only there. A refusal leaves the Summary out rather than failing the call —
 * the reader is at the last step, and the heading and the next program still stand.
 */
async function finishing(
  deps: Deps,
  located: Located,
  unit: UnitSummary,
  language: string,
): Promise<{ readonly text: string; readonly finished: FinishedData }> {
  const answered = await deps.api.returnIndex(located.track, located.program.id);
  const index = answered.ok && answered.index ? answered.index : undefined;
  return handOff(unit, index, language, nextProgram(located.content, located.program.id));
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
function editionQuestion(unit: string, editions: readonly EditionOffered[], declined: boolean): string {
  const choices = editions.map((edition) => `"${edition.language}" (${edition.title})`);
  const list =
    choices.length > 1 ? `${choices.slice(0, -1).join(', ')} or ${choices.at(-1)}` : (choices[0] ?? 'none');
  return (
    (declined
      ? `Nothing opened: the reader was asked directly which edition to read "${unit}" in, and ` +
        'declined or cancelled. Ask them in the conversation instead: '
      : `"${unit}" needs an edition, and none is known for this reader yet. Ask them which ` +
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
 * Every program's door, in the track's order, asked of the places already in hand.
 *
 * `isOpenWhere` is the shared rule (`@ab-ovo/web-kit`'s `gate.ts`) and `shutBehind` is the
 * same question for one program; this is the third caller, and it reads the list `places()`
 * already fetched rather than fetching again. Whether a shut program is next or behind is a
 * question about the program before it, which the listing's order has already answered by the
 * time it is asked.
 */
function doorsOf(
  track: string,
  content: TrackContent,
  placeOf: (track: string, unit: string) => Cursor | undefined,
): ReadonlyMap<string, Door> {
  const doors = new Map<string, Door>();
  for (const program of content.programs) {
    const cursor = placeOf(track, program.id);
    const previous = unitBefore({ units: content.programs }, program.id);
    const shut =
      previous !== undefined &&
      !isOpenWhere((asked) => placeOf(track, asked) !== undefined, {
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

/** How many steps a program has — the API's listing says (`api.ts` checked that it does). */
const lengthOf = (program: ProgramSummary): number => program.stepCount ?? 0;

/** One program's line: its id, its title in the listing's edition, its length, and its door. */
function programLine(program: ProgramSummary, door: Door, edition: string): string {
  const total = lengthOf(program);
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
function programData(track: string, program: ProgramSummary, door: Door, edition: string): ProgramData {
  return {
    track,
    id: program.id,
    title: say(program.titles, edition),
    total: lengthOf(program),
    open: door.kind === 'placed' || door.kind === 'open',
    place: door.kind === 'placed' ? door.cursor.step : null,
    ...(door.kind === 'next' || door.kind === 'behind' ? { after: door.after } : {}),
  };
}

/** The edition a reader asked for, if the track is published in it. */
function editionIn(content: TrackContent, language: string): string | undefined {
  return content.languages.includes(language) ? language : undefined;
}

/**
 * The edition `list_programs` gives titles in when none is named: the reader's, if the
 * track has it; else English, the website's default (ADR-0052); else the track's first.
 */
function listingEdition(content: TrackContent, reader: string | undefined): string {
  return (
    (reader !== undefined ? editionIn(content, reader) : undefined) ??
    editionIn(content, 'en') ??
    content.languages[0] ??
    'en'
  );
}

/**
 * The edition a place is shown in: its own, when the track is published in it, and the
 * listing's otherwise — a place written in an edition the track does not have (no client of
 * this repository writes one) is shown rather than failed on.
 */
function shownIn(content: TrackContent, language: string): string {
  return editionIn(content, language) ?? listingEdition(content, undefined);
}

/** A track's own name in an edition, or its id when the listing carries no names. */
function trackTitle(track: string, content: TrackContent, edition: string): string {
  return content.titles?.[edition] ?? track;
}

/**
 * The edition a shut program is refused in (#167). No place in the program can say it — a
 * program with a place is open by that fact alone (`gate.ts`'s valve) — so it is the one
 * the call named, if the track has it, else the one `list_programs` titles in for this
 * reader. Asked only once the refusal is certain, so an open program pays nothing for it.
 */
async function refusalEdition(
  deps: Deps,
  content: TrackContent,
  asked: string | undefined,
  places: readonly Place[],
): Promise<string> {
  const named = asked !== undefined ? editionIn(content, asked) : undefined;
  if (named) return named;
  return listingEdition(content, await deps.api.edition(places));
}

/**
 * The track a call means when it names none: the only one, if there is only one.
 *
 * Every call used to require the track id, and a server that carries one track was making
 * the model carry `math-for-ai-engineers` through every turn for nothing. A server with
 * several still asks.
 */
function soleTrack(api: AbOvoApi): string | Built {
  const only = api.tracks.length === 1 ? api.tracks[0] : undefined;
  if (only) return only;
  return problem(
    `This server carries ${api.tracks.length === 0 ? 'no tracks' : 'several tracks'}; name one with "track"` +
      (api.tracks.length > 1 ? `: ${api.tracks.join(', ')}.` : '.'),
  );
}

interface Located {
  readonly track: string;
  readonly content: TrackContent;
  readonly program: ProgramSummary;
}

/**
 * The program after this one, by ADJACENCY in the track's listing — the order the book's own
 * manifest declares — and never by adding one to a parsed id: the book renumbered its own
 * main sequence once already when P07 was inserted (program-contents.tsx records it).
 */
function nextProgram(content: TrackContent, unit: string): ProgramSummary | undefined {
  const index = content.programs.findIndex((candidate) => candidate.id === unit);
  return index >= 0 ? content.programs[index + 1] : undefined;
}

/**
 * Resolve a call's track and program. The program id is matched in any case — a reader
 * says "p01" — and what comes back is the book's own spelling, which is what the place is
 * filed under: a place keyed by "p01" would be a second place for P01.
 *
 * A track this server does not carry is refused without a request: the tracks it carries
 * are its own list (`api.ts`), and the API is asked only about those.
 */
async function locate(api: AbOvoApi, track: string, unit: string): Promise<Located | Built> {
  const resolvedTrack = track === '' ? soleTrack(api) : track;
  if (isResult(resolvedTrack)) return resolvedTrack;

  if (!isIdentifier(resolvedTrack)) {
    return problem(`"${resolvedTrack}" is not a track id: letters, digits, dot, dash or underscore. Try list_programs.`);
  }
  if (!isIdentifier(unit)) {
    return problem(`"${unit}" is not a program id: letters, digits, dot, dash or underscore. Try list_programs.`);
  }
  if (!api.tracks.includes(resolvedTrack)) {
    return problem(`This server does not carry the track "${resolvedTrack}". Try list_programs.`);
  }

  const content = await api.track(resolvedTrack);
  const found =
    content.programs.find((candidate) => candidate.id === unit) ??
    content.programs.find((candidate) => candidate.id.toLowerCase() === unit.toLowerCase());
  if (!found) return problem(`The track "${resolvedTrack}" has no program "${unit}". Try list_programs.`);

  return { track: resolvedTrack, content, program: found };
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
 * ADR-0056 that rule was the website's alone: `open_program` would start F02 for a reader the
 * index would have refused, both reading the SAME `ReaderProgress` row. A reader could be
 * inside a program in one window that the other window says does not open yet, and nothing
 * in either could explain it.
 *
 * THE RULE IS NOT RESTATED HERE. `isOpenWhere` (`@ab-ovo/web-kit`'s `gate.ts`) is the one
 * copy, shared with the reading surface. What is here is this transport's half: the places
 * to ask it of, and the refusal. The API does not hold the order (ADR-0065), which is why
 * `open_program` asks this before it records an opening (`POST …/open` writes whatever it
 * is sent), as the browser's recorder asks it before it writes (`remember-position.tsx`).
 *
 * NO REQUEST OF ITS OWN: the rule asks about this program and the one before it, and the
 * caller already holds every place the reader has, from the one read the call makes anyway.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * `undefined` MEANS OPEN, and it is also the honest answer for a program with nothing
 * before it: `unitBefore` returns `undefined` both for the first program of a track and for
 * a program the listing does not carry, and `gate.ts` takes both to mean "nothing here
 * precedes it" — a program the book does not list is not a program a reader can be sent
 * back from.
 */
function shutBehind(
  located: Located,
  placeOf: (track: string, unit: string) => Cursor | undefined,
): Refusal | undefined {
  const { track, content, program } = located;
  const previous = unitBefore({ units: content.programs }, program.id);
  if (!previous) return undefined;

  const open = isOpenWhere((asked) => placeOf(track, asked) !== undefined, {
    unit: program.id,
    previous: previous.id,
  });

  return open ? undefined : { kind: 'not-open', unit: program.id, after: previous.id };
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
   * The edition of the last result that spoke one (#167). When the book's server cannot be
   * reached — the API being where an edition is otherwise read from — `handle()` says
   * `apiUnavailableNote()` in the edition the call named if the track has it, else in this
   * one (`unreachableEdition()`). Nothing else reads it.
   */
  spokenIn?: string;
}

export interface Deps {
  /**
   * The book and the reader's place, both `AbOvo.Api`'s (`api.ts`). The unit tier hands it a
   * stub API; nothing here holds a copy of either.
   */
  readonly api: AbOvoApi;
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
 * get wrong under a reader who did nothing wrong: the book going missing — no API to ask, or
 * one that holds no book — and the API going out of reach — a token that expired, an API that
 * is down. Each used to reach the host as a JSON-RPC error carrying a developer's string. Each
 * is a tool result now, with what fixes it.
 *
 * Anything else still throws, on purpose: an error this file cannot name is a defect in
 * this package, and a sentence would dress it up as the deployment's.
 *
 * AN API OUT OF REACH IS TOLD IN AN EDITION IT DID NOT HAVE TO SAY (#167) —
 * `unreachableEdition()`'s. Asking the API which editions a track has would be asking the
 * thing that has just failed.
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
    if (error instanceof NoBook) return problem(noBookNote(error));
    if (error instanceof ApiUnavailable) return problem(apiUnavailableNote(error, unreachableEdition(args, deps)));
    throw error;
  }
  return delivered(built, deps);
}

/**
 * The edition an API out of reach is told in (#167): the one the call named, if a track the
 * call can mean is published in it; else the one this session last spoke in; else English.
 *
 * RESOLVED, NEVER TAKEN AS SENT. The SDK's low-level `Server` checks no argument against a
 * tool's schema, so `language` is whatever the host passed, and the first version handed it
 * to the note as it came: `constructor` threw out of `handle()` on the path #137 exists to
 * keep a result, and `PL`, or an edition the track does not have, was honoured where every
 * other call refuses it. So it is looked up among a track's editions, as an edition a call
 * names is everywhere else here — and `framingFor()` is total besides.
 *
 * THE EDITIONS ARE THE LAST ONES THE API SAID. The listing that names a track's editions
 * comes from the API that has just failed, so it is the one this process was last answered
 * with (`lastKnown`), and with none there is no edition a call can name: the note owed is
 * still the place's, in the session's edition or English.
 */
function unreachableEdition(args: Record<string, unknown>, deps: Deps): string {
  const asked = typeof args.language === 'string' && args.language !== '' ? args.language : undefined;
  let named: string | undefined;
  if (asked !== undefined) {
    // The track the call names, or any this server carries when it names none (`list_programs`).
    const track = typeof args.track === 'string' && args.track !== '' ? args.track : undefined;
    const meant = deps.api.tracks.filter((id) => track === undefined || id === track);
    named = meant
      .map((id) => deps.api.lastKnown(id))
      .map((content) => (content ? editionIn(content, asked) : undefined))
      .find((edition) => edition !== undefined);
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
 * keeps that edition for the error that is told in it, an API out of reach (`handle()`).
 */
function delivered(built: Built, deps: Deps): ToolResult {
  if (built.isError) return built;
  if (deps.session && built.language !== undefined) deps.session.spokenIn = built.language;
  const ephemeral = deps.api.placeIsEphemeral;
  const tell = ephemeral && deps.session?.ephemeralNoteSaid !== true;
  if (tell && deps.session) deps.session.ephemeralNoteSaid = true;
  const text = tell ? `${built.text}\n\n${ephemeralNote(built.language ?? FALLBACK_LANGUAGE)}` : built.text;
  return {
    text,
    structured: { text, ...built.data, ...(ephemeral ? { placeIsEphemeral: true as const } : {}) },
  };
}

/** The place in one program, from the list the call already holds. */
const placeIn = (places: readonly Place[]) => (track: string, unit: string): Place | undefined =>
  places.find((cursor) => cursor.track === track && cursor.unit === unit);

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
    // One read of every place the reader has, whatever the number of programs. It has been one
    // request since PR #109 replaced a read per program; #171 made it the API's list for an
    // anonymous reader too (`GET /api/v1/progress/anonymous`).
    const places = await deps.api.places();
    const placeOf = placeIn(places);
    const listings: { readonly track: string; readonly content: TrackContent }[] = [];
    for (const track of deps.api.tracks) listings.push({ track, content: await deps.api.track(track) });
    const readerEdition = asked ? undefined : await deps.api.edition(places);

    const lines: string[] = [];
    const programs: ProgramData[] = [];
    const credits: CreditData[] = [];
    const otherEditions = new Set<string>();
    let listedIn: string | undefined;
    let folded = false;
    for (const { track, content } of listings) {
      /*
        ONE EDITION'S TITLES, NOT BOTH (#145). Every unopened program used to carry its
        title in every edition, which is most of what made a new reader's list about 7 KB.
        The reader's edition when one is known, English until then — the website's default
        (ADR-0052) — and any other on request, by `language`.
      */
      const edition = asked ? editionIn(content, asked) : listingEdition(content, readerEdition);
      if (!edition) {
        return problem(
          `The track "${track}" is not published in "${asked}". It has: ${content.languages.join(', ')}.`,
        );
      }
      listedIn = edition;
      for (const other of content.languages) if (other !== edition) otherEditions.add(other);

      lines.push(
        `Track "${track}" — ${trackTitle(track, content, edition)} — editions: ` +
          `${content.languages.join(', ')} — content tag: ${content.tag}`,
      );
      /*
        THE BOOK'S CREDIT, UNDER THE TRACK IT CREDITS (ADR-0066 §4, #172). This list is where a
        reader chooses what to read, so it is where the book is named with its author, its
        notice and its licence, in the listing's edition like the titles beside it (#167), and
        as data for a host that reads fields (#164). Said on every list rather than once a
        session: it is the book's due and not a note about this process, and a host that drops
        an earlier result keeps this one.
      */
      const credit = creditFor(track);
      if (credit) {
        const book = creditIn(credit, edition);
        lines.push(`  ${framingFor(edition).credit(book)}`);
        credits.push({ track, ...book });
      }
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

      const doors = doorsOf(track, content, placeOf);
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
      for (const group of groupsOf({ units: content.programs })) {
        const heading = group.part
          ? say(group.part.titles, edition)
          : group.prefix
            ? groupLabels[group.prefix]
            : undefined;
        if (heading) lines.push(`  ${heading}`);
        const indent = heading ? '    ' : '  ';
        // A program the text names is a program the data names, and no other (#164).
        const named = (program: ProgramSummary, door: Door): void => {
          lines.push(`${indent}${programLine(program, door, edition)}`);
          programs.push(programData(track, program, door, edition));
        };

        /*
          A RUN OF SHUT PROGRAMS IS ONE LINE (#145). Every program the reader can act on is
          named — the ones they have a place in, the ones open now, and the one that opens
          next — and what follows it, shut behind a program that is itself shut, is folded:
          the rule above already says how each of them opens, and saying it again per
          program was most of the rest of the 7 KB. `all` names them anyway. A run of one
          is simply its line, which is no longer than the fold.
        */
        let run: ProgramSummary[] = [];
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
      data: { programs, folded, credits },
    };
  }

  const located = await locate(deps.api, askedTrack, askedUnit);
  if (isResult(located)) return located;
  const { track, content, program } = located;
  const places = await deps.api.places();
  const placeOf = placeIn(places);
  const existing = placeOf(track, program.id);

  if (name === 'open_program') {
    const asked = typeof args.language === 'string' && args.language !== '' ? args.language : undefined;

    /*
      BEFORE THE EDITION IS ASKED FOR, AND THAT ORDER IS THE POINT. A first opening needs an
      edition and the model is told to ask the reader for one; putting the gate after that
      would have the assistant ask "English or Polish?", wait for the answer, and only then
      say the program is not open — a question asked for nothing, in the reader's time.
      AND BEFORE ANYTHING IS WRITTEN: the opening records a place, a place opens the next
      program, and the API records whatever it is sent (ADR-0065).
    */
    const shut = shutBehind(located, placeOf);
    if (shut) return refusalResult(shut, await refusalEdition(deps, content, asked, places));

    /*
      THE EDITION, ASKED ONCE PER READER AND NOT ONCE PER PROGRAM (#144): the one named, else
      the one this program was read in, else the one the READER reads in — and only when
      none of those is known, a question.

      A reader who resumes is not asked again — the first version required the argument on
      every call and then discarded it whenever a place existed, so the model asked a
      question whose answer went nowhere. The second version still asked at the first
      opening of EVERY program, so an agent put "English or Polish?" at the start of each of
      forty-seven, and with `isError` set, so the host painted an ordinary step of the
      conversation red — the mistake ADR-0056 had already corrected for refusals. The
      website keeps one edition per reader (ADR-0052); `AbOvoApi.edition()` reads the same
      record. A named edition the track does not have is still an error: it names nothing.
    */
    const offered = content.languages;
    let language: string | undefined;
    let how: 'named' | 'kept' | 'remembered' | 'chosen';
    if (asked) {
      language = editionIn(content, asked);
      if (!language) return problem(`The track "${track}" is not published in "${asked}". It has: ${offered.join(', ')}.`);
      how = 'named';
    } else if (existing && editionIn(content, existing.language)) {
      language = existing.language;
      how = 'kept';
    } else {
      const known = await deps.api.edition(places);
      language = known !== undefined ? editionIn(content, known) : undefined;
      how = 'remembered';
      if (!language) {
        const editions: readonly EditionOffered[] = offered.map((edition) => ({
          language: edition,
          title: trackTitle(track, content, edition),
        }));
        const outcome: EditionOutcome = deps.chooseEdition
          ? await deps.chooseEdition(program.id, editions)
          : { kind: 'unavailable' };
        language = outcome.kind === 'chosen' ? editionIn(content, outcome.language) : undefined;
        how = 'chosen';
        if (!language) {
          const declined = outcome.kind === 'declined';
          return {
            text: editionQuestion(program.id, editions, declined),
            data: { question: { kind: 'edition', offered: editions, declined } },
          };
        }
      }
    }

    /*
      A FIRST OPENING IS RECORDED BY THE API, AND A RESUME RECORDS NOTHING. `POST …/open`
      creates the place at the program's first step in the edition chosen, and answers the
      place as it stands (ADR-0066 §2); on a place that exists it writes nothing, so a switch
      of edition on the step the reader is on is kept here until the next advance carries it
      (`api.ts`'s `keepEdition`). Nothing here names a step to the API: the only step an
      opening records is the first, which the gate serves to any reader.
    */
    let cursor: Cursor = existing ?? (await deps.api.open(track, program.id, language));
    if (cursor.language !== language) {
      cursor = { ...cursor, language };
      deps.api.keepEdition(cursor);
    }

    const unit = await deps.api.unit(track, program.id);
    const served = await deps.api.step(track, program.id, cursor.step);
    if (!served.ok || !served.step) return refusalResult(fromGate(served.refusal!), cursor.language);

    /*
      THE MODEL'S LINE, AND ENGLISH IN EVERY EDITION (#167): what this call did — started,
      resumed, switched — told to the assistant, which then shows the step below it. The
      step, and the hand-off after it, are the reader's, and speak the edition they are in.
    */
    const opening = !existing
      ? how === 'remembered'
        ? `Starting "${program.id}" in the "${cursor.language}" edition, the one the reader already reads in. ` +
          'Naming another edition switches, at the same step.'
        : how === 'chosen'
          ? `Starting "${program.id}" in the "${cursor.language}" edition, chosen directly by the reader.`
          : `Starting "${program.id}".`
      : existing.language !== cursor.language
        ? `Resuming "${program.id}" at step ${cursor.step}, switched to the "${cursor.language}" edition.`
        : `Resuming "${program.id}" at step ${cursor.step}.`;
    // On the last step the program is finished; the step is shown, and then where to next.
    const shown = show(track, unit, served.step, cursor.language);
    const done = cursor.step === unit.stepCount ? await finishing(deps, located, unit, cursor.language) : undefined;
    return {
      text: `${opening}\n\n${shown.text}${done ? `\n\n${done.text}` : ''}`,
      language: cursor.language,
      data: { step: shown.step, ...(done ? { finished: done.finished } : {}) },
    };
  }

  if (!existing) {
    /*
      TWO REASONS FOR AN EMPTY PLACE, AND THEY ARE NOT THE SAME ANSWER. Either the reader
      simply has not started this program — open_program is the next call, and the model can
      make it — or the book will not let them start it yet, in which case "call open_program
      first" is advice that leads straight into a refusal. Asking the gate here is what keeps
      the model from taking a reader round that loop and then reporting a failure.
    */
    const shut = shutBehind(located, placeOf);
    if (shut) return refusalResult(shut, await refusalEdition(deps, content, undefined, places));
    return problem(`The reader has not opened "${program.id}" yet. Call open_program first.`);
  }
  const cursor: Cursor = { ...existing, language: shownIn(content, existing.language) };
  const unit = await deps.api.unit(track, program.id);

  if (name === 'current_step') {
    const served = await deps.api.step(track, program.id, cursor.step);
    if (!served.ok || !served.step) return refusalResult(fromGate(served.refusal!), cursor.language);
    const shown = show(track, unit, served.step, cursor.language);
    return { text: shown.text, language: cursor.language, data: { step: shown.step } };
  }

  if (name === 'review_step') {
    /*
      A NUMBER THE PROGRAM DOES NOT HAVE NAMES NOTHING, and is answered here, before a request:
      it is the call's argument that is wrong, not the reader's place, and `review_step` with
      `1.5` or `900` has no step to ask the API for. Whether a step the program does have has
      been reached is the API's to answer — the gate this package no longer holds a copy of.
    */
    const n = typeof args.step === 'number' ? args.step : Number.NaN;
    if (!Number.isInteger(n) || n < 1 || n > unit.stepCount) {
      return refusalResult({ kind: 'no-such-step', requested: n, steps: unit.stepCount }, cursor.language);
    }
    const served = await deps.api.step(track, program.id, n);
    if (!served.ok || !served.step) return refusalResult(fromGate(served.refusal!), cursor.language);
    const shown = show(track, unit, served.step, cursor.language);
    return { text: shown.text, language: cursor.language, data: { step: shown.step } };
  }

  if (name === 'submit_answer') {
    /*
      THE STEP BEING ANSWERED, SO A RETRY CANNOT ADVANCE TWICE. A host that times out and
      calls again, or a model that calls twice, used to move the reader two steps: the
      skipped step's body was never shown while its answer arrived in the next step's
      banner. Naming the step makes the second call a no-op that hands back where the
      reader actually is — and the API applies the same rule to the advance it is sent.
    */
    const answering = typeof args.step === 'number' ? args.step : Number.NaN;
    if (!Number.isInteger(answering)) {
      return problem('submit_answer needs "step": the number of the step being answered, from the step that was shown.');
    }
    // Asked of the API before anything else, so the step a refusal hands back is one it served.
    const here = await deps.api.step(track, program.id, cursor.step);
    if (!here.ok || !here.step) return refusalResult(fromGate(here.refusal!), cursor.language);

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

    /*
      THE ADVANCE IS THE API'S: `POST …/advance`, the only thing that raises a place (ADR-0060),
      which reveals the step the answer opens or refuses. The reader's words are not sent — the
      API keeps none — and the edition goes with the step it raises (ADR-0019).
    */
    const moved = await deps.api.advance(track, program.id, cursor.step, cursor.language);
    if (!moved.ok || !moved.step) {
      /*
        The last step: there is no next one to open, and the first version said so with
        `isError` and a sentence — a reader who had just finished the book was told the
        server had failed. The hand-off instead, as the reading surface's `/summary`: the
        book's Summary, its *Can you?*, and the next program. The place is unchanged, and
        nothing is destroyed; opening the program again shows the same.
      */
      if (moved.refusal?.kind === 'ProgramComplete') {
        const done = await finishing(deps, located, unit, cursor.language);
        return { text: recorded + done.text, language: cursor.language, data: { finished: done.finished } };
      }
      return refusalResult(fromGate(moved.refusal!), cursor.language);
    }

    /*
      THE API RECORDED NOTHING WHEN ITS PLACE WAS NOT THE ONE ANSWERED — another surface moved
      the reader between the read above and this advance — and it answered with the step the
      reader is on. Said as the retry above is said, and nothing claimed recorded.
    */
    if (moved.step.n !== answering + 1) {
      const shown = show(track, unit, moved.step, cursor.language);
      return refused(
        `Nothing recorded: the reader is on step ${moved.step.n}, not step ${answering}` +
          (answering < moved.step.n ? ' — that one was already answered.' : '.') +
          ` Here is the step they are on:\n\n${shown.text}`,
        answering < moved.step.n
          ? { kind: 'already-answered', requested: answering }
          : { kind: 'not-reached', requested: answering, furthest: moved.step.n },
        cursor.language,
        shown.step,
      );
    }

    const shown = show(track, unit, moved.step, cursor.language);
    return { text: recorded + shown.text, language: cursor.language, data: { step: shown.step } };
  }

  return problem(`No such tool: ${name}`);
}
