# De `now` uit de render is niet het moment van de klik

Geldt voor: `src/features/prs/Cockpit.tsx`, `PrContextMenu.tsx`, `snooze.ts`,
`src/features/agents/AgentLogPanel.tsx`, en elke handler die een tijd berekent of toetst

`now` is hier altijd een momentopname. In `Cockpit` is het een minuten-tick, in
`AgentLogPanel` een tick van 30 seconden, in `PrContextMenu` het moment van de laatste
render. Dat is goed genoeg om te tonen en slecht als basis voor wat een handler beslist
of opslaat, want hij kan tot een minuut achterlopen. Vlak na middernacht maakt
`tomorrowAt9(now)` van "morgen" vandaag 09:00, en een moment dat bij de render nog in de
toekomst lag kan bij de klik verstreken zijn.

- **Toon met de tick, beslis met een verse klok.** Labels, `min` en `disabled` mogen `now`
  lezen. Wat een handler berekent, vergelijkt of wegschrijft neemt `new Date()` op het
  moment van de handeling.
- **`disabled` is geen controle.** Herhaal de check in de `onClick` tegen een verse klok,
  zoals de snooze-picker in `PrContextMenu` doet.
- **Zet `now` niet in de deps van een effect alleen om hem in een listener te lezen.** Dan
  hangt het effect elke minuut zijn listener opnieuw op en rekent de listener nog steeds
  met de oude tick. Lees de klok in de listener zelf.
- **Nog open:** de toast in `handleSnooze` (`Cockpit.tsx`) formatteert zijn label met
  `formatSnoozeUntil(untilIso, now)`. Reken dat na voor je die functie aanraakt.

De pure functies in `snooze.ts` krijgen `now` als parameter en zijn dus te testen; de
fout zit bij de aanroeper, die de verkeerde klok meegeeft.
