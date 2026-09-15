import { SSR_FALLBACK_CONFIG, type RuntimeConfig } from './runtime-config.ts';

/**
 * FRONTEND-BFF.md §2 — "The client consumes /api/config through ONE small module that
 * fetches it once and caches the promise (in-flight dedupe), rather than each component
 * fetching it." Without the promise cache, every component that needs an address issues
 * its own request on first paint and they all land in the same millisecond.
 *
 * The cached thing is the PROMISE, not the resolved value: caching the value would still
 * let N concurrent first-paint callers each start a request before the first one resolves.
 */
let inFlight: Promise<RuntimeConfig> | null = null;

function isRuntimeConfig(value: unknown): value is RuntimeConfig {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['apiBaseUrl'] === 'string' &&
    (typeof candidate['authBaseUrl'] === 'string' || candidate['authBaseUrl'] === null) &&
    typeof candidate['environment'] === 'string' &&
    typeof candidate['accountsAvailable'] === 'boolean'
  );
}

/**
 * Resolve this deployment's runtime configuration.
 *
 * FRONTEND-BFF.md §2 — the route is read at request time, so the same image serves every
 * environment. This function is safe to call from anywhere, including during a server
 * render, where it returns the SSR fallback rather than fetching this app's own origin.
 */
export function getRuntimeConfig(): Promise<RuntimeConfig> {
  // §2 — "an SSR-safe fallback, so server rendering does not fail or fetch its own origin
  // during render". A server render fetching its own origin is a request a container makes
  // to itself, which deadlocks on a single-worker deployment and is slow on every other.
  if (typeof window === 'undefined') {
    return Promise.resolve(SSR_FALLBACK_CONFIG);
  }

  inFlight ??= fetch('/api/config', {
    // The route is dynamic server-side; asking the browser cache for it as well would put
    // a second, longer-lived copy of the environment in front of the short Cache-Control
    // the route sets deliberately.
    cache: 'no-store',
    headers: { accept: 'application/json' },
  })
    .then(async (response): Promise<RuntimeConfig> => {
      if (!response.ok) throw new Error(`config route returned ${response.status}`);
      const payload: unknown = await response.json();
      if (!isRuntimeConfig(payload)) throw new Error('config route returned an unexpected shape');
      return payload;
    })
    .catch((): RuntimeConfig => {
      // Clearing the cache on failure is what makes this a dedupe rather than a permanent
      // decision: the next caller retries. Resolving with the fallback instead of rejecting
      // keeps the reader loop working when the config route is the thing that is down,
      // which is the same no-backend case the product has to survive anyway.
      inFlight = null;
      return SSR_FALLBACK_CONFIG;
    });

  return inFlight;
}
