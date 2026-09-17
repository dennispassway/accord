# De PR-lijst is een tabel, geen krimpende flexrij

Geldt voor: `src/**/*.css`, `src/features/prs/columnLayout.ts`

De lijstrij verdeelde zijn ruimte met flex-shrink: elk element gaf naar rato toe,
en wie het hardst kromp verdween het eerst. Dat las als chaos, want de statuspill,
de avatar en de reponaam stonden per rij op een andere x. Sinds de kolomlayout
staat elke cel vast op zijn track en vangt alleen de titel op wat overblijft.

Wat dat betekent als je de rij aanraakt:

- **Breedtes staan in `columnLayout.ts`, niet in de CSS.** `DEFAULT_COLUMNS` en
  `COLUMN_BOUNDS` zijn de bron; `prlist.css` leest ze als `var(--col-*)` met een
  fallback. Verander je een getal alleen in de CSS, dan rekent `effectiveColumns`
  met de oude waarde en klopt het inklappen niet meer.
- **Een nieuwe kolom hoort in `effectiveColumns`.** Die functie telt de cellen en
  de gaps op en bepaalt daarmee wat de titel overhoudt. Een cel die je alleen in
  de JSX toevoegt telt niet mee, en dan loopt de rij op een smalle lijstkolom
  over de rand zonder dat een test afgaat.
- **Kop en rij delen dezelfde tracks.** `.pl-thead` en `.pl-row` lezen allebei de
  custom properties op `.pl-table`. Zet een breedte nooit rechtstreeks op een
  cel: dan lopen kop en rijen uit elkaar en is precies de uitlijning weg waar dit
  model voor bestaat.
- **Reken de smalste stand na.** De lijstkolom kan 384px worden (`LIST_MIN` in
  `panelLayout.ts`, de ruimte die overblijft op een venster van 940px met beide
  panelen open). `columnLayout.test.ts` toetst dat de rij daar past met alle
  optionele kolommen zichtbaar: het project en de stapelchip.
- **Inklappen gebeurt in JS, niet met een container query.** De breedtes komen
  als inline custom properties uit React en een inline waarde wint altijd van
  een stylesheet-regel, dus een `@container`-override zou stil niets doen.

De volgorde van inklappen staat in `effectiveColumns`: eerst het project terug
naar zijn stip, dan de status naar zijn icoon, dan de reactiekolom weg, dan de
omvangkolom, en als laatste de versleepbare kolommen terug naar hun ondergrens.
