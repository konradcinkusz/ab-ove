# Jak zbudować dokumentację

Co biegnie na każdym pull requeście, co biegnie, gdy ktoś poprosi, i jak uruchomić jedno i
drugie lokalnie.

> **English version:** [`build-the-documentation.md`](build-the-documentation.md)

## Nie ma witryny do zbudowania

Dokumentacja jest Markdownem, a GitHub ją renderuje — razem z każdym diagramem Mermaida — bez
kroku builda i bez JavaScriptu. To jest wybór i dlatego diagramy są Mermaidem, a nie
obrazkami: diff diagramu jest diffem jego znaczenia.

Co **jest** budowane, i tylko gdy ktoś o to poprosi, to **prezentacja LaTeX-owa** przeglądu —
PDF do wręczenia komuś, kto nie przeczyta Markdowna na GitHubie.

`site/index.html` to znowu osobna rzecz: jedna samowystarczalna strona publikowana na GitHub
Pages przez [`../../.github/workflows/pages.yml`](../../.github/workflows/pages.yml), ze
strażnikiem, który odmawia publikacji strony wykonującej jakiekolwiek żądanie zewnętrzne.

## Sprawdzenia

```bash
npm install         # raz; narzędzia dokumentacji, celowo osobne od web/
npm run lint:docs   # wszystkie pięć, dokładnie to, co uruchamia CI
```

Albo po jednym:

```bash
npm run lint:md         # markdownlint po każdym śledzonym pliku Markdown
npm run lint:links      # każdy względny odnośnik prowadzi do istniejącego pliku
npm run lint:diagrams   # trzy kopie każdego diagramu się zgadzają
npm run lint:parity     # obie połowy każdego dwujęzycznego dokumentu istnieją
npm run lint:papers     # edycje LaTeX-owe trzymają się stylu domowego
```

Dwa z nich mają drugą regułę, która potrzebuje diffa, a CI podaje każdemu ref bazowy:

```bash
node scripts/check-doc-parity.mjs origin/main   # ...i żadnej połowy nie ruszono samej
node scripts/check-papers.mjs origin/main       # ...to samo dla dwóch edycji .tex
```

**Po co jest `lint:papers`.** Domowy styl LaTeX-a mieszka w
[`../papers/house-preamble.tex`](../papers/house-preamble.tex), który obie edycje wciągają
przez `\input` — jeden plik, więc poprawka stylu to jedna zmiana, a nie jedna na dokument.
Sprawdzenie pilnuje czterech rzeczy: że każda edycja robi ten `\input` i definiuje jego
czteropoleceniowy kontrakt *przed* nim, że lokalna kopia wciąż zgadza się skrótem z kopią
w `architecture-standards`, i że rysunek przywołuje się slugiem (`\dgm{b1-reader-loop}`),
a nie ścieżką pisaną dwa razy.

To repozytorium jest powodem, dla którego to sprawdzenie w ogóle istnieje. Obie edycje
zjechały ze stylu domowego całkowicie — żadnego z jego siedmiu znaczników, przy siedmiu na
siedem w `agent-eval-bench` i `marcus-shop` — a rozjazdu nie było widać, bo nic ich nie
porównywało. Build łapie dokument zepsuty; to łapie dokument, który składa się bez błędu
i jest zły.

**Dlaczego tu `npm`, a dla aplikacji `pnpm`.** `web/` jest przestrzenią pnpm, a korzeniowy
`package.json` celowo nie jest jej członkiem. Korzeniowy pakiet, który dołączyłby do tej
przestrzeni, wciągnąłby markdownlinta i mermaid-cli w powierzchnię lintowania, sprawdzania
typów i budowania aplikacji, a lockfile aplikacji postawiłby na drodze zmiany w dokumentacji.
Dwa zbiory zależności niemające ze sobą nic wspólnego dostają dwa lockfile'e.

## PDF-y

```bash
npm install
node scripts/render-diagrams.mjs        # diagramy do wektorowego PDF-a; MUSI być pierwsze
cd docs/papers && pdflatex ab-ovo-overview.tex && pdflatex ab-ovo-overview.tex
cd docs/papers && pdflatex ab-ovo-overview.pl.tex && pdflatex ab-ovo-overview.pl.tex
```

Dwa razy każdy, dla odsyłaczy. Krok renderowania jest pierwszy, bo `.tex` zawierający diagram
przerywa na pierwszym `\includegraphics`, którego pliku nie ma.

**Nic wygenerowanego nie jest commitowane.** Ani PDF-y, ani `docs/diagrams/rendered/`, ani
pośrednie pliki LaTeX-a — zacommitowany PDF jest binarką w każdym diffie i drugą kopią
dokumentu, którego źródło już tu jest, więc w dniu, w którym się rozejdą, nic nie powie, który
z nich jest tym papierem. Jedynym wyjątkiem jest `docs/assets/screenshots/`, a powód stoi w
[`capture-the-screenshots.pl.md`](capture-the-screenshots.pl.md).

## W CI

| Workflow | Wyzwalacz | Co robi |
| --- | --- | --- |
| [`docs.yml`](../../.github/workflows/docs.yml) | każdy pull request dotykający dokumentacji oraz `workflow_dispatch` | cztery sprawdzenia powyżej; przy dispatchu dodatkowo renderuje diagramy, buduje oba PDF-y, robi zrzuty ekranu i wrzuca jeden artefakt |
| [`build-overview-pdf.yml`](../../.github/workflows/build-overview-pdf.yml) | wyłącznie `workflow_dispatch` | sam papier przeglądowy, w obu edycjach, z wyborem silnika TeX |

**Joby z PDF-ami są ręczne celowo.** Dokument bez własnego rytmu wydań nie powinien udawać, że
go ma: budowanie go przy każdym pushu kładłoby PDF na każdym commicie, który ruszył przecinek,
a historia przebiegów mówiłaby, że w tym tygodniu wydano czterdzieści razy. Sprawdzenia nie są
ręczne z lustrzanego powodu — mogą powiedzieć autorowi o zepsutym odnośniku, zanim zrobi to
recenzent.

## Zobacz też

- [`add-a-diagram.pl.md`](add-a-diagram.pl.md)
- [`translate-a-document.pl.md`](translate-a-document.pl.md)
- [`../DIAGRAMS.pl.md`](../DIAGRAMS.pl.md) §D3 — ten proces, narysowany.
