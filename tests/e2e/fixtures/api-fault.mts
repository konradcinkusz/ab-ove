#!/usr/bin/env node
/**
 * A FIXTURE THAT CAN TAKE AbOvo.Api AWAY FROM ONE READER, FOR THE ACCEPTANCE SUITE ONLY.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHY IT EXISTS (issue #139).
 *
 * Since ADR-0060 every frame is a live, server-side call from the web app to `AbOvo.Api`,
 * and a frame whose call finds nobody there throws to `app/error.tsx`. That page is what a
 * reader sees on the one failure ADR-0060 made ordinary, and the suite could not reach it:
 * the call is made by the Next SERVER, so the browser-side route interception
 * `no-backend.spec.ts` uses never sees it, and every spec shares one live API, so no test
 * could stop it without stopping it for every other test running beside it.
 *
 * So this stands between the first deployment and the API as a plain pass-through, and it
 * takes the API away from ONE READER at a time — the anonymous reader id the web app sends
 * as `X-Ab-Ovo-Reader-Id` (ADR-0061), which the middleware minted for one browser context
 * and nobody else holds. A spec cuts its own reader, sees the error page, restores the
 * reader and presses *Try again*; every other test in the run goes on reading through the
 * same process untouched. That is the README's *Independence and cleanup* property, kept by
 * construction rather than by running the spec alone.
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * WHAT A CUT READER GETS IS A DROPPED CONNECTION, NOT A STATUS. `AbOvo.Api` stopped is a
 * refused or reset connection, and that is the failure the content module's candidate
 * ladder has to walk (`web/app/src/lib/server/content.ts`). A 503 would reach the same page
 * by a different branch — the one for an API that answered — and prove less.
 *
 * WHAT IT DOES NOT DO. It never alters a request it passes: the method, the path, the body
 * and every end-to-end header reach the API as the web app sent them, and the answer comes
 * back the same way. A spec that never cuts anybody cannot tell this process is there, which
 * is the property that lets the first deployment go through it at all.
 *
 * THE CONTROL SURFACE IS UNDER `/__fault/`, a prefix `AbOvo.Api` has nothing under, so a
 * control request can never be mistaken for one to forward:
 *
 *   GET    /__fault/health        this process is up — what Playwright's `webServer` polls
 *   PUT    /__fault/<reader id>   take the API away from that reader
 *   DELETE /__fault/<reader id>   give it back
 *
 * NO DEPENDENCY, for the reason `authservice-stub.mts` gives: `tests/e2e` has three
 * devDependencies and a lockfile CI checks by name. `node:http` forwards a request in a
 * few lines. Addresses come from the environment (P5), so `playwright.config.ts` stays the
 * one place that decides which ports this suite's fixtures use.
 */

import { Agent, createServer, request as forward, type IncomingHttpHeaders } from 'node:http';

const PORT = Number(process.env.AB_OVO_FAULT_PORT ?? 3300);

const upstreamSetting = process.env.AB_OVO_FAULT_UPSTREAM?.trim();
if (!upstreamSetting) {
  // There is nothing to stand in front of. `playwright.config.ts` starts this process only
  // when `E2E_API_BASE_URL` names an API, so reaching here is a wiring defect and says so.
  console.error('api-fault: AB_OVO_FAULT_UPSTREAM is unset — there is no API to stand in front of.');
  process.exit(1);
}
const UPSTREAM = new URL(upstreamSetting);

/** Mirrors `AbOvo.Api.Extensions.ReaderIdentity.HeaderName`, as Node lower-cases it. */
const READER_ID_HEADER = 'x-ab-ovo-reader-id';

const CONTROL = '/__fault/';

/** The readers the API is currently taken away from. In memory, and gone with the process. */
const cut = new Set<string>();

/**
 * Headers that describe ONE CONNECTION rather than the message (RFC 9110 §7.6.1), so each
 * hop sets its own. Passing the web app's `connection` on to the API, or the API's
 * `transfer-encoding` back over a connection Node frames by itself, would describe a hop
 * that is not the one the bytes are on.
 */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function endToEnd(headers: IncomingHttpHeaders, drop: readonly string[] = []): IncomingHttpHeaders {
  return Object.fromEntries(
    Object.entries(headers).filter(
      ([name]) => !HOP_BY_HOP.has(name) && !drop.includes(name),
    ),
  );
}

// One kept-alive pool to the API, so a pass-through costs the web app no extra handshake
// per request beside the one it already makes to this process.
const agent = new Agent({ keepAlive: true });

const server = createServer((incoming, outgoing) => {
  const path = incoming.url ?? '/';

  if (path.startsWith(CONTROL)) {
    let rest: string;
    try {
      rest = decodeURIComponent(path.slice(CONTROL.length));
    } catch {
      outgoing.writeHead(400, { 'content-type': 'text/plain' }).end('malformed reader id');
      return;
    }

    if (incoming.method === 'GET' && rest === 'health') {
      outgoing.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
      return;
    }
    if (rest.length > 0 && incoming.method === 'PUT') {
      cut.add(rest);
      outgoing.writeHead(204).end();
      return;
    }
    if (rest.length > 0 && incoming.method === 'DELETE') {
      cut.delete(rest);
      outgoing.writeHead(204).end();
      return;
    }
    outgoing.writeHead(404, { 'content-type': 'text/plain' }).end('no such control');
    return;
  }

  const reader = incoming.headers[READER_ID_HEADER];
  if (typeof reader === 'string' && cut.has(reader)) {
    // The API is not there for this reader: the connection goes, with no answer on it.
    incoming.socket.destroy();
    return;
  }

  const upstream = forward(
    {
      protocol: UPSTREAM.protocol,
      hostname: UPSTREAM.hostname,
      port: UPSTREAM.port,
      method: incoming.method,
      path,
      // `host` is dropped so the request names the API it is going to, not this process.
      headers: endToEnd(incoming.headers, ['host']),
      agent,
    },
    (answer) => {
      outgoing.writeHead(answer.statusCode ?? 502, answer.statusMessage, endToEnd(answer.headers));
      answer.pipe(outgoing);
    },
  );

  // The API itself being unreachable is passed on as what it is — a dropped connection —
  // rather than as an answer this process made up.
  upstream.on('error', () => {
    if (outgoing.headersSent) outgoing.destroy();
    else incoming.socket.destroy();
  });
  // A caller that gave up (the web app's per-rung timeout) takes the forwarded request with it.
  outgoing.on('close', () => {
    if (!outgoing.writableFinished) upstream.destroy();
  });

  incoming.pipe(upstream);
});

server.listen(PORT, '127.0.0.1', () => {
  // Playwright's `webServer` waits on a URL, so this line is for a human reading the log.
  console.log(`api fault fixture listening on http://127.0.0.1:${PORT}, forwarding to ${UPSTREAM.origin}`);
});
