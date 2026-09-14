<!--
  REPO-BASELINE.md §1 — "Commit PR and issue templates that demand repro and impact.
  Templates are the cheapest process you can install."

  Delete the sections that do not apply. Do not delete the checklist.
-->

## What changes, and why

<!-- One paragraph. The WHY is the half a reviewer cannot reconstruct from the diff. -->

## Impact

<!--
  Who or what is affected if this is wrong. Be concrete: a service, an endpoint, a
  deployed environment, a reader mid-frame. "Low risk" is not an impact statement.
-->

- **Blast radius:**
- **If this is wrong, the symptom is:**

## How it was verified

<!--
  Not "it builds". What did you RUN, and what did it print? A claim nobody ran is
  indistinguishable from one that was.
-->

```
paste the command and its output
```

## Reverting

<!-- Is `git revert` enough? If not — a migration, a rotated secret, a deployed
     resource — say what else has to be undone, and in what order. -->

---

## Checklist

- [ ] **The README and any doc this touches still describe the system.** A stale README
      is a review finding, not a cosmetic one: a reader learns nothing true about the
      current system, which is strictly worse than no README.
- [ ] **No secret in the diff.** `bash scripts/scan-secrets.sh --staged` is clean, or the
      pre-commit hook passed. If a secret was ever pushed, stop and read `SECURITY.md`:
      rotate first, clean history second.
- [ ] **Every new environment variable is in `secrets.env.example`** with its tier and its
      `without it:` line, and **one place is named as authoritative** for it — the AppHost
      for local, the `fly.toml` for deployed non-secret, the workflow for deployed secrets.
      The estate's recorded drift was a variable present in the dev branch of a composition
      root and missing from the publish branch.
- [ ] **Tests and linters that would catch this actually run in CI.** A committed config
      that no job executes is the committed-but-never-executed problem.
- [ ] **A fresh clone with every optional integration skipped still runs.** If this change
      makes an integration mandatory, that is the change to discuss, not a detail.

### If this touches auth, CORS, rate limiting or token handling

- [ ] Signature verification still includes **issuer and audience**, checked strictly and
      exactly. Decoding a token and checking `exp` is not authentication.
- [ ] No token reaches `localStorage` or `sessionStorage`. Cookies are set by a server
      route with `httpOnly`, `secure`, `sameSite`.
- [ ] CORS origins are **named explicitly**. No wildcarded PaaS apex, and never one
      combined with credentials.
- [ ] Rate limiting still keys on the shared client-identity resolver — not on the socket
      peer behind a proxy, and not on a client-supplied header with nothing in front.

### If this touches the deployed topology

- [ ] The health check the platform polls is the **readiness** endpoint, not the liveness
      one. For `authservice` that is `/health/ready`; `/health` and `/alive` answer 200 as
      soon as Kestrel binds.
- [ ] The image is still promotable across environments: no address, no environment name
      and no secret baked in at build time.
- [ ] `flyio/SECRETS.md` still names every secret this introduces, and names none of their
      values.

---

## Related

<!-- Issue, ADR, or the decision this implements. An ADR number is better than a link. -->
