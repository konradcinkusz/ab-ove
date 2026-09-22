'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { READER_ID_COOKIE } from '@/lib/reader-cookie';
import { postAdvance } from '@/lib/server/content';
import { ACCESS_TOKEN_COOKIE } from '@/lib/session-cookies';

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
 * from a real submission — a `<form action={revealStep.bind(...)}>` needs no client
 * JavaScript at all, and `frame-keys.tsx`/`answer-line.tsx` call this same function directly
 * for the keyboard paths, rather than each holding its own fetch.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * `nextUrl` is a FIXED URL the caller already knows — `.../${answeringStep + 1}` — never
 * read out of the advance response. Revealing from step N always leaves N+1 servable
 * afterwards, whether this call genuinely raised the cursor or found it already past N+1 (a
 * reader who went back to re-read an earlier frame and pressed reveal again — the same
 * idempotency `submit_answer` already relies on in the MCP tool surface, reused here). So
 * there is nothing in the response this function needs to decide where to send the reader.
 *
 * ON REFUSAL OR AN UNREACHABLE API THIS DOES NOT REDIRECT. Next re-renders the current route
 * after any Server Action, which re-fetches this step with the same `cache: 'no-store'` read
 * every ordinary page load uses — showing the API-unavailable screen if that is what
 * happened, exactly as a plain reload would. A genuine gate refusal cannot reach this
 * function in the first place: the control that calls it is only ever rendered when a next
 * step exists AND this page itself was servable, which is precisely the one case
 * `Reveal.Advance` cannot answer `ProgramComplete` to.
 */
export async function revealStep(
  track: string,
  unit: string,
  language: string,
  answeringStep: number,
  nextUrl: string,
): Promise<void> {
  const store = await cookies();
  const identity = {
    bearer: store.get(ACCESS_TOKEN_COOKIE)?.value,
    readerId: store.get(READER_ID_COOKIE)?.value,
  };

  const outcome = await postAdvance(track, unit, { answeringStep, language }, identity);

  if (outcome.kind === 'ok' && outcome.data.ok) {
    redirect(nextUrl);
  }
}
