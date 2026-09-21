#!/usr/bin/env -S node --experimental-strip-types
/**
 * Ingests the compiled book bundle into `AbOvo.Api` before any spec that opens a frame
 * runs — ADR-0060 made every reading page a live, gated call to the content API
 * (`ContentEndpoints.cs`), so a job that never `POST`s the bundle to
 * `/api/v1/admin/content/bundles` fails every spec that opens a frame on
 * `GET /content/{track}` answering 404, not on whatever the spec actually tests.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IMPORTS THE IDENTITY FIXTURE FOR ITS SIDE EFFECT. `authservice-stub.mts` starts
 * listening the moment it is loaded — exactly what `.github/workflows/ci.yml`'s own
 * `node fixtures/authservice-stub.mts` invocation does — so importing it here reuses that
 * one RS256 implementation instead of a second one. It is the only thing this job can use
 * to mint the Admin-role bearer `MapContentAdminEndpoints` requires; nothing here talks to
 * a real authservice, the same limit every use of this fixture carries (see its own
 * header).
 *
 * A SEPARATE STUB INSTANCE FROM PLAYWRIGHT'S OWN, deliberately short-lived: this process
 * calls `process.exit` the moment the bundle is ingested, freeing the port before
 * Playwright starts its own copy for the identity layer, whose `reuseExistingServer:
 * false` (playwright.config.ts) would otherwise collide with one still listening from this
 * step. Nothing after this point needs the token this process signed — the bundle is a
 * Postgres row now, and every endpoint that serves it back is anonymous.
 *
 * RELIES ON MATCHING DEFAULTS rather than passing a port explicitly, the same choice
 * playwright.config.ts's identity `webServer` entry makes for the issuer and audience:
 * `authservice-stub.mts` defaults to port 3200, and `.github/workflows/ci.yml` sets
 * `E2E_AUTH_BASE_URL` to `http://127.0.0.1:3200` — the same number stated once, not
 * restated here as a second `AB_OVO_STUB_PORT`.
 *
 * NO DEPENDENCY, on the fixture's own reasoning: Node's global `fetch` and `fs` are enough,
 * so this script runs before `pnpm --dir tests/e2e install` has done anything.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import './authservice-stub.mts';
import { ADMIN } from './accounts.mts';

const apiBaseUrl = process.env.E2E_API_BASE_URL?.trim();
if (!apiBaseUrl) {
  console.log('E2E_API_BASE_URL is unset — nothing to ingest the bundle into.');
  process.exit(0);
}

const stubBaseUrl = (process.env.E2E_AUTH_BASE_URL?.trim() || 'http://127.0.0.1:3200').replace(
  /\/+$/,
  '',
);

const here = path.dirname(fileURLToPath(import.meta.url));
const bundlePath = path.resolve(here, '../../../web/content/bundle/bundle.json');
if (!existsSync(bundlePath)) {
  console.error(
    `${bundlePath} is missing — run scripts/fetch-book-content.sh before this script.`,
  );
  process.exit(1);
}
const bundle = readFileSync(bundlePath, 'utf8');

async function waitForStub(): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`${stubBaseUrl}/health`);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${stubBaseUrl}/health never answered.`);
}

await waitForStub();

const login = await fetch(`${stubBaseUrl}/api/v1/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: ADMIN.email, password: ADMIN.password }),
});
if (!login.ok) {
  throw new Error(`the identity fixture refused the admin login: ${login.status}`);
}
const { accessToken } = (await login.json()) as { accessToken: string };

const ingest = await fetch(`${apiBaseUrl}/api/v1/admin/content/bundles`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
  body: bundle,
});
if (!ingest.ok) {
  throw new Error(`AbOvo.Api refused the bundle: ${ingest.status} ${await ingest.text()}`);
}

console.log(`Content bundle ingested into AbOvo.Api (${ingest.status}).`);
process.exit(0);
