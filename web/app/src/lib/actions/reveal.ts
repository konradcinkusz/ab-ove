'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { READER_ID_COOKIE } from '@/lib/reader-cookie';
import { postAdvance } from '@/lib/server/content';
import { ACCESS_TOKEN_COOKIE } from '@/lib/session-cookies';

import { revealFailureOf, type RevealState } from './reveal-outcome.ts';

/**
 * Reveal the step after `answeringStep`, by raising this reader's cursor — ADR-0060: the
 * only way it moves is `POST .../advance` (`AbOvo.Api.Content.Reveal`).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * A SERVER ACTION, NOT A `<Link>`, BECAUSE THE REVEAL IS NOW A WRITE.
 *
 * `frame-view.tsx` used to send a reader forward with a plain navigation, and `prefetch=
 * {false}` existed so Next's own link-prefetching could not pull the next frame's answer
 * over the wire before the reader had committed to anything. That defence assumed the next
 * frame was already SERVABLE and only needed to stay unfetched — which stopped being true
 * the day serving it started requiring this reader's cursor to already be there. A bare GET
 * to `.../n+1` cannot be what raises it any more, or a prefetch, a crawler, or a shared link
 * would silently advance a reader who never pressed anything. So revealing is a POST, issued
 * from a real submission — a `<form>` posting `revealStep.bind(...)` needs no client
 * JavaScript at all, and `frame-keys.tsx`/`answer-line.tsx` SUBMIT THAT SAME FORM for the
 * keyboard paths (`reveal-form.tsx`'s `pressNext`), rather than each holding its own fetch or
 * its own call to this function.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * `nextUrl` is a FIXED URL the caller already knows — `.../${answeringStep + 1}` — never
 * read out of the advance response. Revealing from step N always leaves N+1 servable
 * afterwards, whether this call genuinely raised the cursor or found it already past N+1 (a
 * reader who went back to re-read an earlier frame and pressed reveal again — the same
 * idempotency `submit_answer` already relies on in the MCP tool surface, reused here). So
 * there is nothing in the response this function needs to decide where to send the reader.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ON REFUSAL OR AN UNREACHABLE API THIS DOES NOT REDIRECT, AND IT RETURNS WHY (#138).
 *
 * This comment used to promise that Next re-renders the current route after any Server
 * Action, so a failure would re-fetch this step and show the API-unavailable screen, "exactly
 * as a plain reload would". Next 16 does not: an action that revalidates nothing skips page
 * rendering (`skipPageRendering` in `next/dist/server/app-render/action-handler.js`), so the
 * reader was left on the same frame with no word, no busy state and no change of address —
 * measured with the API stopped, twelve seconds of nothing.
 *
 * So the failure is a VALUE: `reveal-form.tsx` hands this function to `useActionState`, which
 * renders what it returns as one sentence beside `Next` — and, with no script, Next renders the
 * same frame with that state in it (the action's `formState`), so the form a reader without
 * JavaScript submits says the same thing. What it returns is a word and nothing else
 * (`reveal-outcome.ts`): the next frame stays unserved until an advance succeeds (ADR-0014,
 * ADR-0060).
 *
 * A genuine gate refusal cannot reach this function in the first place: the control that
 * calls it is only ever rendered when a next step exists AND this page itself was servable,
 * which is precisely the one case `Reveal.Advance` cannot answer `ProgramComplete` to. If one
 * ever did, it is still a page that did not turn, and it says so rather than nothing.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * `useActionState` calls this with its previous state and the form's data after the bound
 * arguments; neither is read, because nothing the browser posts decides anything here.
 */
export async function revealStep(
  track: string,
  unit: string,
  language: string,
  answeringStep: number,
  nextUrl: string,
): Promise<RevealState> {
  const store = await cookies();
  const identity = {
    bearer: store.get(ACCESS_TOKEN_COOKIE)?.value,
    readerId: store.get(READER_ID_COOKIE)?.value,
  };

  const outcome = await postAdvance(track, unit, { answeringStep, language }, identity);

  if (outcome.kind === 'ok' && outcome.data.ok) {
    redirect(nextUrl);
  }

  /*
    The reason goes to the server's log and never to the reader: it names backend addresses
    (FRONTEND-BFF.md §1), and it is what an operator needs to tell "the API is down" from "the
    API refused this call" — the line the page's own failure path gets from its thrown error.
  */
  console.error(
    `reveal ${track}/${unit} from step ${answeringStep} did not advance: ${
      outcome.kind === 'unavailable'
        ? outcome.reason
        : outcome.kind === 'ok'
          ? `refused (${outcome.data.refusal?.kind ?? 'no refusal given'})`
          : 'not found'
    }`,
  );
  return { failed: revealFailureOf(outcome) };
}
