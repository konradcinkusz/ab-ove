# Jak przetłumaczyć dokument

Które dokumenty są dwujęzyczne, co polska połowa jest winna angielskiej i co sprawdzenie może,
a czego nie potrafi zweryfikować.

> **English version:** [`translate-a-document.md`](translate-a-document.md)

## Co jest dwujęzyczne, a co nie

| Dwujęzyczne | Tylko po angielsku |
| --- | --- |
| [`../START-HERE.pl.md`](../START-HERE.pl.md) | [`../adr/`](../adr/) — dziennik decyzji |
| [`../DIAGRAMS.pl.md`](../DIAGRAMS.pl.md) i każdy `.mmd` | [`../architecture/`](../architecture/) — rejestr |
| [`../SCREENSHOTS.pl.md`](../SCREENSHOTS.pl.md) | [`../ux/UI-UX.md`](../ux/UI-UX.md) — plan |
| [`../tutorials/`](../tutorials/) — cały katalog | `README.md`, `AGENTS.md`, `CONTRIBUTING.md` |
| [`../how-to/`](../how-to/) — cały katalog | [`../../flyio/`](../../flyio/), [`../../scripts/`](../../scripts/) |

Reguła za tym podziałem: **co czytelnik albo nowy współautor napotyka najpierw, jest
dwujęzyczne; zapis rozumowania kierowany do tego, kto utrzymuje kod, nie jest.** Dziennik
decyzji zmienia się nieustannie, a jego niedoutrzymane tłumaczenie jest drugim dziennikiem
decyzji, który nie zgadza się z pierwszym.

Autorytatywna lista jest w
[`../../scripts/check-doc-parity.mjs`](../../scripts/check-doc-parity.mjs), a dopisanie
katalogu do tablicy `BILINGUAL` jest sposobem na włączenie nowego obszaru.

## Reguła nazewnicza

`<nazwa>.md` obok `<nazwa>.pl.md`. Ten sam katalog, ten sam build, jedna widoczna różnica w
nazwie. Diagramy używają tego samego przyrostka na `.mmd`. Edycje LaTeX-owe używają go na
`.tex`.

## Tłumacz na słownictwo, które już istnieje

Ten produkt już mówi po polsku: `web/app/src/lib/i18n/chrome.ts` trzyma każdy napis, który
interfejs pokazuje polskiemu czytelnikowi. **Dopasuj się do niego, zamiast wymyślać własne**,
albo jedno pojęcie zyska dwie nazwy w jednym majątku.

| Po angielsku | Po polsku, tak jak mówi produkt |
| --- | --- |
| frame | ramka |
| section | sekcja |
| program | program |
| course (a whole work; a *track* in the schema) | kurs |
| answer | odpowiedź |
| reader | czytelnik |
| the reader's place in the book | pozycja w lekturze |
| edition | edycja |
| rate | wskaźnik |
| outcome | wynik |
| identity service | serwis tożsamości |

Zostaw identyfikatory kodu w spokoju w obu edycjach — ścieżki tras, nazwy klas, nazwy kolumn,
nazwy endpointów, nazwy plików workflow. To są prawdziwe nazwy, a dokument musi dać się
grepnąć.

## Dwie reguły, które wymusza sprawdzenie

1. **Strukturalna** — każdy dwujęzyczny dokument ma obie połowy. Osierocony `.pl.md` bez
   angielskiego oryginału czerwieni tak samo jak brakujący.
2. **Sprzężenie** — commit edytujący jedną połowę musi edytować drugą. CI podaje `origin/main`
   jako ref bazowy; lokalnie:

   ```bash
   node scripts/check-doc-parity.mjs origin/main
   ```

**Druga reguła nie potrafi zweryfikować, że tłumaczenie jest poprawne; żaden skrypt nie
potrafi.** Weryfikuje, że ktoś spojrzał. To jest awaria, która naprawdę gryzie: złe polecenie
poprawione w jednym języku i zostawione złe w drugim, bez niczego, co by się zaczerwieniło.

Jeśli zmiana naprawdę nie wymagała ruszenia drugiej połowy — literówka w angielskim cytacie,
powiedzmy — napisz to w pull requeście, zamiast obchodzić sprawdzenie.

## Zakładanie nowego dwujęzycznego dokumentu

```bash
npm run lint:parity    # nazywa dokładnie, której połowy brakuje
```

Napisz najpierw połowę angielską, potem polską. Polska połowa będąca tłumaczeniem maszynowym
dokumentu, którego nikt nie przeczytał po angielsku, to dwa dokumenty, z których oba są złe.

**Tłumaczenie to nie transliteracja.** Tam, gdzie angielski mówi coś idiomem bez polskiego
odpowiednika, powiedz rzecz, a nie idiom. Reguła, do której te dokumenty są trzymane, jest
taka, że obie połowy stawiają te same twierdzenia i dają te same polecenia — a nie że mają te
same zdania.

## Zobacz też

- [`build-the-documentation.pl.md`](build-the-documentation.pl.md)
- [`../START-HERE.pl.md`](../START-HERE.pl.md)
