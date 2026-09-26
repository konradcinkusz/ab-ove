/**
 * A STUB OF `AbOvo.Api`, FOR THE UNIT TIER — what the server under test asks instead of a
 * running API (issue #171: "its unit tier runs against a stub API").
 *
 * It answers the requests `api.ts` makes, in the shapes `AbOvo.Contracts` gives them
 * (`@ab-ovo/web-kit/wire`), from bundles a test hands it — the committed fixture, or a track
 * built from it — and it behaves as the API does, as `tests/AbOvo.Api.Tests` holds it:
 *
 * - THE GATE (`Reveal.cs`): step n is served when 1 <= n <= the program's length and n is no
 *   further than the reader's furthest step; a reader with no place there, or no identity at
 *   all, is at step 1. A refusal is data on a 200, never an HTTP error.
 * - THE ADVANCE (`ContentEndpoints`): a request naming a step the reader is not on moves
 *   nothing and serves the step they are on; on the last step it is `ProgramComplete`;
 *   otherwise the place moves one step, taking the edition the request carries.
 * - THE OPENING (`POST …/open`): a place at step 1 in an edition the track has, and nothing
 *   written on a place that exists.
 * - THE READER: the bearer when there is one, else the anonymous id the header names
 *   (`ReaderIdentity.Resolve`); the anonymous read answers the header's reader and nobody else.
 *
 * NOT THE SERVER'S GATE. The server under test holds none: this is the far side of the wire,
 * written as the API behaves, so that the unit tier exercises the server's own code — the
 * client, the tools, the words — against the answers it will get. What the API does is
 * asserted against the API itself, in `tests/AbOvo.Api.Tests`. Nothing in the server imports
 * this directory, and `server.test.ts` checks that no module of the server reads a bundle.
 *
 * It never sends a route's `answer` or an exercise's, because the API has no field for
 * either (`ReturnRoute`, `StepContent`) — so the leak walks in `tools.test.ts` are walks over
 * what the server can actually be sent.
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import fixture from '@ab-ovo/web-kit/fixtures/book-p01.v2.bundle.json' with { type: 'json' };
import { validateBundle } from '@ab-ovo/web-kit';
import type { Bundle, Unit } from '@ab-ovo/web-kit';
import type {
  GateRefusal,
  ProgressRecord,
  ReturnIndexResponse,
  StepResponse,
  TrackContent,
  UnitSummary,
} from '@ab-ovo/web-kit/wire';

/** The origin the unit tier's API is at. Nothing is ever sent there: the stub's `fetch` answers. */
export const STUB_API = 'https://api.example';

/**
 * The committed v2 fixture, validated on the way through rather than trusted — the unit
 * tier's control, and never what a reader is served. The v2 one because it carries the two
 * answer-bearing fields that are not steps (`Route.answer`, `Exercise.answer`), so a walk
 * that asserts neither is ever emitted has something it could emit.
 */
export function fixtureBundle(): Bundle {
  const result = validateBundle(fixture);
  if (!result.ok) {
    throw new Error(
      'fixtures/book-p01.v2.bundle.json no longer validates:\n' +
        result.problems.map((problem) => `  ${problem.path}: ${problem.message}`).join('\n'),
    );
  }
  return result.bundle;
}

/** One reader's place in one program, as the API keeps it. */
export interface Row {
  track: string;
  unit: string;
  step: number;
  language: string;
  updatedAt: string;
}

/** A request the stub was sent: what a test can ask of the traffic afterwards. */
export interface StubCall {
  readonly method: string;
  readonly url: string;
  readonly authorization: string | undefined;
  readonly readerId: string | undefined;
  readonly body: unknown;
  /** What the client asked `fetch` to do with a redirect — `manual`, so an id is never carried on. */
  readonly redirect: RequestInit['redirect'];
}

interface Answer {
  readonly status: number;
  readonly body?: unknown;
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LANGUAGE = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/;

export class StubApi {
  /** Every request, in order. */
  readonly calls: StubCall[] = [];

  /**
   * A test's own answer to a request, in the API's place, when it returns one — a failure to
   * inject, or a redirect. Returning `undefined` lets the stub answer as the API would.
   */
  intercept: ((call: StubCall) => Response | undefined | Promise<Response | undefined>) | undefined;

  readonly #bundles: ReadonlyMap<string, Bundle>;
  readonly #rows = new Map<string, Row[]>();
  readonly #preferences = new Map<string, string>();
  #tick = 0;

  constructor(bundles: readonly Bundle[]) {
    this.#bundles = new Map(bundles.map((bundle) => [bundle.track.id, bundle]));
  }

  /** The Subject the API files an anonymous reader under (`ReaderIdentity.Anonymous`). */
  static anonymous(readerId: string): string {
    return `anon:${readerId.toLowerCase()}`;
  }

  /** One reader's places, as the API would read them: that reader's rows and nobody else's. */
  rowsOf(subject: string): readonly Row[] {
    return [...(this.#rows.get(subject) ?? [])].sort(
      (a, b) => a.track.localeCompare(b.track) || a.unit.localeCompare(b.unit),
    );
  }

  /** One reader's place in one program, or `undefined`. */
  place(subject: string, track: string, unit: string): Row | undefined {
    return this.#rows.get(subject)?.find((row) => row.track === track && row.unit === unit);
  }

  /** A place written straight into the store, where the gate's own advances would have left it. */
  seed(subject: string, place: { track: string; unit: string; step: number; language: string }): void {
    const rows = this.#rows.get(subject) ?? [];
    this.#rows.set(subject, [...rows.filter((row) => row.track !== place.track || row.unit !== place.unit), {
      ...place,
      updatedAt: this.#now(),
    }]);
  }

  /** The edition an account chose on the website (`ReaderPreference`, ADR-0052). */
  prefer(subject: string, language: string): void {
    this.#preferences.set(subject, language);
  }

  /** Later with every write, so "the most recent place" means what it does on the API. */
  #now(): string {
    this.#tick += 1;
    return new Date(Date.UTC(2026, 8, 26, 12, 0, this.#tick)).toISOString();
  }

  /** The `fetch` a client under test is handed: every request answered here, none sent. */
  readonly fetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url);
    const headers = new Headers(init?.headers);
    const call: StubCall = {
      method: init?.method ?? 'GET',
      url: url.href,
      authorization: headers.get('authorization') ?? undefined,
      readerId: headers.get('x-ab-ovo-reader-id') ?? undefined,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      redirect: init?.redirect,
    };
    this.calls.push(call);

    const injected = await this.intercept?.(call);
    if (injected) return injected;

    const answer = this.#answer(call.method, url.pathname, call);
    return answer.body === undefined
      ? new Response(null, { status: answer.status })
      : Response.json(answer.body, { status: answer.status });
  }) as typeof fetch;

  /**
   * The same stub over real HTTP, on a port of the machine's choosing — for a test that starts
   * the server as a host does, as its own process (`restart.test.ts`).
   */
  async listen(): Promise<{ readonly url: string; close(): Promise<void> }> {
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        const headers = Object.entries(request.headers).flatMap(([name, value]) =>
          value === undefined ? [] : [[name, Array.isArray(value) ? value.join(', ') : value] as [string, string]],
        );
        void this.fetch(`http://${request.headers.host ?? '127.0.0.1'}${request.url ?? '/'}`, {
          method: request.method ?? 'GET',
          headers,
          ...(text === '' ? {} : { body: text }),
        }).then(async (answer) => {
          response.writeHead(answer.status, Object.fromEntries(answer.headers));
          response.end(Buffer.from(await answer.arrayBuffer()));
        });
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    return {
      url: `http://127.0.0.1:${port}`,
      close: () =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    };
  }

  /** Who the request is filed under — `ReaderIdentity.Resolve`: a bearer wins, else the header's id. */
  #reader(call: StubCall): { readonly subject: string | undefined; readonly account: boolean } {
    if (call.authorization?.startsWith('Bearer ')) return { subject: call.authorization.slice('Bearer '.length), account: true };
    if (call.readerId && GUID.test(call.readerId)) return { subject: StubApi.anonymous(call.readerId), account: false };
    return { subject: undefined, account: false };
  }

  #answer(method: string, path: string, call: StubCall): Answer {
    const reader = this.#reader(call);
    const records = (subject: string): { records: ProgressRecord[] } => ({
      records: this.rowsOf(subject).map((row) => ({ ...row })),
    });

    if (path === '/api/v1/progress' && method === 'GET') {
      return reader.account && reader.subject ? { status: 200, body: records(reader.subject) } : { status: 401 };
    }
    if (path === '/api/v1/progress/anonymous' && method === 'GET') {
      // The header's reader, and nobody else — even beside a bearer.
      return call.readerId && GUID.test(call.readerId)
        ? { status: 200, body: records(StubApi.anonymous(call.readerId)) }
        : { status: 400 };
    }
    if (path.startsWith('/api/v1/progress')) {
      // Nothing the server under test may send (#171: it no longer calls PUT), so a loud answer.
      return { status: 405 };
    }
    if (path === '/api/v1/preferences/language' && method === 'GET') {
      if (!reader.account || !reader.subject) return { status: 401 };
      const language = this.#preferences.get(reader.subject) ?? null;
      return { status: 200, body: { language, chosenAt: language === null ? null : '2026-09-01T00:00:00Z' } };
    }

    const match = /^\/api\/v1\/content\/([^/]+)(?:\/([^/]+)(?:\/([^/]+))?)?$/.exec(path);
    if (!match) return { status: 404 };
    const [, track = '', unitId, last] = match.map((segment) => (segment === undefined ? undefined : decodeURIComponent(segment)));
    const bundle = this.#bundles.get(track);
    if (!bundle) return { status: 404 };

    if (unitId === undefined) return method === 'GET' ? { status: 200, body: this.#track(bundle) } : { status: 405 };

    const unit = bundle.units.find((candidate) => candidate.id === unitId);
    if (!unit) return { status: 404 };
    const cursor = reader.subject ? (this.place(reader.subject, track, unit.id)?.step ?? 1) : 1;

    if (last === undefined) return method === 'GET' ? { status: 200, body: this.#unit(unit, cursor) } : { status: 405 };
    if (last === 'summary' && method === 'GET') return { status: 200, body: this.#summary(bundle, unit, cursor) };
    if (last === 'open' && method === 'POST') return this.#open(bundle, unit, reader.subject, call.body);
    if (last === 'advance' && method === 'POST') return this.#advance(unit, track, reader.subject, cursor, call.body);
    if (/^-?\d+$/.test(last) && method === 'GET') return { status: 200, body: this.#step(unit, cursor, Number(last)) };
    return { status: 404 };
  }

  #track(bundle: Bundle): TrackContent {
    return {
      tag: bundle.tag,
      languages: bundle.track.languages,
      titles: bundle.track.titles,
      programs: bundle.units.map((unit) => ({
        id: unit.id,
        titles: unit.titles,
        part: unit.part ?? null,
        stepCount: unit.steps.length,
      })),
    };
  }

  #unit(unit: Unit, cursor: number): UnitSummary {
    return {
      id: unit.id,
      titles: unit.titles,
      stepCount: unit.steps.length,
      sections: (unit.sections ?? []).map(({ id, titles, firstStep }) => ({ id, titles, firstStep })),
      part: unit.part ?? null,
      furthest: cursor,
    };
  }

  /** `Reveal.Serve`: the program's bound first, then the reader's. */
  #refusal(total: number, cursor: number, n: number): GateRefusal | undefined {
    if (n < 1 || n > total) {
      return { kind: 'NoSuchStep', requested: n, furthest: cursor, steps: total, message: `step ${n} is not one of ${total}` };
    }
    if (n > cursor) {
      return { kind: 'NotReached', requested: n, furthest: cursor, steps: total, message: `step ${n} is past ${cursor}` };
    }
    return undefined;
  }

  #step(unit: Unit, cursor: number, n: number): StepResponse {
    const refusal = this.#refusal(unit.steps.length, cursor, n);
    if (refusal) return { ok: false, step: null, refusal, furthest: cursor };
    const step = unit.steps[n - 1]!;
    return {
      ok: true,
      step: {
        n: step.n,
        kind: step.kind,
        body: step.body,
        titles: step.titles ?? null,
        answer: step.answer ?? null,
        cue: step.cue ?? false,
        check: step.check ?? null,
      },
      refusal: null,
      furthest: cursor,
    };
  }

  #summary(bundle: Bundle, unit: Unit, cursor: number): ReturnIndexResponse {
    const refusal = this.#refusal(unit.steps.length, cursor, unit.steps.length);
    if (refusal) return { ok: false, index: null, refusal, furthest: cursor };
    const routes = (kind: 'summary' | 'outcome') =>
      (unit.routes ?? [])
        .filter((route) => route.kind === kind)
        .map((route) => ({ labels: route.labels ?? {}, from: route.from, to: route.to }));
    return {
      ok: true,
      index: {
        summary: routes('summary'),
        outcomes: routes('outcome'),
        lab: bundle.labs?.find((lab) => lab.id === unit.id)?.id ?? null,
      },
      refusal: null,
      furthest: cursor,
    };
  }

  #open(bundle: Bundle, unit: Unit, subject: string | undefined, body: unknown): Answer {
    if (!subject) return { status: 400 };
    const language = (body as { language?: unknown } | undefined)?.language;
    if (typeof language !== 'string' || !bundle.track.languages.includes(language)) return { status: 400 };
    const existing = this.place(subject, bundle.track.id, unit.id);
    if (existing) return { status: 200, body: { ...existing } };
    const row: Row = { track: bundle.track.id, unit: unit.id, step: 1, language, updatedAt: this.#now() };
    this.#rows.set(subject, [...(this.#rows.get(subject) ?? []), row]);
    return { status: 200, body: { ...row } };
  }

  #advance(unit: Unit, track: string, subject: string | undefined, cursor: number, body: unknown): Answer {
    if (!subject) return { status: 400 };
    const request = body as { answeringStep?: unknown; language?: unknown } | undefined;
    const answering = request?.answeringStep;
    const language = request?.language;
    if (!Number.isInteger(answering) || typeof language !== 'string' || !LANGUAGE.test(language)) return { status: 400 };

    const total = unit.steps.length;
    // Idempotency: a step the reader is not on moves nothing, and the step they are on comes back.
    if (answering !== cursor) return { status: 200, body: this.#step(unit, cursor, cursor) };
    if (cursor >= total) {
      return {
        status: 200,
        body: {
          ok: false,
          step: null,
          refusal: { kind: 'ProgramComplete', requested: 0, furthest: cursor, steps: total, message: 'finished' },
        } satisfies StepResponse,
      };
    }

    const moved = cursor + 1;
    const existing = this.place(subject, track, unit.id);
    if (existing) {
      existing.step = moved;
      existing.language = language;
      existing.updatedAt = this.#now();
    } else {
      this.#rows.set(subject, [...(this.#rows.get(subject) ?? []), { track, unit: unit.id, step: moved, language, updatedAt: this.#now() }]);
    }
    return { status: 200, body: this.#step(unit, moved, moved) };
  }
}
