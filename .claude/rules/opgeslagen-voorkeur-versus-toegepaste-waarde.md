# Een opgeslagen voorkeur is niet de waarde die geldt

Geldt voor: `src/features/prs/cockpitPrefs.ts`, `src/features/prs/panelLayout.ts`,
`src/features/prs/usePanelWidths.ts`

`loadPanels` trekt de opgeslagen breedtes alleen binnen `PANEL_BOUNDS`; de vensterbreedte
kent die laag niet. Pas `clampPanels` maakt ze passend op het venster van dit moment. Er
zijn dus twee waarden: de vastgelegde keuze (`committed`) en wat er op het scherm staat
(`panels`). Die lopen uiteen zodra het venster de keuze niet aankan, en juist dan gaat het
mis.

- Elke berekening die op de zichtbare toestand reageert (een sleepstap, een toetsstap, een
  reset) gaat uit van de toegepaste waarde, niet van de rauwe opslag. `panelsAfterDrag`
  neemt daarom `clampPanels(stored, windowWidth)` als basis. Reken je op de opslag, dan
  telt het andere paneel voor meer breedte dan het inneemt, blijft er geen ruimte over en
  springt het gesleepte paneel naar zijn ondergrens terwijl je het breder sleept.
- Schrijft een interactie terug naar de opslag, dan leg je de toegepaste verdeling vast,
  inclusief de knijping van het element dat je niet aanraakte. Zonder dat veert een
  losgelaten greep terug naar een verdeling die op dit venster nooit gehaald wordt.
- Een venstermutatie zelf raakt de opslag niet aan: dat is het punt van de scheiding. Houd
  die route en de interactie-route apart.
- Test het geval waarin de twee uiteenlopen, met een opslag die op het venster niet past
  (`{sidebar: 360, detail: 520}` op 940px in `panelLayout.test.ts`). Een test die alleen
  een passende opslag gebruikt is blind voor dit hele verschil, want daar zijn de keuze en
  de toegepaste waarde gelijk.

Zelfde patroon bij elke nieuwe voorkeur die een correctielaag op de omgeving krijgt: de
opslag is een wens, niet de toestand.
