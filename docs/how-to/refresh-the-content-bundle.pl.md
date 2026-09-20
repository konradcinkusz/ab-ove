# Jak odświeżyć paczkę treści

Książka mieszka we własnym repozytorium i przyjeżdża tutaj przypięta. Oto jak ją pobrać,
zweryfikować i przesunąć przypięcie.

> **English version:** [`refresh-the-content-bundle.md`](refresh-the-content-bundle.md)

## Pobierz ją

```bash
bash scripts/fetch-book-content.sh          # pobierz albo zweryfikuj ponownie to, co na dysku
bash scripts/fetch-book-content.sh --check  # tylko weryfikuj; nic nie zapisuj
```

`--check` jest tym, co uruchamia CI. Jest też tym, co mówi ci w jednym wierszu, czy ktoś
ręcznie zmienił pobrany plik.

## Co robi i w jakiej kolejności

1. Czyta przypięcie z [`../../web/content/book.lock.json`](../../web/content/book.lock.json).
   Skrypt nie ma **żadnych domyślności**: nie ma pliku lock, nie ma pobrania.
2. Pobiera każdy wymieniony plik silnika laboratorium książki i **weryfikuje skrót na każdym
   pliku**. Niezgodność przerywa przebieg.
3. Ściąga książkę na rewizji `contentBundle` i uruchamia **własny** kompilator książki z
   `--cross-check`, który wyprowadza ponownie programy, sekcje, ramki, odpowiedzi i wskazówki z
   sondy książki i odmawia, jeśli skompilowana paczka się z nimi nie zgadza.
4. Zapisuje `web/content/bundle/bundle.json`.

Wszystko, co zapisuje, jest **wyprowadzone i wyłączone z gita**. To repozytorium posiada
schemat i prezentację; nie posiada, nie parsuje i nie edytuje plików książki, i nigdy nie
parsuje LaTeX-a (P11, [ADR-0008](../adr/0008-content-is-a-versioned-bundle.md)).

## Przesuń przypięcie

Edytuj `web/content/book.lock.json`:

- `source.revision` — przypięcie silnika laboratorium, **pełny 40-znakowy sha commita**.
  Skrypt odmawia refa. Gdy je przesuwasz, przesuwa się z nim skrót każdego pliku z
  `source.files`; uruchom pobranie ponownie i przepisz skróty, które zgłosi.
- `contentBundle.revision` — przypięcie skompilowanej książki, też pełny sha. Jest celowo
  **niezależne** od powyższego i zwykle nowsze: przypięcie silnika laboratorium jest
  weryfikowane wobec węższego, niezależnie przetestowanego zbioru plików i nie ma powodu go
  przesuwać tylko dlatego, że przesunęło się tamto.

Oba przypięcia niosą `revisionNote` mówiącą, czemu wybrano ten commit. Zaktualizuj ją, gdy
przesuwasz przypięcie — przypięcie, którego powód jest nieaktualny, jest przypięciem, którego
nikt nie umie ocenić.

Potem:

```bash
bash scripts/fetch-book-content.sh
dotnet test AbOvo.sln                  # testy przepisania czytają własne rysunki książki
pnpm --dir web test
pnpm --dir web build
```

**Przesunięcie przypięcia jest decyzją, a nie aktualizacją**, i zmienia to, co widzi każdy
czytelnik. Jeśli nowa rewizja zmienia odpowiedź ramki, wyniki zapisane przy starej wersji
paczki zostają tam, gdzie są, i nigdy nie są uśredniane z nowymi — tego właśnie odmawia
`BundlePinnedQueries` i dlatego każdy klucz tabeli wyników zaczyna się od wersji paczki
([ADR-0024](../adr/0024-a-rate-and-its-interval-are-one-value-over-one-cell.md)).

## Dlaczego paczka jest w ogóle kompilowana tutaj

Bo żadne wydanie książki jeszcze takiej nie niesie. To jest **odstępstwo z warunkiem wyjścia**
zapisane w rejestrze ([ADR-0038](../adr/0038-the-bundle-is-compiled-at-a-pinned-revision.md),
[`../architecture/00-ARCHITECTURE.md`](../architecture/00-ARCHITECTURE.md)): wyjściem jest
pierwsze wydanie niosące paczkę, a tego dnia ten krok staje się pobraniem.

## Gdy skrót się nie zgadza

To jest sprawdzenie, które działa. Ktoś ręcznie zmienił pobrany plik albo historia książki
została przepisana pod przypięciem. Usuń `web/content/` i uruchom pobranie ponownie; jeśli
nadal się nie zgadza, to rewizja jest tym, co się ruszyło.

## Zobacz też

- [`../DIAGRAMS.pl.md`](../DIAGRAMS.pl.md) §A4 — droga treści, narysowana.
- [`../../web/content/README.md`](../../web/content/README.md) — co ląduje w tym katalogu
  (po angielsku).
