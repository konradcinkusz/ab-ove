/**
 * The destination a reader was bounced off, carried through sign-in and validated on the
 * way back — FRONTEND-BFF.md §4: "redirect to login preserving the intended destination as
 * `?redirect=<intended>`", so that a reader bounced off `/read/P12/en/7` returns to frame 7.
 *
 * One implementation, shared by the page that renders the form and the route that answers
 * it. Two copies would be two chances for one of them to be the lenient one, and only the
 * lenient one has to be wrong.
 */

/**
 * Accept a same-origin ABSOLUTE PATH and nothing else.
 *
 * This value arrives on a query string, which means an attacker chooses it. `//evil.example`
 * and `https://evil.example` are both things a browser will navigate to, and a sign-in page
 * that forwards to either is a phishing redirector wearing this site's name — the more so
 * because the reader has just been asked for a password on it.
 *
 * The leading-slash test alone is not enough: `//host` is protocol-relative and resolves to
 * another origin despite starting with a slash, which is why it is excluded by name. A
 * leading slash-backslash is excluded for the same reason one step further out — browsers
 * normalise it toward the protocol-relative form, so a check that only knows about `/`
 * lets it through.
 */
export function safeRedirectTarget(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || value.length === 0) return null;

  if (!value.startsWith('/')) return null;
  if (value.startsWith('//')) return null;
  if (value.startsWith('/\\')) return null;

  // A control character in a Location header is a response-splitting primitive, and this
  // value reaches one. Refuse rather than strip: a stripped path is a destination nobody
  // asked for, where a refused one falls back to a destination this app chose.
  if (/[\u0000-\u001F\u007F]/.test(value)) return null;

  return value;
}
