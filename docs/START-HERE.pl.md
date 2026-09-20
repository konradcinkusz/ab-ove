# Zacznij tutaj

Drzwi frontowe do dokumentacji tego repozytorium.

Jest jej dużo i nie wszystko jest tym samym rodzajem rzeczy. Ta strona mówi ci, którego
rodzaju potrzebujesz, i tam cię wysyła. Jeśli masz przeczytać jedną stronę przed wszystkimi
innymi, przeczytaj tę.

> **English version:** [`START-HERE.md`](START-HERE.md)

## Czym jest to repozytorium?

**ab-ovo to platforma edukacyjna dla kursów nauczania programowanego** — każdy kurs to ciąg
programów z ramek Strouda, w każdej edycji, w której został wydany, wraz z jego ćwiczeniami
komputerowymi. Jedyny kurs przypięty dzisiaj to *Matematyka od zera dla inżyniera AI*: 47
programów, po angielsku i po polsku.

Istnieje, bo książka zbudowana w ten sposób stoi na mechanizmie, którego PDF nie potrafi
wymusić:

> Ramka prosi cię o coś **zanim** cokolwiek ci powie, a kolejna ramka otwiera się
> odpowiedzią, którą miałeś już zapisać. Czytelnik, który przelatuje wzrokiem, nie dostaje
> nic, a papier nie ma jak tego zauważyć.

Tutaj odpowiedzi na ramkę, na której stoisz, **nie ma na stronie**, zamiast być na niej
ukrytą. Odsłonięcie jest nawigacją, więc nic w dokumencie, na łączu ani w prefetchu jej nie
niesie. Wokół tej jednej własności ułożona jest cała reszta tego repozytorium.

**Nic nie jest wdrożone.** Żadna instancja ab-ovo nie działa pod żadnym adresem, dla nikogo.
Istnieje powierzchnia lektury nad całą książką, API, pakiet akceptacyjny Playwrighta, cztery
pliki `fly.toml` opisujące topologię, której nigdy nie zastosowano, i bramki, które złapałyby
regresję w którymkolwiek z tych elementów.

## Cztery rodzaje dokumentu i to, którego chcesz

Ta dokumentacja stosuje [Diátaxis](https://diataxis.fr/), które zauważa, że dokumentacja służy
czterem odrębnym potrzebom i że strona próbująca obsłużyć dwie z nich nie obsługuje dobrze
żadnej. Cztery dzielą się dwoma pytaniami: *pracujesz czy się uczysz?* i *potrzebujesz
działania czy wiedzy?*

| | **Praktyczne** — działanie | **Teoretyczne** — wiedza |
| --- | --- | --- |
| **Nauka** (zdobywanie umiejętności) | 📘 **Samouczki** — lekcje, które prowadzą cię przez zrobienie czegoś pierwszy raz | 💡 **Wyjaśnienia** — tło, kontekst i dlaczego rzeczy są takie, jakie są |
| **Praca** (stosowanie umiejętności) | 🔧 **Przewodniki** — przepisy na zadanie, które już rozumiesz | 📇 **Materiał źródłowy** — suchy, wyczerpujący opis maszynerii |

Wybierz wiersz po tym, co robisz teraz, a nie po tym, ile wiesz.

### 📘 Samouczki — „nigdy tego nie uruchamiałem"

Zorientowane na naukę. Idziesz krok po kroku, wszystko działa, a na końcu zobaczyłeś rzecz na
własne oczy. Żadnych decyzji, żadnej teorii. **Każdy samouczek istnieje w obu językach.**

1. [**Pierwsze uruchomienie**](tutorials/01-first-run.pl.md) — sklonuj, uruchom, otwórz ramkę
   i zobacz, jak produkt odmawia podania odpowiedzi. Około dwudziestu minut, bez poświadczeń,
   bez kont.
2. [**Przeczytaj program tak, jak miał być czytany**](tutorials/02-read-a-program.pl.md) —
   jeden program książki, przerobiony porządnie. Około czterdziestu minut i jedyny sposób, by
   zrozumieć, po co to istnieje.
3. [**Wnieś zmianę**](tutorials/03-contribute-a-change.pl.md) — uruchom każdą bramkę, a potem
   zobacz, jak dwie z nich czegoś odmawiają. Około trzydziestu minut.

### 🔧 Przewodniki — „wiem, czego chcę; jak to zrobić?"

Zorientowane na zadanie. Każdy zakłada, że rozumiesz już otaczające pojęcia, i przechodzi
prosto do kroków. **Wszystkie istnieją w obu językach.**

- [Uruchom testy](how-to/run-the-tests.pl.md) — każda warstwa i po jednej
- [Odśwież paczkę treści](how-to/refresh-the-content-bundle.pl.md) — pobierz książkę,
  zweryfikuj ją, przesuń przypięcie
- [Dodaj diagram](how-to/add-a-diagram.pl.md) — trzy miejsca, w których musi wylądować, i
  pułapki Mermaida, które warto znać wcześniej
- [Zrób zrzuty ekranu](how-to/capture-the-screenshots.pl.md) — jak na nowo zrobić obrazki z
  wycieczki
- [Zbuduj dokumentację](how-to/build-the-documentation.pl.md) — sprawdzenia, PDF-y i to, co CI
  robi z każdym z nich
- [Przetłumacz dokument](how-to/translate-a-document.pl.md) — co jest dwujęzyczne i jakie
  słownictwo dopasować

### 📇 Materiał źródłowy — „jak dokładnie nazywa się ta rzecz?"

Zorientowany na informację. Szukaj w nim rzeczy; nie czytaj od deski do deski. Poniższe są po
angielsku, bo są zapisem rozumowania kierowanym do tego, kto utrzymuje kod — powód stoi w
[`how-to/translate-a-document.pl.md`](how-to/translate-a-document.pl.md).

| Dokument | Co opisuje |
| --- | --- |
| [`architecture/00-ARCHITECTURE.md`](architecture/00-ARCHITECTURE.md) | To repozytorium przejście po konstytucji, P1 do P15, z rejestrem odstępstw i znanymi lukami |
| [`adr/`](adr/) | Każda decyzja wraz z odrzuconymi alternatywami. Status / Context / Decision / Consequences |
| [`ux/UI-UX.md`](ux/UI-UX.md) | Każdy ekran, czego potrzebuje, tokeny projektu tak, jak zbudowane, i uszeregowany backlog |
| [`../flyio/README.md`](../flyio/README.md) | Który adres do czego sięga, w topologii, która jeszcze nie istnieje |
| [`../flyio/SECRETS.md`](../flyio/SECRETS.md) | Każdy sekret i co degraduje się bez niego |
| [`../secrets.env.example`](../secrets.env.example) | Autorytatywna lista każdej zmiennej, po warstwach, bez wartości |
| [`../scripts/README.md`](../scripts/README.md) | Każdy skrypt i tabela rozwiązywania problemów kluczowana dosłownym tekstem wyjątku |
| [`../tests/e2e/README.md`](../tests/e2e/README.md) | Pakiet akceptacyjny: jego warstwy, fikstury i to, co każda dowodzi |

### 💡 Wyjaśnienia — „dlaczego zbudowano to tak?"

Zorientowane na zrozumienie. Czytaj je, gdy chcesz rozumowania, a nie kroków.

| Dokument | Co wyjaśnia |
| --- | --- |
| [`DIAGRAMS.pl.md`](DIAGRAMS.pl.md) 🇵🇱 / [`DIAGRAMS.md`](DIAGRAMS.md) 🇬🇧 | Cały system jako diagramy, w czterech częściach — architektura, pętla czytelnika, instrument, dostarczanie |
| [`SCREENSHOTS.pl.md`](SCREENSHOTS.pl.md) 🇵🇱 / [`SCREENSHOTS.md`](SCREENSHOTS.md) 🇬🇧 | Jak produkt wygląda, ekran po ekranie, z prawdziwego buildu |
| [`../README.md`](../README.md) 🇬🇧 | Czym ab-ovo jest, czym celowo nie jest, i antycele jako twierdzenia o kodzie |
| [`../AGENTS.md`](../AGENTS.md) 🇬🇧 | Dziewięć rzeczy najczęściej mylonych, dla automatycznego współautora |
| [`../CONTRIBUTING.md`](../CONTRIBUTING.md) 🇬🇧 | Ten sam grunt, dla człowieka |
| [`papers/ab-ovo-overview.pl.tex`](papers/ab-ovo-overview.pl.tex) 🇵🇱 / [`papers/ab-ovo-overview.tex`](papers/ab-ovo-overview.tex) 🇬🇧 | Przegląd projektu, złożony — prezentacja powyższego markdowna, niewnosząca żadnego własnego faktu |

## Jedna myśl, którą warto mieć przed wszystkimi innymi

**ab-ovo mierzy książkę, nigdy czytelnika.**

> Użyteczne pytanie, na które odpowiada ten przyrząd, brzmi: *gdzie ta książka marnuje czas
> czytelnika* — a nie *który czytelnik jest najgorszy*.

To nie jest polityka i nie jest intencja. To zbiór twierdzeń o kodzie, z których każde staje
się fałszywe w chwili, gdy ktoś dowiezie to, czego zaprzecza:

- **Nie ma widoku pojedynczego czytelnika** i dodanie go nie jest planowane. Żadna trasa,
  strona ani komponent nie jest kluczowana czytelnikiem; nie ma rankingu, tablicy wyników,
  oceny czytelnika ani sortowania po autorze.
- **Nie ma powierzchni API dla pojedynczego czytelnika.** Żaden endpoint nie nazywa osoby w
  swojej trasie ani w parametrach zapytania.
- **Nie ma tabeli, z której dałoby się zbudować ocenę czytelnika.** Wynik jest zapisywany przy
  *ramce*, *podejściu* i *przebiegu sprawdzenia* — przy artefakcie, nigdy przy osobie — i nie
  niesie też znacznika czasu.

Ostatnie z nich trzymają trzy mechaniczne rzeczy i każdą widziano, jak czegoś odmawia, zanim w
nią uwierzono: zamknięte listy kolumn, każdy klucz i indeks zaczynający się od wersji paczki
oraz zapytanie obejmujące wiele tekstów odrzucane, zanim EF je skompiluje.
[`DIAGRAMS.pl.md`](DIAGRAMS.pl.md) §A5 i §C4 je rysują.

A czytelnik słyszy, co go to kosztuje — czego strukturalna nieobecność nie potrafi dostarczyć
sama: ponieważ wynik nie niesie czytelnika, **usunięcie konta nie cofnie wkładu już wliczonego
do wskaźnika**. Ekran usuwania mówi to dokładnie tak.

## Wszystko na jednej stronie

```text
docs/
├── START-HERE.md / .pl.md      jesteś tutaj
├── DIAGRAMS.md / .pl.md        system jako obrazki, cztery części
├── SCREENSHOTS.md / .pl.md     produkt jako ekrany
├── tutorials/                  dwujęzyczne, zorientowane na naukę
├── how-to/                     dwujęzyczne, zorientowane na zadanie
├── adr/                        dziennik decyzji, po angielsku
├── architecture/               przejście po konstytucji i rejestr odstępstw, po angielsku
├── ux/                         ekrany i uszeregowany backlog, po angielsku
├── diagrams/                   jeden diagram Mermaida na plik, w obu językach
├── assets/screenshots/         obrazki, które pokazuje wycieczka
└── papers/                     przegląd w LaTeX-u, obie edycje
```
