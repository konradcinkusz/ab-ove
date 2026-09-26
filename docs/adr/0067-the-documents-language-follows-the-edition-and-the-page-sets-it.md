# ADR-0067: The document's language follows the edition, and the page sets it

## Status

**Accepted.** Date: 2026-09-26.

## Context

`app/layout.tsx` renders `<html lang="en">` for every page. Each page that follows the
reader's edition ([ADR-0052](0052-one-language-control-remembered-and-english-by-default.md))
puts that edition on its `<main>`, so a screen reader reads a Polish page's content in a Polish
voice ([ADR-0016](0016-the-reading-controls-follow-the-readers-edition.md)). What sits under
`<html>` alone stayed English: the tab's title, and Next's route announcer, a
`role="alert"` region appended to `<body>` that reads the new title out after every client
navigation. A Polish page is also a page whose default language is not English, which is what
WCAG 3.1.1 asks `<html lang>` to state. Issue #166 moved the sign-in pages, `/about` and the
404 into the reader's edition, which made more of the product Polish under an English `<html>`,
and asked for this to be decided and recorded.

The obvious answer is that the root layout reads the edition. What that takes was measured:

1. **A layout sees neither place the edition is named.** It is in the query (`?lang=`) or in the
   path (`/read/<track>/<unit>/<lang>/…`), and a layout receives neither — Next's own reference:
   "Layouts do not rerender on navigation, so they cannot access search params". The middleware
   would have to copy the request into a header for the layout to read, and resolve the edition
   a second time beside `resolvedEdition`.
2. **The root layout is not rendered again on a client navigation**, so its `lang` would be
   right on a page load and stale after the next `<Link>`. The language control is a `<Link>`:
   the most common way a reader changes edition is the one a server-side `lang` gets wrong.
3. **It costs every page its static rendering.** A root layout that reads a request header was
   built on this branch on 2026-09-26: every page route became per-request.

| route | `main` (ad30bfd) | root layout reads the request | this decision |
| --- | --- | --- | --- |
| `/_not-found` | static | dynamic | dynamic — its title reads the remembered edition |
| `/about` | static | dynamic | dynamic — it reads `?lang=` and the remembered edition |
| `/instrument` | static | dynamic | static |
| `/lab`, `/lab/p01` | static | dynamic | static |
| `/read` (the redirect to `/`) | static | dynamic | static |
| `/icon.svg` | static | static | static |

Every other route was per-request on `main` already.

## Decision

**`<html lang>` is the language of the page on screen, and the page sets it, in the browser.**
`components/language/document-language.tsx` writes the page's language onto
`document.documentElement` in a layout effect and puts the root layout's `FALLBACK_LANGUAGE`
back when the page goes. It is rendered by `SkipLink`, which every page a reader meets renders
once with exactly that language — the reading screens with their edition, every other page with
the language of its own words — so no page has a second thing to remember. The legal documents'
pages are the exception: they render no `SkipLink`, and they are English. The root layout stays
static and says English, which is the server's answer and not the last word.

**A page that speaks an edition titles its tab in it.** The title is what the announcer reads,
and it is spoken in the document's language, so a Polish page with the site's English title
would be read out in a Polish voice. The index, the account's pages, the sign-in pages,
`/about`, and the reading routes' and the root's 404s all title themselves in their edition.

**And no link into a page whose title follows the edition through the query or the cookie
prefetches it.** Next keeps the head it prefetched for a link and serves it for that link's
path whatever the query, or the remembered edition, says by the time a link to the path is
followed — so a title that follows the edition is only as current as the last prefetch of its
path. Every `<Link>` into the index, `/courses`, `/about`, the sign-in pages and the account's
pages is `prefetch={false}`, whoever builds its href, as the language control's links have been
since issue #160; `web/app/src/lib/index-href.ts` carries the reason where those hrefs are
built. A reading route names its edition in its path, and a head prefetched for one edition's
path is not served for the other's, so the links between reading screens keep their own rules.

**The root 404's component reads nothing from the request.** The root not-found is
rendered into every route's payload as its boundary: measured on this branch, a cookie read in
its component turned `/instrument`, `/lab`, `/lab/p01` and `/read` per-request. So the 404 reads
its edition in the browser — the address's, as the 500 does, else the choice the browser
remembers — and only its `generateMetadata`, which runs for that page alone, reads the cookie.

## Consequences

**The first paint of a page load says English on `<html>`, and a browser with script switched
off keeps it.** The page's `<main>` is right from the first byte for both; the title and the
announcer are not, until the page is in the browser. That is the one thing a server-side `lang`
would have had and this does not, and it is bought with the table above.

**A client navigation is right, which a server-side `lang` would not have been.** Measured in
Chromium against a production build: the index in English, the language control pressed —
`<html lang>` becomes `pl`, and `en` again when pressed back, with no page load between.
`specs/edition-pages.spec.ts` holds it.

**A title is the page's own edition however the reader arrived, because nothing prefetches
it.** Measured in Chromium against a production build on 2026-09-26, with the links as they
were: the index opened in English, *polski* pressed, then *O ab-ovo*, *Zaloguj się* or *Kursy*
followed — each Polish page was titled in English ("About — ab-ovo", "Sign in — ab-ovo",
"Courses — ab-ovo"). So was the Polish index reached by *← Programy* after *polski* was pressed
on `/courses`, or by the wordmark after it was pressed on a frame, and so was the language
control's own press once another link had prefetched the page it leads to: the index reached
from `/courses` in English and switched there stayed "ab-ovo — courses you work, a frame at a
time". A prefetch by any link to the path did it, which is why the rule is every link. With
prefetch requests blocked every one of those titles was the page's edition, and with the links
declining to prefetch it is: `specs/edition-pages.spec.ts` follows those journeys, and walks
the pages that link into these ones to hold that none of them is prefetched.

**It costs nothing a reader waits for.** These pages are rendered per request, so the press
asked the server for the page whatever had been prefetched (the language control's reason for
the same attribute, issue #160): the head was all a prefetch kept, and it was the part that
went stale. A new link into one of these pages that prefetches brings the stale title back;
on a page the spec walks, the spec fails.

**`/about` and the 404 render per request, where they were prerendered.** They read the
edition, and a page that reads a cookie or a query is rendered per request. Neither calls a
backend, so the cost is a render of a page of text, per request.

**A 404 whose edition only this browser remembers renders once in English.** Its body reads the
remembered choice from the store every control reads, whose server snapshot is "none"; a
reading address names its edition and is right from the first paint.

**A page that renders no `SkipLink` keeps the root layout's English.** The legal documents'
pages render none, and for them that is right: they are English, and so the document says.

Not a deviation from the reference architecture; no register row.
