import type { Page, Route } from '@playwright/test';

/**
 * What AbOvo.Api's /api/v1/info answers with, and how to put a known answer in front of the
 * browser.
 *
 * THIS MODULE CONTAINS NO ASSERTIONS AND NO WAITS. E2E-ACCEPTANCE-TESTING.md §4 warns that a
 * custom assertion-wait wrapper must be verified by reading its body, because the audited
 * estate shipped one that accepted a `timeoutMs` and ignored it in five of its seven
 * methods — indistinguishable from the call site. The cheapest way to be sure that cannot
 * happen here is for the shared code to have nothing to hide: everything below either
 * describes a payload or installs a route handler. Every assertion and every wait lives in
 * a spec file, in plain sight.
 */

/**
 * The path the browser actually asks for.
 *
 * The chain is worth writing down because no single file shows it. The client component
 * calls `getRuntimeConfig()`, which reads GET /api/config, which answers
 * `apiBaseUrl: '/api/proxy'`; the component then fetches `${apiBaseUrl}/api/v1/info`. So the
 * browser requests `/api/proxy/api/v1/info` on this app's own origin, and the BFF proxy
 * resolves the real backend server-side. Intercepting here intercepts the browser's half of
 * that, which is the half these specs are about.
 */
export const SERVICE_INFO_ROUTE = '**/api/proxy/api/v1/info';

export interface IntegrationPayload {
  readonly name: string;
  readonly state: string;
  readonly detail: string;
}

export interface ServiceInfoPayload {
  readonly service: string;
  readonly version: string;
  readonly environment: string;
  readonly integrations: readonly IntegrationPayload[];
}

/**
 * The four optional integrations AbOvo.Api registers, with the two states it can report.
 *
 * These names are not invented for the test. Each is an `AddIntegrationStatus(...)` call in
 * src/AbOvo.ServiceDefaults — `database`, `auth`, `cors`, `otlp` — and SystemEndpoints.cs
 * maps each one's boolean to the literal string "live" or "degraded" and to nothing else.
 * A fifth state appearing in the API is a change this fixture has to be told about, which
 * is the right amount of friction for a change of that kind.
 *
 * The `detail` strings are chosen so that no integration's name appears inside another
 * row's text. The specs locate a row by filtering list items on the integration's name, and
 * a detail mentioning a neighbour would make that filter match two rows — the assertion
 * `toHaveCount(1)` in the spec is what would catch it, but it is cheaper not to write the
 * collision in the first place.
 */
export const SAMPLE_INTEGRATIONS: readonly IntegrationPayload[] = [
  { name: 'auth', state: 'live', detail: 'RS256 validated against the published key set' },
  { name: 'cors', state: 'degraded', detail: 'no browser origin is allowed; the site calls through its own origin' },
  { name: 'database', state: 'live', detail: 'PostgreSQL' },
  { name: 'otlp', state: 'degraded', detail: 'no exporter endpoint is configured' },
];

export const SAMPLE_SERVICE_INFO: ServiceInfoPayload = {
  service: 'AbOvo.Api',
  version: '0.1.0',
  environment: 'Development',
  integrations: SAMPLE_INTEGRATIONS,
};

/** Answer the browser's info request with a known payload. */
export async function serveServiceInfo(page: Page, payload: ServiceInfoPayload): Promise<void> {
  await page.route(SERVICE_INFO_ROUTE, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    }),
  );
}

/**
 * Answer the browser's info request the way the BFF proxy answers when the backend is not
 * usable.
 *
 * The status codes are the proxy's own, from app/api/proxy/[...path]/route.ts: 503 when
 * every rung of the candidate ladder failed, 504 when a rung was reached and did not finish
 * inside the timeout. They are two different faults and the product says two different
 * things about them, so the suite has to be able to produce each one exactly.
 */
export async function serveProxyFailure(page: Page, status: 503 | 504): Promise<void> {
  const body =
    status === 503
      ? { error: 'no backend answered', backend: 'api', detail: 'no candidate was configured' }
      : { error: 'the backend did not respond in time', backend: 'api', detail: 'timed out after 45000ms' };

  await page.route(SERVICE_INFO_ROUTE, (route: Route) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    }),
  );
}

/**
 * Make the browser's info request fail at the transport, as a reader on a broken network or
 * in front of a dead deployment would experience it.
 *
 * This is a harder case than a 503, and a different one: a 503 is the app's own server
 * answering that it could not reach a backend, whereas an aborted request never reaches a
 * server at all and lands in the component's `catch`. The product has to survive both.
 */
export async function serveNetworkFailure(page: Page): Promise<void> {
  await page.route(SERVICE_INFO_ROUTE, (route: Route) => route.abort('failed'));
}
