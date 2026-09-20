# Jak uruchomić testy

Każda warstwa, co obejmuje, i co uruchomić, gdy chcesz tylko jedną.

> **English version:** [`run-the-tests.md`](run-the-tests.md)

## Wszystko, co uruchamia CI, po kolei

```bash
bash scripts/fetch-book-content.sh     # NAJPIERW, raz na klon
dotnet build AbOvo.sln -warnaserror
dotnet test AbOvo.sln
pnpm --dir web lint
pnpm --dir web typecheck
pnpm --dir web test
pnpm --dir web build
bash scripts/scan-secrets.sh --staged
```

Cały zestaw jest na tyle szybki, że zgadywanie, której części dotyczy twoja zmiana, nie jest
tego warte.

**Pobranie jest pierwsze nie bez powodu.** `web/content/` jest wyprowadzone, a nie commitowane,
i testy sprawdzające całą książkę inaczej pominęłyby się po cichu — zielony ptaszek nad
asercją, której nikt nie postawił. `web/app/src/lib/content/have-bundle.ts` odmawia w ogóle
załadowania się, gdy paczki brakuje, a `CI` jest ustawione, więc uczciwym wynikiem w pipeline
jest czerwień, a nie pominięcie.

## Jedna warstwa naraz

| Chcesz | Uruchom |
| --- | --- |
| Warstwy .NET: jednostkową i integracyjną w pamięci | `dotnet test AbOvo.sln` |
| Same reguły architektury | `dotnet test AbOvo.sln --filter ArchitectureTests` |
| Jeden test .NET po nazwie | `dotnet test AbOvo.sln --filter <fragment nazwy metody>` |
| Warstwę jednostkową weba | `pnpm --dir web test` |
| ESLint po przestrzeni | `pnpm --dir web lint` |
| `tsc` po każdym członku przestrzeni | `pnpm --dir web typecheck` |
| Sprawdzenia dokumentacji | `npm run lint:docs` (po `npm install` w korzeniu) |

## Pakiet akceptacyjny

Steruje **buildem produkcyjnym**, a nie `next dev`, bo to dostaje czytelnik.

```bash
pnpm --dir tests/e2e install
pnpm --dir tests/e2e run browsers      # jawnie; żadnego pobierania przeglądarki przy instalacji
pnpm --dir tests/e2e run test:smoke    # ścieżka krytyczna, minuty
pnpm --dir tests/e2e run test:full     # warstwa regresji podstawowej
pnpm --dir tests/e2e run test:identity # specyfikacje, które potrzebują konta
```

Konfiguracja sama uruchamia aplikację webową i korzysta z serwera, który już masz uruchomiony
lokalnie. Warstwa tożsamości dodatkowo uruchamia atrapę serwisu tożsamości i istnieje
**wyłącznie dla celu lokalnego** — wobec celu wdrożonego nie ma na co wskazywać, a projekt,
który by tam istniał, czerwieniałby na każdym przebiegu z powodu niebędącego defektem.

```bash
pnpm --dir tests/e2e run report        # otwórz raport HTML z ostatniego przebiegu
```

## Dwie własności tych bramek

- **Strażnik czerwienieje; nigdy nie pomija.** Job e2e w `ci.yml` czerwienieje, gdy zabraknie
  pakietu, bo zielony przebieg, który niczego nie sprawdził, jest dokładnie tą awarią, której
  pakiet ma zapobiegać (E2E-ACCEPTANCE-TESTING.md §2). Nie „naprawiaj" czerwonego strażnika,
  czyniąc go warunkowym.
- **Nieużywany punkt wejścia do testów jest dokumentacją, która kłamie**
  (TESTING-STRATEGY.md §9). Nie dodawaj skryptu, projektu przeglądarkowego ani konfiguracji
  lintera, których nie uruchamia żaden kontekst CI.

## Gdy coś czerwienieje, a komunikat nie wystarcza

[`../../scripts/README.md`](../../scripts/README.md) niesie tabelę rozwiązywania problemów
kluczowaną **dosłownym tekstem wyjątku**, bo to jest ciąg, który ktoś wkleja w wyszukiwarkę.

## Zobacz też

- [`../tutorials/03-contribute-a-change.pl.md`](../tutorials/03-contribute-a-change.pl.md) —
  obserwowanie, jak dwie z tych bramek czegoś odmawiają.
- [`../DIAGRAMS.pl.md`](../DIAGRAMS.pl.md) §D1 — bramki, narysowane.
