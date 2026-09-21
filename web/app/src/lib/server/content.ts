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

/** One candidate's own attempt — never thrown, so the caller can decide whether to retry it. */
type Attempt<T> = { readonly outcome: ContentOutcome<T> } | { readonly transportFailure: string };

async function attemptOnce<T>(
  base: string,
  path: string,
  method: 'GET' | 'POST',
  identity: ReaderIdentity,
  body: unknown,
  fetchImpl: FetchLike,
): Promise<Attempt<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());

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

    if (response.status === 404) return { outcome: { kind: 'not-found' } };
    if (response.ok) {
      const data = (await response.json()) as T;
      return { outcome: { kind: 'ok', data } };
    }
    return { outcome: { kind: 'unavailable', reason: `api answered ${response.status}` } };
  } catch (error) {
    const detail =
      error instanceof Error && error.name === 'AbortError'
        ? `timed out after ${timeoutMs()}ms`
        : error instanceof Error
          ? error.message
          : String(error);
    return { transportFailure: detail };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One request against the content API, walking the candidate ladder exactly as
 * `forgetRowsAt`/`deleteAccount` do: every rung gets the full timeout, and only a transport
 * failure or a non-2xx-non-404 status advances to the next one.
 *
 * A BARE TRANSPORT FAILURE ON A RUNG GETS ONE IMMEDIATE RETRY BEFORE THAT RUNG IS GIVEN UP ON.
 * Every read here is a request the reader is already waiting on (ADR-0060 — this is the only
 * door to the book now), fired from a long-lived Node process reusing keep-alive sockets
 * against a long-lived Kestrel one. The pair race exactly the way HTTP/1.1 keep-alive always
 * can: Kestrel closes an idle connection at the same moment undici hands that same connection
 * back out, and the request fails before either side sent a byte — undici's own "fetch
 * failed" for a socket that was never live for this attempt. That is not the candidate being
 * unreachable, and falling through to the NEXT rung (internal DNS or `localhost`, neither of
 * which anything is listening on outside a deployed estate) turns one lost socket into an
 * outage. A fresh connection resolves it, so one retry happens before the rung is charged
 * with a real failure; an HTTP-level error response is never retried this way, since that
 * candidate answered and retrying it blindly would risk a second identical POST.
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

  for (const base of candidates) {
    let attempt = await attemptOnce<T>(base, path, method, identity, body, fetchImpl);
    if ('transportFailure' in attempt) {
      attempt = await attemptOnce<T>(base, path, method, identity, body, fetchImpl);
    }

    if ('transportFailure' in attempt) {
      last = { kind: 'unavailable', reason: `${base}: ${attempt.transportFailure}` };
      continue;
    }
    if (attempt.outcome.kind === 'unavailable') {
      last = attempt.outcome;
      continue;
    }
    return attempt.outcome;
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
