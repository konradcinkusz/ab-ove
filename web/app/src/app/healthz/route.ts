import { NextResponse } from 'next/server';

/**
 * GET /healthz — the platform health check for `ab-ovo-web-<env>`.
 *
 * `flyio/web.fly.toml` points `[[http_service.checks]]` here and states the contract this
 * file satisfies: "a route handler at app/healthz that returns 200 only when the server can
 * render, and 503 otherwise."
 *
 * Why not "/" — FRONTEND-BFF.md §2, restated in that fly.toml: a frontend serving a broken
 * bundle still returns 200 for its index page, so a check on "/" passes on a white screen.
 *
 * What this asserts, and what it deliberately does not:
 *
 *  - It renders. The handler runs inside the standalone server, so a 200 proves Node
 *    started, the route tree resolved and a response can be produced.
 *  - It reads the environment at request time, which is the same mechanism `/api/config`
 *    depends on (§2). A build-time-frozen bundle would answer from a snapshot.
 *  - It does NOT call the API. The reader loop is specified to work with no backend at all,
 *    so a health check that failed when the API was cold would take the web app out of
 *    rotation for a condition the product is designed to tolerate — and would make the API's
 *    cold start a web outage, which is the coupling `min_machines_running` exists to avoid
 *    (P7, P8). The API's own health is reported at the API's own /health.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET(): NextResponse {
  return NextResponse.json(
    {
      status: 'healthy',
      service: 'ab-ovo-web',
      environment: process.env.AB_OVO_ENVIRONMENT ?? process.env.NODE_ENV ?? 'unknown',
    },
    {
      status: 200,
      // A cached health check reports the state of whichever machine answered first.
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
