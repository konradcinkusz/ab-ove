# ab-ovo — podsumowanie projektu

> Ten dokument nie jest częścią bilingwalnego systemu dokumentacji tego repozytorium
> (`docs/START-HERE.md` i `scripts/check-doc-parity.mjs` go nie obejmują). To jednorazowe,
> całościowe zebranie tego, co repozytorium faktycznie mówi o sobie — dla właściciela projektu,
> po polsku, w jednym miejscu. Źródło: zawartość repozytorium `konradcinkusz/ab-ove` na dzień
> **2026-09-20** (ostatni commit: `dda018b`, gałąź `main`). Każda sekcja niżej wskazuje pliki,
> z których pochodzi, żeby dało się to zweryfikować i zaktualizować.

## 0. Najważniejsze: to jest dużo dalej niż notatki robocze

Notatki, które miałeś dotąd zapisane, opisują **wczesną wizję** — zakres nieustalony, model
biznesowy nieustalony, split-screen w stylu MathCAD, brak wzmianek o MCP. **Repozytorium
faktycznie zawiera coś innego i dużo bardziej dojrzałego**: działający (ale jeszcze
niewdrożony) system — backend .NET 10 + frontend Next.js, 47 zaakceptowanych ADR-ów, pełną
architekturę z testami i bramkami CI, a nawet serwer MCP. Kluczowe rozbieżności z notatkami:

| Notatka robocza | Stan faktyczny w repo |
| --- | --- |
| Zakres treści nieustalony (jedna książka czy biblioteka ~50 kursów) | **Ściśle jedna książka**: *Mathematics from Zero for the AI Engineer*. Żadnej wzmianki o Pythonie dla .NET-owców, LangChain/LangGraph, MS Agent Framework ani o katalogu kursów z „path chooserem" nigdzie w kodzie ani dokumentacji. |
| Model biznesowy nieustalony (jednorazowy zakup / freemium / subskrypcja) | **Częściowo już rozstrzygnięty, i to na nie**: licencja treści książki (CC BY-NC-SA) prawnie zabrania pobierania opłat za dostęp do treści, płatnego poziomu czy reklam przy niej. Otwarte zostają tylko: donacje i płatna usługa, która treści w ogóle nie dotyka ([ADR-0033](../docs/adr/0033-the-content-is-the-books-to-licence-and-noncommercial-is-the-binding-term.md)). |
| Split-screen: treść po lewej, notatnik MathCAD/MATLAB po prawej | **Nie tak zbudowane.** Jedna ramka na raz, w jednej kolumnie (miara czytelnicza 34rem), pod nią „worksheet": linia na odpowiedź, pole „Working" liczące proste wyrażenia arytmetyczne (kalkulator, wprost **nie** CAS — [ADR-0042](../docs/adr/0042-the-evaluator-is-a-calculator-not-a-cas.md)) i płótno do szkicowania. Wariant side-by-side z panelem Pythona **istniał i został usunięty** ([ADR-0040](../docs/adr/0040-the-python-lab-leaves-the-reader-loop.md)). |
| Silnik ćwiczeń wbudowany w aplikację, nie zewnętrzny serwis | **Prawda, i dokładniej niż w notatce**: Python skompilowany do WebAssembly (Pyodide), uruchamiany w przeglądarce czytelnika, zero wykonania po stronie serwera. Ale dotyczy tylko ćwiczeń książki i jest **wypychany poza główną pętlę czytania** — dziś osobny ekran `/lab/p01`, nie panel obok ramki. |
| Brak wzmianek o MCP | **Jest serwer MCP** (`web/mcp`, pakiet `@ab-ovo/mcp`) — serwuje tę samą książkę klientom typu Claude/ChatGPT przez stdio, dzieląc pozycję czytelnika z aplikacją webową przez to samo API. |
| Brak zdefiniowanej persony/targetu | Grupa docelowa wynika wprost z treści: czytelnik jednej konkretnej książki matematycznej dla inżynierów AI — nie ogólny rynek kursów. |

---

## 1. Co to jest

**ab-ovo** to platforma edukacyjna zamykająca w sobie książkę *Mathematics from Zero for the
AI Engineer* — 47 programów ramek nauczania programowanego Strouda, po angielsku i po polsku,
razem z ćwiczeniami komputerowymi książki. Istnieje, bo mechanizmu książki nie da się wymusić
w PDF-ie: ramka pyta o coś, **zanim** cokolwiek powie, a kolejna ramka otwiera się odpowiedzią,
którą czytelnik miał już zapisać. Czytelnik, który przelatuje wzrokiem, nie dostaje nic — a
papier nie ma jak to zauważyć. W aplikacji odpowiedzi **nie ma w ogóle na stronie** (nie jest
tylko ukryta stylami CSS), dopóki reveal — nawigacja do kolejnej ramki — jej nie odsłoni.
(`README.md`, `docs/START-HERE.pl.md`)

**Nazwa systemu i nazwa repozytorium są rozjechane celowo, tymczasowo.** System i wszystkie
pochodne nazwy (`AbOvo`, `@ab-ovo/*`, obrazy `ghcr.io/konradcinkusz/ab-ovo-*`, aplikacje Fly)
nazywają się `ab-ovo`. Repozytorium na GitHubie nazywa się `ab-ove` — literówka z momentu
założenia, którą świadomie zostawiono, bo poprawienie jej w nazwach pochodnych (np. w nazwie
aplikacji Fly) byłoby drogie do cofnięcia. Właściciel potwierdził, że docelowa nazwa to
`ab-ovo`; zmiana nazwy repo to jeden ręczny krok, wciąż niewykonany
([ADR-0005](../docs/adr/0005-slug-ab-ovo.md)).

### Status: nic nie jest wdrożone

Repozytorium stoi na etapie **buduje się, testy zielone, obrazy Dockera się budują**. Nie
istnieje żadna działająca instancja ab-ovo, pod żadnym adresem, dla nikogo. Zero aplikacji na
Fly.io istnieje, zero sekretów ustawiono, oba pakiety GHCR są prywatne. Repozytorium **jest już
publiczne** na GitHubie (`konradcinkusz/ab-ove`), ale to jedyny element „open source'owego"
etapu, który się wydarzył.

---

## 2. Pętla czytelnika — rdzeń produktu

Wymóg produktowy, nie optymalizacja: **pętla czytelnika działa bez konta i bez backendu**.

1. **Przeczytaj ramkę.** Krótka z założenia — jedna myśl, czasem jedna linia.
2. **Zapisz odpowiedź, zanim odwrócisz stronę.** Zobowiązanie jest mechanizmem.
3. **Odsłoń kolejną ramkę**, która otwiera się odpowiedzią. Porównaj, idź dalej albo cofnij się
   o jedną.
4. **Pracuj obok ramki, jeśli trzeba.** Pole liczące linię arytmetyki (nie CAS) i płótno do
   szkicowania. Nic z tego, co czytelnik zapisze, nie opuszcza jego przeglądarki
   ([ADR-0039](../docs/adr/0039-a-frame-accepts-the-readers-answer-as-a-commitment.md)).

Żaden z tych czterech kroków nie rozmawia z serwerem. Ramki są serwowane jako wersjonowana
paczka treści skompilowana z książki przy przypiętej rewizji
([ADR-0008](../docs/adr/0008-content-is-a-versioned-bundle.md),
[ADR-0038](../docs/adr/0038-the-bundle-is-compiled-at-a-pinned-revision.md)).

**Konto dodaje wyłącznie synchronizację** — Twoje miejsce w książce podążające za Tobą między
maszynami. To nie brama na żaden z czterech kroków wyżej, to ostatnia faza pracy, a wdrożenie
bez usługi tożsamości w ogóle jest wspieraną konfiguracją, zgłaszaną jako *zdegradowana*, a nie
błąd startu.

**Ćwiczenia Pythona z książki wciąż istnieją**, pod `/lab/p01`, ale są jednym programem z
czterdziestu siedmiu i są w trakcie wychodzenia z produktu — decyzja właściciela: czytelnik
książki matematycznej nie powinien musieć pisać Pythona, żeby odpowiedzieć na ramkę, a wśród
1036 odpowiedzi w książce praktycznie żadna nie jest jednolinijkowcem w Pythonie
([ADR-0040](../docs/adr/0040-the-python-lab-leaves-the-reader-loop.md)).

---

## 3. Zakres treści — dziś ściśle jedna książka

Treść pochodzi z osobnego repozytorium, **`konradcinkusz/math-for-ai-engineers`**
(„the book"), i nigdy nie jest tu commitowana ręcznie — jest pobierana skryptem
`scripts/fetch-book-content.sh` przy przypiętej rewizji i weryfikowana sumami kontrolnymi
(`web/content/book.lock.json`). To repozytorium **nigdy nie parsuje LaTeX-u** książki wprost —
własny kompilator i cross-check książki produkują wersjonowaną paczkę treści
(schemat JSON), którą aplikacja renderuje.

Docelowo (fazie 2b, dziś zablokowanej) treść ma pochodzić z **wydania (release) książki**
publikującego gotową paczkę — takie wydanie jeszcze nie istnieje, więc obecnie paczka jest
kompilowana lokalnie z tarballa książki przy każdym pobraniu, co jest udokumentowanym,
tymczasowym odstępstwem od architektury docelowej (rejestr odstępstw,
`docs/architecture/00-ARCHITECTURE.md`).

**Żadnych planów rozszerzenia na inne książki (Python dla .NET-owców, LangChain/LangGraph,
Microsoft Agent Framework) ani na katalog ~50 kursów z „path chooserem" nie ma w kodzie ani w
dokumentacji.** Jedyna wzmianka o „drugim torze" (*second track*) to zablokowana pozycja
backlogu (#81, `docs/ux/UI-UX.md`) — nieopisana, niezaplanowana, czekająca na decyzję.

---

## 4. Model biznesowy — częściowo już rozstrzygnięty

Repozytorium kodu jest na licencji **MIT**. Treść książki jest na licencji **CC BY-NC-SA
4.0** (Creative Commons, uznanie autorstwa, niekomercyjne, na tych samych warunkach), pobierana
z osobnego repozytorium i nigdy nie relicencjonowana przez ab-ovo.

**Klauzula NonCommercial wiąże samo wdrożenie, nie tylko redystrybucję** — jak długo książka
niesie ten warunek, żadna instancja ab-ovo serwująca tę treść **nie może** pobierać opłat za
dostęp do niej, chować jej za płatnym poziomem ani wyświetlać przy niej reklam. Otwarte
pozostają: donacje, płatna usługa niedotykająca treści w ogóle, oraz sprzedaż samej książki
przez jej autora (który jest posiadaczem praw) —
([ADR-0033](../docs/adr/0033-the-content-is-the-books-to-licence-and-noncommercial-is-the-binding-term.md)).

To oznacza: pytanie „jednorazowy zakup czy freemium czy subskrypcja" jest już częściowo
zamknięte po stronie treści z tej jednej książki — żadna z tych trzech opcji nie może dotyczyć
dostępu do samej treści, dopóki obowiązuje CC BY-NC-SA. Otwarte zostaje wszystko, co nie
dotyka treści bezpośrednio (np. płatne funkcje wokół produktu, donacje).

---

## 5. Interfejs i UX — jak jest naprawdę zbudowane

Aplikacja webowa (nie desktopowa, nie mobilna) — Next.js 16 / React 19, responsywna, jeden
klient. **Świadomie odrzucona** jest osobna aplikacja mobilna — druga kopia całej logiki
(`docs/ux/UI-UX.md`, sekcja „What is deliberately not on this list").

**Nie jest to split-screen w stylu MathCAD/MATLAB.** Ekran czyta jedną ramkę naraz, w jednej
kolumnie tekstu o mierze 34rem (dobranej pod prozę, nie pod dashboard). Pod treścią ramki
znajduje się „worksheet":

- kropkowana linia na własną odpowiedź czytelnika (pole tekstowe — commitment przed odsłonięciem),
- zwijane pole **„Working"** — pad liczący linię arytmetyki, wprost zdefiniowany jako
  **kalkulator, nie CAS** ([ADR-0042](../docs/adr/0042-the-evaluator-is-a-calculator-not-a-cas.md)),
- zwijane pole **„Sketch"** — płótno do odręcznego rysowania
  ([ADR-0043](../docs/adr/0043-a-sketch-is-strokes-and-the-pane-never-opens-itself.md)).

Wariant bliższy Twojej notatce — panel Pythona **obok** ramki, side-by-side na szerokim ekranie
— **istniał i został skasowany** razem z całą trasą, która go renderowała
([ADR-0040](../docs/adr/0040-the-python-lab-leaves-the-reader-loop.md)). Uzasadnienie
właściciela: czytelnik książki matematycznej nie powinien pisać kodu, żeby odpowiedzieć na
ramkę. Rozumowanie o nienakładających się panelach z tej decyzji zostało odziedziczone przez
obecny „worksheet" (jedna kolumna, kolejność źródłowa, nic sticky/floating).

**Silnik wykonujący ćwiczenia jest wbudowany w aplikację, zgodnie z Twoją notatką** — ale to
dotyczy wyłącznie ćwiczeń Pythona z książki, nie ogólnego środowiska obliczeniowego. Python jest
skompilowany do WebAssembly przez **Pyodide** i uruchamiany w przeglądarce, w dedykowanym
module workerze (żeby dało się zatrzymać zawieszony interpreter bez zawieszania karty —
[ADR-0034](../docs/adr/0034-stopping-a-run-ends-the-interpreter-and-boots-another.md)). Zero
wykonania po stronie serwera, zero kodu czytelnika opuszczającego jego maszynę. Reached dziś
tylko z jednego linku na ekranie podsumowania programu P01, nie z panelu obok ramki.

Cała reszta stron: `/` (indeks programów), `/about` (argument produktu + panel integracji),
`/read/<track>/<unit>/<lang>[/<step>]` (spis treści i ramki), `/login`, `/account`
(postęp, eksport, usunięcie), `/instrument` (widok autorski rankingujący ramki), `/healthz`.
Pełna tabela tras: `docs/ux/UI-UX.md`.

---

## 6. Serwer MCP — istnieje, wbrew notatce

`web/mcp` (pakiet `@ab-ovo/mcp`) to serwer MCP (Model Context Protocol) serwujący tę samą
książkę, krok po kroku, klientowi pracującemu wewnątrz hosta MCP (Claude, ChatGPT i inne) —
zamiast przez stronę internetową. Działa lokalnie po stdio, na checkout repozytorium; **nic nie jest
wdrożone**. Kluczowa własność: odpowiedź na krok **nie jest przechowywana przy tym kroku** —
jest otwarciem *następnego* kroku, dokładnie ten sam mechanizm co w interfejsie webowym, więc
serwer nie filtruje odpowiedzi z odpowiedzi — odmawia wybrania kroku, do którego czytelnik
jeszcze nie doszedł.

Jeśli skonfigurowany ze zmiennymi `AB_OVO_API_URL` i `AB_OVO_READER_TOKEN`, korzysta z **tego
samego** rekordu `ReaderProgress` co aplikacja webowa — program otwarty w MCP wznawia się
dokładnie tam, gdzie przeglądarka go zostawiła. Narzędzia: `list_programs`, `open_program`,
`current_step`, `submit_answer`, `review_step`; jeden prompt: `read`.
(`web/mcp/README.md`, `docs/architecture/MCP-SERVER-SKETCH.md`)

---

## 7. Architektura techniczna

**Backend — .NET 10 (Aspire):**

| Projekt | Rola |
| --- | --- |
| `src/AbOvo.AppHost` | Korzeń kompozycji do developmentu (Aspire). **Nie jest topologią produkcyjną.** |
| `src/AbOvo.ServiceDefaults` | Wspólny „kernel": telemetria, health checki, walidacja JWT, CORS, rate limiting, migracje, wybór dostawcy bazy. Twardy limit rozmiaru (~800 linii kodu bez komentarzy), pilnowany mechanicznie w CI. |
| `src/AbOvo.Contracts` | DTO przekraczające granicę usługi. |
| `src/AbOvo.Api` | Serwis HTTP. Właściciel bazy `apidb`. Waliduje tokeny RS256, nie posiada kluczy, nie wystawia (mintuje) tokenów. |

Tożsamość/logowanie: zewnętrzny `authservice` (adoptowany z opublikowanego obrazu
`ghcr.io/konradcinkusz/authservice:v0.3.1`, nie budowany w tym repo). API tylko waliduje tokeny
RS256 przez JWKS.

**Frontend — Next.js 16 / React 19 / TypeScript**, wzorzec BFF (backend-for-frontend):
przeglądarka rozmawia wyłącznie z własnym originem aplikacji webowej
(`/api/config`, `/api/auth/login`, `/api/auth/session`, `/api/proxy/[...path]`), nigdy
bezpośrednio z API ani z `authservice`. Zero zewnętrznych żądań z przeglądarki (brak CDN,
webfontów, skryptów firm trzecich) — KaTeX i Pyodide są serwowane z własnego origin.

**Baza danych:** jedna instancja Postgres, dwie logiczne bazy (`apidb`, `authdb`), migracje EF
Core, bez publicznego nasłuchu.

**Testy:** xUnit v3 (jednostkowe + integracyjne in-memory + reguły architektoniczne NetArchTest
pilnujące granic kernela), Playwright (e2e, dwa poziomy: `smoke` na każdym PR, `core` na każdym
pushu do `main`), testy jednostkowe frontendu przez wbudowany `node --test` (zero dodatkowego
runnera).

**CI/CD:** GitHub Actions — `ci.yml` (build/testy/reguły architektury), `secret-scan.yml`
(gitleaks na każdym PR/pushu), `codeql.yml` (SAST + audyt zależności, cotygodniowo),
`flyio.yml` (deploy na tagu `v*`, jeszcze nigdy nieuruchomiony produkcyjnie), `docs.yml`
(linting dokumentacji — linki, parowanie diagramów, parowanie dwujęzycznych dokumentów).

**Docelowe wdrożenie — Fly.io, region `waw`:** cztery aplikacje opisane w `flyio/*.fly.toml`
(`ab-ovo-postgres`, `ab-ovo-authservice-dev`, `ab-ovo-api-dev`, `ab-ovo-web-dev`), obrazy w
GHCR. **Żadna z nich nie istnieje faktycznie** — to opis plików, nie stan systemu.

---

## 8. Model danych i „anty-cele" — architektoniczne ograniczenie, nie tylko polityka

Naczelna zasada produktu: **instrument mierzy książkę, nigdy czytelnika.** To nie jest
deklaracja intencji — jest wymuszone w kodzie:

- **Tylko dwie encje w bazie**: `ReaderProgress` (gdzie czytelnik jest w książce — potrzebne
  wyłącznie do synchronizacji między urządzeniami) i `FrameOutcome` (anonimowy licznik
  trafień/pudeł per ramka+sprawdzenie+próba — **bez identyfikatora czytelnika i bez
  znacznika czasu**, żeby uniemożliwić rekonstrukcję sesji z serii wpisów).
- Zapytanie do `ReaderProgress`, które nie precyzuje jednego czytelnika, jest **odrzucane w
  runtime**, zanim Entity Framework je skompiluje — nie przez recenzję kodu, przez interceptor.
- Brak widoku per-czytelnik, rankingu, tablicy wyników — nigdzie w kodzie ani w planach.
- **Brak modelu językowego (LLM) gdziekolwiek w pętli czytelnika** — żadnego ocenia
  odpowiedzi, wyjaśniania, generowania ćwiczeń. Powód: pętla ma działać bez backendu; ocena
  modelu byłaby niedeterministyczna i nie do zaudytowania jako dowód o książce; porównanie z
  odpowiedzią książki *jest* nauką ([ADR-0010](../docs/adr/0010-no-language-model-in-the-loop.md)).
- **Brak grywalizacji** (streaki, odznaki, punkty) — świadomie odrzucone, bo nagradzałyby
  uczucie zamiast pracy.

„Instrument" (`/instrument`, faza 4 planu) to widok **dla autora książki**, rankingujący ramki
od najgorzej nauczających, z przedziałami ufności liczonymi metodą z samej książki — nie widok
dla czytelnika i nie widok per-osoba.

---

## 9. Dokumentacja — już bardzo rozbudowana

Repozytorium ma **istniejący folder `docs/`** ze strukturą Diátaxis (samouczki / przewodniki /
materiał źródłowy / wyjaśnienia):

| Ścieżka | Co zawiera |
| --- | --- |
| `docs/START-HERE.md` / `.pl.md` | Drzwi frontowe do całej dokumentacji |
| `docs/adr/` | **47 Architecture Decision Records** — każda decyzja z kontekstem, alternatywami i konsekwencjami |
| `docs/architecture/00-ARCHITECTURE.md` | Repozytorium zmierzone względem „konstytucji" architektonicznej (zasady P1–P15), rejestr odstępstw, znane luki |
| `docs/ux/UI-UX.md` | Wszystkie ekrany jak zbudowane, backlog rankingowany fazami |
| `docs/diagrams/` | Diagramy Mermaid, po angielsku i polsku |
| `docs/papers/ab-ovo-overview.tex` / `.pl.tex` | Przegląd projektu jako artykuł LaTeX, w obu edycjach |
| `docs/tutorials/`, `docs/how-to/` | Dwujęzyczne samouczki i przewodniki zadaniowe |
| `AGENTS.md` | Zasady dla agentów AI pracujących w tym repo |
| `CONTRIBUTING.md`, `SECURITY.md` | To samo dla człowieka; procedura na wyciek sekretu |
| `flyio/README.md`, `flyio/SECRETS.md`, `flyio/INFRASTRUCTURE-ANALYSIS.md` | Topologia wdrożenia, sekrety, analiza kosztów |

Dokumentacja ma własne bramki w CI: każdy link musi się rozwiązywać, diagramy muszą się parsować
w trzech kopiach naraz, a dokumenty dwujęzyczne (tylko wybrany podzbiór — samouczki,
przewodniki, START-HERE, DIAGRAMS, SCREENSHOTS) nie mogą być edytowane tylko po jednej stronie
językowej. ADR-y i dokument architektury są **celowo tylko po angielsku** — zmieniają się zbyt
szybko, żeby utrzymywać tłumaczenie bez ryzyka rozjazdu.

---

## 10. Plan fazowy (z `docs/ux/UI-UX.md`)

| Faza | Co obejmuje | Stan |
| --- | --- | --- |
| 1 | Panel ćwiczeń Pythona (Pyodide) | Zrobione, ale relacja z ramką zmieniona przez ADR-0040 |
| 2a | Schemat treści + widok ramki, na fikcyjnej paczce | Zrobione |
| 2b | Prawdziwa treść — 47 programów z opublikowanej paczki książki | **Zablokowane** — książka jeszcze nie publikuje takiej paczki; obejście: kompilacja lokalna przy każdym pobraniu |
| 3 | Konta i synchronizacja postępu | W trakcie — logowanie zbudowane, reguła konfliktu „furthest-frame-wins" zaprojektowana |
| 4 | „Instrument" — widok autorski rankingujący ramki | W dużej mierze zbudowane, z rygorem statystycznym (przedziały ufności, ważony wynik) |
| 5 | Wydanie open source | Częściowo: repo już publiczne; audyt historii pod kątem sekretów zrobiony; pozostaje m.in. zmiana nazwy repo na `ab-ovo`, upublicznienie pakietów GHCR |

---

## 11. Licencje — podsumowanie

| Co | Licencja | Gdzie zapisane |
| --- | --- | --- |
| To repozytorium (aplikacja, narzędzia, testy, dokumentacja) | **MIT** | `LICENSE` |
| Treść książki (`web/content/book/`, pobierana, nigdy niecommitowana) | **CC BY-NC-SA 4.0** | licencja książki, przypięta w `web/content/book.lock.json` |
| Pyodide (środowisko CPython serwowane z tego origin) | **MPL-2.0** | dołączone bez modyfikacji |

**Warunek NonCommercial wiąże wdrożenie**: żadna instancja ab-ovo serwująca tę treść nie może
pobierać opłat za dostęp do niej, chować jej za płatnym poziomem ani wyświetlać przy niej
reklam. Trzecia strona może uruchomić własną instancję, ale nie może jej sprzedawać.

---

## 12. Otwarte pytania — to, co naprawdę jeszcze nie jest zdecydowane

W przeciwieństwie do punktów z Twojej notatki, które okazały się już rozstrzygnięte albo
nieaktualne, to poniżej wygląda na realnie otwarte, potwierdzone brakiem wzmianek w kodzie i
dokumentacji:

- **Czy powstanie druga książka/tor treści.** Zarezerwowane jako zablokowana pozycja backlogu
  (#81), zero specyfikacji.
- **Model biznesowy poza treścią książki** — donacje, płatne funkcje niedotykające treści: nie
  zaprojektowane, tylko dopuszczone przez ADR-0033.
- **Zmiana nazwy repozytorium** z `ab-ove` na `ab-ovo` — czeka na ręczną akcję właściciela.
- **Kto dokładnie jest czytelnikiem** poza „ktoś czytający tę jedną książkę matematyczną dla
  inżynierów AI" — brak person/segmentacji w dokumentacji produktowej.

---

## Źródła

Ten dokument został złożony z (m.in.): `README.md`, `docs/START-HERE.pl.md`,
`docs/architecture/00-ARCHITECTURE.md`, `docs/ux/UI-UX.md`, `AGENTS.md`, `flyio/README.md`,
`web/mcp/README.md`, `web/content/README.md`, `web/app/package.json`,
`src/AbOvo.Api/AbOvo.Api.csproj`, `global.json`,
`docs/adr/0033-the-content-is-the-books-to-licence-and-noncommercial-is-the-binding-term.md`,
`docs/adr/0010-no-language-model-in-the-loop.md`, oraz przegląd struktury katalogów i historii
commitów repozytorium `konradcinkusz/ab-ove`. Repozytorium samo siebie traktuje przestarzały
dokument jako defekt (P14) — jeśli coś tu przestanie być prawdą, warto to poprawić w tym samym
commicie, który to zmienia.
