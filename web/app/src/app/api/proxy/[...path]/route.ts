import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { backendCandidates, type BackendId } from '@/lib/server/backends';
import { ACCESS_TOKEN_COOKIE } from '@/lib/session-cookies';
import { READER_ID_COOKIE, READER_ID_HEADER } from '@/lib/reader-cookie';

/**
 * The BFF proxy — FRONTEND-BFF.md §5.
 *
 * "Create exactly ONE catch-all BFF proxy route at app/api/proxy/[...path]/route.ts
 * fronting the whole estate. Do not add a hand-written route per backend."
 *
 * One route rather than one per backend is not tidiness. Everything below — the bearer
 * injection, the candidate ladder, the timeout, the streaming — is security-relevant or
 * environment-relevant, and a second hand-written route is a second copy of all of it that
 * will be fixed once and left broken elsewhere. §8's last row is the general form of that:
 * "Same bug fixed in one app, alive in three."
 */

export const dynamic = 'force-dynamic';

/**
 * Node, not Edge. The ladder's third rung is a Fly `.internal` address over the private
 * IPv6 network, and streaming an arbitrary upstream body through is a Node capability.
 */
export const runtime = 'nodejs';

/**
 * FRONTEND-BFF.md §5 — "The proxy routes by path prefix through a routing table
 * (/api/agentic/* -> agentic service, ... -> default), so the client has exactly one base
 * URL."
 *
 * Read top to bottom; the first match wins, and the empty prefix is the default. Adding a
 * backend is a row here, which is the point: the client keeps its single base URL and does
 * not learn that the estate grew.
 */
interface ProxyRoute {
  /** Matched against the path AFTER `/api/proxy/`. */
  readonly prefix: string;
  readonly backend: BackendId;
  /** Whether the prefix is part of the upstream path or only a selector. */
  readonly stripPrefix: boolean;
}

const ROUTING_TABLE: readonly ProxyRoute[] = [
  // /api/proxy/auth/login  ->  <authservice>/login
  { prefix: 'auth/', backend: 'authservice', stripPrefix: true },
  // ... -> default. /api/proxy/api/v1/info -> <api>/api/v1/info
  { prefix: '', backend: 'api', stripPrefix: false },
];

function selectRoute(path: string): { backend: BackendId; upstreamPath: string } {
  for (const route of ROUTING_TABLE) {
    if (path.startsWith(route.prefix)) {
      const remainder = route.stripPrefix ? path.slice(route.prefix.length) : path;
      return { backend: route.backend, upstreamPath: `/${remainder}` };
    }
  }
  // Unreachable: the last row's prefix is '' and every string starts with ''. Kept so the
  // function is total rather than relying on a reader noticing that.
  return { backend: 'api', upstreamPath: `/${path}` };
}

/**
 * FRONTEND-BFF.md §5 (citing P7 — the topology is cost-shaped) — "Size the proxy timeout
 * generously enough to cover a scale-to-zero cold start of the callee."
 *
 * §8: "Downloads fail after idle periods — Proxy timeout shorter than the callee's cold
 * start." The arithmetic this number has to cover is a Fly machine resuming, plus a .NET
 * runtime starting, plus a first connection to a Postgres that may itself be cold. A
 * fetch-shaped default of five or ten seconds is inside that window, which is why the
 * symptom is intermittent and only after idle periods — the worst kind to chase.
 */
const DEFAULT_TIMEOUT_MS = 45_000;

function timeoutMs(): number {
  const configured = Number.parseInt(process.env.AB_OVO_PROXY_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
}

/**
 * Headers that describe THIS hop and must not be forwarded, plus the two the client is not
 * allowed to have a say in.
 *
 * `authorization` is dropped because FRONTEND-BFF.md §5 says the proxy "never accepts an
 * Authorization header supplied by the client" — it is injected below from the cookie. A
 * proxy that forwards a client-supplied bearer is a proxy whose client holds a token, which
 * is the whole arrangement inverted.
 *
 * `cookie` is dropped because the session cookie is this app's, for this origin. Forwarding
 * it hands the backend a credential it has no use for and did not ask for.
 *
 * `READER_ID_HEADER` is dropped for the same reason as `authorization`, ADR-0061: it too is
 * injected below, from `ab_ovo_rid`, never accepted from the client directly — a client that
 * could set its own reader-id header could claim any other anonymous reader's cursor.
 */
const REQUEST_HEADERS_NOT_FORWARDED = new Set([
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'proxy-authorization',
  'proxy-authenticate',
  'te',
  'trailer',
  'content-length', // recomputed by fetch from the body actually sent
  'authorization',
  'cookie',
  READER_ID_HEADER,
]);

/**
 * FRONTEND-BFF.md §5 — "The proxy passes through the upstream status, body and relevant
 * headers rather than re-wrapping them in its own envelope", and specifically
 * "Content-Disposition and Content-Length passed through" — "without them the browser
 * cannot name the file or show progress."
 */
const RESPONSE_HEADERS_FORWARDED = [
  'content-type',
  'content-disposition',
  'content-length',
  'content-language',
  'cache-control',
  'etag',
  'last-modified',
  'expires',
  'vary',
  'retry-after',
  'location',
  'www-authenticate',
] as const;

function buildUpstreamHeaders(
  request: Request,
  bearer: string | undefined,
  readerId: string | undefined,
): Headers {
  const headers = new Headers();
  request.headers.forEach((value, name) => {
    if (!REQUEST_HEADERS_NOT_FORWARDED.has(name.toLowerCase())) headers.set(name, value);
  });

  /**
   * FRONTEND-BFF.md §1, §5 — "The BFF injects the token as a bearer header SERVER-SIDE when
   * proxying. Client code never constructs an Authorization header." This line is the
   * reason the cookie can be HttpOnly at all: the browser sends the cookie because it is
   * same-origin, this process reads it, and the token crosses to the backend from here —
   * never through anything a script can touch.
   */
  if (bearer) headers.set('authorization', `Bearer ${bearer}`);

  // ADR-0061 — same shape, for the anonymous reader's cursor: middleware.ts already
  // guarantees this cookie exists on every page request, so its absence here means a
  // client-initiated write reached the proxy through something other than a page (a
  // service worker, a hand-built fetch) rather than a reader who was never given one.
  if (readerId) headers.set(READER_ID_HEADER, readerId);

  return headers;
}

function buildResponseHeaders(upstream: Response): Headers {
  const headers = new Headers();
  for (const name of RESPONSE_HEADERS_FORWARDED) {
    const value = upstream.headers.get(name);
    if (value !== null) headers.set(name, value);
  }

  /**
   * One correction rather than a blind copy: if the upstream compressed the body, fetch has
   * already decompressed it by the time we read it, so the upstream `content-length`
   * describes bytes that no longer exist. Forwarding it truncates the response in the
   * browser. The header is dropped in that case and kept in every other, which is what
   * makes the §5 pass-through rule true for downloads rather than only for JSON.
   */
  if (upstream.headers.has('content-encoding')) headers.delete('content-length');

  return headers;
}

interface LadderFailure {
  kind: 'timeout' | 'unreachable';
  detail: string;
}

/**
 * Walk FRONTEND-BFF.md §5's candidate ladder.
 *
 *   1. explicit env var
 *   2. orchestrator service-discovery variables (services__<name>__https__0)
 *   3. internal DNS name
 *   4. localhost
 *
 * "The ladder is what makes ONE CODE PATH work on a laptop, under Aspire, and on every
 * cloud platform, with zero per-environment code." There is accordingly no `if (production)`
 * anywhere below, and none may be added: the environments differ in which rung answers,
 * never in which code runs.
 */
async function forwardThroughLadder(
  backend: BackendId,
  upstreamPath: string,
  search: string,
  method: string,
  headers: Headers,
  body: ArrayBuffer | undefined,
): Promise<{ ok: true; response: Response } | { ok: false; failure: LadderFailure }> {
  const candidates = backendCandidates(backend);
  let lastDetail = 'no candidate was configured';
  let timedOut = false;

  /**
   * A 403 that was stepped over, buffered so it can still be the answer.
   *
   * Advancing past a 403 is §5's rule, but it must not DESTROY the backend's answer: if
   * rung one says 403 because the reader genuinely lacks the role, and every later rung is
   * simply not there, then 403 is the truth and a synthesised 503 would be this proxy
   * inventing an outage. The body is read rather than the Response held, because an
   * unconsumed body keeps a socket open for as long as the rest of the ladder takes.
   */
  let deferred: { status: number; statusText: string; headers: Headers; body: ArrayBuffer } | null =
    null;

  for (const base of candidates) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs());

    try {
      const response = await fetch(`${base}${upstreamPath}${search}`, {
        method,
        headers,
        body,
        redirect: 'manual',
        cache: 'no-store',
        signal: controller.signal,
      });

      /**
       * FRONTEND-BFF.md §5 — "In the ladder, treat a 403 as 'wrong ingress, try the next
       * candidate' rather than as a terminal failure."
       *
       * §8: "Proxy 403s only in one environment — Candidate ladder missing that
       * environment's rung." A platform's edge answering 403 for an address that is right
       * on a laptop and wrong here is indistinguishable, from this side, from an
       * authorization decision; treating it as terminal is what produces the
       * works-everywhere-except-one-environment symptom. If a later rung answers, that
       * rung was the right ingress. If none does, the 403 is returned unchanged below and
       * the caller sees the backend's own answer.
       */
      if (response.status === 403 && base !== candidates[candidates.length - 1]) {
        lastDetail = `403 from ${base} — treated as wrong ingress`;
        deferred ??= {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          body: await response.arrayBuffer(),
        };
        continue;
      }

      return { ok: true, response };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        timedOut = true;
        lastDetail = `timed out after ${timeoutMs()}ms against ${base}`;
      } else {
        lastDetail = `${base}: ${error instanceof Error ? error.message : String(error)}`;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  if (deferred) {
    // Nothing further up the ladder answered, so the 403 was the ingress after all.
    return {
      ok: true,
      response: new Response(deferred.body, {
        status: deferred.status,
        statusText: deferred.statusText,
        headers: deferred.headers,
      }),
    };
  }

  return {
    ok: false,
    failure: { kind: timedOut ? 'timeout' : 'unreachable', detail: lastDetail },
  };
}

async function handle(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
): Promise<Response> {
  const { path } = await context.params;
  const joined = (path ?? []).join('/');
  const { backend, upstreamPath } = selectRoute(joined);

  const store = await cookies();
  const bearer = store.get(ACCESS_TOKEN_COOKIE)?.value;
  const readerId = store.get(READER_ID_COOKIE)?.value;

  /**
   * The request body is BUFFERED; the response body is STREAMED. The asymmetry is
   * deliberate and it is the ladder's price.
   *
   * A `ReadableStream` can be consumed once, so a request body left as a stream could be
   * sent to the first candidate and to no other — the retry that §5 requires would send an
   * empty body to rung two and produce a 400 that looks like the backend's fault. Requests
   * through this proxy are commands and forms, measured in kilobytes. Responses are where
   * the size is, and §5 is unambiguous about those: "Large binaries (downloads) are
   * STREAMED through the proxy, never buffered into memory" — §8 lists a buffered response
   * as a cause of downloads failing.
   */
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const body = hasBody ? await request.arrayBuffer() : undefined;

  const result = await forwardThroughLadder(
    backend,
    upstreamPath,
    new URL(request.url).search,
    request.method,
    buildUpstreamHeaders(request, bearer, readerId),
    body && body.byteLength > 0 ? body : undefined,
  );

  if (!result.ok) {
    /**
     * FRONTEND-BFF.md §5 — "The proxy uses an AbortController timeout, and maps that
     * timeout to HTTP 504", and "Return 503 only when EVERY candidate in the ladder has
     * failed." Two different answers because they are two different faults: 504 says the
     * backend is there and did not finish in time, 503 says nothing answered at all. An
     * operator reading one of these should not have to guess which happened.
     */
    const status = result.failure.kind === 'timeout' ? 504 : 503;
    return NextResponse.json(
      {
        error: status === 504 ? 'the backend did not respond in time' : 'no backend answered',
        backend,
        detail: result.failure.detail,
      },
      { status, headers: { 'cache-control': 'no-store' } },
    );
  }

  const upstream = result.response;

  /**
   * `upstream.body` is handed over as the stream it already is — not read, not buffered,
   * not re-encoded. A download of any size crosses this function in constant memory, and
   * the browser gets its filename and its progress bar from the headers copied above.
   */
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: buildResponseHeaders(upstream),
  });
}

/**
 * One implementation, exported under each verb. Next requires a named export per method;
 * a `handle` that differs between them would be several proxies wearing one path.
 */
export const GET = handle;
export const HEAD = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
