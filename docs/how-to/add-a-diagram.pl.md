# Jak dodać diagram

Diagram w tym repozytorium istnieje w trzech miejscach naraz, a sprawdzenie trzyma te trzy
identycznymi. Oto przepis, który za pierwszym razem trafia we wszystkie trzy.

> **English version:** [`add-a-diagram.md`](add-a-diagram.md)

## Kształt rzeczy

| Gdzie | Po co |
| --- | --- |
| W treści [`../DIAGRAMS.pl.md`](../DIAGRAMS.pl.md) | Jedyna forma, którą renderuje GitHub |
| W treści [`../DIAGRAMS.md`](../DIAGRAMS.md) | To samo, dla czytelnika angielskiego |
| `../diagrams/<id>-<slug>.mmd` i `<id>-<slug>.pl.mmd` | Otwieralne osobno; renderują się do PDF-a dla edycji LaTeX-owych |

Kluczem łączącym jest **identyfikator sekcji**: sekcja zatytułowana `### C6.` posiada `c6-*.mmd`
w dokumencie angielskim i `c6-*.pl.mmd` w polskim. Nazwa pliku zostaje wolna, by opisać
diagram.

## Kroki

1. **Wybierz część i kolejny wolny identyfikator.** A — kontekst i architektura, B — pętla
   czytelnika, C — instrument, D — build i dostarczanie. Identyfikatory nigdy nie są używane
   ponownie.

2. **Napisz źródło angielskie** w `docs/diagrams/<id>-<slug>.mmd`.

   - **Wyłącznie ASCII** w tym pliku: żadnych półpauz, żadnych strzałek jako glifów, żadnych
     diakrytyków. Angielska edycja LaTeX-owa jest pisana tak, by kompilowała się pod
     `pdflatex` ze standardowym TeX Live, a znak wielobajtowy bez mapowania jest błędem builda,
     a nie złym glifem.
   - **Każdy wiersz komentarza niesie tekst po znaczniku `%%`.** Mermaid usuwa komentarz
     wyrażeniem, które wymaga co najmniej jednego znaku po znaczniku, więc samotny `%%`
     *przetrwa* usuwanie, sklei się z następnym wierszem i diagram nie sparsuje się w wierszu
     1. Do odstępów używaj pustego wiersza.
   - **Żadnego średnika w etykiecie ani w `Note`.** Mermaid czyta go jako separator instrukcji,
     a błąd parsowania wskazuje wtedy złe miejsce. Użyj przecinka albo kropki.
   - **Uzasadnienie włóż w nagłówek `%%`.** GitHub go nie renderuje i o to chodzi: obrazek
     zostaje czysty, a argument podróżuje razem z plikiem.

3. **Napisz źródło polskie** w `docs/diagrams/<id>-<slug>.pl.mmd`. Przetłumacz etykiety
   prozy; zostaw ścieżki tras, nazwy klas, nazwy kolumn i nazwy plików workflow po angielsku,
   bo to są prawdziwe nazwy, a diagram musi dać się grepnąć. Polskie diakrytyki są tu
   poprawne — polska edycja jest składana z `babel[polish]` i `inputenc[utf8]`, a polska
   etykieta bez nich byłaby po prostu złą polszczyzną.

4. **Wyrenderuj oba, zanim cokolwiek wkleisz.** Diagram, który się nie parsuje, jest diagramem,
   który GitHub po cichu pokazuje jako blok kodu.

   ```bash
   npm install                                   # raz
   node scripts/render-diagrams.mjs <id>         # oba języki, tylko ten diagram
   ```

5. **Dodaj sekcję do obu dokumentów**, we właściwej części, wraz z prozą wokół niej:

   ~~~markdown
   ### C6. To, co mówi tytuł

   Jedno albo dwa zdania o tym, czemu ten obrazek jest wart posiadania, z ADR-em albo plikiem
   źródłowym, który o tym decyduje.

   ```mermaid
   ```
   ~~~

6. **Wklej zawartość `.mmd` do ogrodzonego bloku**, bajt w bajt, w każdym dokumencie — plik
   angielski do `DIAGRAMS.md`, polski do `DIAGRAMS.pl.md`. Razem z nagłówkiem komentarza:
   sprawdzenie porównuje cały plik.

7. **Zweryfikuj.**

   ```bash
   npm run lint:diagrams
   ```

   Nazywa dokładnie, która z trzech kopii się rozjechała i w którą stronę.

## Osadzenie diagramu gdzie indziej

`README.md` i oba dokumenty `START-HERE` mogą osadzić kopię diagramu. Reguła tam nie może
łączyć po identyfikatorze, więc łączy po treści: blok musi być **identyczny co do bajtu z
którymś plikiem** w `docs/diagrams/`. Skopiuj `.mmd` dosłownie; nigdy nie pisz wariantu.

## Renderowanie do papieru

```bash
node scripts/render-diagrams.mjs          # każdy diagram, oba języki
node scripts/render-diagrams.mjs --pl     # tylko edycja polska
node scripts/render-diagrams.mjs a1 b2    # tylko te identyfikatory
```

Wyjście ląduje w `docs/diagrams/rendered/`, które jest **wyłączone z gita**: wyrenderowane
diagramy są wyjściem builda tak samo jak PDF-y, które je zawierają. Pliki `.tex` odnoszą się do
nich ścieżką względną, a `.github/workflows/build-overview-pdf.yml` uruchamia krok renderowania
**przed** krokiem LaTeX-a właśnie dlatego.

## Zobacz też

- [`build-the-documentation.pl.md`](build-the-documentation.pl.md) — cały build dokumentacji.
- [`../DIAGRAMS.pl.md`](../DIAGRAMS.pl.md) §D3 — ten proces, narysowany.
