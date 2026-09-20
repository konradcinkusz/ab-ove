---
name: Bug report
about: Something behaves differently from how it is documented to behave
title: ''
labels: bug
assignees: ''
---

<!--
  REPO-BASELINE.md §1 — templates exist to demand REPRO and IMPACT. A report without a
  repro is a guess somebody else has to reproduce before they can start.

  If this is a SECURITY issue, do not open an issue at all. Open a private security
  advisory instead — see SECURITY.md. A public issue is a disclosure with no fix
  attached.
-->

## What happened

<!-- One sentence. -->

## What you expected instead

<!-- And where that expectation came from — a README line, a doc, an error message. -->

## Repro

<!--
  Numbered steps, from a fresh clone where possible. If it needs a deployed environment,
  say which one.
-->

1.
2.
3.

## The literal error text

<!--
  PASTE IT, do not describe it. Exception type, message, and the id if it has one
  (IDX10703, ASPIRE010, SqlException 18456). The literal text is what makes this findable
  by the next person pasting the same string into a search box — a described symptom is
  not.
-->

```text
paste the exception, the log line, or the console output
```

## Impact

- **What is unusable because of this:**
- **Is there a workaround:**
- **How often does it happen:** <!-- every time / intermittently / once -->

## Environment

- **Where:** <!-- local (`dotnet run --project src/AbOvo.AppHost`) / dev on Fly / CI -->
- **OS:**
- **`dotnet --version`:**
- **`node --version`:**
- **Commit or image tag:**

## What you already ruled out

<!-- Optional, and the most useful box on this form when it is filled in. -->
