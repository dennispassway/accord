# Een PR-nummer is geen identiteit

Geldt voor: `src/features/prs/**`, `src/lib/github/**`

De cockpit toont meerdere repo's naast elkaar en PR-nummers zijn per repo uniek, niet
globaal. Twee repo's met een PR #188 zijn geen uitzondering maar het normale geval zodra
iemand een tweede repo toevoegt.

- Elke state, notitie, cache-sleutel of vergelijking die een PR aanwijst gebruikt
  `repoId` + `number`, en bij voorkeur de bestaande sleutel `keyOfPr` uit
  `src/features/prs/PrList.tsx` (`${repoId}#${number}`, ook gebruikt door
  `prKeyOf` in `useAgentRuns.ts` en de mock-fixtures).
- Draagt een type alleen `prNumber` (zoals `StackRebaseStatus` in `StackRail.tsx`), dan
  is dat een bug in wording: zet `repoId` erbij zodra je zo'n type aanraakt, en vergelijk
  nooit op kaal `pr.number`.
- Dit valt niet op in tests of in de UI zolang je één repo geconfigureerd hebt. De fout
  toont zich als een label of voortgangsmelding die op de verkeerde kaart landt, of als
  een opruim-effect dat een melding levend houdt omdat een andere repo nog een PR met dat
  nummer heeft.
