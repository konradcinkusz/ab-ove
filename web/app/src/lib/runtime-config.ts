/**
 * The client-safe runtime configuration contract.
 *
 * FRONTEND-BFF.md §2 — this is the runtime substitute for build-time public env vars:
 * "One image, N environments, addresses supplied where the container starts." The same
 * shape is produced by `app/api/config/route.ts` (server, per request) and consumed by
 * `runtime-config.client.ts` (browser). It lives in its own module so the two cannot
 * drift, and so nothing server-side has to be imported to name the type.
 *
 * FRONTEND-BFF.md §2 — "returns only client-safe configuration. Secrets and backend
 * credentials must not appear in its payload." Every field below is a value that is
 * already public the moment a browser renders the page.
 */
export interface RuntimeConfig {
  /**
   * The ONE base URL the client has (FRONTEND-BFF.md §5 — "so the client has exactly one
   * base URL"). It is origin-relative on purpose.
   *
   * FRONTEND-BFF.md §1 — "Client JavaScript never learns a backend URL. Backend addresses
   * exist only in server-side code and server-read environment variables." So what the
   * browser is handed as "the API base URL" is the path to this app's own catch-all proxy,
   * not the address of AbOvo.Api. The proxy resolves the real backend per request through
   * the candidate ladder of §5 and injects the bearer server-side. Handing the browser
   * `https://ab-ovo-api-dev.fly.dev` instead would reintroduce CORS, per-environment
   * client builds and a token the client must hold, all three at once.
   */
  apiBaseUrl: string;

  /**
   * The BROWSER-FACING origin of authservice, or null when this deployment has not been
   * given one.
   *
   * This is the one address that genuinely has to cross to the client, and the reason is
   * that it is not a fetch: signing in and the OAuth callback are browser NAVIGATIONS to
   * authservice's own pages, and a navigation cannot be proxied without becoming a
   * different site. It is environment-specific, which is exactly why it arrives here
   * rather than through NEXT_PUBLIC_AUTH_URL (§2, citing P12).
   *
   * Token-bearing traffic does NOT use this. It goes through `apiBaseUrl` + `/auth/...`,
   * where the cookie is read and the bearer injected server-side (§5).
   */
  authBaseUrl: string | null;

  /**
   * Which deployment the reader is looking at, for the banner and for bug reports. Named,
   * never inferred client-side: an image promoted from staging to production is byte
   * identical (§2, Checklist item 2), so nothing in the bundle can know this.
   */
  environment: string;

  /**
   * Whether this deployment has an identity service wired at all.
   *
   * P8 — degradation must be legible. The reader loop is required to work with no account
   * and no backend, so "accounts are not available here" is a normal state of this
   * product and not an error; the UI says so rather than offering a sign-in that 503s.
   */
  accountsAvailable: boolean;
}

/**
 * FRONTEND-BFF.md §2 — "That config module has an SSR-safe fallback, so server rendering
 * does not fail or fetch its own origin during render."
 *
 * The fallback is not a guess about the environment: it is the subset that is TRUE in every
 * environment by construction. `apiBaseUrl` is a fixed path on this origin, so it is right
 * everywhere; the two genuinely environment-specific fields degrade closed. A server render
 * that used this fallback shows the reader the same page it would show with no backend
 * reachable — which is a state this product must handle anyway.
 */
export const SSR_FALLBACK_CONFIG: RuntimeConfig = {
  apiBaseUrl: '/api/proxy',
  authBaseUrl: null,
  environment: 'unknown',
  accountsAvailable: false,
};
