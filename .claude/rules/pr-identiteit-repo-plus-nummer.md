# Een PR-nummer is alleen uniek binnen zijn repo

Geldt voor: `src/**`

Accord toont PR's uit meerdere repo's naast elkaar, dus `#42` bestaat in elke repo
opnieuw. Elke vergelijking, lookup of stukje state dat een PR aanwijst hoort daarom op
`repoId` én `number` te matchen, nooit op het nummer alleen. Fout gaat dit meestal niet
stuk in de repo waar je test: het toont pas iets bij de verkeerde PR zodra dezelfde
nummers in twee repo's voorkomen.

- Bewaar je een PR als sleutel in state (statusmeldingen, selectie, caches), gebruik dan
  `${repoId}#${number}` via het bestaande `keyOfPr` (`src/features/prs/PrList.tsx`) of
  `prKeyOf` (`src/features/agents/useAgentRuns.ts`). Bevat een statusobject losse velden,
  neem `repoId` er dan naast `prNumber` in op en vergelijk allebei.
- Een lijst die per definitie binnen één repo blijft (een stapelketen, de zusters van de
  geselecteerde PR) mag op nummer matchen; leid dat dan af uit de bron die de lijst al op
  repo filtert, en niet uit de aanname dat het "toch dezelfde repo" is.
- Overleeft de state een PR-wissel (een melding die bewust blijft staan tot een volgende
  actie), reken dan expliciet door wat er gebeurt als de gebruiker naar een andere repo
  navigeert.
