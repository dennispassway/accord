# Een handgeschreven lijst van union-leden loopt stil achter

Geldt voor: `src/**`

Een `ColumnKey[]`, `SortMode[]` of `Mergeable[]` hoeft van TypeScript niet alle leden van
de union te bevatten. Zo'n lijst is dus door niets gedekt: je breidt het type uit, de
compiler zwijgt, Biome ziet niets, en de lijst slaat het nieuwe lid over. Deze lijsten
staan bijna allemaal op de plek waar dat het meest kost, namelijk het inlezen van
`localStorage` en het parsen van API-JSON, waar een onbekende waarde stil terugvalt op een
default. De gebruiker merkt het pas na een herstart, als zijn keuze weg is.

- Bestaat er al een `Record<K, ...>` met dezelfde sleutels, leid de lijst daaruit af:
  `Object.keys(DEFAULT_COLUMNS) as ColumnKey[]` in `cockpitPrefs.ts`. Het record dwingt
  volledigheid wel af, dus een nieuwe `ColumnKey` geeft meteen een typefout, op één plek.
- Is er geen record, maak er een: `const ALL: Record<SortMode, true> = { ... }` en daaruit
  de lijst. `as const satisfies readonly SortMode[]` helpt niet, dat toetst alleen dat elk
  element geldig is en niet dat ze er allemaal zijn.
- Nog zo'n lijst, elk met hetzelfde risico: `SORT_MODES` (`cockpitPrefs.ts`), `EFFORTS`
  (`src/lib/settings.ts`), `MERGEABLE_VALUES` (`src/lib/github/parse.ts`), `MENU_METHODS`
  (`MergeSection.tsx`).
- Is de lijst bewust een deelverzameling, schrijf dat er dan bij. `VALID_MODES` in
  `src/lib/mock/mode.ts` laat `"off"` weg en `SHRINK_ORDER` in `columnLayout.ts` laat het
  project weg, allebei met reden.
- De bijbehorende test loopt het record af en leest elk lid terug. Een test die één lid bij
  naam noemt blijft groen zodra er een lid bijkomt, en dat is precies het geval dat je
  wilde vangen.
