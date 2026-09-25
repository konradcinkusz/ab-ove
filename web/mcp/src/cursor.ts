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

  /**
   * The edition this reader reads in, when one is known; `undefined` when nothing says.
   *
   * ONE EDITION PER READER, NOT ONE PER PROGRAM (#144). `open_program` used to know an
   * edition only for a program the reader already had a place in, so every first opening
   * asked "English or Polish?" again — at the start of each of forty-seven programs, and as
   * an error the host painted red. The website remembers one edition per reader (ADR-0052);
   * this is the same question asked of the same record, so that a first opening can start
   * in it and only a reader with no edition anywhere is asked.
   */
  edition(): Promise<string | undefined>;
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
 * Why a reader's place could not be reached, in the three shapes that have different fixes.
 *
 * - `unauthorised` — the service answered 401 or 403: the reader token has expired or is
 *   not a reader's. A fresh token fixes it; trying again does not.
 * - `unreachable` — no answer at all (the fetch itself rejected), or one that says "later"
 *   (5xx, 408, 429). Trying again shortly is the fix.
 * - `refused` — any other answer that is not the record: a 404 from an address that is not
 *   this API, a body that is not a JSON object. Or no answer because nothing could be asked:
 *   an `AB_OVO_API_URL` that is not an http or https address, which is the one `refused`
 *   with no status. Trying again will not change it.
 */
export type PlaceProblem = 'unauthorised' | 'unreachable' | 'refused';

/**
 * The store could not reach the reader's place.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * A TYPE, BECAUSE A BARE `Error` BECAME A PROTOCOL ERROR (#137).
 *
 * `ApiCursorStore` used to throw `new Error('progress read failed: 401')` and let a rejected
 * `fetch` pass straight through. `handle()` in `tools.ts` catches what it can name and
 * nothing else, so both reached the host as JSON-RPC `-32603` with a developer's string in
 * it: the host showed a failure, the model read `fetch failed`, and the reader was told
 * nothing they could act on. With a type and a reason, `handle()` answers with a result and
 * a sentence — what happened to their place (nothing), and what fixes it.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export class PlaceUnavailable extends Error {
  readonly reason: PlaceProblem;
  /** The HTTP status, when the service answered at all. */
  readonly status: number | undefined;
  /**
   * True when a WRITE failed. The call that made it can be made again; whether it was
   * recorded is not known, because a 5xx or a dropped connection can follow a commit.
   */
  readonly writing: boolean;

  constructor(
    reason: PlaceProblem,
    message: string,
    detail: { readonly status?: number; readonly writing: boolean; readonly cause?: unknown },
  ) {
    super(message, detail.cause === undefined ? undefined : { cause: detail.cause });
    this.name = 'PlaceUnavailable';
    this.reason = reason;
    this.status = detail.status;
    this.writing = detail.writing;
  }
}

/** Which of the three a status is; see `PlaceProblem` for why these lines. */
function problemFor(status: number): PlaceProblem {
  if (status === 401 || status === 403) return 'unauthorised';
  if (status >= 500 || status === 408 || status === 429) return 'unreachable';
  return 'refused';
}

/**
 * For development and for the unit tier. NOT for a deployment: it forgets every reader's
 * place when the process restarts, which is the one thing an account is supposed to buy.
 */
export class MemoryCursorStore implements CursorStore {
  readonly #rows = new Map<string, Cursor>();

  /**
   * The edition of the place written last. There is no account here and so no preference
   * to read; the reader's most recent place is the one record that says which edition they
   * are reading in, and a switch is a write, so it moves this too.
   */
  #latest: string | undefined;

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
    this.#latest = merged.language;
    return merged;
  }

  async edition(): Promise<string | undefined> {
    return this.#latest;
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

  /**
   * One request to the service, and its JSON — or `PlaceUnavailable`, never anything else.
   *
   * Every way this can fail is turned into the one type `handle()` answers with a sentence,
   * here where the difference between them is still visible: a rejected `fetch` is no
   * answer, a status is an answer, and a body that is not JSON came from something that is
   * not this API.
   */
  async #json(url: string, init: RequestInit, writing: boolean): Promise<object> {
    // The URL as given, for the message: parsing it is the next step, and may be what fails.
    const doing = `${init.method ?? 'GET'} ${url}`;

    /*
      AN ADDRESS THAT IS NOT ONE IS NOT A NETWORK FAULT. `fetch` rejects `not-a-url` with the
      same TypeError as a dropped connection, and `localhost:8180` parses with `localhost:`
      as its scheme and is rejected the same way, so both used to read as `unreachable` —
      "try again shortly", which never helps. Asked here, where `URL.parse` answers `null`
      rather than throwing, it is `refused`, whose fix is AB_OVO_API_URL itself.
    */
    const scheme = URL.parse(url)?.protocol;
    if (scheme !== 'http:' && scheme !== 'https:') {
      throw new PlaceUnavailable('refused', `${doing} was not sent: AB_OVO_API_URL is not an http or https address`, {
        writing,
      });
    }

    let response: Response;
    try {
      response = await this.#fetch(url, init);
    } catch (error) {
      throw new PlaceUnavailable('unreachable', `${doing} failed: ${String(error)}`, { writing, cause: error });
    }
    if (!response.ok) {
      throw new PlaceUnavailable(problemFor(response.status), `${doing} failed: ${response.status}`, {
        status: response.status,
        writing,
      });
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      // A body that does not parse is an answer from the wrong thing; one cut off half-way
      // is the network, and the network is worth trying again.
      const reason: PlaceProblem = error instanceof SyntaxError ? 'refused' : 'unreachable';
      throw new PlaceUnavailable(reason, `${doing} answered ${response.status} with no record: ${String(error)}`, {
        status: response.status,
        writing,
        cause: error,
      });
    }

    // Every answer this store reads is an object — `{ records }`, `{ language }`, a record.
    // `null`, a number or a list parses and is none of them, and reading a field of `null`
    // would escape `handle()` as a TypeError: the protocol error #137 exists to end.
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new PlaceUnavailable('refused', `${doing} answered ${response.status} with no record: ${JSON.stringify(body)}`, {
        status: response.status,
        writing,
      });
    }
    return body;
  }

  /** The account's rows as the service answers them, `updatedAt` and all. */
  async #records(): Promise<readonly ProgressRecordJson[]> {
    const body = (await this.#json(`${this.#baseUrl}/api/v1/progress`, { headers: this.#headers() }, false)) as {
      records?: readonly ProgressRecordJson[];
    };
    return body.records ?? [];
  }

  async readAll(): Promise<readonly Cursor[]> {
    return (await this.#records()).map((row) => this.#adopt(row));
  }

  /**
   * The edition the reader chose on the website — `GET /api/v1/preferences/language`, the
   * `ReaderPreference` row ADR-0052 keeps for an account — and, when they never chose one
   * there, the edition of their most recent place.
   *
   * The service answers "never chosen" as a 200 with nulls rather than a 404
   * (`PreferenceEndpoints`), so a null here is an answer, not a fault, and the fallback is
   * the same record the memory store reads: the place the reader last moved, which says
   * which edition they were reading in on whichever surface they read it. Nothing is written
   * to the preference from here — choosing the web's language is the web's control.
   */
  async edition(): Promise<string | undefined> {
    const chosen = (await this.#json(
      `${this.#baseUrl}/api/v1/preferences/language`,
      { headers: this.#headers() },
      false,
    )) as { language?: string | null };
    if (chosen.language) return chosen.language;

    const rows = await this.#records();
    const latest = rows.reduce<ProgressRecordJson | undefined>(
      (best, row) => (best === undefined || Date.parse(row.updatedAt) > Date.parse(best.updatedAt) ? row : best),
      undefined,
    );
    return latest ? this.#adopt(latest).language : undefined;
  }

  async read(track: string, unit: string): Promise<Cursor | undefined> {
    // The service answers the whole list either way, so one read is one list.
    return (await this.readAll()).find((row) => row.track === track && row.unit === unit);
  }

  async save(cursor: Cursor): Promise<Cursor> {
    if (!isIdentifier(cursor.track) || !isIdentifier(cursor.unit)) {
      throw new Error('a track and a unit are short identifiers: letters, digits, dot, dash, underscore');
    }

    // A ProgressRecord, not a ProgressResponse — read from ProgressEndpoints rather than
    // assumed, because the read and the write deliberately answer different shapes.
    const row = (await this.#json(
      `${this.#baseUrl}/api/v1/progress/${encodeURIComponent(cursor.track)}/${encodeURIComponent(cursor.unit)}`,
      {
        method: 'PUT',
        headers: this.#headers(),
        body: JSON.stringify({ step: cursor.step, language: cursor.language }),
      },
      true,
    )) as ProgressRecordJson;

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
