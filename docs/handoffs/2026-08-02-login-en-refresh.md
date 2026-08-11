# Handoff: login-foutpad en refresh-cluster (B8, B9, U13, B1, U1, U3, U2, B2, U4, U5, U14)

Werkstroom 1 van de flow-audit van 2026-08-02. Volledige context en severity-
onderbouwing: https://claude.ai/code/artifact/3de789ce-b56b-42a5-9683-a217494040c2
(codes hieronder verwijzen daarnaar).

## Werkwijze (afwijkend van de globale standaard)

- **Geen PR's, geen worktrees**: alles direct op `main` in kleine conventional
  commits (expliciet projectbesluit).
- Checks vóór elke commit: `pnpm typecheck && pnpm test && pnpm lint && pnpm knip`.
- TDD bij businesslogica: nieuwe test eerst rood, commit de rode test als
  checkpoint, fix in de implementatie (nooit de test verzwakken).
- UI verifiëren in de mockmodus: `http://localhost:1420/?mock=app` (dev-server
  draait mogelijk al; poort 1420 is strict, hergebruik hem). Geforceerde
  dark-mode oogt in een kale browser half toegepast door translucente tokens
  zonder macOS-vibrancy: opstellingsartefact, geen bug.

## Bevindingen en geverifieerde root causes

### B8 (kritiek) - loginfout is een doodlopende straat
`src/App.tsx:30` rendert bij `status === "error"` alleen `<p>Fout: ...</p>`;
het `LoginScreen` verschijnt niet en er is geen retry-knop. Dit pad is
gegarandeerd bereikbaar: de device-code verloopt na 15 min
(`src/features/auth/useAuth.ts:113,178`) en 5 mislukte polls landen er ook
(`useAuth.ts:127-130`).
**Acceptatie**: na een verlopen code of pollfout toont de app een scherm met
de foutmelding én een knop die een nieuwe device-flow start; geen herstart nodig.

### B9 (hoog) - "De browser is geopend op ..." is niet waar
`src/features/auth/LoginScreen.tsx:99-101` belooft een geopende browser, maar
nergens in het loginpad wordt er een geopend; de fallback is een
`<a target="_blank">` (`LoginScreen.tsx:113-120`) die in een Tauri-webview
vermoedelijk niets doet (niet getriaged: test dit eerst in de echte app). De
rest van de app gebruikt wél `openUrl` uit `@tauri-apps/plugin-opener`
(`src/features/prs/PrList.tsx:107`, `DetailPanel.tsx:396`).
**Acceptatie**: bij de start van de device-flow opent de browser echt (via
`openUrl`), de knop gebruikt `openUrl`, en de tekst klopt met het gedrag.

### U13 (laag) - flits van het uitlog-scherm bij elke start
`src/features/auth/useAuth.ts:27-33` begint op `loggedOut`; het token komt pas
een effect later (`:59-83`). Er is geen `checking`-status in
`src/features/auth/types.ts`.
**Acceptatie**: een ingelogde gebruiker ziet bij start nooit het loginscherm
(introduceer een `checking`-state die niets of een kale achtergrond rendert).

### B1 (hoog) - mislukte achtergrond-refresh wist de hele lijst
`src/features/prs/usePrs.ts:90-96` zet elke niet-auth-fout om in
`{status:"error"}`, en `src/features/prs/Cockpit.tsx:276-285` vervangt dan de
complete UI. De schrijfkant doet het goed: fout ernaast tonen zonder de lijst
te slopen (`usePrs.ts:153-161`).
**Acceptatie**: een refresh-fout terwijl er al data staat laat de lijst staan
en toont een banner (zoals `writeError`); het volledige foutscherm blijft
alleen voor de allereerste load.

### U1 (hoog) - geen refresh bij zichtbaar worden; tray-teller veroudert
Polling slaat ticks over bij `document.hidden` (`Cockpit.tsx:260-270`) maar
er is geen `visibilitychange`-listener die bij tonen ververst. Venster sluiten
= verbergen (`src-tauri/src/tray.rs:76-82`), dus dit is de normale toestand.
De tray-badge update alleen na een fetch (`src/features/prs/useTraySync.ts:30-37`),
die dan juist geblokkeerd is.
**Acceptatie**: app zichtbaar worden triggert een refresh (met een minimale
interval-guard, bv. niet vaker dan elke 30 s); de tray-teller loopt daardoor
weer bij zodra de gebruiker kijkt. Achtergrond-poll voor de tray mag, maar is
een plus, geen eis.

### U3 (middel) - geen refresh-indicator; lastUpdated wordt nooit getoond
`src/features/prs/Toolbar.tsx:112-120` heeft geen busy-state;
`usePrs.ts:52,64,87` zet `lastUpdated` dat nergens gerenderd wordt.
**Acceptatie**: tijdens een refresh is dat zichtbaar (spinner op de knop) en
de toolbar of statusregel toont hoe oud de data is ("2 min geleden").

### U2 (hoog) - koude start: blanco scherm plus seriële waterfall
Startvolgorde: keychain → REST `/user` (`useAuth.ts:62-71`) → Cockpit-mount
(`App.tsx:24-28`) → tweede keychain-read → PR-fetch (`usePrs.ts:73-83`). De
viewer-login kan gratis mee in de bestaande GraphQL-query
(`src/lib/github/queries.ts:23-34`). De laatste PR-lijst wordt nergens bewaard
(alleen settings, `src/lib/settings.ts:51,84`).
**Acceptatie**: (a) de PR-fetch start niet meer ná een aparte `/user`-call
(viewer in dezelfde GraphQL-query of parallel); (b) de laatst opgehaalde lijst
staat in localStorage en wordt bij start direct getoond met een refresh
eroverheen, met de versheids-indicator uit U3.

### B2 (middel) - merge: PR ploft terug in de lijst, knop blijft "bezig"
`usePrs.ts:244-251`: optimistische verwijdering gevolgd door `await load()`,
terwijl de zoek-API eventually consistent is (de eigen comment op regel
244-245 beschrijft het). De merge-knop en toast wachten de volledige refetch
uit (`src/features/prs/MergeSection.tsx:62-67,103`, `Cockpit.tsx:379-385`).
**Acceptatie**: na een geslaagde merge is de knop direct klaar en de toast
direct zichtbaar; een lokale "recent gemerged"-set filtert fetch-resultaten
zodat de PR niet terugflitst (verloopt na bv. 10 min of zodra de API hem niet
meer teruggeeft).

### U4 (middel) - overlappende refreshes, geen fetch-timeout
`usePrs.ts:61-97` heeft geen in-flight-guard of AbortController; interval, ⌘R,
toolbar, tray en post-merge kunnen tegelijk lopen. `fetchAllPrs` heeft geen
timeout (`queries.ts:113`); de Rust-kant wel (15 s, `src-tauri/src/auth.rs:17`).
**Acceptatie**: hooguit één load tegelijk (nieuwe aanvraag tijdens een lopende
mag samenvallen of de vorige aborten), en de fetch heeft een timeout van ~15 s
met een nette fout.

### U5 (middel) - geen rate-limit-afhandeling leespad; prioriteit = 4×N calls
`queries.ts:125-130` kent alleen 401 en een kale "403". De
`rateLimitNote`-helper bestaat al maar alleen op schrijfpaden
(`src/lib/github/labels.ts:45-51`, `merge.ts:20-26`, gedupliceerd).
`setPriority` doet altijd 4 sequentiële REST-calls inclusief een blinde
label-create die meestal 422 geeft (`labels.ts:148-161`, `:71`); bulk =
4×N (`Cockpit.tsx:329-338`).
**Acceptatie**: (a) één gedeelde rateLimitNote-helper, ook gebruikt door
`fetchAllPrs`, zodat een 403/429 een leesbare melding met wachttijd geeft;
(b) `setPriority` slaat DELETE's over voor labels die de PR niet heeft
(de PR-data bevat de labels al) en cachet per repo of het label bestaat.

### U14 (laag) - repo koppelen: zoekroot en hints kloppen niet
`src/features/agents/RepoPathSetup.tsx:30-32` scant hardgecodeerd
`~/Projects`, placeholder zegt `~/Code/...` (`:84`). Ontkoppelen kan niet
(`src/features/settings/SettingsSheet.tsx:310-320`).
**Acceptatie**: zoekroot(s) consistent met de hints (of instelbaar), en een
koppeling is te verwijderen.

## Voorgestelde commit-knip (volgorde)

1. `fix(auth):` B8 + U13 (foutpad met retry, checking-state)
2. `fix(auth):` B9 (openUrl in de device-flow)
3. `fix(prs):` B1 (refresh-fout als banner, lijst blijft staan)
4. `feat(prs):` U1 (visibilitychange-refresh met guard)
5. `feat(prs):` U3 (spinner + lastUpdated-weergave)
6. `perf(prs):` U2 (viewer in GraphQL-query + localStorage-snapshot)
7. `fix(prs):` B2 (recent-merged-filter, merge-knop direct klaar)
8. `fix(prs):` U4 (in-flight-guard + fetch-timeout)
9. `fix(github):` U5 (gedeelde rate-limit-helper + slimmere setPriority)
10. `fix(settings):` U14

## Overlap-waarschuwing

Deze werkstroom raakt `usePrs.ts`, `Cockpit.tsx` en `Toolbar.tsx`, net als
werkstroom 2 (toetsenbord/gevaarlijke acties). Draai ze NA elkaar, niet
parallel, of verdeel per bestand.

## Niet getriaged

- Werkt `target="_blank"` überhaupt in de echte Tauri-webview? Eerst testen.
- Rate-limit-gedrag is uit code afgeleid, niet tegen de echte API bewezen.
