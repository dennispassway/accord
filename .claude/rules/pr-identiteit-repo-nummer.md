# Een PR-nummer is geen identiteit

Geldt voor: `src/**`

De cockpit toont meerdere repo's naast elkaar en PR-nummers zijn per repo uniek, niet
globaal. Twee repo's met een PR #188 zijn geen uitzondering maar het normale geval zodra
iemand een tweede repo toevoegt. Fout gaat dit meestal niet stuk in de repo waar je test:
het toont pas iets bij de verkeerde PR zodra dezelfde nummers in twee repo's voorkomen.

- Elke state, notitie, cache-sleutel of vergelijking die een PR aanwijst gebruikt
  `repoId` + `number`, en bij voorkeur de bestaande sleutel `keyOfPr` uit
  `src/features/prs/PrList.tsx` (`${repoId}#${number}`, ook gebruikt door
  `prKeyOf` in `src/features/agents/useAgentRuns.ts` en de mock-fixtures). Bevat een
  statusobject losse velden, neem `repoId` er dan naast `prNumber` in op en vergelijk
  allebei.
- Draagt een type alleen `prNumber`, dan is dat een bug in wording: zet `repoId` erbij
  zodra je zo'n type aanraakt, en vergelijk nooit op kaal `pr.number`. `StackRebaseStatus`
  in `StackRail.tsx` was zo'n type en draagt inmiddels allebei.
- Een lijst die per definitie binnen één repo blijft (een stapelketen, de zusters van de
  geselecteerde PR) mag op nummer matchen; leid dat dan af uit de bron die de lijst al op
  repo filtert, en niet uit de aanname dat het "toch dezelfde repo" is.
- Overleeft de state een PR-wissel (een melding die bewust blijft staan tot een volgende
  actie), reken dan expliciet door wat er gebeurt als de gebruiker naar een andere repo
  navigeert.
- Dit valt niet op in tests of in de UI zolang je één repo geconfigureerd hebt. De fout
  toont zich als een label of voortgangsmelding die op de verkeerde kaart landt, of als
  een opruim-effect dat een melding levend houdt omdat een andere repo nog een PR met dat
  nummer heeft.
