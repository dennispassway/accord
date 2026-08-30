---
name: css-flex-rijen
description: Krimpgedrag van flex-rijen in de CSS van Accord, geldt voor src/**/*.css
globs: src/**/*.css
---

# Flex-rijen die moeten kunnen krimpen

Geldt voor: `src/**/*.css`

Accord draait in een venster met een harde ondergrens (`minWidth: 940` in
`src-tauri/tauri.conf.json`). Met de sidebar (216px) en het detailpaneel (340px) open
houdt de lijstkolom daar ongeveer 384px over. Dat is de breedte waarop je een rij moet
narekenen, niet de breedte van je eigen scherm.

Regels voor een rij waarin één element mag afkappen (`text-overflow: ellipsis`):

- Geef het belangrijkste afkappende element een `flex-basis` groter dan 0. Met
  `flex-basis: 0` draagt het niets bij aan het krimp-algoritme: het absorbeert alle
  negatieve ruimte en verdwijnt op het minimumvenster volledig, terwijl de rest van de
  rij op volle breedte blijft staan. Zo verdween de PR-titel op 940px.
- Verdeel het krimpen daarna met de shrink-factor, niet door elementen vast te zetten:
  wat als eerste mag wijken krijgt een hogere factor (`.pl-repo` staat op `flex: 0 3 auto`
  en wijkt dus voor de titel en de statuspill). Elk krimpend element heeft `min-width: 0`
  nodig, anders krimpt het niet onder zijn content-breedte en loopt de rij alsnog over.
- Alles wat je op `flex: 0 0 ...` zet moet samen binnen de beschikbare breedte passen,
  ook in de breedste variant van de rij. Een element dat kan wrappen telt daarbij niet
  als "past": zet zulke tekst op `nowrap` met ellipsis, anders duwt de wrap de hoogte in
  en het krimpbudget verder omlaag.
- Elke conditionele kolom (iets dat alleen bij een bepaalde instelling of filter
  verschijnt) telt mee in die som. Reken de rij door met alle optionele elementen
  zichtbaar.

Zie `.pl-title`, `.pl-status-pill`, `.pl-row-end` en `.pl-repo` in
`src/features/prs/prlist.css` als voorbeeld van het patroon dat werkt.
