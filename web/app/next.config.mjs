// @ts-check
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // FRONTEND-BFF.md preamble (citing P6 — one container per service, built from a
  // multi-stage Dockerfile). `standalone` is what lets the runner stage be a traced subset
  // of node_modules copied in, rather than a second `pnpm install` inside the image.
  output: 'standalone',

  // The TRACING ROOT is the workspace, not this package. pnpm hoists shared dependencies
  // to web/node_modules and symlinks them into web/app/node_modules; a tracing root of
  // web/app would follow those symlinks out of the root and silently drop the real files,
  // giving an image that builds and then cannot start. (FRONTEND-BFF.md §7 — one
  // workspace — has this as its direct build-time consequence.)
  outputFileTracingRoot: join(here, '..'),

  reactStrictMode: true,

  // FRONTEND-BFF.md §1 — the browser talks ONLY to this origin. There is deliberately no
  // `rewrites()` or `redirects()` entry pointing at a backend host, and there must never
  // be one: a rewrite to a backend is the same illusion as a direct call — it removes the
  // CORS symptom while leaving the client holding a backend address, and it bypasses the
  // one place (§5's proxy) where the bearer is injected server-side.
  poweredByHeader: false,
};

export default nextConfig;
