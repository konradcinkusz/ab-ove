# Jak opublikować pakiet MCP

Ręczny krok właściciela: upublicznienie w npm pakietu, który buduje `web/mcp`. CI buduje go,
pakuje i sprawdza, ale nigdy go nie publikuje; to jest lista kontrolna części, która zostaje
przy człowieku.

> **English version:** [`publish-the-mcp-package.md`](publish-the-mcp-package.md)

**Nic z tego nie zostało jeszcze zrobione.** Pakietu nie ma w npm i nic nie jest wdrożone
(AGENTS.md #2), więc opublikowany pakiet sięga tylko do API, które ktoś sam uruchomi, dopóki
pierwsze wdrożenie nie da mu publicznego API, na które można go wskazać.

## Dlaczego to jest krok człowieka

Wersji opublikowanej w npm **nie można użyć ponownie**, nawet po jej wycofaniu, a zakres
(scope) w npm należy do konta, więc nazwy nie wybiera to repozytorium
([ADR-0066](../adr/0066-the-mcp-server-is-a-typescript-client-of-the-api-installed-before-it-is-hosted.md)
§3). `web/mcp/package.json` ma `"private": true`, dopóki ta lista nie usunie tego wiersza, więc
żadne polecenie uruchomione przez przypadek nie może go opublikować
([ADR-0070](../adr/0070-the-mcp-package-is-built-and-checked-in-ci-and-published-by-its-owner.md)
§3). Workflow, który go buduje, `.github/workflows/mcp-package.yml`, nie ma żadnego tokenu npm.

## Czego potrzebuje właściciel

- konta npm z włączonym uwierzytelnianiem dwuskładnikowym oraz zakresu nazwy, jeśli ją ma
  (własnego konta albo organizacji, której jest właścicielem);
- Node'a i dołączonego do niego `npm`;
- kopii roboczej tego repozytorium z zainstalowanym workspace (`pnpm --dir web install`), bo
  tam działa sprawdzenie archiwum;
- działającego `AbOvo.Api` z książką, jeśli podziękowanie ma być widoczne na liście, jak w
  poniższym sprawdzeniu ([`01-first-run.pl.md`](../tutorials/01-first-run.pl.md) uruchamia takie
  API). Bez niego sprawdzenie czyta z atrapy.

## Lista kontrolna

1. **Wybierz nazwę i sprawdź ją w npm.** `npm view <nazwa>` odpowiadające `E404` oznacza, że
   nikt jej nie ma. Nazwa z zakresem wymaga tego zakresu: konto musi go
   posiadać (własny albo organizacji, której jest właścicielem); strona konta na npmjs.com
   pokazuje, które to.
   Wybierz też pierwszy numer wersji: to `version` w `web/mcp/package.json` i jest on
   zużyty z chwilą publikacji.
2. **Zrób jeden commit, który to mówi.** Na gałęzi:
   - ustaw `name` w `web/mcp/package.json`, jedynym miejscu, gdzie jest ustawiana, i przepisz
     komentarz `//name` nad nim, który mówi, że nazwę dopiero wybrać;
   - usuń `"private": true` oraz komentarz `//private` nad nim;
   - ustaw `repository.url` na adres repozytorium z tej chwili. Zmiana nazwy na `ab-ovo` (#78)
     go zmienia, a zaufana publikacja npm porównuje go z repozytorium, w którym działa
     workflow (ADR-0070 §5);
   - wpisz nazwę tam, gdzie `web/mcp/README.md` ma `<package-name>`, bo ten plik jest stroną
     pakietu w npm.

   Otwórz pull request i zatwierdź go na zwykłych zasadach: to zmiana manifestu, który uruchamia
   host, więc podlega przeglądowi jak każda taka zmiana.
3. **Weź z CI archiwum scalonego commita.** Przebieg `MCP package` uruchomiony scaleniem do
   `main` wysyła je jako artefakt `ab-ovo-mcp-package`: zip z jednym plikiem `.tgz`, który
   wygasa po czasie przechowywania ustawionym w `mcp-package.yml`. **Actions, MCP package, Run
   workflow** buduje kolejne dla `main` na żądanie. Przebieg samego pull requesta buduje
   scalenie gałęzi z `main` takim, jakie było wtedy, a to nie jest scalony commit, jeśli
   `main` poszedł dalej, więc nie jest to plik do publikacji. Publikuj archiwum zbudowane w CI,
   a nie na maszynie: sprawdzenie poniżej czyta właśnie ten plik, a suma kontrolna z
   podsumowania przebiegu mówi, że pobrany plik jest tym, który zbudowało CI.
4. **Sprawdź plik, a nie drzewo** (następna sekcja). Musi przejść z `--for-publish`.
5. **Opublikuj ten plik z własnej maszyny właściciela**, po zalogowaniu do npm:

   ```bash
   npm login
   npm publish path/to/<tarball>.tgz --access public --dry-run   # co zostałoby opublikowane; nic nie jest
   npm publish path/to/<tarball>.tgz --access public
   ```

   `--access public` dotyczy nazwy z zakresem, którą npm inaczej publikuje jako ograniczoną;
   pakiet jest bezpłatny (ADR-0066 §4). Archiwum nadal oznaczone `private` npm odrzuca kodem
   `EPRIVATE`, a krok 2 właśnie to usuwa.
6. **Zobacz, co się stało.** Z pustego katalogu `npx -y <nazwa> --version` wypisuje nazwę i
   wersję, a `npm view <nazwa>` pokazuje pakiet i jego licencję (MIT). Potem wskaż go hostowi
   (`claude mcp add ab-ovo -e AB_OVO_API_URL=http://localhost:<port> -- npx -y <nazwa>`) i
   wywołaj `list_programs`: pod kursem jest podziękowanie dla książki.
7. **Otaguj commit `mcp-v<wersja>`, nigdy `v*`.** `flyio.yml` wdraża na tag pasujący do `v*`
   (nigdy jeszcze nie działał), więc tag zaczynający się w ten sposób uruchomiłby łańcuch
   wdrożenia. Tag przy publikacji mówi, z którego commita powstała wersja.

**Pomyłki się nie cofa, tylko zastępuje.** Opublikowaną wersję można oznaczyć jako przestarzałą
(`npm deprecate <nazwa>@<wersja> "<dlaczego>"`), ale jej numer jest stracony: popraw to w nowym
commicie i opublikuj następną wersję.

## Sprawdzenie archiwum, które zbudowało CI

Ten sam skrypt, który CI uruchamia na każdym wysyłanym archiwum, tym razem na pobranym pliku.
Czyta plik, a nie katalog, z którego powstał, i na nic się nie zda, jeśli nie zostanie
uruchomiony na pliku, który ma być opublikowany.

```bash
node web/mcp/scripts/verify-tarball.ts path/to/<tarball>.tgz --for-publish
node web/mcp/scripts/verify-tarball.ts path/to/<tarball>.tgz --api http://localhost:<port>   # względem działającego API
```

Co sprawdza, w tej kolejności:

1. **Zawartość.** Wyłącznie launcher, JavaScript w `dist/`, schematy treści web-kit i przypięcie,
   `package.json`, `LICENSE` i `README.md`. Bez TypeScriptu, którego Node nie przetworzy pod
   `node_modules`; **bez kopii książki**, która jest na licencji CC BY-NC-SA 4.0 i nie jest
   redystrybuowana przez npm (ADR-0033, ADR-0066 §4); bez kodu testów; bez niczego, co jest
   dość duże, by być książką. Licencja jest tą MIT, którą deklaruje manifest, a nic w
   `dependencies` nie jest specyfikatorem, którego żaden rejestr nie rozwiąże. Nie ma
   skryptu uruchamianego przy instalacji, który działałby na maszynie każdego czytelnika.
2. **Instalacja** dołączonym do Node'a `npm`, do pustego katalogu poza kopią roboczą; każdy
   plik JavaScript się parsuje.
3. **Start:** `--version` przez skrót, który uruchamia `npx`, `--help` i odmowa argumentu.
4. **Uścisk dłoni:** zainstalowany serwer jest uruchamiany tak, jak uruchamia go host, klient
   się łączy, a `list_programs` wraca z **podziękowaniem dla książki** w instrukcjach serwera i
   na liście, słowami i jako dane.
5. **Tylko `--for-publish`:** manifest nie jest już `private`.

**Czego nie sprawdza**, a właściciel tak: że nazwa jest wolna i jego (krok 1), że ta wersja nie
została już opublikowana (npm powie to na końcu kroku 5, za późno, by to naprawić) i że jakieś
API ma książkę.

Przed krokiem 5 warto też zajrzeć do środka, bo sprawdzenie czyta listę, a nie ocenia: `tar -tzf
<tarball>.tgz` to cała zawartość, a pakiet tego rodzaju to krótka lista.

## Zanim pakiet zostanie wskazany na wdrożoną instancję

Żadna jeszcze nie istnieje. Kiedy powstanie, najpierw muszą być prawdą (powody są w
`web/mcp/README.md`):

- podziękowanie pokazuje lista tej instancji, co sprawdza powyższe `--api <jej adres>`;
- instancja udostępnia książkę bezpłatnie, bez opłat, bez płatnego poziomu i bez reklam
  przy treści (ADR-0033);
- powierzchnia czytania też dziękuje książce, co należy do pierwszego wdrożenia (#71);
- wiersze anonimowych czytelników są przechowywane według reguły (ADR-0061, Konsekwencje
  ADR-0066).

## Później: CI publikuje, bez tokenu

ADR-0070 §5 rozstrzyga, że jeśli CI kiedykolwiek publikuje, to przez zaufaną publikację npm
przez GitHub OIDC, a nigdy przez przechowywany token, i że włącza ją właściciel. Workflow nie
ma w drzewie. ADR zawiera jego tekst i mówi dokładnie, co ustawić w npm i na GitHubie.
Pierwsza publikacja pozostaje tą listą, ręcznie.

## Zobacz też

- [`../adr/0070-the-mcp-package-is-built-and-checked-in-ci-and-published-by-its-owner.md`](../adr/0070-the-mcp-package-is-built-and-checked-in-ci-and-published-by-its-owner.md)
- [`../../web/mcp/README.md`](../../web/mcp/README.md) — podłączenie agenta i podziękowanie
  dla książki.
- [`run-the-tests.pl.md`](run-the-tests.pl.md)
