// REPO-BASELINE.md §1 — "CI must actually execute the linters and tests the repo claims to
// have". This config is wired to the `lint` script, which is wired to the frontend CI job;
// a committed-but-never-executed lint config is the failure that table names.
//
// Next 16 removed `next lint`, so ESLint is invoked directly and the shareable config is
// consumed as a flat-config array.
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

/** @type {import('eslint').Linter.Config[]} */
const config = [
  {
    // `public/**` is not source. scripts/prepare-lab-assets.mjs stages Pyodide's own
    // pyodide.mjs and pyodide.asm.mjs there (13 MB, minified, someone else's), and ESLint
    // reads any .mjs it is pointed at — so without this entry `pnpm lint` reports several
    // thousand findings about an upstream artefact nobody here can act on, and the six
    // findings that are about this repository are invisible among them. A linter whose
    // output nobody reads is a linter that is not running (REPO-BASELINE.md §1).
    ignores: ['.next/**', 'node_modules/**', 'public/**', 'next-env.d.ts'],
  },
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    rules: {
      // FRONTEND-BFF.md §2 (citing P12) — NEXT_PUBLIC_* bakes at build time, so an address
      // put there costs one image per environment and breaks build-once-deploy-many. §8
      // lists the symptom: "Staging frontend calls production APIs". The runtime route
      // GET /api/config exists precisely so this rule can be absolute, and the linter is
      // what keeps it absolute after the person who knew moves on.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][property.name=/^NEXT_PUBLIC_/]",
          message:
            'NEXT_PUBLIC_* is baked into the image at build time (FRONTEND-BFF.md §2). Read it per request in app/api/config/route.ts and consume it through lib/runtime-config.client.ts.',
        },
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][computed=true][property.value=/^NEXT_PUBLIC_/]",
          message:
            'NEXT_PUBLIC_* is baked into the image at build time (FRONTEND-BFF.md §2). Read it per request in app/api/config/route.ts and consume it through lib/runtime-config.client.ts.',
        },
      ],
    },
  },
  {
    // FRONTEND-BFF.md §1 — "Client JavaScript never learns a backend URL"; §3 — no token
    // ever reaches a client store. Everything under lib/server is the code that holds
    // both. Making the import a lint error is cheaper than reviewing for it: the 'use
    // client' boundary is invisible in a diff, and a Client Component importing one of
    // these modules is exactly how a backend host ends up in a browser bundle.
    files: ['src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/lib/server/*', '../lib/server/*', './server/*'],
              message:
                'lib/server holds backend addresses and the session cookie (FRONTEND-BFF.md §1, §3). A component reaches the backend through the same-origin BFF routes, never through these modules.',
            },
          ],
        },
      ],
    },
  },
];

export default config;
