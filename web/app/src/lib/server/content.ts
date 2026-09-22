import type {
  AdvanceBody,
  StepResponse,
  TrackContent,
  UnitSummary,
} from '@/lib/content/wire';

import { backendCandidates } from './backends.ts';

/**
 * The reading surface's only door to the book — ADR-0060. Every read and every advance goes
 * through `AbOvo.Api`'s content endpoints; nothing under `src/app/read/**` reads a compiled
 * bundle from disk any more (that path, `@ab-ovo/web-kit`'s `bundleFor`, still exists for
 * `web/mcp` and for the unit tier, which is deliberately not this).
 *
 * The wire shapes live in `lib/content/wire.ts`, not here — see that file for why. This
 * module holds only the calls: the candidate ladder, the per-candidate timeout, and an
 * OUTCOME union rather than a thrown error or a raw `Response`, on `account-deletion.ts`'s
 * pattern exactly (the candidate ladder, `redirect: 'manual'`, `cache: 'no-store'`).
 */

const CONTENT_PATH = '/api/v1/content';

/**
 * Shorter than `account-deletion.ts`'s 45s: that module runs once, on a reader's own
 * confirmed action. This runs on every frame a reader turns to, so a slow candidate must
 * fail fast enough that the ladder's later rungs still have time to answer inside a reader's
 * patience for a page load.
 */
const DEFAULT_TIMEOUT_MS = 8_000;

/**
 * What a GUESSED rung (`backends.ts`'s own word for internal DNS and `localhost` — rungs 3
 * and 4, never confirmed reachable by anything an operator said) gets instead of the full
 * budget above.
 *
 * Measured on this suite's own reading spec: one brief stall reaching the CONFIGURED address
 * was enough to walk the ladder down to `ab-ovo-api.internal`, whose DNS lookup resolves to
 * nothing anywhere outside a real Fly deployment — and a `.internal` TLD is exactly the shape
 * that can eat several real seconds failing rather than answering NXDOMAIN at once, on a
 * runner whose resolver has no authority for it. Charging that guess the SAME eight seconds
 * as the address an operator actually configured turned one brief hiccup on rung one into a
 * ladder walk long enough to blow a reader's whole page-load patience — and, inside this
 * suite, Playwright's test timeout. A guess that was never going to answer should fail fast;
 * only the configured rung (the first one `backendCandidates` ever returns) has earned the
 * full budget.
 */
const GUESSED_RUNG_TIMEOUT_MS = 1_500;

function timeoutMs(): number {
  const configured = Number.parseInt(process.env.AB_OVO_API_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
}

/** Mirrors `AbOvo.Api.Extensions.ReaderIdentity.HeaderName`. */
const READER_ID_HEADER = 'X-Ab-Ovo-Reader-Id';

/** Who is asking — a signed-in reader's bearer, an anonymous one's cursor cookie, or neither. */
export interface ReaderIdentity {
  readonly bearer?: string;
  readonly readerId?: string;
}

/**
 * What a call against the content API came back with, in this application's terms — never a
 * thrown error and never a raw `Response`.
 *
 * `not-found` is a READER's problem (a URL naming a track or program that does not exist) and
 * `unavailable` is DEPLOYMENT's (every candidate failed to answer at all) — the same split
 * `bundleFor`'s own doc comment draws between "the page is absent" and "a 500 with a sentence
 * in the log", carried over a network instead of a disk read.
 */
export type ContentOutcome<T> =
  | { readonly kind: 'ok'; readonly data: T }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'unavailable'; readonly reason: string };

/** Injectable for tests, on `delete-account.ts`'s pattern. The global is production's only implementation. */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

function identityHeaders(identity: ReaderIdentity): Headers {
  const headers = new Headers({ accept: 'application/json' });
  // A signed-in reader's bearer wins when both are present — ReaderIdentity.Resolve reads
  // the same way, and sending both when only one will be honoured is not a choice a caller
  // needs to make correctly, so it is not asked to.
  if (identity.bearer) headers.set('authorization', `Bearer ${identity.bearer}`);
  else if (identity.readerId) headers.set(READER_ID_HEADER, identity.readerId);
  return headers;
}

/**
 * One request against the content API, walking the candidate ladder exactly as
 * `forgetRowsAt`/`deleteAccount` do: only a transport failure or a non-2xx-non-404 status
 * advances to the next rung. UNLIKE those two, not every rung gets the full timeout — only
 * the first, CONFIGURED one does (`backendCandidates`'s own ordering guarantee); every rung
 * after it is a guess (`GUESSED_RUNG_TIMEOUT_MS`'s own doc comment says why a guess earns far
 * less of a reader's patience than the address an operator actually set).
 */
async function request<T>(
  method: 'GET' | 'POST',
  path: string,
  identity: ReaderIdentity,
  body: unknown,
  fetchImpl: FetchLike,
): Promise<ContentOutcome<T>> {
  const candidates = backendCandidates('api');
  let last: ContentOutcome<T> = { kind: 'unavailable', reason: 'no api is configured' };

  for (const [index, base] of candidates.entries()) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      index === 0 ? timeoutMs() : GUESSED_RUNG_TIMEOUT_MS,
    );

    try {
      const headers = identityHeaders(identity);
      if (body !== undefined) headers.set('content-type', 'application/json');

      const response = await fetchImpl(`${base}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        // Following a redirect would send the bearer to an address nobody chose — the same
        // reasoning `deleteAccount` gives.
        redirect: 'manual',
        cache: 'no-store',
        signal: controller.signal,
      });

      if (response.status === 404) return { kind: 'not-found' };

      if (response.ok) {
        const data = (await response.json()) as T;
        return { kind: 'ok', data };
      }

      /*
       * A RUNG THAT SAYS "SLOW DOWN" IS A RUNG THAT ANSWERED, so the ladder stops on it —
       * ADR-0018's "a rejection is terminal; only a transport failure walks the ladder",
       * which that ADR wrote for a password and named "a rate-limited address" among the
       * outcomes a client must not flatten. Sign-in has obeyed it since; this module did not.
       *
       * Every other non-2xx is ambiguous — a gateway in front of a service that is not
       * there answers 502 the same way one in front of a service that is broken does — and
       * the ladder exists for exactly that ambiguity. A 429 is not ambiguous: it is
       * `AbOvo.Api`'s own rate limiter, which means the address this deployment was given
       * is up and is talking. Walking past it asks the SAME service again through a name it
       * was never reached by, then ends on `localhost:8080`, a rung this application
       * invented — so the reason carried back names an address nobody configured and the
       * next person reads "the API is not deployed" off a service that is merely busy.
       * Measured in CI, where a rate-limited run reported
       * `content API unavailable: http://localhost:8080: fetch failed` with a healthy API
       * answering on the configured rung throughout.
       *
       * On Fly it is also a real cost, not only a misleading line: rung three is a
       * `.internal` lookup with no authority to answer it, which `GUESSED_RUNG_TIMEOUT_MS`'s
       * own comment says can eat seconds before failing.
       */
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        return {
          kind: 'unavailable',
          reason: `${base}: api answered 429${retryAfter ? `, retry after ${retryAfter}s` : ''}`,
        };
      }

      last = { kind: 'unavailable', reason: `api answered ${response.status}` };
    } catch (error) {
      const rungTimeout = index === 0 ? timeoutMs() : GUESSED_RUNG_TIMEOUT_MS;
      const detail =
        error instanceof Error && error.name === 'AbortError'
          ? `timed out after ${rungTimeout}ms`
          : error instanceof Error
            ? error.message
            : String(error);
      last = { kind: 'unavailable', reason: `${base}: ${detail}` };
    } finally {
      clearTimeout(timer);
    }
  }

  return last;
}

const path = (...segments: readonly (string | number)[]): string =>
  [CONTENT_PATH, ...segments.map((segment) => encodeURIComponent(String(segment)))].join('/');

/** The current bundle's tag, editions and every program — `GET /api/v1/content/{track}`. */
export function fetchTrackContent(
  track: string,
  identity: ReaderIdentity,
  fetchImpl: FetchLike = fetch,
): Promise<ContentOutcome<TrackContent>> {
  return request('GET', path(track), identity, undefined, fetchImpl);
}

/** A program's title, section headings and step count — never a step's body. */
export function fetchUnitSummary(
  track: string,
  unit: string,
  identity: ReaderIdentity,
  fetchImpl: FetchLike = fetch,
): Promise<ContentOutcome<UnitSummary>> {
  return request('GET', path(track, unit), identity, undefined, fetchImpl);
}

/** One step, subject to the reveal gate — `refusal` rather than a thrown error when refused. */
export function fetchStep(
  track: string,
  unit: string,
  step: number,
  identity: ReaderIdentity,
  fetchImpl: FetchLike = fetch,
): Promise<ContentOutcome<StepResponse>> {
  return request('GET', path(track, unit, step), identity, undefined, fetchImpl);
}

/**
 * Submit the reader's answer and reveal the next step — the only way this application's
 * cursor moves forward. `identity` MUST carry a bearer or a reader id, or `AbOvo.Api` answers
 * 400 (`NoIdentity`), which this function reports as `unavailable`: a page that reaches this
 * call with neither has a defect upstream of it, not a reader with a bad request.
 */
export function postAdvance(
  track: string,
  unit: string,
  body: AdvanceBody,
  identity: ReaderIdentity,
  fetchImpl: FetchLike = fetch,
): Promise<ContentOutcome<StepResponse>> {
  return request('POST', path(track, unit, 'advance'), identity, body, fetchImpl);
}
