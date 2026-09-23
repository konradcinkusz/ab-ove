# ADR-0064: Every screen is scanned for WCAG A and AA in the acceptance suite

## Status

**Accepted.** Date: 2026-09-23.

## Context

This repository makes its accessibility decisions one at a time, and asserts each where it is
made:

- 44 px targets (`reading.spec.ts`, `pager.spec.ts`);
- focus as a ring;
- focus never under the pinned pager (WCAG 2.4.11);
- `--ink-faint` at 4.5:1 and `--control-edge` at 3:1 (`lib/theme/tokens.test.ts`, ADR-0063);
- `role="list"` restored where `list-style: none` strips it.

Nothing checked the rest of WCAG: a control with no accessible name, a field with no label, a
landmark nested wrongly, a duplicate id, or a contrast pair nobody thought to add to the token
test. A regression of that kind would reach a reader without turning anything red.

axe-core decides those rules from the DOM. A trial scan of every reading screen and its shell
found no violation of the WCAG 2.0, 2.1 or 2.2 A and AA rules, in either scheme, including
with the program map, the reading settings and both worksheet panes open. The same scan
reported all three violations deliberately put on a page. So a gate would hold a line the
product has already reached, and would not start from a backlog.

## Decision

**The acceptance suite scans every screen with axe-core against WCAG 2.0, 2.1 and 2.2 at
levels A and AA** (`tests/e2e/specs/accessibility.spec.ts`):

- **Coverage:** every screen in both schemes, with each panel open, and at 360 px. The forms
  behind an account are scanned in the `identity` project.
- **Failure messages:** a failure names the rule, its impact and the elements.
- **Control:** the file carries its own positive control. Violations are put on a page, and
  the scan must report them.
- **Rules are never disabled to get green.** A rule that is wrong for one element is fixed in
  the product. If it truly cannot be fixed, it is excluded for that element alone, in that
  scan, with the reason written beside the exclusion.

`@axe-core/playwright` is the one dependency beside Playwright itself. It is pinned in
`tests/e2e/package.json` like the others, and audited by `codeql.yml`'s dependency job with
the rest of that tree. It is licensed MPL-2.0, and it runs only in the test tree: nothing of
it ships in an image.

## Consequences

**A floor, not a verdict.** axe cannot tell whether a name is a good one, whether the focus
order makes sense, or how a screen reader reads the maths. Those stay with the specs that
assert them, and with a person. A clean scan says only that no machine-decidable rule is
broken.

**The core run grows by one test per screen, per scheme.** Measured on 2026-09-23, the whole
file took 1.2 minutes on two workers against a local production build. The frame that asks,
in the light scheme, is in `@smoke`, so a pull request is gated on the screen the product is
built around. The rest run on `@core`.

**A new rule in a later axe-core release can turn the suite red with no change to the
product.** The version is pinned for that reason, and moving it is a decision taken in a diff
that shows the scan still passes, or fixes what the new rule found.
