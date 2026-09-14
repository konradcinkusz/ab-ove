/**
 * Where the backends are, and how one code path finds them everywhere.
 *
 * FRONTEND-BFF.md §1 — "Client JavaScript never learns a backend URL. Backend addresses
 * exist only in server-side code and server-read environment variables." This module is
 * that server-side code. Nothing under `src/components` may import it, and the ESLint
 * config makes that a build error rather than a review convention.
 */

/** The estate's backends, as this app knows them. */
export type BackendId = 'api' | 'authservice';

interface BackendSpec {
  /**
   * The env candidates, in the order FRONTEND-BFF.md §5 gives them:
   *   1. explicit env var
   *   2. orchestrator service-discovery variables (services__<name>__https__0)
   *
   * Every read is a STATIC property access, never `process.env[name]`. Next inlines
   * statically-analyzable reads into the Edge bundle that middleware runs in; a dynamic
   * index there returns undefined and the ladder silently loses its first two rungs —
   * which presents as §8's "Proxy 403s only in one environment" with no clue as to why.
   */
  readonly envCandidates: () => ReadonlyArray<string | undefined>;
  /** The role segment in the estate's Fly app names: ab-ovo-<role>[-<environment>]. */
  readonly role: string;
  /** The port the service listens on inside the private network. */
  readonly internalPort: number;
  /** Rung 4 — a laptop running the service directly, or the AppHost's mapped endpoint. */
  readonly localhost: string;
}

const BACKENDS: Readonly<Record<BackendId, BackendSpec>> = {
  api: {
    envCandidates: () => [
      // Handed to the container by AbOvo.AppHost (`AB_OVO_API_URL`) and by the Fly config.
      process.env.AB_OVO_API_URL,
      process.env.services__api__https__0,
      process.env.services__api__http__0,
    ],
    role: 'api',
    // ASPNETCORE_URLS=http://+:8080 for every .NET service in the estate.
    internalPort: 8080,
    localhost: 'http://localhost:8080',
  },
  authservice: {
    envCandidates: () => [
      process.env.AB_OVO_AUTH_URL,
      process.env.services__authservice__https__0,
      process.env.services__authservice__http__0,
    ],
    role: 'authservice',
    internalPort: 8080,
    // The AppHost maps authservice's container port 8080 to host port 8081.
    localhost: 'http://localhost:8081',
  },
};

/**
 * Rung 3 — internal DNS names.
 *
 * Fly resolves `<app>.internal` over the private network, and the estate's app names are
 * `ab-ovo-<role>[-<environment>]`. The environment suffix is DERIVED from this container's
 * own `FLY_APP_NAME` rather than branched on: `ab-ovo-web-dev` yields `ab-ovo-api-dev`.
 *
 * FRONTEND-BFF.md §5 — "Write zero per-environment branching in the proxy. There must be
 * no `if (production)` style environment switch in the resolution path." Derivation is not
 * branching: this code runs identically in every environment and simply produces nothing
 * when FLY_APP_NAME is unset, which is what happens on a laptop and under Aspire.
 */
function internalDnsCandidates(spec: BackendSpec): string[] {
  const hosts: string[] = [];

  const selfAppName = process.env.FLY_APP_NAME;
  if (selfAppName) {
    const sibling = selfAppName.replace(/-web(?=$|-)/, `-${spec.role}`);
    if (sibling !== selfAppName) hosts.push(sibling);
  }
  // The unsuffixed form, for an estate deployed without an environment suffix.
  hosts.push(`ab-ovo-${spec.role}`);

  return hosts.map((host) => `http://${host}.internal:${spec.internalPort}`);
}

function normalizeBase(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

/**
 * The candidate ladder for one backend, in FRONTEND-BFF.md §5's order:
 * explicit env var -> service-discovery variables -> internal DNS -> localhost.
 *
 * "The ladder is what makes *one code path* work on a laptop, under Aspire, and on every
 * cloud platform, with zero per-environment code."
 */
export function backendCandidates(id: BackendId): string[] {
  const spec = BACKENDS[id];
  const ordered: string[] = [];

  for (const value of spec.envCandidates()) {
    if (value && value.trim().length > 0) ordered.push(normalizeBase(value));
  }
  for (const value of internalDnsCandidates(spec)) ordered.push(normalizeBase(value));
  ordered.push(normalizeBase(spec.localhost));

  // Deduplicate while preserving order: under Aspire the explicit variable and a discovery
  // variable are frequently the same address, and probing it twice doubles a cold start.
  return [...new Set(ordered)];
}

/**
 * Whether an operator or an orchestrator has SAID where this backend is.
 *
 * `backendCandidates` always returns something — rungs three and four are derived and
 * guessed so that one code path works on a laptop, under Aspire and on Fly — so "is there a
 * candidate" is true in every deployment and answers nothing. This answers the different
 * question the sign-in page has to ask: *was this deployment given an identity service?*
 *
 * P8 — a deployment with no identity service is a supported state, and the page that would
 * offer a sign-in form has to know which state it is in. Only the configured rungs count:
 * `ab-ovo-authservice.internal` and `localhost:8081` are addresses this app invented, and
 * offering a form on the strength of a guess is how a reader ends up typing a password into
 * a page that had no one to ask.
 *
 * Conservative on purpose. A laptop running authservice on 8081 with no variable set reads
 * as "not configured", and the fix is to set the variable (P5 — configuration through the
 * environment), which is the same fix every other environment already applies.
 */
export function backendConfigured(id: BackendId): boolean {
  return BACKENDS[id].envCandidates().some((value) => !!value && value.trim().length > 0);
}

/**
 * The BROWSER-facing address of authservice, for the one thing that cannot be proxied: a
 * navigation to its sign-in page. See `RuntimeConfig.authBaseUrl`.
 *
 * It is a separate variable from `AB_OVO_AUTH_URL` because the two answer different
 * questions. `AB_OVO_AUTH_URL` is "where does this container reach authservice", which on
 * Fly may be a `.internal` address no browser can resolve. This is "where do I send the
 * reader's browser", which must be public. Where only the first is set and it is already
 * public — a laptop, the AppHost, a single-origin deployment — it doubles as the answer.
 */
export function publicAuthBaseUrl(): string | null {
  const explicit = process.env.AB_OVO_AUTH_PUBLIC_URL;
  if (explicit && explicit.trim().length > 0) return normalizeBase(explicit);

  const reachedFromServer = process.env.AB_OVO_AUTH_URL;
  if (!reachedFromServer || reachedFromServer.trim().length === 0) return null;

  // A private-network address is not an answer to "where do I send the browser". Saying
  // nothing is better than handing the reader a link that cannot resolve: P8 — a
  // deployment without a usable identity service degrades, and says which feature went.
  const normalized = normalizeBase(reachedFromServer);
  let host: string;
  try {
    host = new URL(normalized).host;
  } catch {
    // The value came from an operator typing into `fly secrets set`, so it can be anything.
    // An unparseable address is not a browser destination either, and throwing here would
    // take down /api/config — the one route that has to answer for the page to render at
    // all — over a typo in a variable that only gates sign-in.
    return null;
  }
  if (/\.internal(:\d+)?$/i.test(host)) return null;

  return normalized;
}
