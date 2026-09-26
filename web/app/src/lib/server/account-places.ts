import type { Bundle } from '@ab-ovo/web-kit';

import { backendCandidates } from './backends.ts';

/**
 * Where the reader's ACCOUNT says they are — the list on `/account`, read on the server.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * A READER READING THEIR OWN ROWS, WHICH IS THE ONE QUESTION ADR-0020 LEAVES OPEN.
 *
 * `GET /api/v1/progress` answers with the rows filed under the bearer's own subject and no
 * other: `ProgressEndpoints` reads the subject off the token and has no route that takes
 * one, and `ReaderScopedQueries` refuses any query over the table that does not pin it by
 * equality. So nothing here is an aggregate or can become one — it is one reader's record,
 * fetched with that reader's own token, for the page that shows it to them.
 *
 * WHAT COMES BACK IS A POSITION AND NEVER A PROGRESS (ADR-0041): a program and the furthest
 * frame the account holds in it. Each row's `updatedAt` is read past rather than carried,
 * because a date beside a place is the first line of a history nobody decided to keep
 * (ADR-0039 refused one for the worksheet; ADR-0055 kept it refused for the export).
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * THE BEARER IS THE READER'S OWN AND GOES SERVER TO SERVER, never through the browser —
 * the Server Component reads it from the HttpOnly cookie and calls `AbOvo.Api` directly,
 * which is ADR-0061's arrangement for a page that renders from the API (FRONTEND-BFF.md §1:
 * the browser talks to this origin and nothing else).
 */

/** `AbOvo.Api`'s progress endpoint — the whole record for the bearer's subject. */
const PROGRESS_PATH = '/api/v1/progress';

/**
 * `content.ts`'s two budgets, for `content.ts`'s reason: this call runs while a page renders,
 * so a stalled rung has to fail within a reader's patience for a page load. Only the first
 * rung — the address a deployment configured — gets the full one; every rung after it is an
 * address `backends.ts` guessed, and a guess that was never going to answer is charged
 * little.
 */
const DEFAULT_TIMEOUT_MS = 8_000;
const GUESSED_RUNG_TIMEOUT_MS = 1_500;

function timeoutMs(): number {
  const configured = Number.parseInt(process.env.AB_OVO_API_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
}

/** One row as the page may use it: the four fields that say where, checked. */
export interface AccountRecord {
  readonly track: string;
  readonly unit: string;
  readonly step: number;
  readonly language: string;
}

export type AccountPlacesOutcome =
  /** The API answered for this reader. An empty list is an account holding no place. */
  | { readonly kind: 'held'; readonly records: readonly AccountRecord[] }
  /**
   * The rows could not be read, for a reason the reader cannot act on: no rung answered, one
   * answered in a shape this application does not recognise, or one refused the bearer.
   * The reason is for the server's log (it names backend addresses) and never for the page.
   */
  | { readonly kind: 'unavailable'; readonly reason: string };

/** Injectable for tests, on `delete-account.ts`'s pattern. The global is production's only one. */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

const isRecord = (value: unknown): value is AccountRecord => {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row['track'] === 'string' &&
    row['track'].length > 0 &&
    typeof row['unit'] === 'string' &&
    row['unit'].length > 0 &&
    typeof row['language'] === 'string' &&
    row['language'].length > 0 &&
    typeof row['step'] === 'number' &&
    Number.isInteger(row['step']) &&
    row['step'] >= 1
  );
};

/**
 * P11 — the API's body is checked at the edge, once, and only the four fields leave.
 *
 * Per row and not per document, on `lib/progress/store.ts`'s rule: one row this application
 * cannot read should not cost the reader the others. A body that is not the contract at all
 * is `null`, which the caller reports as unavailable — calling it an empty account would be
 * telling the reader their place is gone because a response had the wrong shape.
 */
export function recordsIn(body: unknown): readonly AccountRecord[] | null {
  if (typeof body !== 'object' || body === null) return null;
  const records = (body as { records?: unknown }).records;
  if (!Array.isArray(records)) return null;

  return records.filter(isRecord).map(({ track, unit, step, language }) => ({
    track,
    unit,
    step,
    language,
  }));
}

/**
 * Ask `AbOvo.Api` for every place it holds for the bearer's subject.
 *
 * The ladder walks on a transport failure and on an ambiguous status, and STOPS on an answer
 * that is not ambiguous. A 401 or 403 is the API refusing this bearer, and asking the next
 * rung would be shopping for an address that accepts it — ADR-0018's "a rejection is
 * terminal; only a transport failure walks the ladder". A 429 is the configured rung busy
 * rather than absent, which `content.ts` records measuring the hard way.
 */
export async function fetchAccountPlaces(
  accessToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<AccountPlacesOutcome> {
  const candidates = backendCandidates('api');
  let last: AccountPlacesOutcome = { kind: 'unavailable', reason: 'no api is configured' };

  for (const [index, base] of candidates.entries()) {
    const budget = index === 0 ? timeoutMs() : GUESSED_RUNG_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), budget);

    try {
      const response = await fetchImpl(`${base}${PROGRESS_PATH}`, {
        method: 'GET',
        headers: { accept: 'application/json', authorization: `Bearer ${accessToken}` },
        // Following a redirect would send the bearer to an address nobody chose — the same
        // reasoning `deleteAccount` gives.
        redirect: 'manual',
        cache: 'no-store',
        signal: controller.signal,
      });

      if (response.ok) {
        const records = recordsIn(await response.json());
        return records
          ? { kind: 'held', records }
          : { kind: 'unavailable', reason: `${base}: the progress body is not the contract` };
      }

      if (response.status === 401 || response.status === 403 || response.status === 429) {
        return { kind: 'unavailable', reason: `${base}: api answered ${response.status}` };
      }

      last = { kind: 'unavailable', reason: `${base}: api answered ${response.status}` };
    } catch (error) {
      const detail =
        error instanceof Error && error.name === 'AbortError'
          ? `timed out after ${budget}ms`
          : error instanceof Error
            ? error.message
            : String(error);
      last = { kind: 'unavailable', reason: `${base}: ${detail}` };
    } finally {
      clearTimeout(timer);
    }
  }

  return last;
}

/** A place the page can show and open: a program this deployment carries, and a frame in it. */
export interface AccountPlace {
  readonly track: string;
  readonly unit: string;
  /** The program's title, in `language`. */
  readonly title: string;
  /** The edition the frame opens in — the one the place was read in, where the course has it. */
  readonly language: string;
  /** The furthest frame the account holds, clamped to the program's length. */
  readonly step: number;
  /** The frame itself. Built from the bundle's identifiers, never from the row's strings. */
  readonly href: string;
}

/**
 * The account's rows, in the book's order, as places a reader can open.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE BOOK'S ORDER, NOT THE TABLE'S. The API sorts by track and then by unit id, which is an
 * ordering of strings; the index lays its tiles out in the manifest's order, pin by pin
 * (`groupsOf` keeps it), and a reader's own list in a different order from the page they
 * came from would read as a different book.
 *
 * A ROW FOR A PROGRAM THIS DEPLOYMENT DOES NOT CARRY IS LEFT OUT, as the index's card leaves
 * it out of *Continue* (`start-card.tsx`): a track unpinned or a unit renamed is a record
 * about something that is not here, and a link to it would be a 404. For the same reason a frame
 * past the end of a program that has since grown shorter is clamped to its last frame.
 *
 * THE EDITION IS THE ROW'S WHERE THE COURSE PUBLISHES IT — the place was read in it — and
 * the course's own first edition where it does not, the index's rule for a title
 * (`program-grid.tsx`). The two editions are the same frames (ADR-0016), so frame 12 of one
 * is frame 12 of the other; the row's language is still data a client wrote, and only an
 * edition the bundle names reaches the href.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * Two rows for one program cannot come from the API, whose key is the program; if they did,
 * the further one wins, which is ADR-0019's rule rather than a new one.
 */
export function placesInBookOrder(
  records: readonly AccountRecord[],
  bundles: readonly Bundle[],
): readonly AccountPlace[] {
  const held = new Map<string, AccountRecord>();
  for (const record of records) {
    const key = `${record.track}/${record.unit}`;
    const other = held.get(key);
    if (!other || record.step > other.step) held.set(key, record);
  }

  const places: AccountPlace[] = [];

  for (const bundle of bundles) {
    const { id: track, languages } = bundle.track;

    for (const unit of bundle.units) {
      const record = held.get(`${track}/${unit.id}`);
      if (!record || unit.steps.length === 0) continue;

      const language = languages.includes(record.language) ? record.language : languages[0];
      if (language === undefined) continue;

      const title = unit.titles[language];
      if (title === undefined) continue;

      const step = Math.min(record.step, unit.steps.length);

      places.push({
        track,
        unit: unit.id,
        title,
        language,
        step,
        href: `/read/${track}/${unit.id}/${language}/${step}`,
      });
    }
  }

  return places;
}
