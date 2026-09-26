/**
 * A link from one of the identity service's emails — an account's address and a token — as the
 * page it lands on receives it, and as this origin's server keeps it (issue #170).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE ADDRESS AND THE TOKEN ARRIVE IN A URL, AND THAT IS UPSTREAM'S CHOICE, NOT THIS APP'S.
 *
 * authservice builds both links from a fixed path and a query it writes itself —
 * `{FrontendBaseUrl}/reset-password?token=…&email=…` and `/verify-email?…` (the probe,
 * docs/architecture/AUTHSERVICE-ACCOUNT-RECOVERY-PROBE.md §3) — so when a reader opens one, the
 * address bar holds their address and a credential, whatever this app builds. What this app
 * decides is everything after that: the page the link lands on takes both out of the URL into a
 * cookie only this origin's server can read, and answers with an address that carries neither
 * (`emailed-link-cookie.ts`, `app/reset-password/route.ts`). ADR-0018 refused the URL for the
 * address for the reasons that apply twice over to a token — history, and every access log
 * between here and the reader — and the same rule is kept by moving them out at the first hop.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * This file is the pure half — reading the pair out of a query, and the cookie's value — so
 * `node --test` can hold it (P13). The cookie itself is `emailed-link-cookie.ts`, which needs
 * `next/headers`, and nothing under `node --test` can import that.
 */
export interface EmailedLink {
  /** The account the link was sent for — never rendered, never put in a URL. */
  readonly email: string;
  /** ASP.NET Identity's token: a credential for one purpose, spent only by a POST the reader makes. */
  readonly token: string;
}

/**
 * How long this origin holds a link once it has landed: FIFTEEN MINUTES, which `chrome.resetPage`,
 * `chrome.confirmPage` and `chrome.linkProblems` say in words, in both editions —
 * `i18n/chrome.test.ts` holds the words to this number. It is here, in the pure half, so that
 * test can read it; `emailed-link-cookie.ts` is what sets it.
 *
 * Long enough to choose a password the service will take and to put it in a password manager;
 * short enough that a shared computer does not hold the pair for the rest of the day. The link
 * in the email outlives it (the token's own lifetime is the framework's default, the probe §6),
 * so a lapse costs opening the link again and never a new email.
 */
export const EMAILED_LINK_LIFETIME_SECONDS = 15 * 60;

/**
 * The longest address an account can have: `[StringLength(256)]` on the request types at the
 * tag `flyio/authservice.fly.toml` pins — `sign-in-address.ts`'s bound, for its reason.
 */
const MAX_EMAIL_LENGTH = 256;

/**
 * Generous for what the service issues: an Identity token is a data-protection payload in
 * base64, a few hundred characters. An early refusal of what could not be a token; the bound
 * that decides whether a cookie is set is the next one, on the value itself.
 */
const MAX_TOKEN_LENGTH = 2048;

/**
 * The longest value this origin will set as the cookie, measured as it will be sent — so a
 * crafted link cannot make this origin set a cookie a browser refuses. RFC 6265 §6.1 asks a
 * browser to keep at least 4096 bytes of a cookie, name and attributes included, and this
 * leaves room for both.
 *
 * On the ENCODED value, because the two lengths above do not bound it: JSON writes a `"` or a
 * `\` twice, and UTF-8 spells a character outside ASCII in up to four bytes. A pair of the
 * longest plain values comes to a little over three kilobytes and still fits; a pair past this
 * is no link worth keeping, and the page says no link is open — which is what a browser that
 * dropped the cookie would have made it say, minus the cookie.
 */
const MAX_COOKIE_VALUE_LENGTH = 3600;

/** Not empty, within its bound, and no control characters — nothing else is judged here. */
function usable(value: string, maxLength: number): boolean {
  if (value.length === 0 || value.length > maxLength) return false;
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return false;
  }
  return true;
}

/**
 * The pair a link carries, or `null` when it does not carry one worth keeping.
 *
 * `URLSearchParams` has already undone the link's percent-encoding — authservice escapes both
 * values with `Uri.EscapeDataString`, so a token's `+` arrives as `%2B` and comes back a `+`
 * here rather than the space a bare `+` would decode to. Whether the pair is RIGHT is the
 * identity service's to say, when the reader acts on it; this only refuses what could not be a
 * pair at all.
 */
export function emailedLinkFrom(query: URLSearchParams): EmailedLink | null {
  const email = (query.get('email') ?? '').trim();
  const token = (query.get('token') ?? '').trim();
  if (!usable(email, MAX_EMAIL_LENGTH) || !email.includes('@')) return null;
  if (!usable(token, MAX_TOKEN_LENGTH)) return null;
  const link = { email, token };
  return encodeEmailedLink(link).length <= MAX_COOKIE_VALUE_LENGTH ? link : null;
}

/**
 * The cookie's value: the pair as JSON, in base64url so no character in either needs a
 * cookie's own escaping and a reader of the jar sees neither at a glance.
 *
 * It is not a secret from the browser that holds it — the same browser had both in its address
 * bar a moment before — and it is HttpOnly, so no script on any page can read it.
 */
export function encodeEmailedLink(link: EmailedLink): string {
  return Buffer.from(JSON.stringify({ email: link.email, token: link.token }), 'utf8').toString('base64url');
}

/**
 * Read a cookie's value back, held to the same shape as a link on arrival: a cookie is a value
 * the reader can edit, so it proves nothing this module did not check again.
 */
export function decodeEmailedLink(value: string | undefined): EmailedLink | null {
  if (!value) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { email, token } = parsed as { email?: unknown; token?: unknown };
  if (typeof email !== 'string' || typeof token !== 'string') return null;
  return emailedLinkFrom(new URLSearchParams({ email, token }));
}
