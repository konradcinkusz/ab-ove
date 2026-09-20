# Jak zrobić zrzuty ekranu

Obrazki w [`../SCREENSHOTS.pl.md`](../SCREENSHOTS.pl.md) pochodzą z pakietu akceptacyjnego,
wobec prawdziwego buildu produkcyjnego. Oto jak zrobić je od nowa.

> **English version:** [`capture-the-screenshots.md`](capture-the-screenshots.md)

## Polecenie

```bash
bash scripts/fetch-book-content.sh     # bez tego aplikacja nie ma czego serwować
pnpm --dir web install
pnpm --dir web build
pnpm --dir tests/e2e install
pnpm --dir tests/e2e run browsers      # jawnie; żadnego pobierania przeglądarki przy instalacji
pnpm --dir tests/e2e run screenshots
```

Konfiguracja Playwrighta sama uruchamia aplikację webową, więc nie ma serwera, o którym trzeba
pamiętać. Obrazki lądują w `docs/assets/screenshots/`, nadpisując to, co tam jest.

## Czym to jest, a czym nie

[`../../tests/e2e/specs/screenshots.spec.ts`](../../tests/e2e/specs/screenshots.spec.ts) jest
**projektem** Playwrighta — `screenshots` — obok `smoke`, `core` i `identity`. Jest projektem,
a nie własnym skryptem, bo zrobienie zrzutu tego produktu potrzebuje dokładnie tego, co ten
pakiet już ma: buildu produkcyjnego, przypiętej przeglądarki i obiektu strony, który potrafi
poczekać na hydrację, zamiast spać. Drugi skrypt kupiłby drugą wersję Playwrighta, drugie
pobranie przeglądarki i drugi sposób uruchamiania aplikacji.

**To nie jest testowanie regresji wizualnej.** Nic nie porównuje się z zapisanym obrazem, a
zmiana projektu graficznego tego nie czerwieni. Każdy test sprawdza, że ekran, który za chwilę
sfotografuje, *jest ekranem, za który się podaje* — bo zestaw dokumentacji zilustrowany
zdjęciem strony błędu jest gorszy niż taki bez obrazków.

**Celowo nie ma go w `smoke`, `core` ani `identity`.** Zapisuje do drzewa roboczego, czego nie
robi żaden inny projekt, a wciągnięcie go do `core` oznaczałoby, że każde scalenie do main
przepisuje pliki pod `docs/`.

## Dlaczego obrazki są commitowane

To jedyny wygenerowany artefakt, który to repozytorium commituje, a wyjątek jest wymuszony, a
nie wybrany: dokument Markdown na GitHubie nie wyrenderuje obrazka, który istnieje tylko
wewnątrz artefaktu przebiegu workflow. Wszędzie indziej — PDF-y, wyrenderowane diagramy,
`web/content/` — nic wygenerowanego nie jest commitowane.

## Kiedy robić je od nowa

Gdy zmieni się ekran z wycieczki. Zrzut ekranu, który już nie istnieje, jest gorszy niż brak
zrzutu, bo jest pewnym siebie obrazkiem czegoś fałszywego.

Po ponownym zrobieniu zobacz, co się zmieniło:

```bash
git status docs/assets/screenshots/
```

Diff PNG-ów jest nieczytelny, więc **otwórz zmienione obrazki** przed commitem. Jeśli zmienił
się tylko jeden ekran, `git checkout -- docs/assets/screenshots/<reszta>` i zacommituj ten
jeden, który ma znaczenie; commit przepisujący każdy obrazek, bo przebiegło zbieranie, jest
szumem w historii.

## Dodanie ekranu do wycieczki

1. Dodaj test do `screenshots.spec.ts` wewnątrz bloku `@screenshots`. Sprawdź, że ekran jest
   tym ekranem, a potem `shoot(page, '<nazwa>')`.
2. Dodaj obrazek do **obu**: [`../SCREENSHOTS.md`](../SCREENSHOTS.md) i
   [`../SCREENSHOTS.pl.md`](../SCREENSHOTS.pl.md), z tekstem alternatywnym opisującym, co jest
   na obrazku — tekst alternatywny dostaje czytelnik czytnika ekranu i dostaje go też
   czytelnik, któremu obrazek się nie wczytał.
3. `npm run lint:docs` — sprawdzenie odnośników weryfikuje, że plik, do którego się odwołałeś,
   istnieje.

## Czego nie ma na zrzutach i dlaczego

`/account` i `/instrument/<track>/<unit>` potrzebują konta, a konto potrzebuje serwisu
tożsamości. Pakiet taki ma — atrapę, którą sam uruchamia — ale sfotografowanie ekranu, którego
każda liczba pochodzi z fikstury, ilustrowałoby fiksturę, a nie produkt.

## Zobacz też

- [`run-the-tests.pl.md`](run-the-tests.pl.md) — reszta pakietu akceptacyjnego.
- [`../SCREENSHOTS.pl.md`](../SCREENSHOTS.pl.md) — sama wycieczka.
