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
import type { Cursor, Refusal } from './reveal.ts';
import type { CursorStore } from './cursor.ts';
import { isIdentifier } from './cursor.ts';
import { ContentUnavailable, groupsOf, languageIn, say, unitIn } from './content.ts';
import type { Bundle, BundleSource, Step, Text, Unit } from './content.ts';

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
7. A step that asks nothing says so; move on with submit_answer and no answer. If the
   reader asks for the other edition, call open_program with that language — their place
   is kept.

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

const TRACK = {
  type: 'string',
  description:
    'The track id, e.g. "math-for-ai-engineers". Leave it out when the server carries one ' +
    'track, which list_programs shows.',
};
const UNIT = {
  type: 'string',
  description: 'The program id, e.g. "P01" (case does not matter). list_programs names them all.',
};

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
            'The edition to read, e.g. "en" or "pl". Needed the first time a program is ' +
            'opened — ask the reader rather than inferring it from the language they happen ' +
            'to be chatting in. Leave it out to resume in the edition they were reading; ' +
            'give a different one to switch editions, which keeps their place.',
        },
      },
      required: ['unit'],
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
      required: ['unit'],
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
        step: {
          type: 'integer',
          minimum: 1,
          description:
            'The step being answered — the number on the step that was shown. A submit for ' +
            'a step the reader is no longer on is refused and the current step returned, so ' +
            'a call that is retried never moves them twice.',
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
  },
];

export interface ToolResult {
  readonly text: string;
  readonly isError?: boolean;
}

/** Bad input: a track, a program, an edition or a step number that names nothing. */
const problem = (text: string): ToolResult => ({ text, isError: true });

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
 */
const refused = (text: string): ToolResult => ({ text });

function refusalResult(refusal: Refusal): ToolResult {
  return refusal.kind === 'no-such-step' ? problem(explain(refusal)) : refused(explain(refusal));
}

/**
 * What a reader is told when the place is kept in memory — IN THE RESULT, where they can
 * read it. `server.ts` says the same on stderr, which no reader of an MCP host ever sees;
 * finding out by losing one's place is the worst available way to be told (P8).
 */
export const EPHEMERAL_NOTE =
  'Your place in the book is kept for this session only: this server has no account to ' +
  'write it to, so a restart begins the program again. Fine for reading; not a bookmark.';

/**
 * The one sentence a reader gets when the deployment has no book, and the one line that
 * fixes it. The loader's own message follows, because it names the paths it checked and
 * that is what whoever runs the server needs.
 */
export const NO_CONTENT_NOTE =
  'This server has no book to serve yet: the compiled content bundle is not on this ' +
  'machine. Whoever runs the server should run `bash scripts/fetch-book-content.sh` from ' +
  'the repository root, once, and start the server again.';

/**
 * The names for the id prefixes `groupsOf` divides a track by — the reading surface's
 * `chrome.groupLabels`, in the one language this server's own sentences have (§3 of the
 * sketch). A prefix with no entry is listed without a heading.
 */
const GROUP_LABELS: Readonly<Record<string, string>> = { F: 'Foundation', P: 'Main sequence' };

/**
 * Where a step is: `P01 · How a computer stores a number › Scientific notation · step 5 of 48`.
 *
 * The reading surface's place row, one transport over — the program's id and title, the
 * section the step is under, the position. The first version of this file printed
 * `## Step 5 of 48` and nothing else, so a reader thirty steps in had a number and no
 * name, and a reader choosing a program in `list_programs` had forty-seven ids to choose
 * among. The title lives in the bundle; it was never emitted.
 */
export function placeLine(unit: Unit, step: Step, language: string): string {
  const section = unit.sections?.find((candidate) => candidate.id === step.section);
  const where = section ? ` › ${say(section.titles, language)}` : '';
  return `${unit.id} · ${say(unit.titles, language)}${where} · step ${step.n} of ${unit.steps.length}`;
}

/** Render one step for a reader, in their edition. */
export function render(unit: Unit, step: Step, language: string): string {
  const parts: string[] = [`## ${placeLine(unit, step, language)}`];

  if (step.answer) {
    parts.push(
      `--- The book's answer to step ${step.n - 1} ---\n${say(step.answer, language)}\n` +
        '--- Compare your own answer with that before reading on ---',
    );
  }

  const title = step.titles ? say(step.titles, language) : undefined;
  parts.push(`${title ? `**${title}**\n\n` : ''}${say(step.body, language)}`);

  if (step.check) {
    parts.push(
      `This step has an exercise: lab "${step.check.lab}", exercise "${step.check.exercise}". ` +
        'The exercises run in the reader\'s browser and are not available through this server; ' +
        'the reading surface has them.',
    );
  }

  /*
    Reader-facing, and so naming no tool. The first version told the reader the next step
    "arrives through submit_answer", which is a sentence for the assistant; the assistant
    has the tool's own description for that. What the reader needs is the method's one
    instruction, or to know that this step asks nothing of them.
  */
  parts.push(
    step.cue
      ? 'Write your answer down before going on. The next step opens with the answer to this one.'
      : 'This step asks nothing; go on when you are ready.',
  );

  return parts.join('\n\n');
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
 */
export function completion(unit: Unit, language: string, next: Unit | undefined): string {
  const routes = unit.routes ?? [];
  const summary = routes.filter((route) => route.kind === 'summary');
  const outcomes = routes.filter((route) => route.kind === 'outcome');
  const range = (from: number, to: number): string => (from === to ? `step ${from}` : `steps ${from}–${to}`);
  const item = (route: { labels?: Text; from: number; to: number }): string =>
    `- ${route.labels ? say(route.labels, language) : ''} (${range(route.from, route.to)})`;

  const parts: string[] = [
    `## ${unit.id} · ${say(unit.titles, language)} · finished — all ${unit.steps.length} steps worked.`,
  ];
  if (summary.length > 0) {
    parts.push(`**Summary** — the book's own return index; each item names what a run of steps established, and the steps to re-read for it:\n${summary.map(item).join('\n')}`);
  }
  if (outcomes.length > 0) {
    parts.push(`**Can you?** — what the reader should now be able to do:\n${outcomes.map(item).join('\n')}`);
  }
  parts.push(
    next
      ? `**Next program:** ${next.id} · ${say(next.titles, language)}. To open it, call open_program with unit "${next.id}" (edition "${language}").`
      : 'This was the last program in the track. list_programs shows them all.',
  );
  return parts.join('\n\n');
}

/**
 * The track a call means when it names none: the only one, if there is only one.
 *
 * Every call used to require the track id, and a server that carries one track was making
 * the model carry `math-for-ai-engineers` through every turn for nothing. A server with
 * several still asks.
 */
function soleTrack(bundles: BundleSource): string | ToolResult {
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
function locate(bundles: BundleSource, track: string, unit: string): Located | ToolResult {
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

const isResult = (value: unknown): value is ToolResult =>
  typeof value === 'object' && value !== null && 'text' in value;

export interface Deps {
  readonly cursors: CursorStore;
  /** Injected so the unit tier runs against the committed fixture, never through bundleFor(). */
  readonly bundles: BundleSource;
  /**
   * True when the place is kept in this process's memory and forgotten at restart — the
   * store `server.ts` falls back to with no API to talk to. The results that show a place
   * then say so; a reader is told in the channel they can read.
   */
  readonly placeIsEphemeral?: boolean;
}

/**
 * Answer one tool call. The one thing wrapped here is the content going missing: a bundle
 * that was never fetched throws out of the loader, and that used to reach the host as a
 * JSON-RPC error on the reader's first call. It is a tool result now, with the fix in it.
 */
export async function handle(
  name: string,
  args: Record<string, unknown>,
  deps: Deps,
): Promise<ToolResult> {
  try {
    return await dispatch(name, args, deps);
  } catch (error) {
    if (error instanceof ContentUnavailable) return problem(`${NO_CONTENT_NOTE}\n\n${error.message}`);
    throw error;
  }
}

async function dispatch(
  name: string,
  args: Record<string, unknown>,
  deps: Deps,
): Promise<ToolResult> {
  const askedTrack = typeof args.track === 'string' ? args.track : '';
  const askedUnit = typeof args.unit === 'string' ? args.unit : '';
  const ephemeral = deps.placeIsEphemeral ? `\n\n${EPHEMERAL_NOTE}` : '';

  if (name === 'list_programs') {
    const places = await deps.cursors.readAll();
    const placeOf = (track: string, unit: string): Cursor | undefined =>
      places.find((cursor) => cursor.track === track && cursor.unit === unit);

    const lines: string[] = [];
    for (const bundle of deps.bundles.all()) {
      const editions = bundle.track.languages;
      lines.push(
        `Track "${bundle.track.id}" — ${editions.map((edition) => say(bundle.track.titles, edition)).join(' · ')} ` +
          `— editions: ${editions.join(', ')} — content tag: ${bundle.tag}`,
      );
      /*
        Grouped where the book is — its parts, or the id prefix — by the same function the
        index uses, so the two surfaces never divide the book two ways. One group is a
        list, and gets no heading.
      */
      for (const group of groupsOf(bundle)) {
        const heading = group.part
          ? editions.map((edition) => say(group.part!.titles, edition)).join(' · ')
          : group.prefix
            ? GROUP_LABELS[group.prefix]
            : undefined;
        if (heading) lines.push(`  ${heading}`);

        for (const program of group.units) {
          const cursor = placeOf(bundle.track.id, program.id);
          /*
            The title in the edition the reader is in, or in every edition until they have
            chosen one: a reader picks a program by what it is about, and a list of ids was
            a list of nothing to choose by.
          */
          const titled = cursor
            ? say(program.titles, cursor.language)
            : editions.map((edition) => say(program.titles, edition)).join(' · ');
          const total = program.steps.length;
          /*
            A place on the last step is "finished": no last step of this book asks
            anything (measured on the pinned bundle), so reaching it is reaching the end,
            and the hand-off is what open_program returns there.
          */
          const place = cursor
            ? cursor.step === total
              ? `finished (${total} steps)`
              : `at step ${cursor.step} of ${total}`
            : 'not opened';
          lines.push(`  ${heading ? '  ' : ''}${program.id} · ${titled} — ${total} steps — ${place}`);
        }
      }
    }
    return { text: lines.join('\n') + ephemeral };
  }

  const located = locate(deps.bundles, askedTrack, askedUnit);
  if (isResult(located)) return located;
  const { track, unit } = located;

  if (name === 'open_program') {
    const bundle = deps.bundles.for(track);
    const asked = typeof args.language === 'string' && args.language !== '' ? args.language : undefined;
    const existing = await deps.cursors.read(track, unit.id);

    /*
      The edition: the one asked for, else the one the reader was already in. A reader who
      resumes is not asked again — the first version required the argument on every call
      and then discarded it whenever a cursor existed, so the model asked a question whose
      answer went nowhere. A first opening still needs one, and a bad one names the editions.
    */
    const language = asked ? (bundle ? languageIn(bundle, asked) : undefined) : existing?.language;
    if (!language) {
      const offered = bundle?.track.languages.join(', ') ?? 'none';
      return problem(
        asked
          ? `The track "${track}" is not published in "${asked}". It has: ${offered}.`
          : `"${unit.id}" has not been opened before, so it needs an edition: one of ${offered}. Ask the reader which.`,
      );
    }

    const cursor: Cursor = existing ? { ...existing, language } : { track, unit: unit.id, language, step: FIRST_STEP };
    const saved = await deps.cursors.save(cursor);

    const served = current(unit, saved);
    if (!served.ok) return refusalResult(served.refusal);

    const opening = !existing
      ? `Starting "${unit.id}".`
      : existing.language !== saved.language
        ? `Resuming "${unit.id}" at step ${saved.step}, switched to the "${saved.language}" edition.`
        : `Resuming "${unit.id}" at step ${saved.step}.`;
    // On the last step the program is finished; the step is shown, and then where to next.
    const finished =
      saved.step === unit.steps.length ? `\n\n${completion(unit, saved.language, nextUnit(bundle, unit))}` : '';
    return { text: `${opening}\n\n${render(unit, served.step, saved.language)}${finished}${ephemeral}` };
  }

  const cursor = await deps.cursors.read(track, unit.id);
  if (!cursor) {
    return problem(`The reader has not opened "${unit.id}" yet. Call open_program first.`);
  }

  if (name === 'current_step') {
    const served = current(unit, cursor);
    if (!served.ok) return refusalResult(served.refusal);
    return { text: render(unit, served.step, cursor.language) };
  }

  if (name === 'review_step') {
    const n = typeof args.step === 'number' ? args.step : Number.NaN;
    const served = serve(unit, cursor, n);
    if (!served.ok) return refusalResult(served.refusal);
    return { text: render(unit, served.step, cursor.language) };
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
    if (answering !== cursor.step) {
      return refused(
        `Nothing recorded: the reader is on step ${cursor.step}, not step ${answering}` +
          (answering < cursor.step ? ' — that one was already answered.' : '.') +
          ` Here is the step they are on:\n\n${render(unit, unit.steps[cursor.step - 1]!, cursor.language)}`,
      );
    }

    const here = current(unit, cursor);
    if (!here.ok) return refusalResult(here.refusal);

    /*
      An answer is required where something was asked, and only there. A step with no cue
      asks nothing — the book's teaching frames — and the first version demanded a
      non-empty answer to go on from one, so the assistant invented a word or asked the
      reader to answer a question nobody put.
    */
    const answer = typeof args.answer === 'string' ? args.answer.trim() : '';
    if (here.step.cue && !answer) {
      return problem(
        'No answer was supplied. Ask the reader what they wrote — do not answer the step for them. ' +
          `"I don't know" is a valid answer and should be passed through as it stands.`,
      );
    }

    const recorded = answer
      ? `Recorded as the reader's answer to step ${cursor.step}:\n"${answer}"\n` +
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
        return { text: recorded + completion(unit, cursor.language, nextUnit(deps.bundles.for(track), unit)) };
      }
      return refusalResult(moved.refusal);
    }

    const saved = await deps.cursors.save(moved.cursor);
    const served = current(unit, saved);
    if (!served.ok) return refusalResult(served.refusal);

    return { text: recorded + render(unit, served.step, saved.language) };
  }

  return problem(`No such tool: ${name}`);
}
