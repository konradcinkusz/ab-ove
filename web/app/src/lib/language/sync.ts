/**
 * The chosen edition, to the account and back.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE BROWSER'S RECORD IS THE ONE EVERY PAGE RENDERS FROM. THE ACCOUNT IS A COPY.
 *
 * `progress/sync.ts`'s first paragraph, and it holds here for the same reason: ADR-0004
 * says the reader loop works with no account and no backend, so a language that needed a
 * round trip to be known would make the anonymous path the degraded one. Nothing on any
 * page waits for this module. It runs after the page is up, it changes what the reader sees
 * only when the account genuinely knows something this browser did not, and every failure
 * below leaves the reader reading in whatever edition they were already in.
 *
 * Which is also why there is no error surface (ADR-0019's reasoning): a reader cannot act on
 * "the language sync failed", the page in front of them is unaffected, and the next cycle
 * repairs it.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * THE RULE IS MOST-RECENT-WINS, AND IT IS NOT THE PROGRESS RULE.
 *
 * Progress merges on "furthest", because a reader who has read frame 40 has read frame 40
 * and a machine saying 12 is simply behind. A preference has no "further": there is no
 * edition that contains the other. The only rule a reader can predict is that whatever they
 * last chose, on whichever machine they last chose it, is what they get — so the comparison
 * is on the timestamp the CHOOSING machine wrote, and `PreferenceEndpoints` applies exactly
 * the same comparison on its side (clamping a clock set to 2099, which this module cannot).
 *
 * The one asymmetry worth naming: a browser that has NEVER chosen adopts the account's
 * answer whatever its age, because "never chose" is not a choice of English — it is the
 * absence of one, and an absence loses to anything.
 *
 * It talks to ONE origin — `/api/proxy/...`, this app's own BFF (FRONTEND-BFF.md §1, §5).
 * There is no backend address anywhere below and none may appear: the proxy injects the
 * bearer server-side out of an HttpOnly cookie, which is the whole reason script here has
 * no token to mishandle.
 */
import { ask } from '@/lib/session/client';

import { adoptLanguage, snapshot } from './client.ts';
import { isLanguageTag, type Choice } from './store.ts';

/** The BFF path. `/api/proxy` + the service's own route — see the §5 routing table. */
const PREFERENCE = '/api/proxy/api/v1/preferences/language';

const json = { 'content-type': 'application/json' } as const;

/**
 * Every call goes through here, and every failure is a value rather than an exception.
 *
 * A rejected promise from `fetch` and a 503 from the proxy mean the same thing to this
 * module — the account could not be reached — and the answer to both is to leave the local
 * record alone and try again later.
 */
async function call(init?: RequestInit): Promise<Response | null> {
  try {
    return await fetch(PREFERENCE, { cache: 'no-store', credentials: 'same-origin', ...init });
  } catch {
    return null;
  }
}

/**
 * What the account holds, or nothing.
 *
 * `null` is "could not ask"; a `Choice` of `undefined` inside a successful answer is "this
 * reader has never chosen anywhere". The endpoint answers 200 with nulls for the second
 * rather than 404, so the two are distinguishable — which they must be, because one means
 * retry later and the other means push.
 */
async function pull(): Promise<{ readonly choice: Choice | undefined } | null> {
  const response = await call();
  if (!response?.ok) return null;

  try {
    const body = (await response.json()) as { language?: unknown; chosenAt?: unknown };

    if (!isLanguageTag(body.language)) return { choice: undefined };
    if (typeof body.chosenAt !== 'string' || !Number.isFinite(Date.parse(body.chosenAt))) {
      return { choice: undefined };
    }

    return { choice: { language: body.language, chosenAt: body.chosenAt } };
  } catch {
    return null;
  }
}

/** Tell the account. The answer is what now stands there, which may not be what was sent. */
async function push(choice: Choice): Promise<Choice | undefined> {
  const response = await call({
    method: 'PUT',
    headers: json,
    body: JSON.stringify({ language: choice.language, chosenAt: choice.chosenAt }),
  });

  // A 400 is this machine holding something the service will not file — a tag it does not
  // recognise the shape of. It is not retried differently from a 503 because there is
  // nothing different to do: the local record is the reader's and is not edited to make a
  // request succeed.
  if (!response?.ok) return undefined;

  try {
    const body = (await response.json()) as { language?: unknown; chosenAt?: unknown };
    if (!isLanguageTag(body.language)) return undefined;
    if (typeof body.chosenAt !== 'string') return undefined;
    return { language: body.language, chosenAt: body.chosenAt };
  } catch {
    return undefined;
  }
}

const newer = (a: Choice, b: Choice): boolean => Date.parse(a.chosenAt) > Date.parse(b.chosenAt);

let running: Promise<Choice | undefined> | null = null;

/**
 * One exchange with the account, collapsing concurrent callers into one.
 *
 * Returns the choice the reader should now be in, or `undefined` when nothing changed —
 * which is what the caller navigates on. It is the only thing in this module that a page
 * acts on, and it is deliberately a VALUE rather than a side effect on the URL: this module
 * has no opinion about which page it is running on, and the two pages that could need a
 * navigation want different ones.
 */
export function syncLanguage(): Promise<Choice | undefined> {
  running ??= exchange().finally(() => {
    running = null;
  });
  return running;
}

async function exchange(): Promise<Choice | undefined> {
  // Shared with the account control and the progress sync: `ask()` collapses concurrent
  // callers into one request, so the three components that need this answer do not each
  // fetch it. An anonymous reader has a browser record and nothing else to reconcile it
  // with, which is the supported case and not a degraded one.
  if ((await ask()) !== 'signed-in') return undefined;

  const local = snapshot();
  const remote = await pull();
  if (remote === null) return undefined;

  // Nobody has chosen anywhere. Nothing to adopt and nothing worth sending: a reader who
  // has not touched the control is reading the default, and writing that to the account
  // would record a choice they never made — which the next machine would then adopt as
  // one.
  if (!remote.choice && !local) return undefined;

  // The account knows and this browser does not. "Never chose" loses to anything, however
  // old, because it is an absence rather than an answer.
  if (remote.choice && !local) {
    adoptLanguage(remote.choice);
    return remote.choice;
  }

  if (local && (!remote.choice || newer(local, remote.choice))) {
    // This machine is ahead. The answer is what now stands on the account, which is this
    // choice unless a third machine got in between the pull and the push — in which case
    // this browser adopts THAT, exactly as it would have had it arrived in the pull.
    const landed = await push(local);
    if (!landed || landed.language === local.language) return undefined;

    adoptLanguage(landed);
    return landed;
  }

  // The account is ahead. Adopt it, and say so only if it actually changes the edition:
  // a fresher timestamp on the same language is not something to navigate for.
  if (local && remote.choice && newer(remote.choice, local)) {
    adoptLanguage(remote.choice);
    return remote.choice.language === local.language ? undefined : remote.choice;
  }

  return undefined;
}

/**
 * Tell the account about a choice just made here, without waiting for it.
 *
 * The control calls this and navigates. Nothing is awaited on the reader's behalf: the
 * browser record and the cookie are already written by the time this starts, so the page
 * they land on is right whether or not this request ever completes — and if it does not,
 * the next `syncLanguage()` sends it, because the local record is newer than the account's.
 */
export function announceChoice(choice: Choice): void {
  void (async () => {
    if ((await ask()) !== 'signed-in') return;
    await push(choice);
  })();
}
