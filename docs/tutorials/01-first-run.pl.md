# Samouczek 1 — pierwsze uruchomienie

**Co będziesz mieć na końcu:** ab-ovo działające na twojej własnej maszynie, serwujące całą
książkę, z otwartą przed tobą ramką, która zadała ci pytanie i odmawia na nie odpowiedzi.

**Ile to potrwa:** około dwudziestu minut, w większości czekania na build.

**Czego potrzebujesz:** klonu tego repozytorium i niczego więcej. Żadnego konta, żadnego
poświadczenia, żadnej usługi, żadnego klucza. To nie jest wygoda — to własność produktu i pod
koniec tego samouczka zobaczysz ją na własne oczy.

> **English version:** [`01-first-run.md`](01-first-run.md)

---

## Krok 1 — dowiedz się, czego brakuje twojej maszynie

```bash
bash scripts/setup.sh --check
```

To niczego nie zmienia. Zgłasza, czego brakuje i skąd to wziąć. Przeczytaj wynik, zanim
cokolwiek zainstalujesz: nazywa każdy wymóg wraz ze wskazówką instalacyjną, więc nie musisz
zgadywać wersji.

Potem uruchom to naprawdę:

```bash
bash scripts/setup.sh
```

Cztery ponumerowane kroki: sprawdź wymagania, zainicjuj **lokalny** magazyn sekretów,
wygeneruj jeden obowiązkowy sekret, a potem zaproponuj każdą opcjonalną integrację jako
opisany krok, który możesz pominąć. Pominięcie każdego opcjonalnego kroku jest wspieranym
wynikiem — kroki obowiązkowe wystarczą do wszystkiego poniżej.

**Żaden sekret nigdy nie ląduje w drzewie roboczym.** Krok 2 inicjuje `dotnet user-secrets`;
`secrets.env.example` nazywa każdą zmienną i nie zawiera żadnych wartości.

## Krok 2 — pobierz książkę

```bash
bash scripts/fetch-book-content.sh
```

To jest krok, który ludzie pomijają, a awaria, którą to daje, nie wygląda na brakujący krok
(#75). `web/content/` jest **wyprowadzone, a nie commitowane** — książka jest osobnym
repozytorium, przypiętym po commicie, a ten skrypt pobiera jej silnik laboratorium plik po
pliku, weryfikując na każdym skrót, po czym kompiluje 47 programów książki w paczkę treści
własnym kompilatorem książki ([ADR-0008](../adr/0008-content-is-a-versioned-bundle.md),
[ADR-0038](../adr/0038-the-bundle-is-compiled-at-a-pinned-revision.md)).

Zobaczysz wiersz na plik zakończony `ok`, a potem podsumowanie kompilacji. Uruchom to
ponownie kiedykolwiek, żeby zweryfikować, co jest na dysku; jest idempotentne.

> **Jeśli skrót się nie zgadza**, ktoś ręcznie zmienił pobrany plik. Właśnie po to jest ten
> skrót. Usuń `web/content/` i uruchom skrypt jeszcze raz.

## Krok 3 — uruchom to

```bash
dotnet run --project src/AbOvo.AppHost
```

AppHost jest **deweloperskim** korzeniem kompozycji (P1): podnosi razem Postgresa, kontener
serwisu tożsamości, API i aplikację webową, i drukuje adres panelu. Nie jest wdrożoną
topologią i nigdy nią nie będzie — patrz [samouczek 3](03-contribute-a-change.pl.md) i
[`../DIAGRAMS.pl.md`](../DIAGRAMS.pl.md) §D2.

Otwórz <http://localhost:3000>.

Jeśli wolisz w ogóle nie uruchamiać .NET-a, powierzchnia lektury nie potrzebuje go wcale:

```bash
pnpm --dir web install
pnpm --dir web build
pnpm --dir web start
```

To podaje tę samą witrynę bez API, bez bazy i bez serwisu tożsamości za nią — co jest sednem
kolejnego kroku.

## Krok 4 — zobacz, jak produkt odmawia ci powiedzenia czegoś

Patrzysz na indeks programów. Wybierz **F01 — Numbers, powers and roots** i czytaj do ramki 3.

![Ramka programu F01, prosząca czytelnika o zapisanie rozwinięcia dziesiętnego jednej trzeciej, z kropkowaną linią odpowiedzi pod spodem i przyciskiem "Reveal the answer".](../assets/screenshots/frame-asks-english.png)

Ramka 3 mówi ci, czym jest liczba wymierna, a potem prosi o zapisanie rozwinięcia dziesiętnego
⅓. Pod pytaniem jest kropkowana linia z napisem *write it down before you read on*.

Teraz zrób to, co zrobiłbyś z każdą inną stroną: otwórz inspektor przeglądarki i poszukaj w
dokumencie odpowiedzi.

**Nie ma jej tam.** Ani w elemencie, ani w atrybucie, ani w znaczniku skryptu, ani w
prefetchu. Nie ma czego znaleźć, bo odpowiedź na ramkę, na której stoisz, renderuje żądanie o
*kolejną* ramkę i nic wcześniej. Odsłonięcie jest nawigacją, a nie przełącznikiem
([ADR-0014](../adr/0014-the-content-schema-is-json-schema-and-knows-nothing-about-frames.md)).

Naciśnij <kbd>→</kbd> albo kliknij **Reveal the answer**.

![Kolejna ramka, która otwiera się napisem "0.333…, repeating without end".](../assets/screenshots/frame-reveals-english.png)

Ramka 4 otwiera się odpowiedzią, którą miałeś już zapisać. To jest własny mechanizm książki, a
uczynienie go strukturalnym zamiast ukrytym elementem jest powodem, dla którego ten produkt w
ogóle istnieje.

## Krok 5 — wyłącz wszystko i czytaj dalej

Zatrzymaj AppHost. Zatrzymaj API. Zatrzymaj bazę.

Przeładuj ramkę.

**Nic się nie zmienia.** Ramki są serwowane razem z witryną jako wersjonowana paczka, a
wszystko, co napiszesz na ramce, zostaje w twojej przeglądarce
([ADR-0039](../adr/0039-a-frame-accepts-the-readers-answer-as-a-commitment.md)). Pętla
czytelnika ma działać bez konta i bez backendu, a ekran w niej, który nie potrafiłby się
wyrenderować bez zapytania, byłby defektem, a nie stanem ładowania.

Wypróbuj resztę, gdy backend jest wyłączony:

- Otwórz `Working` pod linią odpowiedzi — notatnik, który liczy arytmetykę. Kalkulator, celowo
  nie system algebry komputerowej
  ([ADR-0042](../adr/0042-the-evaluator-is-a-calculator-not-a-cas.md)).
- Otwórz `Sketch` — płótno, które przyjmuje pociągnięcia i nigdy nie otwiera się samo
  ([ADR-0043](../adr/0043-a-sketch-is-strokes-and-the-pane-never-opens-itself.md)).
- Przełącz edycję w wierszu miejsca. Ta sama ramka, po polsku, z zachowanym numerem ramki.
- Naciśnij <kbd>g</kbd> i wpisz numer ramki.

## Co zobaczyłeś

| Twierdzenie | Gdzie to zobaczyłeś |
| --- | --- |
| Odpowiedzi nie ma, zamiast być ukrytą | Krok 4, w inspektorze |
| Pętla czytelnika nie potrzebuje konta ani backendu | Krok 5, przy wszystkim wyłączonym |
| Książka jest treścią, nie źródłem, i jest przypięta | Krok 2, skrót na każdy plik |
| Edycja jest wyborem czytelnika, nigdy zgadywanym | Krok 5, wiersz miejsca |

## Dokąd dalej

- [**Samouczek 2 — przeczytaj program tak, jak miał być czytany**](02-read-a-program.pl.md),
  jeśli chcesz zrozumieć produkt, a nie repozytorium.
- [**Samouczek 3 — wnieś zmianę**](03-contribute-a-change.pl.md), jeśli chcesz ją zrobić.
- [`../START-HERE.pl.md`](../START-HERE.pl.md) kieruje cię do wszystkiego innego.
