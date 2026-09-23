# Een async antwoord kan landen nadat de gebruiker verder is

Geldt voor: `src/**`, elke hook of component die na een `await` of in een timer state zet

De effects hier ruimen hun eigen fetch op met een `cancelled`-vlag in de cleanup
(`usePrDetail`, `windowFocus.ts`). Werk dat vanuit een event handler start heeft geen
cleanup: een mutatie met refetch, een retry, een loginpoll die zichzelf opnieuw inplant.
Daar zet het antwoord de state, ook als er intussen een nieuwer verzoek liep of de
gebruiker naar een andere PR ging. Dan staat een opgeloste thread weer open, of de detail
van PR A onder PR B.

- **Twee vragen na elke `await`.** Is dit nog het laatste verzoek? Tel een volgnummer op
  in een ref en vergelijk (`mutationSeqRef` in `usePrDetail`, `generationRef` in
  `useAuth`). Hoort het nog bij hetzelfde onderwerp? Houd de huidige sleutel in een ref
  bij en vergelijk met de sleutel waarmee je begon (`currentKeyRef`). Een cache-write op
  de juiste sleutel mag doorgaan, de `setState` niet.
- **Ook in de `catch` en vóór een nieuwe timer.** Een poll die al onderweg was toen de
  gebruiker annuleerde faalt daarna en plant de volgende in. Een check alleen op het
  succespad laat precies dat pad lopen.
- **Lokale state die bij één onderwerp hoort krijgt een `key`.** Een component dat een
  uitgeklapte of zelf opgehaalde toestand bewaart, houdt die vast als de ouder alleen de
  prop verwisselt. `AgentLogPanel` staat daarom op `key={run.runId}`. De sleutel volgt
  dezelfde identiteit als in `pr-identiteit-repo-plus-nummer.md`.
- **Een test vangt dit hier niet.** Het project heeft geen jsdom of testing-library en de
  hooks worden niet los getest. Zet de reden in een comment naast de check, anders ziet
  de volgende opruimronde een overbodige `return`.
