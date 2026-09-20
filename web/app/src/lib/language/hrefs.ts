/**
 * The same page in each edition, as a plain map.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHY A MAP AND NOT THE `hrefFor(language)` CLOSURE THIS REPLACED.
 *
 * `LanguageChoice` is a Client Component — it has to be, because remembering the choice
 * means touching `localStorage`, a cookie and the account. The props of a Client Component
 * cross the server/client boundary and are serialised, and a function does not serialise:
 *
 *     Functions cannot be passed directly to Client Components unless you explicitly expose
 *     it by marking it with "use server".
 *
 * Which is a run-time error on every page that renders the control, and the build is green
 * when it happens — the typecheck has no opinion about what crosses the boundary. It was
 * found by the acceptance suite refusing to start.
 *
 * So the caller still owns the URL shape, exactly as it did with the closure, and what
 * crosses the boundary is the ANSWER rather than the function that computes it: four short
 * strings for a two-edition track.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * Build `{ en: '/…/en/3', pl: '/…/pl/3' }` from the editions and a URL builder.
 *
 * `build` runs HERE, on the server, and never crosses anything. The insertion order is
 * `languages`' order, which is the bundle's own declaration — the control renders the
 * editions in that order and does not sort them (ADR-0015's reasoning, which ADR-0052
 * kept).
 */
export function editionHrefs(
  languages: readonly string[],
  build: (language: string) => string,
): Readonly<Record<string, string>> {
  return Object.fromEntries(languages.map((language) => [language, build(language)]));
}
