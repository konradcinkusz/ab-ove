/**
 * THE BOOK AND THE READER'S PLACE, BOTH FROM `AbOvo.Api` — ADR-0066 §1, issue #171.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THIS PACKAGE KEEPS NOTHING OF ITS OWN.
 *
 * Tracks, programs and steps come from `GET /api/v1/content/**`, and every advance goes
 * through `POST …/advance`. There is no bundle on disk and no copy of the reveal gate: the
 * gate is `AbOvo.Api`'s (`Reveal.cs`), the one copy every client asks, and a step this
 * server has not been served is a step it cannot show. Until #171 this package read the
 * compiled bundle from the checkout and held its own `reveal.ts`, and its place went to the
 * account through `PUT /api/v1/progress/…`, which trusted the step it was sent.
 *
 * The reader's place is `ReaderProgress` — the row the reading surface writes, keyed by
 * reader, track and program. A second table keyed by reader would be a second answer to
 * "where is this person", and the two would drift the first time somebody read on a phone
 * and then asked a model. Nor does this package touch the database: `AbOvo.Api` registers
 * `ReaderScopedQueries`, which refuses any query over that table that does not pin one
 * reader by an equality, and a client with its own connection would be a second, unguarded
 * door past a guard that would still be green.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * WHO THE READER IS. A bearer when `AB_OVO_READER_TOKEN` is set — an account's place, the
 * order `ReaderIdentity.Resolve` reads in — and otherwise an anonymous reader's opaque id
 * (ADR-0061's pattern, ADR-0066 §2), sent as `X-Ab-Ovo-Reader-Id` and filed by the API as
 * `anon:<id>`. `identity.ts` mints and keeps the id; this module only sends it, and only to
 * the origin it was minted for, and never says it anywhere else.
 *
 * Every failure to reach the API is `ApiUnavailable`, with a reason whose fix differs, and a
 * server that has no book to ask is `NoBook`. `tools.ts`'s `handle()` answers both with a
 * sentence rather than letting them reach a host as a protocol error (#137).
 */
import { PINS } from '@ab-ovo/web-kit';
import type {
  AdvanceBody,
  OpenBody,
  ProgressRecord,
  ReturnIndexResponse,
  StepResponse,
  TrackContent,
  UnitSummary,
} from '@ab-ovo/web-kit/wire';

import type { HeldId } from './identity.ts';

/** Mirrors `AbOvo.Api.Extensions.ReaderIdentity.HeaderName`. */
export const READER_ID_HEADER = 'X-Ab-Ovo-Reader-Id';

/**
 * Where one reader is in one program.
 *
 * `step` is the FURTHEST step the gate has served, never "the step they are looking at". The
 * two differ only when a reader re-reads, and conflating them is how a re-read would hand
 * somebody the answer to a frame they had not answered.
 */
export interface Cursor {
  readonly track: string;
  readonly unit: string;
  readonly language: string;
  readonly step: number;
}

/** A cursor as the API keeps it, with when it last moved — what the most recent place is found by. */
export interface Place extends Cursor {
  readonly updatedAt: string;
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
 * Why the API could not be used, in the three shapes that have different fixes.
 *
 * - `unauthorised` — the service answered 401 or 403: the reader token has expired or is not
 *   a reader's. A fresh token fixes it; trying again does not.
 * - `unreachable` — no answer at all (the fetch itself rejected), or one that says "later"
 *   (5xx, 408, 429). Trying again shortly is the fix.
 * - `refused` — any other answer that is not what was asked for: a 404 from an address that
 *   is not this API, a redirect, a body that is not the shape the API sends. Or no answer
 *   because nothing could be asked: an `AB_OVO_API_URL` that is not an http or https address,
 *   which is the one `refused` with no status. Trying again will not change it.
 */
export type ApiProblem = 'unauthorised' | 'unreachable' | 'refused';

/**
 * The API could not be used for this call.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * A TYPE, BECAUSE A BARE `Error` BECAME A PROTOCOL ERROR (#137).
 *
 * The store this replaces used to throw `new Error('progress read failed: 401')` and let a
 * rejected `fetch` pass straight through. `handle()` in `tools.ts` catches what it can name
 * and nothing else, so both reached the host as JSON-RPC `-32603` with a developer's string
 * in it. With a type and a reason, `handle()` answers with a result and a sentence — what
 * happened to the reader's place (nothing), and what fixes it. The book comes from the same
 * API now, so a failed read of a step is this type too.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export class ApiUnavailable extends Error {
  readonly reason: ApiProblem;
  /** The HTTP status, when the service answered at all. */
  readonly status: number | undefined;
  /**
   * True when a WRITE failed. The call that made it can be made again; whether it was
   * recorded is not known, because a 5xx or a dropped connection can follow a commit.
   */
  readonly writing: boolean;
  /** True when the request carried a bearer, so a 401 or 403 says the token is the thing to renew. */
  readonly withToken: boolean;

  constructor(
    reason: ApiProblem,
    message: string,
    detail: {
      readonly status?: number;
      readonly writing: boolean;
      readonly withToken: boolean;
      readonly cause?: unknown;
    },
  ) {
    super(message, detail.cause === undefined ? undefined : { cause: detail.cause });
    this.name = 'ApiUnavailable';
    this.reason = reason;
    this.status = detail.status;
    this.writing = detail.writing;
    this.withToken = detail.withToken;
  }
}

/**
 * This server has no book to serve: no API to ask (`AB_OVO_API_URL` is not set), or an API
 * that holds no content for a track this server carries (it answered 404). Either is a fault
 * of the deployment and not of anything the reader did, and `handle()` answers it with the
 * fix, for whoever runs the server — the successor of the missing-bundle note of #136.
 */
export class NoBook extends Error {
  readonly kind: 'unconfigured' | 'not-held';
  /** The track the API holds nothing for, when `kind` is `not-held`. */
  readonly track: string | undefined;

  constructor(kind: 'unconfigured' | 'not-held', track?: string) {
    super(
      kind === 'unconfigured'
        ? 'AB_OVO_API_URL is not set'
        : `the API holds no content for the track "${track ?? ''}"`,
    );
    this.name = 'NoBook';
    this.kind = kind;
    this.track = track;
  }
}

/** Who a request is filed under — `ReaderIdentity.Resolve`'s two readers, or nobody the API can name. */
export type ReaderSource =
  | { readonly kind: 'account'; readonly bearer: string }
  /**
   * An anonymous reader's id, resolved the first time a request needs it and then held for
   * the life of the process: minted and kept by `identity.ts`, or held in memory alone when
   * it could not be kept, which `kept` says.
   */
  | { readonly kind: 'anonymous'; readonly hold: () => HeldId }
  /** No reader: an `AB_OVO_API_URL` with no origin to key an id by, which nothing is sent to anyway. */
  | { readonly kind: 'nobody' };

export interface ApiOptions {
  /** `AB_OVO_API_URL`, or `undefined` when it is not set — every call then answers `NoBook`. */
  readonly baseUrl: string | undefined;
  readonly reader: ReaderSource;
  /**
   * The tracks this server carries — the ones this checkout pins (`PINS`), whose content the
   * API is asked for. `AbOvo.Api` lists no courses yet (the deviation register's row on the
   * index says so), so a pin is how a client knows which track to ask about.
   */
  readonly tracks?: readonly string[];
  /** Injectable, so the unit tier runs against a stub API with no network. */
  readonly fetch?: typeof fetch;
}

/** Which of the three a status is; see `ApiProblem` for why these lines. */
function problemFor(status: number): ApiProblem {
  if (status === 401 || status === 403) return 'unauthorised';
  if (status >= 500 || status === 408 || status === 429) return 'unreachable';
  return 'refused';
}

// ── What the API answers, checked rather than trusted ─────────────────────────────────
//
// A body is read as the shape AbOvo.Contracts gives it only after it has been seen to be
// one: an answer that parses and is something else came from something that is not this
// API, and reading a field of it would escape `handle()` as a TypeError — the protocol error
// #137 exists to end. Only what this package reads is checked.

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is Readonly<Record<string, string>> =>
  isObject(value) && Object.values(value).every((words) => typeof words === 'string');
const isCount = (value: unknown): value is number => Number.isInteger(value);

function isRecord(value: unknown): value is ProgressRecord {
  return (
    isObject(value) &&
    typeof value['track'] === 'string' &&
    typeof value['unit'] === 'string' &&
    isCount(value['step']) &&
    typeof value['language'] === 'string' &&
    typeof value['updatedAt'] === 'string'
  );
}

function isPart(value: unknown): boolean {
  return value === null || value === undefined || (isObject(value) && typeof value['id'] === 'string' && isText(value['titles']));
}

function isTrackContent(value: unknown): value is TrackContent {
  return (
    isObject(value) &&
    typeof value['tag'] === 'string' &&
    Array.isArray(value['languages']) &&
    value['languages'].every((language) => typeof language === 'string') &&
    (value['titles'] === undefined || value['titles'] === null || isText(value['titles'])) &&
    Array.isArray(value['programs']) &&
    value['programs'].every(
      (program) =>
        isObject(program) &&
        typeof program['id'] === 'string' &&
        isText(program['titles']) &&
        isPart(program['part']) &&
        // Required here although optional on the wire: an API older than #171 lists no
        // lengths, and every line of `list_programs` prints one.
        isCount(program['stepCount']),
    )
  );
}

function isUnitSummary(value: unknown): value is UnitSummary {
  return (
    isObject(value) &&
    typeof value['id'] === 'string' &&
    isText(value['titles']) &&
    isCount(value['stepCount']) &&
    Array.isArray(value['sections']) &&
    value['sections'].every(
      (section) => isObject(section) && typeof section['id'] === 'string' && isText(section['titles']) && isCount(section['firstStep']),
    )
  );
}

const REFUSALS = new Set(['NotReached', 'NoSuchStep', 'ProgramComplete']);

function isRefusal(value: unknown): boolean {
  return (
    isObject(value) &&
    typeof value['kind'] === 'string' &&
    REFUSALS.has(value['kind']) &&
    isCount(value['requested']) &&
    isCount(value['furthest']) &&
    isCount(value['steps'])
  );
}

function isStepResponse(value: unknown): value is StepResponse {
  if (!isObject(value) || typeof value['ok'] !== 'boolean') return false;
  if (!value['ok']) return isRefusal(value['refusal']);
  const step = value['step'];
  return (
    isObject(step) &&
    isCount(step['n']) &&
    isText(step['body']) &&
    (step['titles'] === null || step['titles'] === undefined || isText(step['titles'])) &&
    (step['answer'] === null || step['answer'] === undefined || isText(step['answer'])) &&
    typeof step['cue'] === 'boolean' &&
    (step['check'] === null ||
      step['check'] === undefined ||
      (isObject(step['check']) && typeof step['check']['lab'] === 'string' && typeof step['check']['exercise'] === 'string'))
  );
}

function isReturnIndexResponse(value: unknown): value is ReturnIndexResponse {
  if (!isObject(value) || typeof value['ok'] !== 'boolean') return false;
  if (!value['ok']) return isRefusal(value['refusal']);
  const index = value['index'];
  const routes = (list: unknown): boolean =>
    Array.isArray(list) &&
    list.every((route) => isObject(route) && isText(route['labels']) && isCount(route['from']) && isCount(route['to']));
  return isObject(index) && routes(index['summary']) && routes(index['outcomes']);
}

/**
 * `AbOvo.Api`, as this server reads it: the content endpoints, the reader's places, the one
 * write that records opening a program, and the advance. One reader per process — the stdio
 * shape, where one host serves one reader (MCP-SERVER-SKETCH.md §4 says what a hosted server
 * would change).
 */
export class AbOvoApi {
  readonly tracks: readonly string[];
  readonly #base: string | undefined;
  readonly #reader: ReaderSource;
  readonly #fetch: typeof fetch;
  #held: HeldId | undefined;

  /**
   * THE EDITION AT A TIE, WHICH THE SERVICE DOES NOT CARRY.
   *
   * An opening writes nothing on a place that exists (ADR-0066 §2), and an advance carries
   * the edition with the step it raises (ADR-0019: "frame 40, in Polish" is one fact and not
   * two). So a reader who switches editions ON the step they are on has nowhere to write the
   * switch, and the next read would switch them back. The reading surface has no such
   * problem because the edition it shows is in the URL; here it is in the cursor.
   *
   * So the switch is kept here, for that step only, the way the surface keeps it in the
   * address bar: it reaches the API with the next advance, which the service adopts whole,
   * and it is dropped the moment the API's step moves past it — that is another machine
   * reading on, and its edition travels with its step. One reader per process, so the key
   * needs no reader in it.
   */
  readonly #editionAt = new Map<string, { readonly step: number; readonly language: string }>();

  /**
   * The last listing of each track this process was answered with. Asked for again on every
   * call, never served from here: it is kept only so that a place out of reach can be told in
   * an edition the call named when the track is known to have it (#167), the API that says
   * which editions a track has being the thing out of reach.
   */
  readonly #known = new Map<string, TrackContent>();

  constructor(options: ApiOptions) {
    this.#base = options.baseUrl === undefined ? undefined : options.baseUrl.replace(/\/+$/, '');
    this.#reader = options.reader;
    this.#fetch = options.fetch ?? fetch;
    this.tracks = options.tracks ?? PINS.map((pin) => pin.track);
  }

  /**
   * True once this process holds its anonymous reader's id in memory alone — it could not be
   * kept (`identity.ts`), so a restart begins every program again. `tools.ts` says so to the
   * reader: once in the words of a session, on every result as data (P8).
   */
  get placeIsEphemeral(): boolean {
    return this.#reader.kind === 'anonymous' && this.#held !== undefined && !this.#held.kept;
  }

  /** The listing of a track this process was last answered with, without asking again. */
  lastKnown(track: string): TrackContent | undefined {
    return this.#known.get(track);
  }

  static #key(track: string, unit: string): string {
    return `${track}/${unit}`;
  }

  #headers(json: boolean): Record<string, string> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (json) headers['content-type'] = 'application/json';
    const reader = this.#reader;
    if (reader.kind === 'account') {
      headers['authorization'] = `Bearer ${reader.bearer}`;
    } else if (reader.kind === 'anonymous') {
      this.#held ??= reader.hold();
      headers[READER_ID_HEADER] = this.#held.id;
    }
    return headers;
  }

  /**
   * One request to the API, and its JSON object — or `undefined` for a 404 where the caller
   * reads one as an answer, and `ApiUnavailable` or `NoBook` for everything else that is not
   * the answer.
   *
   * THE ID GOES TO ITS OWN ORIGIN AND NOWHERE ELSE (ADR-0066 §2). Every request is to the
   * address `AB_OVO_API_URL` names, and a redirect is not followed: `fetch` carries a custom
   * header across one, and an id sent to another origin would let that origin's operator
   * replay it. So a 3xx is an answer, and it is `refused` — an address that moves is not the
   * address this server was given.
   */
  async #json(
    method: 'GET' | 'POST',
    path: string,
    options: { readonly body?: object; readonly writing: boolean; readonly notFound?: 'answer' },
  ): Promise<Json | undefined> {
    if (this.#base === undefined) throw new NoBook('unconfigured');
    const url = `${this.#base}${path}`;
    // The URL as given, for the message: parsing it is the next step, and may be what fails.
    const doing = `${method} ${url}`;
    const writing = options.writing;
    const withToken = this.#reader.kind === 'account';

    /*
      AN ADDRESS THAT IS NOT ONE IS NOT A NETWORK FAULT. `fetch` rejects `not-a-url` with the
      same TypeError as a dropped connection, and `localhost:8180` parses with `localhost:` as
      its scheme and is rejected the same way, so both used to read as `unreachable` — "try
      again shortly", which never helps. Asked here, where `URL.parse` answers `null` rather
      than throwing, it is `refused`, whose fix is AB_OVO_API_URL itself.
    */
    const scheme = URL.parse(url)?.protocol;
    if (scheme !== 'http:' && scheme !== 'https:') {
      throw new ApiUnavailable('refused', `${doing} was not sent: AB_OVO_API_URL is not an http or https address`, {
        writing,
        withToken,
      });
    }

    let response: Response;
    try {
      response = await this.#fetch(url, {
        method,
        headers: this.#headers(options.body !== undefined),
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        redirect: 'manual',
      });
    } catch (error) {
      throw new ApiUnavailable('unreachable', `${doing} failed: ${String(error)}`, { writing, withToken, cause: error });
    }
    if (response.status === 404 && options.notFound === 'answer') return undefined;
    if (!response.ok) {
      throw new ApiUnavailable(problemFor(response.status), `${doing} failed: ${response.status}`, {
        status: response.status,
        writing,
        withToken,
      });
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      // A body that does not parse is an answer from the wrong thing; one cut off half-way
      // is the network, and the network is worth trying again.
      const reason: ApiProblem = error instanceof SyntaxError ? 'refused' : 'unreachable';
      throw new ApiUnavailable(reason, `${doing} answered ${response.status} with nothing to read: ${String(error)}`, {
        status: response.status,
        writing,
        withToken,
        cause: error,
      });
    }
    if (!isObject(body)) {
      throw new ApiUnavailable('refused', `${doing} answered ${response.status} with ${JSON.stringify(body)}`, {
        status: response.status,
        writing,
        withToken,
      });
    }
    return body;
  }

  /** `#json`'s answer, seen to be the shape wanted — or `refused`, naming what it was not. */
  async #shaped<T>(
    method: 'GET' | 'POST',
    path: string,
    is: (value: unknown) => value is T,
    what: string,
    options: { readonly body?: object; readonly writing: boolean },
  ): Promise<T> {
    const body = await this.#json(method, path, options);
    if (!is(body)) {
      throw new ApiUnavailable('refused', `${method} ${this.#base ?? ''}${path} answered with something that is not ${what}`, {
        writing: options.writing,
        withToken: this.#reader.kind === 'account',
      });
    }
    return body;
  }

  static #path(...segments: readonly (string | number)[]): string {
    return `/api/v1/content/${segments.map((segment) => encodeURIComponent(String(segment))).join('/')}`;
  }

  /**
   * A track's listing: its tag, editions, title and programs, each with its length. A 404 is
   * a track the API holds nothing for, and that is `NoBook` rather than a reader's slip: the
   * tracks asked about are this server's own.
   */
  async track(track: string): Promise<TrackContent> {
    const body = await this.#json('GET', AbOvoApi.#path(track), { writing: false, notFound: 'answer' });
    if (body === undefined) throw new NoBook('not-held', track);
    if (!isTrackContent(body)) {
      throw new ApiUnavailable('refused', `GET ${this.#base ?? ''}${AbOvoApi.#path(track)} answered with something that is not a track`, {
        writing: false,
        withToken: this.#reader.kind === 'account',
      });
    }
    this.#known.set(track, body);
    return body;
  }

  /** A program's shape — titles, headings, length — and never a step's body. */
  unit(track: string, unit: string): Promise<UnitSummary> {
    return this.#shaped('GET', AbOvoApi.#path(track, unit), isUnitSummary, 'a program', { writing: false });
  }

  /** Step `n`, or the gate's refusal of it — the API's gate, asked for this reader. */
  step(track: string, unit: string, n: number): Promise<StepResponse> {
    return this.#shaped('GET', AbOvoApi.#path(track, unit, n), isStepResponse, 'a step', { writing: false });
  }

  /** A program's Summary and *Can you?*, served as its last step is (#158), or refused as it would be. */
  returnIndex(track: string, unit: string): Promise<ReturnIndexResponse> {
    return this.#shaped('GET', AbOvoApi.#path(track, unit, 'summary'), isReturnIndexResponse, 'a summary', {
      writing: false,
    });
  }

  /**
   * Every place this reader has, in one call: `GET /api/v1/progress` for an account, and
   * `GET /api/v1/progress/anonymous` for the reader an id names (#171) — each with the edition
   * this process switched to on that same step.
   */
  async places(): Promise<readonly Place[]> {
    const path = this.#reader.kind === 'account' ? '/api/v1/progress' : '/api/v1/progress/anonymous';
    const body = await this.#json('GET', path, { writing: false });
    const records = body?.['records'];
    if (!Array.isArray(records) || !records.every(isRecord)) {
      throw new ApiUnavailable('refused', `GET ${this.#base ?? ''}${path} answered with something that is not a list of places`, {
        writing: false,
        withToken: this.#reader.kind === 'account',
      });
    }
    return records.map((record) => this.#adopt(record));
  }

  /** The API's row, with the edition this process switched to on that same step. */
  #adopt(row: ProgressRecord): Place {
    const key = AbOvoApi.#key(row.track, row.unit);
    const kept = this.#editionAt.get(key);
    if (kept && kept.step !== row.step) this.#editionAt.delete(key);
    return {
      track: row.track,
      unit: row.unit,
      step: row.step,
      language: kept && kept.step === row.step ? kept.language : row.language,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * A switch of edition on the step the reader is on: kept here until an advance carries it
   * (`#editionAt` says why). Nothing is sent.
   */
  keepEdition(cursor: Cursor): void {
    this.#editionAt.set(AbOvoApi.#key(cursor.track, cursor.unit), { step: cursor.step, language: cursor.language });
  }

  /**
   * Record that the reader opened a program — `POST …/open` (ADR-0066 §2, #171): a place at
   * its first step in the edition named, or nothing written when a place exists. Answers the
   * place as it now stands.
   */
  async open(track: string, unit: string, language: string): Promise<Place> {
    const body: OpenBody = { language };
    const record = await this.#shaped('POST', AbOvoApi.#path(track, unit, 'open'), isRecord, 'a place', {
      body,
      writing: true,
    });
    return this.#adopt(record);
  }

  /**
   * Submit an answer to the step it names — `POST …/advance`, the only thing that raises a
   * place. The answer's words are not sent: the API keeps none, and nothing here is kept as
   * evidence about the reader (MCP-SERVER-SKETCH.md §5). The API decides what is served next.
   */
  async advance(track: string, unit: string, answering: number, language: string): Promise<StepResponse> {
    const body: AdvanceBody = { answeringStep: answering, language };
    const moved = await this.#shaped('POST', AbOvoApi.#path(track, unit, 'advance'), isStepResponse, 'a step', {
      body,
      writing: true,
    });
    // The edition went with the step it raised, so the switch this process held is the API's now.
    if (moved.ok) this.#editionAt.delete(AbOvoApi.#key(track, unit));
    return moved;
  }

  /**
   * The edition this reader reads in, when one is known; `undefined` when nothing says.
   *
   * ONE EDITION PER READER, NOT ONE PER PROGRAM (#144). For an account, the one chosen on the
   * website — `GET /api/v1/preferences/language`, the `ReaderPreference` row ADR-0052 keeps,
   * which answers "never chosen" as a 200 with nulls. Otherwise, and for a reader with no
   * account, whom no preference is kept for, the edition of their most recent place: the
   * place last moved says which edition they were reading in, on whichever surface. Nothing is
   * written to the preference from here — choosing the website's language is the website's
   * control. `places` is the list the caller already holds, so it is not asked for twice.
   */
  async edition(places?: readonly Place[]): Promise<string | undefined> {
    if (this.#reader.kind === 'account') {
      const chosen = await this.#json('GET', '/api/v1/preferences/language', { writing: false });
      const language = chosen?.['language'];
      if (typeof language === 'string' && language !== '') return language;
    }
    const rows = places ?? (await this.places());
    const latest = rows.reduce<Place | undefined>(
      (best, row) => (best === undefined || Date.parse(row.updatedAt) > Date.parse(best.updatedAt) ? row : best),
      undefined,
    );
    return latest?.language;
  }
}
