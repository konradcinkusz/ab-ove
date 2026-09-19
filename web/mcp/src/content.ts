/**
 * THE ONLY FILE IN THIS PACKAGE THAT REACHES INTO @ab-ovo/app.
 *
 * The content library — the loader, the validator that refuses rather than degrades, and
 * the schema types — lives at app/src/lib/content. Reimplementing any of it here would be
 * the defect the root package.json names when it says @ab-ovo/web-kit exists to stop two
 * apps diverging: two loaders would disagree about a bundle eventually, and the one that
 * disagreed quietly would be this one.
 *
 * So there is one import boundary and it is this module. When the kit is extracted, the
 * three specifiers below are what move, and nothing else in this package knows the
 * difference. MCP-SERVER-SKETCH.md §6 carries that as the exit condition.
 */
export {
  allBundles,
  bundleFor,
  languageIn,
  say,
  stepIn,
  tagFor,
  unitIn,
} from '../../app/src/lib/content/bundle.ts';

export type { Bundle, Step, Text, Unit } from '../../app/src/lib/content/schema.ts';
