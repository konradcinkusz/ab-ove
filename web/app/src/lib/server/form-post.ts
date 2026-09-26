import { NextResponse } from 'next/server';

import { isLanguageTag } from '@/lib/language/store';
import { safeRedirectTarget } from '@/lib/redirect-target';

/**
 * The part the four routes of the way back into an account share (issue #170): reading a post
 * in either of the two shapes this app's auth routes accept, and the answers every one of them
 * gives before it does anything of its own.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * `/api/auth/login` AND `/api/auth/register` EACH SPELL THIS OUT, and those copies are left as
 * they are. Four more copies was the other way, and this repository's sentence for that is
 * already written: two copies are two chances for one of them to drift. What is here is exactly
 * their shape — the same two bodies, the same `lang` rule, the same 303 — so a route built on it
 * answers as they do.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export interface FormPost {
  /**
   * A field as sent, or `''`. NOT trimmed here: the address is trimmed by the route that reads
   * it, and a password never is (`register.ts` says why).
   */
  field(name: string): string;
  /** The edition the page was in — the shape of a language tag, or nothing (`/api/auth/login`'s rule). */
  readonly edition: string | undefined;
  /** Where the reader was going: a same-origin path `safeRedirectTarget` has passed, or `null`. */
  readonly redirectTo: string | null;
  /**
   * A plain HTML form, answered with a 303, or a JSON caller, answered with a status — decided
   * by the branch that parsed the body, for `login/route.ts`'s reason: two reads of one header
   * are two chances to hand a form a JSON answer it can do nothing with.
   */
  readonly wantsRedirect: boolean;
}

/** Read either body shape, or `null` for anything else. */
export async function readFormPost(request: Request): Promise<FormPost | null> {
  const contentType = request.headers.get('content-type') ?? '';

  const build = (get: (name: string) => unknown, wantsRedirect: boolean): FormPost => {
    const field = (name: string): string => {
      const value = get(name);
      return typeof value === 'string' ? value : '';
    };
    const lang = get('lang');
    return {
      field,
      edition: isLanguageTag(lang) ? lang : undefined,
      redirectTo: safeRedirectTarget(field('redirect')),
      wantsRedirect,
    };
  };

  try {
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const form = await request.formData();
      return build((name) => form.get(name), true);
    }

    if (contentType.includes('application/json')) {
      const body = (await request.json()) as unknown;
      if (typeof body !== 'object' || body === null) return null;
      return build((name) => (body as Record<string, unknown>)[name], false);
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * 303, never 302: the browser must follow it with a GET, or a reload would post a password or
 * spend a link again. `Location` is a path, for the reason `login/route.ts` measured —
 * `request.url` names this server, not the address the reader used.
 */
export function seeOther(location: string, headers: Readonly<Record<string, string>> = {}): NextResponse {
  return new NextResponse(null, {
    status: 303,
    headers: { location, 'cache-control': 'no-store', ...headers },
  });
}

/** The same-origin guard's answer (`same-origin.ts`): a cross-site form must not act as the reader. */
export function crossSiteRefused(): NextResponse {
  return NextResponse.json(
    { error: 'this route accepts same-origin requests only' },
    { status: 403, headers: { 'cache-control': 'no-store' } },
  );
}

/** A body that is neither a form nor JSON. */
export function unreadableBody(): NextResponse {
  return NextResponse.json(
    { error: 'expected a form or JSON body' },
    { status: 415, headers: { 'cache-control': 'no-store' } },
  );
}

/** A JSON caller's answer: a code from a closed set, and the status that says whose fault. */
export function problemAnswer(problem: string, status: number): NextResponse {
  return NextResponse.json({ problem }, { status, headers: { 'cache-control': 'no-store' } });
}
