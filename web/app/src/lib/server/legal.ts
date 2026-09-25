/**
 * The Terms of Use and the Privacy Policy an account is created under, served on this
 * origin at `/legal/<document>/<version>`.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS APP FETCHES THEM, AND FROM WHERE.
 *
 * authservice records WHICH version of each document an account accepted, and publishes
 * the versions (`GET /api/v1/auth/consents/versions`) — and nothing else. There is no text,
 * no URL and no route for either document at the pinned tag, or at the latest one
 * (docs/architecture/AUTHSERVICE-ACCOUNT-RECOVERY-PROBE.md §8). A version is an identifier
 * for a text that lives somewhere else, and where is this deployment's to say.
 *
 * So it says so with one run-time address, `AB_OVO_LEGAL_URL` (P12: an address arrives at
 * run time, never at build time), under which each document is a plain-text file named by
 * its version: `<AB_OVO_LEGAL_URL>/terms/<version>.txt`. The server reads it and the page
 * renders it on this origin — FRONTEND-BFF.md §1, the browser talks to nothing else, so a
 * link straight to the document host would break the same rule a font from a CDN breaks.
 *
 * PLAIN TEXT, AND ONLY PLAIN TEXT. Whatever the host answers is rendered by React as text,
 * never as markup: HTML fetched from another host and served from this origin would run
 * with this origin's cookies. A host that answers anything but `text/plain` — a static
 * site's HTML fallback for a missing file is the usual case — has not published the
 * document, and is told apart from one that has by the content type rather than by the
 * status alone.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ADR-0049 records the decision, and what happens when the documents are not there: the
 * registration form is not offered (#141). Asking a reader to accept a text nobody can read
 * is not a consent, and a checkbox that presents it as one is the defect this module exists
 * to close.
 */

/** The two documents a registration accepts, in the order the consent sentence names them. */
export type LegalDocumentId = 'terms' | 'privacy';

/** What each is called on the page. English only, as `/register` is (see its header). */
export const LEGAL_DOCUMENT_TITLES: Readonly<Record<LegalDocumentId, string>> = {
  terms: 'Terms of Use',
  privacy: 'Privacy Policy',
};

export function isLegalDocumentId(value: string): value is LegalDocumentId {
  return value === 'terms' || value === 'privacy';
}

/**
 * Whether a version can name a file. The version arrives from two places this app does
 * not control — the identity service's configuration, and the `/legal/…` address a reader
 * or anyone else typed — and it becomes a path segment on the document host. A letter or a
 * digit first, then letters, digits, dots, hyphens and underscores: every date and every
 * `v1.2` fits, and `.`, `..` and anything carrying a slash cannot.
 */
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export function isPublishableVersion(version: string): boolean {
  return VERSION_PATTERN.test(version);
}

/** Where a document is on THIS origin — the only address a page ever links to. */
export function legalPath(document: LegalDocumentId, version: string): string {
  return `/legal/${document}/${encodeURIComponent(version)}`;
}

/**
 * The document host, or `null` when this deployment has not named one.
 *
 * Only an absolute http(s) address counts. The value is typed into `fly secrets set` or an
 * environment file by an operator, so it can be anything, and a relative or malformed one
 * is treated as absent rather than thrown on: the pages that ask are `/register` and
 * `/legal/…`, and neither should fail to render over a typo in a variable that only decides
 * whether they have a document to show.
 */
export function legalSourceBase(): string | null {
  // A STATIC property access, for the reason `backends.ts` gives at length.
  const configured = process.env.AB_OVO_LEGAL_URL;
  if (!configured || configured.trim().length === 0) return null;

  const normalized = configured.trim().replace(/\/+$/, '');
  try {
    const url = new URL(normalized);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  } catch {
    return null;
  }
  return normalized;
}

/** What asking for one document produced. */
export type LegalDocumentOutcome =
  | { readonly kind: 'published'; readonly text: string }
  /** No host is configured, the version cannot name a file, or the host has no such file. */
  | { readonly kind: 'unpublished' }
  /** The host was asked and did not give an answer this app can read as either. */
  | { readonly kind: 'unavailable'; readonly reason: string };

/**
 * One answer from the document host, as an outcome. Pure, and the layer this module is
 * tested at (P13).
 *
 * 404 and 410 are the host saying the file is not there. A 200 counts only as `text/plain`
 * with something in it: an empty file is not a document, and a 200 in any other type is a
 * host that answers every path with a page of its own. Every other status is `unavailable`
 * — the host may well have the file and failed to hand it over — so the page answers 500
 * rather than claiming the document does not exist.
 */
export function classifyLegalResponse(
  status: number,
  contentType: string | null,
  text: string,
): LegalDocumentOutcome {
  if (status === 404 || status === 410) return { kind: 'unpublished' };
  if (status !== 200) return { kind: 'unavailable', reason: `document host answered ${status}` };

  const plain = (contentType ?? '').toLowerCase().split(';')[0]?.trim() === 'text/plain';
  if (!plain) return { kind: 'unpublished' };

  // A byte-order mark is an encoding artefact of whichever editor saved the file, not text.
  // Written as an escape, not the character: a literal U+FEFF is invisible, and an editor
  // or formatter that strips byte-order marks would empty this pattern without a diff.
  const body = text.replace(/^\uFEFF/, '');
  return body.trim().length > 0 ? { kind: 'published', text: body } : { kind: 'unpublished' };
}

/** Injectable for tests. The global is the only implementation in production. */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/**
 * Long enough for a static host on the far side of the world, short enough that `/register`
 * does not hang on one that has gone away. There is no scale-to-zero machine to wake here,
 * which is what the estate's own 45 s timeouts are sized for.
 */
const LEGAL_TIMEOUT_MS = 10_000;

/**
 * The text of one document at one version.
 *
 * Nothing is fetched for a version that cannot name a file or when no host is configured:
 * both are `unpublished`, which is what they mean to a reader.
 */
export async function legalDocument(
  document: LegalDocumentId,
  version: string,
  fetchImpl: FetchLike = fetch,
): Promise<LegalDocumentOutcome> {
  const base = legalSourceBase();
  if (!base || !isPublishableVersion(version)) return { kind: 'unpublished' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LEGAL_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${base}/${document}/${encodeURIComponent(version)}.txt`, {
      method: 'GET',
      headers: { accept: 'text/plain' },
      cache: 'no-store',
      // A redirect is NOT followed. The text a reader is asked to accept is served from this
      // origin as the configured host's, so it has to be the configured host's: followed, a
      // 3xx would hand over whatever another host answered, under this deployment's name.
      // Not followed, it reaches `classifyLegalResponse` as the status it is — `unavailable`
      // — and the operator publishes the file at the address `AB_OVO_LEGAL_URL` names.
      redirect: 'manual',
      signal: controller.signal,
    });
    // A body that is not going to be read is cancelled, so the connection is released now
    // rather than whenever the runtime collects it; a cancel that fails changes no outcome.
    if (response.status !== 200) await response.body?.cancel().catch(() => undefined);
    const text = response.status === 200 ? await response.text() : '';
    return classifyLegalResponse(response.status, response.headers.get('content-type'), text);
  } catch (error) {
    const detail =
      error instanceof Error && error.name === 'AbortError'
        ? `timed out after ${LEGAL_TIMEOUT_MS}ms`
        : error instanceof Error
          ? error.message
          : String(error);
    return { kind: 'unavailable', reason: `${base}: ${detail}` };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Whether `/register` offers its form — the page's whole decision, here so that it is pure
 * and tested (P13) rather than a line in a Server Component nothing asserts on.
 *
 * The state it matters most for is the one every deployment without `AB_OVO_LEGAL_URL` is
 * in (the AppHost, `flyio/web.fly.toml`): an identity service, versions it requires, and no
 * text for them. The acceptance suite cannot reach that state — its identity deployment
 * always has a document host, and its other deployment stops earlier, at "no identity
 * service" — so a change that offered the checkbox again without the documents behind it
 * would turn nothing red there. `legal.test.ts` is where it turns red instead.
 *
 * Every condition has to hold (ADR-0049 and its amendment):
 *   - an identity service is configured, and the versions it requires are known;
 *   - the page has not already answered the reader — a verification notice, or a problem no
 *     retype fixes — since a form under that answer invites an attempt that cannot succeed;
 *   - every document the consent names was asked for and is published. `null` means they
 *     were not asked for, and an empty list names nothing a reader could accept, so neither
 *     counts as published.
 */
export function offersRegistrationForm(state: {
  readonly identityConfigured: boolean;
  readonly versionsKnown: boolean;
  readonly answered: boolean;
  readonly documents: readonly LegalDocumentOutcome[] | null;
}): boolean {
  const { identityConfigured, versionsKnown, answered, documents } = state;
  return (
    identityConfigured &&
    versionsKnown &&
    !answered &&
    documents !== null &&
    documents.length > 0 &&
    documents.every((outcome) => outcome.kind === 'published')
  );
}

/**
 * The text as paragraphs: split on blank lines, with a paragraph's own line breaks kept for
 * the stylesheet to show. Line endings are normalised first, so a file saved on Windows is
 * not one paragraph.
 */
export function paragraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n/)
    .map((block) => block.replace(/^\n+|\s+$/g, ''))
    .filter((block) => block.trim().length > 0);
}
