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
    annotations: READS,
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
 */
export function placeUnavailableNote(failure: PlaceUnavailable): string {
  const status = failure.status === undefined ? '' : ` (HTTP ${failure.status})`;
  const kept =
    'Your place in the book could not be reached just now, and nothing is lost: it is kept ' +
    'on your account, exactly where you left it.' +
    (failure.writing
      ? ' This call may not have been recorded; either way, the same call is safe to make ' +
        'again once the place can be reached — it will not move you twice.'
      : '');

  switch (failure.reason) {
    case 'unauthorised':
      return (
        `${kept}\n\nThe service that keeps it would not let this server in${status}: the reader ` +
        'token it was started with has expired or is not valid. Whoever runs the server should ' +
        'give it a fresh AB_OVO_READER_TOKEN and start it again; trying again before that will ' +
        'not help.'
      );
    case 'unreachable':
      return `${kept}\n\nThe service that keeps it is out of reach or not answering right now${status}. Try again shortly.`;
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
 * The names for the id prefixes `groupsOf` divides a track by — the reading surface's
 * `chrome.groupLabels`, in the one language this server's own sentences have (§3 of the
 * sketch). A prefix with no entry is listed without a heading.
 */
const GROUP_LABELS: Readonly<Record<string, string>> = { F: 'Foundation', P: 'Main sequence' };

/**
 * Where a step is: `P01 · How a computer stores a number › Scientific notation · step 5 of 48`.
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
 * THE ONE QUESTION `open_program` ASKS, AS AN ORDINARY RESULT.
 *
 * Asked only when no edition is known for this reader at all, which is once: the answer
 * becomes a place, and every program after it starts in the edition that place is in. So
 * it is not an error — nothing was wrong with the call, the reader simply has not said yet
 * — and a result flagged as one is painted red by a host and apologised for by a model.
 * `isError` stays for an edition the track does not have, which names nothing.
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
  /**
   * Ask the reader to confirm or correct a step's answer directly, through the host's UI,
   * bypassing the model — MCP elicitation. Absent on a host that does not support it, which
   * `submit_answer` treats exactly like an `unavailable` outcome: trust the argument, as
   * before. Never called for a step with no cue, because there is nothing to confirm.
   */
  readonly elicit?: (step: number, proposed: string) => Promise<ElicitOutcome>;
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
 */
export async function handle(
  name: string,
  args: Record<string, unknown>,
  deps: Deps,
): Promise<ToolResult> {
  try {
    return await dispatch(name, args, deps);
  } catch (error) {
    if (error instanceof ContentUnavailable) return problem(noContentNote(error));
    if (error instanceof PlaceUnavailable) return problem(placeUnavailableNote(error));
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
    const asked = typeof args.language === 'string' && args.language !== '' ? args.language : undefined;
    const every = args.all === true;
    const places = await deps.cursors.readAll();
    const placeOf = (track: string, unit: string): Cursor | undefined =>
      places.find((cursor) => cursor.track === track && cursor.unit === unit);
    const readerEdition = asked ? undefined : await deps.cursors.edition();

    const lines: string[] = [];
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
      */
      for (const group of groupsOf(bundle)) {
        const heading = group.part
          ? say(group.part.titles, edition)
          : group.prefix
            ? GROUP_LABELS[group.prefix]
            : undefined;
        if (heading) lines.push(`  ${heading}`);
        const indent = heading ? '    ' : '  ';

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
            lines.push(`${indent}${programLine(first, doors.get(first.id)!, edition)}`);
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
          lines.push(`${indent}${programLine(program, door, edition)}`);
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
      BEFORE THE EDITION IS ASKED FOR, AND THAT ORDER IS THE POINT. A first opening needs an
      edition and the model is told to ask the reader for one; putting the gate after that
      would have the assistant ask "English or Polish?", wait for the answer, and only then
      say the program is not open — a question asked for nothing, in the reader's time.
    */
    const shut = await shutBehind(deps.cursors, bundle, track, unit, existing);
    if (shut) return refusalResult(shut);

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
        if (!language) return { text: editionQuestion(unit, editions, outcome.kind === 'declined') };
      }
    }

    const cursor: Cursor = existing ? { ...existing, language } : { track, unit: unit.id, language, step: FIRST_STEP };
    const saved = await deps.cursors.save(cursor);

    const served = current(unit, saved);
    if (!served.ok) return refusalResult(served.refusal);

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
    const finished =
      saved.step === unit.steps.length ? `\n\n${completion(unit, saved.language, nextUnit(bundle, unit))}` : '';
    return { text: `${opening}\n\n${render(unit, served.step, saved.language)}${finished}${ephemeral}` };
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
    const shut = await shutBehind(deps.cursors, deps.bundles.for(track), track, unit, undefined);
    if (shut) return refusalResult(shut);
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
      const outcome = await deps.elicit(cursor.step, proposed);
      if (outcome.kind === 'confirmed') {
        answer = outcome.answer.trim();
        confirmedByReader = true;
      } else if (outcome.kind === 'declined') {
        return refused(
          `Nothing recorded: asked the reader directly to confirm step ${cursor.step}'s answer ` +
            'and they declined or cancelled. Ask them in the conversation instead, and call ' +
            'submit_answer again once they have.',
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
