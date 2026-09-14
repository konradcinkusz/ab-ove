# Security

How to report something, what this repository does to keep secrets out of itself, and —
the part that has to be read before it is needed — **what to do when a secret lands in
history.**

---

## Reporting a vulnerability

Open a [private security advisory][advisory] on `konradcinkusz/ab-ovo`. That is a private
channel: it is not visible until it is published, and it carries a fix and a disclosure
together.

**Do not open a public issue for a vulnerability.** A public issue is a disclosure with no
fix attached, and the window between the two is the window an attacker gets.

If you cannot use an advisory, contact the repository owner directly through their GitHub
profile.

There is no bounty. This is a personal project, the response is best-effort, and saying so
is more useful than a service-level promise nobody is on call for.

[advisory]: https://github.com/konradcinkusz/ab-ovo/security/advisories/new

---

## A secret landed in a commit. Read this part first.

### ROTATE FIRST. CLEAN HISTORY SECOND.

That order is the whole of this section, and it is the opposite of the instinct.

**The commit is public the moment it is pushed.** Not when somebody notices it, not when
the pull request is opened, not when a scanner reports it. GitHub serves a pushed commit by
SHA to anyone who asks for it, forks keep their own copy, and every mirror, CI cache and
clone that fetched in the meantime has it. Rewriting the history does not un-copy any of
that.

So **scrubbing without rotating is theatre**: it removes the evidence and leaves the
credential valid. The only action that takes the attacker's access away is invalidating the
value, and every minute spent rewriting history first is a minute the old value still works.

### The order, in full

1. **Rotate the credential.** `flyio/SECRETS.md` names the five root secrets this estate
   has and where each one is rotated. Do this before anything else, including before
   telling anyone, including before deciding how serious it is.

2. **Confirm the new value is live**, and that the old one is dead. A rotation that was
   staged and never deployed is not a rotation — `fly secrets set` without a deploy leaves
   the running process on the old value.

3. **Then** rewrite the history, if it is worth doing. It usually is, because the next
   person to read the file should not find a credential in it even a dead one, and because
   a scanner will keep reporting it forever. `git filter-repo` is the tool; every
   collaborator then has to re-clone, which is why this is step three and not step one.

4. **Then** write down what happened: which credential, which commit, when it was pushed,
   when it was rotated, and how long the window was. An incident nobody recorded is an
   incident that gets to happen twice.

### What NOT to do

- **Do not `git commit --amend` or force-push over it and consider it handled.** If it was
  ever pushed, it is out. If it was *never* pushed, the hook already blocked it and there
  is nothing to clean.
- **Do not delete the repository and recreate it.** Forks survive that, and so do caches.
- **Do not rotate "later, when there is time".** The window is the whole finding.

### Some values look like secrets and are not

A public URL, an issuer string, an app name, a database name, a rule id. Rotating one of
those costs a deploy and buys nothing. `flyio/SECRETS.md` §1 carries the test worth
applying: **would you paste it into a pull request?** If not, it is a secret. Everything in
a `[env]` block ends up in the image config and in `fly config show`, so "it is only in the
toml" is not a mitigation.

---

## What this repository does to keep secrets out of itself

### Scanning, in both places

| | Runs | Catches |
|---|---|---|
| `scripts/hooks/pre-commit` | before each commit, on the staged index | the mistake **before it becomes history** |
| `.github/workflows/secret-scan.yml` | every pull request, every push to `main` | contributors **who have no hooks installed** |
| `scripts/scan-secrets.sh` | on demand | the same scan as CI, locally, in seconds rather than a push cycle |

Neither of the first two substitutes for the other, and that is the reason both exist. The
hook is the only one that can prevent the leak; CI is the only one that covers a machine
you do not control.

All three read the same `/.gitleaks.toml`. A hook tuned differently from CI is two
scanners, and the looser of the two defines the repository's real posture.

Install the hook — `bash scripts/setup.sh` does it, or:

```bash
git config core.hooksPath scripts/hooks
```

`core.hooksPath` rather than a copy into `.git/hooks`, so the hook is a tracked file that
review can see change.

### Where a secret is allowed to live

| Context | Store | Never |
|---|---|---|
| Local development | `dotnet user-secrets` (outside the working tree) | a file in the repository |
| Deployed | `fly secrets set` | a `[env]` block in a `fly.toml` |
| CI | a GitHub **Environment** secret | a repository secret, an inline literal |

`secrets.env.example` documents every variable in the system by name, with its tier and
what degrades without it. It contains no values, and it is deliberately **not**
allowlisted in the scanner: a value in that file would be a leak with a README wrapped
round it.

### The recorded failure this is all aimed at

Live credentials committed in a tracked helper script — a script mirroring a CI job for
local debugging, which is genuinely a good pattern — **because inline literals were the
path of least resistance and nothing said no, and no pre-commit hook existed to catch
it.**

Note which half of that sentence is the fix. Not "be careful": a hook, and an example file
that makes the right thing the easy thing.

### Continuous, not point-in-time

A code review is static analysis at a moment. The continuous complement runs on every
change and is not optional:

- **Secret scanning** — the three above.
- **CodeQL / SAST** and a **dependency audit** — `.github/workflows/codeql.yml`.
- **`NuGetAudit` at restore** — `Directory.Build.props` sets `NuGetAuditMode=all` and
  `NuGetAuditLevel=low`, so a newly published advisory against any package, transitive
  ones included, fails the restore. An image build can therefore go red on source that has
  not changed. That is the intended trade, and it is worth knowing before anyone goes
  looking for the commit that broke the build.

### Dependency updates

`.github/dependabot.yml` declares every ecosystem and opens **no** version-update pull
requests today. That is a deliberate deviation, recorded in ADR-0006 under `docs/adr/`,
and it does **not** turn off security updates or vulnerability alerts — those are a
repository setting and are unaffected by that file. The file itself carries the reasoning
and the trigger for switching it on.

---

## The standing posture

These are properties this repository is meant to have. They are listed so a change that
breaks one is visible as a change rather than as a detail.

- **No token in `localStorage` or `sessionStorage`, in any frontend.** Any XSS exfiltrates
  them. Auth cookies are set by a server route, with `httpOnly`, `secure` and `sameSite` —
  an `httpOnly` cookie *cannot* be set from `document.cookie`, so client JavaScript that
  appears to do it has silently set a cookie that is not `httpOnly`.
- **Token storage is identical across every frontend of the same product.** Two frontends
  built at different times against different assumptions is the recorded failure, and the
  weaker one defines the product's real posture.
- **Anything gating access verifies the signature, including issuer and audience.**
  Decoding a token and checking `exp` is not authentication — decode-only middleware
  accepting forged tokens is a real recorded finding, not a hypothetical. Here that means
  RS256 against the published JWKS, and it means validating `aud` **strictly and exactly**:
  authservice signs 2FA challenge tokens with the same key under the audience `AbOvo:2fa`.
- **Authorization is deny-by-default**, with an `[AllowAnonymous]` list short enough to
  read aloud — register, login, health, webhooks, each webhook with its own signature
  check. Never by email-string comparison: that means no second admin and no revocation
  without a redeploy.
- **CORS uses named explicit origins.** Never a wildcarded PaaS apex such as `*.fly.dev`,
  and never one combined with credentials — that trusts every tenant of the platform.
- **Swagger is off in production.** It is information disclosure: the route map, the DTO
  shapes and the validation rules, gift-wrapped. The recorded pattern is that it gets
  turned on "for deployment debugging" and filed as a finding by the next review.
- **`Guid.NewGuid()` is for identifiers only** — a JTI, a row id. A GUID is not a secret.
  Anything an attacker could present as proof is at least 256 bits from a CSPRNG,
  URL-safe base64.
- **Encode at render, never at storage.** Store exactly what the user typed; the renderer
  owns escaping. HTML-encoding on write corrupts the data for every non-HTML consumer and
  still double-encodes on the way out. User-supplied markdown goes through a sanitizer —
  markdown is an XSS vector even inside React.
- **The instrument measures the book, never the reader.** It is stated here because it is
  a data-handling commitment as much as a product one: what is collected is bounded by
  what that sentence permits.

---

## This document is not a penetration test

Everything above is static analysis and written policy. **A code review does not replace a
penetration test**, and nothing in this repository should be filed as one.
