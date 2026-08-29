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

- Het afkappende element heeft `flex-basis: 0` en draagt daardoor niets bij aan het
  krimp-algoritme: het absorbeert geen negatieve ruimte en gaat als eerste naar 0px.
  Alle broers en zussen die niet mogen krimpen (`flex: 0 0 ...`) moeten dus samen binnen
  de beschikbare breedte passen, ook in de breedste variant van de rij.
- Past dat niet, zet het cluster of de tekst ernaast op `flex: 0 1 <basis>` met
  `min-width: 0`. Zonder `min-width: 0` krimpt een flex-item niet onder zijn
  content-breedte en loopt de rij alsnog over.
- Elke conditionele kolom (iets dat alleen bij een bepaalde instelling of filter
  verschijnt) telt mee in die som. Reken de rij door met alle optionele elementen
  zichtbaar.

Zie `.pl-row-end` en `.pl-repo` in `src/features/prs/prlist.css` als voorbeeld van het
patroon dat werkt.
