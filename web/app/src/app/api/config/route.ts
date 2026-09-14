import { NextResponse } from 'next/server';

import { publicAuthBaseUrl } from '@/lib/server/backends';
import type { RuntimeConfig } from '@/lib/runtime-config';

/**
 * GET /api/config — FRONTEND-BFF.md §2.
 *
 * "Create a server route GET /api/config that reads the environment AT REQUEST TIME and
 * returns the client-safe config. One image, N environments, addresses supplied where the
 * container starts. This is the Next.js twin of the nginx config.json-at-entrypoint
 * pattern."
 *
 * The alternative this route exists to remove is NEXT_PUBLIC_*. Those are substituted into
 * the bundle by the compiler, so an address put there is frozen into the image, and one
 * image per environment follows — which breaks build-once-deploy-many (P12) and produces
 * §8's first row: "Staging frontend calls production APIs". The ESLint config makes reading
 * a NEXT_PUBLIC_* variable an error so this route cannot quietly be bypassed later.
 */

/**
 * FRONTEND-BFF.md §2 — "Mark the /api/config route dynamic so it is never statically
 * optimized."
 *
 * This single line is what makes the whole scheme work. Next would otherwise see a handler
 * with no request-dependent input, evaluate it during `next build`, and serve the answer as
 * a static file — capturing the BUILD machine's environment in the image and silently
 * reintroducing the exact defect the route was written to remove. The failure has no
 * symptom at build time: the route still responds, with last week's addresses.
 */
export const dynamic = 'force-dynamic';

/** `process.env` must be the container's, not a snapshot the Edge bundle carried in. */
export const runtime = 'nodejs';

export function GET(): NextResponse<RuntimeConfig> {
  const authBaseUrl = publicAuthBaseUrl();

  /**
   * FRONTEND-BFF.md §2 — "returns ONLY client-safe configuration. Secrets and backend
   * credentials must not appear in its payload." This response is delivered to a browser,
   * so the test for adding a field is not "is it useful" but "would I put it in the page
   * source". Every field below is already public by the time it is read.
   *
   * In particular there is no API address here: the client's API base is a path on this
   * origin (§1, §5), and the real backend is resolved per request inside the proxy.
   */
  const config: RuntimeConfig = {
    apiBaseUrl: '/api/proxy',
    authBaseUrl,
    environment: process.env.AB_OVO_ENVIRONMENT?.trim() || process.env.NODE_ENV || 'unknown',
    // P8 — a deployment with no identity service is a supported state of this product, not
    // a broken one. Saying so here is what lets the UI offer the reader loop and explain
    // the missing half, instead of offering a sign-in button that fails.
    accountsAvailable: authBaseUrl !== null,
  };

  return NextResponse.json(config, {
    headers: {
      /**
       * FRONTEND-BFF.md §2 — "sets a short Cache-Control with stale-while-revalidate."
       *
       * It is read on every page load, so it should be cheap; it carries the environment,
       * so it must not be pinned. Thirty seconds is short enough that a `fly secrets set`
       * is visible within a deploy's own settling time, and the SWR window keeps the read
       * off the critical path afterwards.
       *
       * `private` because this is the app's own origin and may sit behind a shared cache:
       * the payload is not user-specific today, and a field that is user-specific must not
       * be able to land in a shared cache by being added to a public response tomorrow.
       */
      'cache-control': 'private, max-age=30, stale-while-revalidate=300',
    },
  });
}
