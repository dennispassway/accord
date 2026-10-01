# Een uitleg in de UI komt uit de functie die beslist

Geldt voor: `src/features/prs/DetailPanel.tsx`, `Checklist.tsx`, `AgentActionButton.tsx`,
`mergeChecklist.ts`, `MergeSection.tsx`, `Cockpit.tsx`, en elke reden, hint of
sneltoets-label in `src/**` die beschrijft wat een handler elders doet

Het detailpaneel toont veel tekst over beslissingen die ergens anders vallen: waarom
mergen niet kan, waarom geen agent kan draaien, welke toets een run start. Rekent de
weergave die beslissing zelf nog eens uit, dan zijn er twee waarheden. Elke kant klopt op
zichzelf, dus geen test merkt het als ze uit elkaar lopen; de gebruiker ziet een reden
die niet de echte is, of een toets die iets anders doet dan de knop waar hij op staat.

- **Lees de reden uit de beslisser.** De melding onder Agents komt uit
  `planAgentAction(...).unavailableReason`, niet uit een eigen combinatie van
  `disabledReason`-aanroepen.
- **Een sneltoets-hint belooft dat de toets precies die knop indrukt.** De R-handler in
  `Cockpit.tsx` start altijd `preferredReviewer` in `settings.review.primaryMode`.
  `AgentActionButton` toont de R daarom alleen als de voorkeursagent op de knop staat, en
  `Checklist.tsx` geeft de knop dezelfde modus mee. Pas je een van beide kanten aan, reken
  dan de andere na.
- **Kan de weergave de beslisser niet aanroepen, toets dan de leden en niet het aantal.**
  `mergeChecklist` bouwt zijn regels naast `mergeReasons` in plaats van eruit. Een
  invariant-test die alleen het aantal blokkerende regels vergelijkt blijft groen als de
  checklist het verkeerde punt rood maakt, zolang het totaal klopt. De invariant in
  `mergeChecklist.test.ts` noemt daarom per geval de sleutels die blokkeren. Een nieuwe
  blokkade in `mergeReasons` krijgt daar een eigen geval, ook in een combinatie met een
  andere.
- **Nog open:** de toast bij R komt uit `agentStartBlockedReason` (`Cockpit.tsx`), een
  kopie van `disabledReason` in `DetailPanel.tsx` met dezelfde teksten. Wijzig je een
  reden of komt er een bij, trek die twee dan eerst samen tot één functie.

Zelfde familie als `union-lijst-uit-record.md`: een tweede, handgeschreven versie van iets
dat al ergens vastligt loopt stil achter, en de typechecker ziet het niet.
