/**
 * Where the reader's place is kept.
 *
 * THIS PACKAGE OWNS NO STORE. The cursor is `ReaderProgress` — the row the reading surface
 * already writes, keyed `(Subject, Track, Unit)` and carrying the furthest step — reached
 * over the same HTTP API the browser's BFF uses. A second table keyed by reader would be a
 * second answer to "where is this person", and the two would drift the first time somebody
 * read on a phone and then asked a model.
 *
 * IT DOES NOT TOUCH THE DATABASE, and that is a rule rather than a convenience. `AbOvo.Api`
 * registers `ReaderScopedQueries`, which throws on any query over `ReaderProgress` that
 * does not pin a single `Subject` by equality. A client with its own connection would be
 * outside that guard — so the guard would still be green while the property it protects
 * had a second, unguarded door.
 *
 * Furthest-wins (ADR-0019) is enforced by the service, not here: the PUT returns the MERGED
 * record and every implementation below ADOPTS it rather than assuming its own write won.
 * `ProgressRecord`'s own documentation says why that is part of the contract.
 */
import type { Cursor } from './reveal.ts';

export interface CursorStore {
  /** The reader's place in one program, or undefined if they have not opened it. */
  read(track: string, unit: string): Promise<Cursor | undefined>;

  /**
   * Every place the reader has, in one call. `list_programs` used to ask `read()` once per
   * program — forty-seven GETs of the same list against the API store — and this is the
   * one request it makes instead.
   */
  readAll(): Promise<readonly Cursor[]>;

  /**
   * Report a step reached. Returns the record AS IT NOW STANDS, which may be further along
   * than what was written — that is the merge, and the caller adopts the answer.
   */
  save(cursor: Cursor): Promise<Cursor>;
}

/**
 * The identifier shape `AbOvo.Api` enforces on the route segments, restated here so a bad
 * track or unit is refused before it becomes an HTTP round trip and a 400 somebody has to
 * read. Restated rather than imported because the two live in different languages; the
 * service is still the one that decides, and this is the cheaper half of the same answer.
 */
const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

export function isIdentifier(value: string): boolean {
  return IDENTIFIER.test(value);
}

/**
 * Furthest-wins, applied locally so the in-memory store behaves like the service on the
 * one thing that matters to the gate: THE STEP NEVER LOWERS.
 *
 * The edition follows the latest write. The service resolves a tie by keeping the
 * account's edition (ADR-0019), because there a tie means two machines disagreeing; here
 * there is one reader in one process, and a write carrying a different edition at the
 * same step is that reader switching editions on purpose, which `open_program` offers.
 * Keeping the old edition would make the switch a request the store quietly ignored.
 */
export function furthest(existing: Cursor | undefined, incoming: Cursor): Cursor {
  if (!existing) return incoming;
  return { ...incoming, step: Math.max(existing.step, incoming.step) };
}

/**
 * For development and for the unit tier. NOT for a deployment: it forgets every reader's
 * place when the process restarts, which is the one thing an account is supposed to buy.
 */
export class MemoryCursorStore implements CursorStore {
  readonly #rows = new Map<string, Cursor>();

  static #key(track: string, unit: string): string {
    return `${track}/${unit}`;
  }

  async read(track: string, unit: string): Promise<Cursor | undefined> {
    return this.#rows.get(MemoryCursorStore.#key(track, unit));
  }

  async readAll(): Promise<readonly Cursor[]> {
    return [...this.#rows.values()];
  }

  async save(cursor: Cursor): Promise<Cursor> {
    const key = MemoryCursorStore.#key(cursor.track, cursor.unit);
    const merged = furthest(this.#rows.get(key), cursor);
    this.#rows.set(key, merged);
    return merged;
  }
}

/** What the API answers. Shaped by AbOvo.Contracts; camelCase is the Web JSON default. */
interface ProgressRecordJson {
  readonly track: string;
  readonly unit: string;
  readonly step: number;
  readonly language: string;
  readonly updatedAt: string;
}

/**
 * The real one: `GET /api/v1/progress` and `PUT /api/v1/progress/{track}/{unit}`, carrying
 * the reader's own bearer.
 *
 * The token is supplied per call rather than held, because this server serves many readers
 * and a field would be one reader's token answering another reader's request — which is
 * the whole class of defect `ReaderScopedQueries` exists for, arriving through the client
 * instead of through a query.
 */
export class ApiCursorStore implements CursorStore {
  readonly #baseUrl: string;
  readonly #bearer: () => string;
  readonly #fetch: typeof fetch;

  /**
   * THE EDITION AT A TIE, WHICH THE SERVICE DOES NOT CARRY.
   *
   * The service adopts a write's language only with a further step (`update.Step >
   * existing.Step`, and reconcile.ts in the reading surface says why: "frame 40, in
   * Polish" is one fact and not two). So a reader who switches editions ON the step they
   * are on writes a record the service answers with the old edition, and the next read
   * would switch them back. The reading surface has no such problem because the edition it
   * shows is in the URL; here it is in the cursor, and the cursor is this store's.
   *
   * So the switch is kept here, for that step only, the way the surface keeps it in the
   * address bar: it is written to the account with the next step, which the service then
   * adopts whole, and it is dropped the moment the account's step moves past it — that is
   * another machine reading on, and its edition travels with its step. One reader per
   * process (`server.ts` binds one token), so the key needs no reader in it; a store that
   * served several would have to add one.
   */
  readonly #editionAt = new Map<string, { readonly step: number; readonly language: string }>();

  /** `fetchImpl` is injectable so the unit tier can count requests without a network. */
  constructor(baseUrl: string, bearer: () => string, fetchImpl: typeof fetch = fetch) {
    this.#baseUrl = baseUrl.replace(/\/+$/, '');
    this.#bearer = bearer;
    this.#fetch = fetchImpl;
  }

  static #key(track: string, unit: string): string {
    return `${track}/${unit}`;
  }

  /** The account's row, with the edition this process switched to on that same step. */
  #adopt(row: ProgressRecordJson): Cursor {
    const key = ApiCursorStore.#key(row.track, row.unit);
    const kept = this.#editionAt.get(key);
    if (kept && kept.step !== row.step) this.#editionAt.delete(key);
    return {
      track: row.track,
      unit: row.unit,
      language: kept && kept.step === row.step ? kept.language : row.language,
      step: row.step,
    };
  }

  #headers(): Record<string, string> {
    return {
      authorization: `Bearer ${this.#bearer()}`,
      'content-type': 'application/json',
      accept: 'application/json',
    };
  }

  async readAll(): Promise<readonly Cursor[]> {
    const response = await this.#fetch(`${this.#baseUrl}/api/v1/progress`, {
      headers: this.#headers(),
    });
    if (!response.ok) throw new Error(`progress read failed: ${response.status}`);

    const body = (await response.json()) as { records?: readonly ProgressRecordJson[] };
    return (body.records ?? []).map((row) => this.#adopt(row));
  }

  async read(track: string, unit: string): Promise<Cursor | undefined> {
    // The service answers the whole list either way, so one read is one list.
    return (await this.readAll()).find((row) => row.track === track && row.unit === unit);
  }

  async save(cursor: Cursor): Promise<Cursor> {
    if (!isIdentifier(cursor.track) || !isIdentifier(cursor.unit)) {
      throw new Error('a track and a unit are short identifiers: letters, digits, dot, dash, underscore');
    }

    const response = await this.#fetch(
      `${this.#baseUrl}/api/v1/progress/${encodeURIComponent(cursor.track)}/${encodeURIComponent(cursor.unit)}`,
      {
        method: 'PUT',
        headers: this.#headers(),
        body: JSON.stringify({ step: cursor.step, language: cursor.language }),
      },
    );
    if (!response.ok) throw new Error(`progress write failed: ${response.status}`);

    // A ProgressRecord, not a ProgressResponse — read from ProgressEndpoints rather than
    // assumed, because the read and the write deliberately answer different shapes.
    const row = (await response.json()) as ProgressRecordJson;

    // The service kept its edition on a tie: keep the reader's here, for this step.
    const key = ApiCursorStore.#key(row.track, row.unit);
    if (row.step === cursor.step && row.language !== cursor.language) {
      this.#editionAt.set(key, { step: row.step, language: cursor.language });
    } else {
      this.#editionAt.delete(key);
    }
    return this.#adopt(row);
  }
}
