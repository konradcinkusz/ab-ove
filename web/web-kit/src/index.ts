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
 *
 * `have-bundle.ts` is not re-exported either, for a sharper reason: it is TEST
 * infrastructure that decides at import whether the book is on disk, by the loader's
 * working-directory guesses, and THROWS at import when it is not and `CI` is set. Through
 * the barrel that ran in every consumer's production graph, so a host that started the MCP
 * server under CI=true from its own directory got a server that exited at once with a
 * sentence about test ordering (#136). Tests take it from `@ab-ovo/web-kit/have-bundle`,
 * its own entry in package.json's `exports`, and nothing else imports it.
 */
export * from './bundle.ts';
export * from './gate.ts';
export * from './schema.ts';
export { validateBundle, type ValidationResult } from './validate.ts';
