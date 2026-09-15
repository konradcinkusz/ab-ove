/**
 * Whether this browser is signed in — the one place the answer is kept.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IT HAS TO BE ASKED, BECAUSE IT CANNOT BE READ.
 *
 * FRONTEND-BFF.md §3 — "Create a GET /api/auth/session route that rehydrates the client's
 * session state on page load." The guide is explicit that this is mandatory rather than
 * convenient, and the reason is mechanical: the session cookie is HttpOnly BY DESIGN, so
 * script cannot read it back, and without this route every page load looks signed out.
 *
 * This module is that route's client side, and it is one module rather than a hook in each
 * consumer so that the account control and the progress sync ask ONCE between them. Two
 * consumers polling the same route would be two answers that can disagree — and the one
 * that mattered would be whichever rendered second.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * It holds no token and never sees one. What comes back from the route is session STATE.
 */

export type SessionStatus =
  /** Nobody has asked yet. Render nothing: "we do not know" is not "you are signed out". */
  | 'unknown'
  | 'signed-in'
  | 'signed-out'
  /**
   * P8 — degradation must be legible. The cookie is there and the key set could not be
   * reached to verify it, so this is "we cannot say" rather than "you are logged out".
   * Telling a signed-in reader they have been logged out because a machine was cold is the
   * defect `/api/auth/session` refuses to commit, and it would be undone here.
   */
  | 'unavailable';

const listeners = new Set<() => void>();

let status: SessionStatus = 'unknown';
let asked: Promise<SessionStatus> | null = null;

const announce = (): void => {
  for (const listener of listeners) listener();
};

const settle = (next: SessionStatus): SessionStatus => {
  if (status !== next) {
    status = next;
    announce();
  }
  return status;
};

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** React calls this on every render, so it returns a primitive and builds nothing. */
export function snapshot(): SessionStatus {
  return status;
}

/** The server renders no account control at all, because the server has no reader. */
export function serverSnapshot(): SessionStatus {
  return 'unknown';
}

/**
 * Ask the BFF, at most once at a time.
 *
 * Concurrent callers share one request: the account control and the progress sync both
 * mount in the same tick, and two requests would be two chances for the answers to differ.
 */
export function ask(): Promise<SessionStatus> {
  asked ??= fetch('/api/auth/session', { cache: 'no-store', credentials: 'same-origin' })
    .then(async (response) => {
      if (!response.ok) return settle('unavailable');

      const body = (await response.json()) as {
        authenticated?: unknown;
        identityUnavailable?: unknown;
      };

      if (body.authenticated === true) return settle('signed-in');
      if (body.identityUnavailable === true) return settle('unavailable');
      return settle('signed-out');
    })
    .catch(() =>
      // The network, not the identity service. Same answer for the same reason: an
      // unreachable route is not evidence that the reader is signed out.
      settle('unavailable'),
    )
    .finally(() => {
      asked = null;
    });

  return asked;
}

/**
 * Sign out: clear the cookies, and nothing else.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ISSUE #11 — "Signing out leaves local progress intact. A sign-out that wipes the
 * reader's place is a punishment for using an account."
 *
 * The enforcement is the ABSENCE below: this function does not import the progress store,
 * so there is no line here that could clear it and none can be added without the import
 * appearing in a diff. The reader keeps reading exactly where they were, with an account
 * copy waiting for them if they sign in again — which is what makes signing in a safe
 * thing to try rather than a commitment.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * The cookies are cleared by the BFF route, because they are HttpOnly and script cannot
 * touch them — the same property, cutting the same way, in the other direction.
 */
export async function signOut(): Promise<void> {
  try {
    await fetch('/api/auth/session', {
      method: 'DELETE',
      cache: 'no-store',
      credentials: 'same-origin',
    });
  } catch {
    // The cookie may or may not be gone. `ask()` below settles it either way, and a reader
    // who is still signed in is offered the control again rather than being told a lie.
  }
  await ask();
}
