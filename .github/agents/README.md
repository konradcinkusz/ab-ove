# `.github/agents/` — Copilot agent definitions

**This directory is empty today, and that is a state rather than an omission.** No agent
has been defined for this repository yet. What is here instead is the set of rules any
definition dropped in has to satisfy — written before the first one arrives, because the
rules below each exist because of a specific failure, and a rule discovered afterwards is
discovered by repeating it.

REPO-BASELINE.md §6: "Commit AI assistant/agent definitions (Claude Code subagents,
Copilot agents) into the repo next to the code they operate on — `.claude/agents/` and
`.github/agents/` — and **review them like code.**"

| Directory | Holds | Consumed by |
|---|---|---|
| `.github/agents/` | Copilot agent definitions | GitHub Copilot |
| `.claude/agents/` | Claude Code subagent definitions | Claude Code |
| `.claude/settings.json` | the standards-adoption declaration | Claude Code |

They are separate because the two tools read different files, not because the boundary
means anything. An agent that operates on this repository belongs beside the code
whichever one runs it.

---

## The rules any definition here must satisfy

### 1. A tool allowlist is a safety boundary, and it is enforced by construction

Every definition carries an explicit list of the tools it may use. **An analysis or
documentation agent gets read-only tools by construction, not by convention** — "it only
reads things" is a description of what an agent has done so far, not a property of it.

The distinction matters most for the agents that sound harmless. A documentation agent
with write access is one confidently-wrong edit away from rewriting the file that says
what the system does, and this repository treats a stale README as a review finding
precisely because a reader learns nothing true from one.

### 2. Repo-relative paths only. Never an absolute one.

This is a real recorded finding, not a style preference: a hardcoded `C:\Repos\…` in an
agent definition **breaks every other machine and CI**. It works for exactly one person
and fails everywhere else, and the failure looks like the agent being broken rather than
like a path being wrong.

Write `src/AbOvo.ServiceDefaults/`, never `/home/user/ab-ove/src/...` and never
`C:\Repos\ab-ove\src\...`.

### 3. The description is the router, so it carries worked examples

Automatic delegation matches on the description. **A one-line description does not route**
— it is the difference between an agent that gets invoked and one that sits in a directory.

Embed the invocations it is meant to answer, in the words somebody would actually use:

> Use this agent when asked to audit the Fly.io topology. Examples: "does the api app
> have a public listener it should not"; "check every fly.toml declares a readiness
> check"; "which secrets are set on ab-ovo-api-dev that it does not own".

### 4. If it has memory, the memory is project-scoped, committed, and governed

Persistent agent memory is allowed. If it is used it is **project-scoped**, **committed**
(so it is reviewable and diffable like anything else that changes behaviour), and carries
an **explicit save/don't-save policy written down** in the definition.

The policy is the part people skip, and it is the part that matters: an agent that saves
whatever it happened to learn accumulates a private, unreviewed configuration that nobody
can explain and nothing can audit.

### 5. The paths an agent is given are security-relevant

`.github/CODEOWNERS` assigns this directory and `.claude/` to the repository owner for
that reason. An agent definition is code that runs with tools attached: **widening a tool
allowlist is a privilege change that reads like a config tweak.**

---

## What an agent here must not assume

- **Secrets.** Nothing in this repository holds one, by design. `secrets.env.example`
  names every variable in the system and contains no values. An agent that needs a
  credential is an agent that needs a different design.
- **That the working tree is the deployed topology.** `src/AbOvo.AppHost/AppHost.cs` is
  the **development** composition root. Production is described by `flyio/*.fly.toml` and
  the workflow. An agent reasoning about "what is deployed" from the AppHost is reading
  the wrong file, and the two genuinely differ.
- **That a check exists because a config file exists.** The committed-but-never-executed
  problem: a lint config in the tree proves nothing about whether any job runs it. Check
  `.github/workflows/`.

---

## Before adding the first definition

Read `REPO-BASELINE.md` §6 in full, and check the definition against the five rules above.
The cheapest moment to get an agent's tool allowlist right is before it has ever run.
