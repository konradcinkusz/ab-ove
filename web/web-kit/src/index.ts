/**
 * @ab-ovo/web-kit — the loader, the schema types and the validator, and nothing else.
 *
 * content.ts's own words, from before this package existed, are still the description:
 * "the loader, the validator that refuses rather than degrades, and the schema types."
 * Rendering (maths, markdown), the index's edition/track selection and lab-runtime asset
 * staging stay in `@ab-ovo/app` — see this package's own package.json for why each one
 * does not belong here.
 *
 * The validator's internals (`Problem`, `Schema`, `unimplementedKeywords`,
 * `validateAgainst`) are deliberately not re-exported: nothing outside `validate.ts` and
 * its own test needs them, and a barrel that hands out implementation detail invites a
 * consumer to depend on it by accident.
 */
export * from './bundle.ts';
export * from './gate.ts';
export * from './schema.ts';
export * from './have-bundle.ts';
export { validateBundle, type ValidationResult } from './validate.ts';
