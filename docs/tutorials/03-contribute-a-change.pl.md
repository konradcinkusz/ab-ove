# Samouczek 3 — wnieś zmianę

**Co będziesz mieć na końcu:** zmianę, która przechodzi każdą bramkę tego repozytorium, i
doświadczenie z pierwszej ręki, jak dwie z tych bramek czegoś odmawiają — a tej części nie da
się wziąć z lektury.

**Ile to potrwa:** około trzydziestu minut.

**Czego potrzebujesz:** ukończonego [samouczka 1](01-first-run.pl.md), żeby książka była
pobrana, a build działał.

> **English version:** [`03-contribute-a-change.md`](03-contribute-a-change.md)

---

## Krok 1 — uruchom to, co uruchamia CI, zanim cokolwiek zmienisz

Zrób to najpierw, na czystym drzewie. Jeśli coś jest czerwone teraz, chcesz wiedzieć, że było
czerwone, zanim to dotknąłeś.

```bash
dotnet build AbOvo.sln -warnaserror    # ostrzeżenia są błędami, tu i w Directory.Build.props
dotnet test AbOvo.sln                  # jednostkowe, integracyjne w pamięci i reguły architektury
pnpm --dir web lint
pnpm --dir web typecheck                # tsc po każdym członku przestrzeni, nie tylko po tym, co widzi trasa
pnpm --dir web build
bash scripts/scan-secrets.sh --staged   # to, co uruchamia hak pre-commit
```

Cały zestaw jest na tyle szybki, że zgadywanie, której części dotyczy twoja zmiana, nie jest
tego warte.

Rozróżnienie, które ludzi zaskakuje: **API nie potrzebuje książki; jego testy tak.**
`Instrument/Proportion.cs` trzyma stałą przepisaną z książki, więc serwis działa na gołym
klonie, a test sprawdzający to przepisanie rzuca wyjątkiem na brakującym pliku źródłowym.

## Krok 2 — zobacz, jak reguły architektury czegoś odmawiają

To najszybszy sposób, by zrozumieć, czym jest wspólne jądro, i zajmuje jedną edycję, którą za
chwilę cofniesz.

Otwórz `src/AbOvo.ServiceDefaults/Extensions.cs` i dodaj referencję do `AbOvo.Api` — wystarczy
dowolna dyrektywa `using` sięgająca do środka. Potem:

```bash
dotnet test AbOvo.sln --filter ArchitectureTests
```

Czerwienieje i mówi dlaczego. `src/AbOvo.ServiceDefaults` jest wspólnym jądrem (P2): wyłącznie
instalacja przekrojowa, żadnej encji biznesowej, żadnego DTO, żadnego enuma, żadnych danych
zasiewowych, żadnego napisu dla użytkownika. Proza zawiodła w tym majątku już dwa razy —
biblioteka `.Core`, która zaczęła jako wspólna instalacja, a skończyła jako wspólna domena —
więc reguła jest testem, a nie konwencją:

- jądro nie może referować `AbOvo.Api` ani `AbOvo.Contracts`;
- nie może deklarować `DbContext`;
- nie może eksportować publicznej niezapieczętowanej klasy do dziedziczenia (P10).

Cofnij edycję. Obok stoi druga, słabsza bramka — job `kernel-size` w `ci.yml`, pułap na
**wiersze kodu** jądra ([ADR-0011](../adr/0011-kernel-size-gate-counts-code-lines.md)). Liczy
kod, a nie surowe wiersze, właśnie po to, by uzasadnienie, o które prosi P14, było darmowe — i
dlatego **nigdy nie rozwiązuje się awarii rozmiaru przez kasowanie komentarzy**.

## Krok 3 — zobacz, jak instrument odmawia dowiedzenia się czegoś o czytelniku

Otwórz `src/AbOvo.Api/Persistence/FrameOutcome.cs` i dodaj kolumnę — `ReaderId`, znacznik
czasu, cokolwiek. Potem:

```bash
dotnet test AbOvo.sln --filter OutcomeIsNotAReader
```

Czerwone — i to jest reguła, wokół której ułożony jest cały produkt
([ADR-0009](../adr/0009-the-instrument-measures-the-book.md)):

> **ab-ovo mierzy książkę, nigdy czytelnika.**

Trzymają ją trzy mechaniczne rzeczy i każdą widziano, jak czegoś odmawia, zanim w nią
uwierzono:

1. **Zamknięte listy kolumn.** `Count` musi być jedyną kolumną poza kluczem, żeby żaden wiersz
   nie mógł należeć do jednego przebiegu.
2. **Każdy klucz i indeks zaczyna się od wersji paczki**, żeby najtańszym agregatem w schemacie
   nie było *ta ramka, przez wszystkie wersje* — zapytanie, które kazałoby rejestrowi kłamać o
   ramce, którą ktoś już poprawił.
3. **`BundlePinnedQueries` odmawia zapytania obejmującego wiele tekstów**, zanim EF je
   skompiluje, a `ReaderScopedQueries` robi lustrzane odbicie nad magazynem miejsca w lekturze.

Cofnij edycję. [`../DIAGRAMS.pl.md`](../DIAGRAMS.pl.md) §A5 i §C4 rysują obie.

## Krok 4 — zrób zmianę i jej dokumentację w jednym commicie

To jest P14 i to po tej regule najczęściej ocenia się to repozytorium.

- **Komentarz cytuje zasadę albo sekcję przewodnika, którą ma spełniać.** Reguła bez cytatu
  jest czyimś gustem, a kolejny czytelnik nie odróżni jednego od drugiego.
- **Decyzja dostaje ADR** — [`../adr/`](../adr/), z
  [`0000-template.md`](../adr/0000-template.md): Status / Context / Decision / Consequences.
  Krótko. Consequences to nagłówek, który ludzie pomijają, i ten, który czyni ten zapis wartym
  trzymania.
- **Odstępstwo od konstytucji dostaje wiersz w rejestrze odstępstw**
  ([`../architecture/00-ARCHITECTURE.md`](../architecture/00-ARCHITECTURE.md)), z datą,
  powodem i **warunkiem wyjścia**. Odstępstwo bez podanej drogi wyjścia jest dryfem.
- **Nie podawaj liczby wystąpień.** „Jedyne miejsce, gdzie robimy X", „trzy ramki rygoru",
  „czternaście przypadków" — zestawienie cicho się dezaktualizuje i nic nie potrafi go
  sprawdzić. Nazwij regułę i miejsca, gdzie jest uchylona.
- **Zanim napiszesz zdanie o innym pliku, otwórz ten plik.** Większość nieaktualnej
  dokumentacji w tym majątku to pewne siebie zdanie o sąsiedzie napisane z pamięci.

Jeśli twoja zmiana dotyka czegokolwiek w [`../tutorials/`](.), [`../how-to/`](../how-to/) albo
dokumentów wymienionych w `scripts/check-doc-parity.mjs`, **polska połowa rusza się w tym samym
commicie** — patrz
[`../how-to/translate-a-document.pl.md`](../how-to/translate-a-document.pl.md). Tłumaczenie,
które się rozjeżdża, jest gorsze niż jego brak, bo czytelnik mu ufa.

## Krok 5 — sprawdź dokumentację tak, jak sprawdzi ją CI

```bash
npm install          # narzędzia dokumentacji; osobne od web/, celowo
npm run lint:docs    # markdownlint, odnośniki, parowanie diagramów i parzystość EN/PL
```

Jeśli dodałeś albo zmieniłeś diagram, przepisem jest
[`../how-to/add-a-diagram.pl.md`](../how-to/add-a-diagram.pl.md); jeśli zmieniłeś ekran,
[`../how-to/capture-the-screenshots.pl.md`](../how-to/capture-the-screenshots.pl.md) mówi, jak
robi się zdjęcia od nowa.

## Krok 6 — pakiet akceptacyjny, jeśli dotknąłeś ekranu

```bash
pnpm --dir tests/e2e install
pnpm --dir tests/e2e run browsers      # jawnie; żadnego pobierania przeglądarki przy instalacji
pnpm --dir tests/e2e run test:smoke
```

Dwie własności tych bramek warto znać, zanim spróbujesz którąś spełnić:

- **Strażnik tutaj czerwienieje; nigdy nie pomija.** Job e2e w `ci.yml` czerwienieje, gdy
  zabraknie pakietu, bo zielony przebieg, który niczego nie sprawdził, jest dokładnie tą
  awarią, której pakiet ma zapobiegać. Nie „naprawiaj" czerwonego strażnika, czyniąc go
  warunkowym.
- **Nieużywany punkt wejścia do testów jest dokumentacją, która kłamie.** Nie dodawaj skryptu,
  projektu przeglądarkowego ani konfiguracji lintera, których nie uruchamia żaden kontekst CI.

## Dokąd dalej

- [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) — proces wokół zmiany (po angielsku).
- [`../../AGENTS.md`](../../AGENTS.md) — ten sam grunt, napisany dla automatycznego
  współautora, w tym dziewięć rzeczy najczęściej mylonych (po angielsku).
- [`../architecture/00-ARCHITECTURE.md`](../architecture/00-ARCHITECTURE.md) — to repozytorium
  przejście po konstytucji, P1 do P15, z odstępstwami i znanymi lukami (po angielsku).
