# ADR-0032: A lab runtime is refused until its wheels are on this origin

## Status

**Accepted.** Date: 2026-09-19.

## Context

Issue #51. `web/app/scripts/prepare-lab-assets.mjs` copies the Pyodide **interpreter** into
`public/` — the loader, the wasm, the stdlib zip and `pyodide-lock.json` — so that the lab
pane fetches every byte from this origin. Its own header says why the package is a dependency
rather than a script tag: Pyodide's documentation leads with a jsDelivr `indexURL`, and taking
that advice would put a third party in the critical path of the reader loop.

It copies no package wheels. `content-schema.v1.json` nevertheless already lets a bundle say

```json
{ "id": "P01", "runtime": "numpy", "exercises": ["…"] }
```

and the book's plan names the labs that will want it. The pinned fixture says `"stdlib"`, so
nothing is missing today — and on the day a bundle says otherwise, the runtime a reader needs
is not here and **nothing in the tree would have said so before a reader opened the lab pane.**

Three measurements shaped the decision, and two of them contradict what the issue assumed.

**The npm package ships no wheels.** `pyodide@314.0.7`'s directory holds `pyodide.mjs`,
`pyodide.asm.mjs`, `pyodide.asm.wasm`, `python_stdlib.zip`, `pyodide-lock.json` and their maps.
Not one `.whl`. So "copy the wheels too" is not an available fix: there is nothing here to
copy from.

**The failure is a 404 on this origin, not a silent CDN fetch.** In that version the package
manager's constructor reads

```js
IN_NODE ? (installBaseUrl = packageCacheDir ?? packageBaseUrl, cdnURL = config.cdnUrl)
        :  installBaseUrl = packageBaseUrl
```

and `downloadPackage` rethrows a failed fetch unless `IN_NODE`. In a browser a relative
`file_name` therefore resolves against `packageBaseUrl`, which `loadPyodide` derives from the
`indexURL` the worker passes, and the jsDelivr fallback beneath it is unreachable. That is the
better of the two failures — and it is still a reader who finds it, and the jsDelivr default
is computed on every `loadPyodide` call on an option upstream marks `@ignore`, so which branch
reads it is upstream's private business and carries no promise.

**`pyodide-lock.json` already names the file exactly.** `numpy` resolves to one wheel, with a
`depends` list and a sha256. That is what makes a useful message possible rather than a
warning that a rule might be at risk.

## Decision

**A bundle may not declare a runtime whose files this origin does not serve, and the build
says so.**

`web/app/src/lib/content/runtime-assets.ts` states, in one place, which Pyodide packages each
`labs[].runtime` needs, resolves that to wheel file names through the real lock following
`depends` to the end of the chain, and reports the ones that are not served.
`prepare-lab-assets.mjs` applies it to the real pinned bundles **after** it has written
`public/pyodide/`, against a listing of that directory — so the question asked is the literal
one and not a proxy for it. `prebuild` runs on every `pnpm build`, which CI runs, so this
cannot ship.

Three decisions inside it, each with an obvious alternative that was rejected:

- **Not in `validate.ts`.** A bundle declaring `numpy` is a perfectly **valid** bundle: the
  compiler did nothing wrong and the schema permits it. What is wrong is that *this
  deployment* has not staged the wheel. That is the distinction `bundle.ts` already draws in
  its own words — a reader's typo is a 404 and a deployment defect is a 500 — and teaching the
  validator to read a directory would also put a filesystem call in the render path, since
  `bundleFor()` validates per process on a request.
- **The script does not copy the wheels; the failure names it as the place to add them.**
  There is nothing to copy (above), so a copy loop would be code nobody could watch working,
  and a *conditional* copy would contradict the stance `PYODIDE_FILES` already takes — that
  list is "a decision, not a guess", and behaviour that changes with whatever happens to be on
  disk is the rule it refuses. Where the bytes would come from is a decision with consequences
  — a download during the build, a second pinned package, or a committed binary that the same
  header argues against — and it wants its own ADR.
- **`RUNTIME_PACKAGES` is a total record over `Lab['runtime']`, and unknown runtimes are also
  refused at run time.** The first makes a new enum member a `pnpm typecheck` failure. The
  second is not belt and braces for the same failure: `schema.ts`'s union is kept in step with
  the schema document by hand, so the enum can grow while the union does not, and a map that
  silently answered "needs nothing" would be indistinguishable from one that had checked.
  `runtime-assets.test.ts` compares the map's keys against the schema document's enum, which
  closes the third side.

## Consequences

**The guard was watched failing before the passing result was believed**, in both tiers and on
real data. With the fixture's one lab mutated to `"runtime": "numpy"`, `pnpm build` died in
`prebuild` with exit 1, naming
`numpy-2.4.6-cp314-cp314-pyemscripten_2026_0_wasm32.whl`, its sha256, the lab that asked for
it and `web/app/public/pyodide/` as where it must land. The unit tier went red on the same
mutation. Separately, replacing `unservedWheels` with `() => []` — a guard that reports
nothing missing — was watched turning the unit tier red, so the passing case is not a test
that would pass against a guard doing nothing.

**The failure is an instruction, not a warning.** The person who meets it has had a green tree
go red on a content change, and the message names the file, the lab, the path and the decision
that is still owed. What it may not do is tell them to relax it: a runtime whose bytes are not
here is the rule in UI-UX.md rule 4 and FRONTEND-BFF.md §1 being broken, and the colophon
promises it to the reader's face.

**A build script now imports application modules.** `prepare-lab-assets.mjs` reads
`bundle.ts` and `runtime-assets.ts` directly, which Node 22 permits by stripping types on the
way in — the engine floor in `web/package.json` is already 22.18.0 for the unit tier, and this
is the second thing standing on it. The alternative was to re-read the fixture JSON in the
script, which would have been a second statement of *which bundles this application serves*.

**The measurement about upstream is asserted rather than remembered.** A test reads the
installed `pyodide` directory and fails if it ever contains a `.whl`. The version is pinned
exactly, with no range, so that cannot change under a lockfile refresh — only when somebody
moves the pin, which is exactly when the advice in the failure message would have stopped
being true.

**What this does NOT do.** It does not put numpy on this origin, and it does not decide how it
would get there. It makes the day that becomes necessary a red build with a written-down
decision attached, instead of a reader whose lab pane fetches something from somewhere.
