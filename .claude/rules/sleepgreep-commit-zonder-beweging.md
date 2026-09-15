# Een sleepgreep legt vast wat je hem als breedte meegeeft

Geldt voor: `src/features/prs/ResizeHandle.tsx`, `columnLayout.ts`, `panelLayout.ts`,
`useColumnWidths.ts`, `usePanelWidths.ts`, `PrList.tsx`, `Cockpit.tsx`

`handlePointerUp` roept `onCommit` ook aan na een pointerdown/up zonder beweging: `widthAt`
valt dan terug op de `width`-prop. Eén klik op een greep schrijft dus een waarde naar
`localStorage` terwijl de gebruiker niets versleepte. Daar volgen twee dingen uit.

- **Geef de bewaarde keuze door als `width`, niet de toegepaste breedte.** De lijst en de
  panelen scheiden bewust wat de gebruiker koos van wat er op dit venster past
  (`useColumnWidths` tegenover `effectiveColumns`, `committed` tegenover `clampPanels`).
  Krijgt de greep de toegepaste, al ingeknepen waarde, dan maakt die ene klik het knijpen
  permanent. `PrList.grip` geeft `columns[column]` door en zit dus goed; de panelen in
  `Cockpit.tsx` geven `panels.*` door, de uitkomst van `clampPanels`, dus daar staat dit
  nog open. Reken het na voor je die greep aanraakt.
- **Een berekende bovengrens mag nooit onder de huidige breedte zakken.** Die `max` gaat
  naar `aria-valuemax` en clampt in de aanroeper ook elke commit. Geeft de functie op een
  krappe stand de ondergrens terug in plaats van de huidige breedte, dan zet één klik de
  kolom op zijn smalst en staat `aria-valuenow` boven `aria-valuemax`. `maxColumnWidth`
  begint daarom bij `current` en telt de speling er hoogstens bij op.

Toets zo'n grens op de smalste stand en niet op een ruim venster. Op `LIST_MIN` (384px) is
`fullTitleRoom` al ruim negatief vóórdat `effectiveColumns` iets heeft ingeklapt, en daar
zitten deze randgevallen; op de standaardbreedte blijft alles groen.
