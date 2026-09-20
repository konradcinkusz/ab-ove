/**
 * The one prompt, and the completions for its arguments.
 *
 * A host surfaces a server's prompts as menu entries or slash-commands, which is the only
 * way a reader who installed the server and does not know its tool names finds the way in.
 * Tools are what the MODEL calls; a prompt is what the READER picks. So there is one, it is
 * named for what the reader wants to do, and its message states the method before it asks
 * for the first step — the same order `SERVER_INSTRUCTIONS` puts things in, because the
 * first thing that happens otherwise is an assistant helpfully working frame 1.
 *
 * Pure logic, no protocol: `server.ts` registers these on the low-level `Server`, and
 * `server.test.ts` drives them over an in-memory transport.
 */
import { groupsOf } from './content.ts';
import type { BundleSource } from './content.ts';

export interface PromptArgument {
  readonly name: string;
  readonly description: string;
  readonly required: boolean;
}

export interface PromptDefinition {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly arguments: readonly PromptArgument[];
}

export const READ_PROMPT: PromptDefinition = {
  name: 'read',
  title: 'Work a program of the book with me',
  description:
    'Read a program of Mathematics from Zero for the AI Engineer one step at a time: each ' +
    'step asks for something, the reader answers in their own words, and the next step ' +
    'opens with the book\'s answer. Name a program, or leave it out to choose one.',
  arguments: [
    {
      name: 'program',
      description: 'The program id, e.g. "P01" — the completions list them. Leave it out to be shown the list.',
      required: false,
    },
    {
      name: 'language',
      description: 'The edition to read, "en" or "pl". Needed the first time a program is opened.',
      required: false,
    },
  ],
};

export const PROMPTS: readonly PromptDefinition[] = [READ_PROMPT];

export interface PromptMessage {
  readonly role: 'user';
  readonly content: { readonly type: 'text'; readonly text: string };
}

/**
 * The message the host inserts when the reader picks the prompt. Addressed to the
 * assistant in the reader's voice, because that is who says it: it states the method in
 * three sentences and then says which tool to call first, with the arguments the reader
 * supplied and none it did not.
 */
export function promptMessages(
  name: string,
  args: Readonly<Record<string, string>>,
): { readonly description: string; readonly messages: readonly PromptMessage[] } | undefined {
  if (name !== READ_PROMPT.name) return undefined;

  const program = args['program']?.trim();
  const language = args['language']?.trim();

  const method =
    'I want to work a program of the book with you, one step at a time. The method: show me ' +
    'one step as the server gives it, then stop and let me answer it myself. Do not answer ' +
    'the step for me, do not work it out to check, and pass my answer to submit_answer ' +
    'exactly as I wrote it. The next step opens with the book\'s own answer, and comparing ' +
    'mine with it is the lesson.';

  const opening = program
    ? `Open ${program} with open_program${language ? ` in the "${language}" edition` : ''}` +
      (language ? '' : ' — if it has not been opened before, ask me which edition, en or pl') +
      ', and show me the step I am on.'
    : 'Call list_programs and show me the programs by title, grouped as the server groups ' +
      'them, so I can choose one. Then open the one I name with open_program' +
      (language ? ` in the "${language}" edition` : ', asking me which edition if it needs one') +
      '.';

  return {
    description: READ_PROMPT.description,
    messages: [{ role: 'user', content: { type: 'text', text: `${method}\n\n${opening}` } }],
  };
}

/**
 * What the host offers as the reader types an argument. A completion value is what the
 * host inserts, so these are ids — the titles stay in `list_programs` and in the prompt's
 * own description. Matched on the id's start, in any case, in the manifest's order; the
 * protocol caps a list at a hundred and the book is under that.
 */
export function completeArgument(
  bundles: BundleSource,
  promptName: string,
  argument: { readonly name: string; readonly value: string },
): readonly string[] {
  if (promptName !== READ_PROMPT.name) return [];
  const typed = argument.value.toLowerCase();

  if (argument.name === 'program') {
    return bundles
      .all()
      .flatMap((bundle) => groupsOf(bundle).flatMap((group) => group.units))
      .map((unit) => unit.id)
      .filter((id) => id.toLowerCase().startsWith(typed))
      .slice(0, 100);
  }

  if (argument.name === 'language') {
    const seen = new Set<string>();
    for (const bundle of bundles.all()) {
      for (const language of bundle.track.languages) seen.add(language);
    }
    return [...seen].filter((language) => language.toLowerCase().startsWith(typed));
  }

  return [];
}
