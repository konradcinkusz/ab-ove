/**
 * The tool surface, and the sentences that travel with it.
 *
 * A TOOL DESCRIPTION IS A REQUEST, NOT A RULE — ADR-0009 draws that line for this estate:
 * "an anti-goal that exists only as prose is a request; one the architecture cannot express
 * is a rule." So nothing below is load-bearing for the reveal. The gate is `reveal.ts` and
 * it holds whatever a model decides to do with these strings.
 *
 * What the descriptions ARE load-bearing for is the one thing no gate can decide: whether
 * the answer that arrives is the reader's. A model cannot be prevented from composing one —
 * it fills the argument — so the contract is stated where the model reads it, in the words
 * it will act on, and `submit_answer` echoes back what it recorded so a reader who was
 * answered FOR can see that they were.
 */
import { advance, current, explain, serve, FIRST_STEP } from './reveal.ts';
import type { Cursor } from './reveal.ts';
import type { CursorStore } from './cursor.ts';
import { isIdentifier } from './cursor.ts';
import { allBundles, bundleFor, languageIn, say, unitIn } from './content.ts';
import type { Step, Unit } from './content.ts';

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
`.trim();

export interface ToolDefinition {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

const TRACK = { type: 'string', description: 'The track id, e.g. "math-for-ai-engineers".' };
const UNIT = { type: 'string', description: 'The program id within the track, e.g. "P01".' };

export const TOOLS: readonly ToolDefinition[] = [
  {
    name: 'list_programs',
    title: 'List the programs available',
    description:
      'Every track and program this server carries, with the languages it is published in ' +
      'and how far the reader has got in each. Call this first when the reader has not ' +
      'named a program.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'open_program',
    title: 'Open or resume a program',
    description:
      'Start a program, or resume it where the reader left off, and return the step they ' +
      'are on. Show that step to the reader and let them answer it. This does not move ' +
      'them forward — only submit_answer does.',
    inputSchema: {
      type: 'object',
      properties: {
        track: TRACK,
        unit: UNIT,
        language: {
          type: 'string',
          description:
            'The edition to read, e.g. "en" or "pl". Ask the reader rather than inferring ' +
            'it from the language they happen to be chatting in.',
        },
      },
      required: ['track', 'unit', 'language'],
      additionalProperties: false,
    },
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
      required: ['track', 'unit'],
      additionalProperties: false,
    },
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
        answer: {
          type: 'string',
          minLength: 1,
          description:
            "The reader's own answer, verbatim. Free text, any language, any format. Not " +
            'composed or corrected by the assistant. Ask the reader if they have not given one.',
        },
      },
      required: ['track', 'unit', 'answer'],
      additionalProperties: false,
    },
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
      required: ['track', 'unit', 'step'],
      additionalProperties: false,
    },
  },
];

export interface ToolResult {
  readonly text: string;
  readonly isError?: boolean;
}

const problem = (text: string): ToolResult => ({ text, isError: true });

/** Render one step for a reader, in their edition. */
export function render(step: Step, language: string, total: number): string {
  const parts: string[] = [];

  if (step.answer) {
    parts.push(
      `--- The answer to the previous step ---\n${say(step.answer, language)}\n` +
        '--- Compare your own answer against that before reading on ---',
    );
  }

  const title = step.titles ? say(step.titles, language) : undefined;
  parts.push(`## Step ${step.n} of ${total}${title ? ` — ${title}` : ''}\n\n${say(step.body, language)}`);

  if (step.check) {
    parts.push(
      `This step has an exercise: lab "${step.check.lab}", exercise "${step.check.exercise}". ` +
        'The exercises run in the reader\'s browser and are not available through this server; ' +
        'the reading surface has them.',
    );
  }

  parts.push(
    step.cue
      ? 'Write your answer down before going on. The next step opens with the answer to this one, ' +
          'and it arrives through submit_answer.'
      : 'When you are ready, submit_answer moves on.',
  );

  return parts.join('\n\n');
}

function locate(track: string, unit: string): { unit: Unit; total: number } | ToolResult {
  if (!isIdentifier(track) || !isIdentifier(unit)) {
    return problem('A track and a unit are short identifiers: letters, digits, dot, dash or underscore.');
  }

  const bundle = bundleFor(track);
  if (!bundle) return problem(`This server does not carry the track "${track}". Try list_programs.`);

  const found = unitIn(bundle, unit);
  if (!found) return problem(`The track "${track}" has no program "${unit}". Try list_programs.`);

  return { unit: found, total: found.steps.length };
}

const isResult = (value: unknown): value is ToolResult =>
  typeof value === 'object' && value !== null && 'text' in value;

export interface Deps {
  readonly cursors: CursorStore;
}

export async function handle(
  name: string,
  args: Record<string, unknown>,
  deps: Deps,
): Promise<ToolResult> {
  const track = typeof args.track === 'string' ? args.track : '';
  const unit = typeof args.unit === 'string' ? args.unit : '';

  if (name === 'list_programs') {
    const lines: string[] = [];
    for (const bundle of allBundles()) {
      lines.push(
        `Track "${bundle.track.id}" (${say(bundle.track.titles, bundle.track.languages[0] ?? 'en')}), ` +
          `languages: ${bundle.track.languages.join(', ')}, content tag: ${bundle.tag}`,
      );
      for (const program of bundle.units) {
        const cursor = await deps.cursors.read(bundle.track.id, program.id);
        const place = cursor ? `at step ${cursor.step} of ${program.steps.length}` : 'not opened';
        lines.push(`  ${program.id} — ${program.steps.length} steps — ${place}`);
      }
    }
    return { text: lines.join('\n') };
  }

  const located = locate(track, unit);
  if (isResult(located)) return located;

  if (name === 'open_program') {
    const asked = typeof args.language === 'string' ? args.language : '';
    const bundle = bundleFor(track);
    const language = bundle ? languageIn(bundle, asked) : undefined;
    if (!language) {
      const offered = bundle?.track.languages.join(', ') ?? 'none';
      return problem(`The track "${track}" is not published in "${asked}". It has: ${offered}.`);
    }

    const existing = await deps.cursors.read(track, unit);
    const cursor: Cursor = existing ?? { track, unit, language, step: FIRST_STEP };
    const saved = await deps.cursors.save(cursor);

    const served = current(located.unit, saved);
    if (!served.ok) return problem(explain(served.refusal));

    const resumed = existing ? `Resuming "${unit}" at step ${saved.step}.` : `Starting "${unit}".`;
    return { text: `${resumed}\n\n${render(served.step, saved.language, located.total)}` };
  }

  const cursor = await deps.cursors.read(track, unit);
  if (!cursor) {
    return problem(`The reader has not opened "${unit}" yet. Call open_program first.`);
  }

  if (name === 'current_step') {
    const served = current(located.unit, cursor);
    if (!served.ok) return problem(explain(served.refusal));
    return { text: render(served.step, cursor.language, located.total) };
  }

  if (name === 'review_step') {
    const n = typeof args.step === 'number' ? args.step : Number.NaN;
    const served = serve(located.unit, cursor, n);
    if (!served.ok) return problem(explain(served.refusal));
    return { text: render(served.step, cursor.language, located.total) };
  }

  if (name === 'submit_answer') {
    const answer = typeof args.answer === 'string' ? args.answer.trim() : '';
    if (!answer) {
      return problem(
        'No answer was supplied. Ask the reader what they wrote — do not answer the step for them. ' +
          `"I don't know" is a valid answer and should be passed through as it stands.`,
      );
    }

    const moved = advance(located.unit, cursor);
    if (!moved.ok) return problem(explain(moved.refusal));

    const saved = await deps.cursors.save(moved.cursor);
    const served = current(located.unit, saved);
    if (!served.ok) return problem(explain(served.refusal));

    return {
      text:
        `Recorded as the reader's answer to step ${cursor.step}:\n"${answer}"\n` +
        '(Not marked, and not kept as evidence about the reader. If that is not what they ' +
        'wrote, say so and re-read the step rather than moving on.)\n\n' +
        render(served.step, saved.language, located.total),
    };
  }

  return problem(`No such tool: ${name}`);
}
