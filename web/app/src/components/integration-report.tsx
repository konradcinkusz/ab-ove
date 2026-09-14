'use client';

import { useEffect, useState } from 'react';

import { getRuntimeConfig } from '@/lib/runtime-config.client';

/**
 * The live integration report, fetched through the BFF.
 *
 * FRONTEND-BFF.md §1 — this component talks to `/api/proxy/...`, a path on this app's own
 * origin. It does not know that AbOvo.Api exists at an address, it holds no token, and it
 * constructs no Authorization header; the proxy of §5 resolves the backend and injects the
 * bearer server-side. That is why there is no CORS configuration anywhere in this estate on
 * the frontend's account, and why there must never be: needing it would mean this rule had
 * already been broken.
 *
 * P8 — this panel exists so that a degraded deployment is legible IN THE PRODUCT rather
 * than only in a JSON document somebody has to know to curl. AbOvo.Api reports each
 * optional integration as live or degraded on /api/v1/info and prints the same list as a
 * startup banner; a reader or an operator looking at the running site can now see it too.
 *
 * The unreachable case is not an error state. ab-ovo's reader loop is required to work with
 * no account and no backend, so "no API answered" is a supported configuration of this
 * product and this panel says so plainly instead of throwing.
 */

interface Integration {
  name: string;
  state: string;
  detail: string;
}

interface ServiceInfo {
  service: string;
  version: string;
  environment: string;
  integrations: Integration[];
}

type ReportState =
  | { kind: 'loading' }
  | { kind: 'live'; info: ServiceInfo }
  | { kind: 'unreachable'; detail: string };

function asServiceInfo(value: unknown): ServiceInfo | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate['service'] !== 'string' ||
    typeof candidate['version'] !== 'string' ||
    typeof candidate['environment'] !== 'string' ||
    !Array.isArray(candidate['integrations'])
  ) {
    return null;
  }

  const integrations: Integration[] = [];
  for (const entry of candidate['integrations']) {
    if (typeof entry !== 'object' || entry === null) continue;
    const row = entry as Record<string, unknown>;
    if (typeof row['name'] !== 'string' || typeof row['state'] !== 'string') continue;
    integrations.push({
      name: row['name'],
      state: row['state'],
      detail: typeof row['detail'] === 'string' ? row['detail'] : '',
    });
  }

  return {
    service: candidate['service'],
    version: candidate['version'],
    environment: candidate['environment'],
    integrations,
  };
}

function badgeClass(state: string): string {
  const normalized = state.toLowerCase();
  if (normalized === 'live') return 'badge badge-live';
  if (normalized === 'degraded') return 'badge badge-degraded';
  return 'badge badge-unknown';
}

export function IntegrationReport(): React.JSX.Element {
  const [state, setState] = useState<ReportState>({ kind: 'loading' });
  const [environment, setEnvironment] = useState<string>('unknown');

  useEffect(() => {
    // React 18+ mounts effects twice in development's Strict Mode, and a reader can navigate
    // away mid-flight. Without this guard the second, discarded response wins the race and
    // the panel flickers between two answers.
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        // §2 — the addresses come from the runtime config route, never from a compiled-in
        // NEXT_PUBLIC_* value. The promise is shared, so several panels cost one request.
        const config = await getRuntimeConfig();
        if (!cancelled) setEnvironment(config.environment);

        const response = await fetch(`${config.apiBaseUrl}/api/v1/info`, {
          headers: { accept: 'application/json' },
          cache: 'no-store',
        });

        if (!response.ok) {
          // The proxy answers 503 when no rung of the candidate ladder replied and 504 when
          // one replied too slowly (§5). Both mean the same thing to a reader — there is no
          // API here — and the distinction is kept for whoever is holding the pager.
          const detail =
            response.status === 503
              ? 'No backend answered. This deployment is running without an API.'
              : response.status === 504
                ? 'The API did not answer in time. It may be starting from cold.'
                : `The API answered ${response.status}.`;
          if (!cancelled) setState({ kind: 'unreachable', detail });
          return;
        }

        const info = asServiceInfo(await response.json());
        if (cancelled) return;

        setState(
          info
            ? { kind: 'live', info }
            : { kind: 'unreachable', detail: 'The API answered in a shape this page did not expect.' },
        );
      } catch {
        // A network fault, a parse fault, an aborted navigation. None of them is worth an
        // error boundary: the page below this panel is the product, and it does not need
        // an API to work.
        if (!cancelled) {
          setState({
            kind: 'unreachable',
            detail: 'The API could not be reached from the browser.',
          });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="panel" aria-labelledby="integration-report-heading">
      <div className="panel-head">
        <h2 id="integration-report-heading">Integration report</h2>
        <span className="meta">
          {environment}
          {state.kind === 'live' ? ` · ${state.info.service} ${state.info.version}` : ''}
        </span>
      </div>

      <div className="panel-body">
        <p className="panel-note">
          Read live from this deployment&rsquo;s API through this site&rsquo;s own origin. Each row is
          an optional integration and whether this deployment has it. A <em>degraded</em> row is
          not a fault: the service is meant to start and answer without any of them.
        </p>

        <div aria-live="polite">
          {state.kind === 'loading' && (
            <p className="meta pulse">Asking the API what it has&hellip;</p>
          )}

          {state.kind === 'unreachable' && (
            <>
              <p>
                <span className="badge badge-degraded">no API</span>
              </p>
              <p className="panel-note" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                {state.detail} Nothing on this page depends on it, and neither does the reader
                loop: frames render from content shipped with the site and the lab pane runs
                Python in your browser. An account and a backend buy you progress that follows
                you between machines, and nothing else.
              </p>
            </>
          )}

          {state.kind === 'live' && state.info.integrations.length === 0 && (
            <p className="panel-note" style={{ marginBottom: 0 }}>
              The API answered and reports no optional integrations.
            </p>
          )}

          {state.kind === 'live' && state.info.integrations.length > 0 && (
            <ul className="integrations">
              {state.info.integrations.map((integration) => (
                <li key={integration.name}>
                  <span className="name">{integration.name}</span>
                  <span className={badgeClass(integration.state)}>{integration.state}</span>
                  <span className="detail">{integration.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
