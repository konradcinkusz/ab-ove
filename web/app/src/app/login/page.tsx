import Link from 'next/link';

import { publicAuthBaseUrl } from '@/lib/server/backends';

/**
 * The sign-in page.
 *
 * It exists in this scaffold for one concrete reason: `middleware.ts` redirects here, and a
 * gate whose redirect target 404s is a gate that turns "you are not signed in" into "the
 * site is broken". There is no sign-in form yet — accounts are Phase 3 — so the honest
 * thing to render is what has actually happened and what the reader can do instead.
 *
 * FRONTEND-BFF.md §3 — when the form does arrive, it must POST the tokens it receives to
 * /api/auth/session and stop there. It may not put them in localStorage, and it cannot set
 * the cookie itself: document.cookie cannot set HttpOnly.
 */

/**
 * FRONTEND-BFF.md §4 — the intended destination arrives as `?redirect=<intended>`, so that
 * a reader bounced off /read/P12?frame=7 comes back to frame 7.
 */
function safeRedirectTarget(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || value.length === 0) return null;

  // Only a same-origin ABSOLUTE PATH is ever accepted. This value came in on a query
  // string, which means an attacker chooses it: `//evil.example` and
  // `https://evil.example` are both things a browser will happily navigate to, and a
  // sign-in page that forwards to them is a phishing redirector with this site's name on
  // it. The check is here rather than at the point of use because the point of use is the
  // thing somebody will add later without reading this comment.
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const intended = safeRedirectTarget(params['redirect']);

  // P8 — a deployment with no identity service is a supported state, so the page says which
  // of the two situations the reader is in rather than offering a button that cannot work.
  const identityConfigured = publicAuthBaseUrl() !== null;

  return (
    <main className="shell">
      <header className="masthead">
        <p className="wordmark">
          ab<span>-</span>ovo
        </p>
        <h1 className="lede">Signing in is not the way in.</h1>
        <p className="standfirst">
          You reached this page because something asked for an account. Almost nothing in
          ab-ovo does: the frames and the lab run without one, and an account exists only to
          carry your progress between machines.
        </p>
      </header>

      <section className="section">
        <h2>What happened</h2>
        <p>
          {intended ? (
            <>
              You asked for <code>{intended}</code>, which is one of the few pages that needs
              to know who you are. Accounts arrive in Phase 3; until then that page is not
              reachable and nothing else is affected.
            </>
          ) : (
            <>
              No destination was carried into this page, so there is nothing waiting on the
              other side of a sign-in. Go back and carry on reading.
            </>
          )}
        </p>
      </section>

      <section className="section">
        <h2>Identity</h2>
        <p>
          {identityConfigured
            ? 'This deployment has an identity service configured. The sign-in form itself is Phase 3 work and is not built yet.'
            : 'This deployment has no identity service configured, which is a normal way to run ab-ovo: everything except cross-machine progress works without one.'}
        </p>
      </section>

      <footer className="colophon">
        <p>
          <Link href="/">Back to the reader</Link>
        </p>
      </footer>
    </main>
  );
}
