# Handoff: toetsenbord, gevaarlijke acties en feedback (B3-B7, U6-U12)

Werkstroom 2 van de flow-audit van 2026-08-02. Volledige context:
https://claude.ai/code/artifact/3de789ce-b56b-42a5-9683-a217494040c2

## Werkwijze

- **Geen PR's, geen worktrees**: direct op `main` in kleine conventional commits.
- Checks vóór elke commit: `pnpm typecheck && pnpm test && pnpm lint && pnpm knip`.
- TDD waar het logica betreft (selection, shortcuts-guard, bulk-telling);
  UI-gedrag verifiëren in de mockmodus `http://localhost:1420/?mock=app`
  (dev-server draait mogelijk al op strict poort 1420).
- Twee bevindingen zijn in de browser gereproduceerd (B3, B4); reproduceer ze
  eerst zelf ter controle en na de fix als bewijs.

## Bevindingen en geverifieerde root causes

### B3 (hoog, gereproduceerd) - pijltjesnavigatie dood tot de eerste muisklik
De arrow/Enter-handler hangt op `div.cockpit` met `tabIndex={0}`
(`src/features/prs/Cockpit.tsx:394-418`), maar niets focust dat element na
mount; focus staat op `body`. Repro: verse load → ArrowDown → selectie
beweegt niet (`document.activeElement === body`). `M`/`R`/⌘F werken wél
(window-listeners), wat het willekeurig laat aanvoelen.
**Acceptatie**: direct na start werken de pijltjes; focus komt op de cockpit
bij mount en keert daar terug na het sluiten van sheets/menu's.

### B4 (hoog, gereproduceerd) - bulkknop telt PR's die de zoekfilter verbergt
`Cockpit.tsx:545` geeft `allPrs={visiblePrs}` (pre-zoekfilter) aan
`BulkReviewButton` (`src/features/prs/BulkReviewButton.tsx:25-38`), terwijl de
lijst `filteredPrs` toont (`Cockpit.tsx:137-150`). Repro: zoek "sentry" → 2
rijen zichtbaar, knop zegt "(7)" en zou 7 runs starten.
**Acceptatie**: de teller en de gestarte set zijn exact de zichtbare lijst.

### B5 (hoog) - merge-/review-shortcuts actief terwijl menu's open staan
`Cockpit.tsx:161`: `shortcutsEnabled = !settingsOpen && !sortOpen` — het
contextmenu (`Cockpit.tsx:76`), het merge-methodemenu
(`src/features/prs/MergeSection.tsx:54`) en het agent-modusmenu
(`src/features/agents/AgentButtons.tsx:46` in `AgentButtons.tsx`) tellen niet
mee. Een kale `m` merget direct (`MergeSection.tsx:79-84`).
**Acceptatie**: met welk menu/popover dan ook open doen `m`, `r` en de
pijl-shortcuts niets; getest met een unit-test op de guard.

### B6 (middel) - selectie scrolt niet in beeld
Geen `scrollIntoView` in `src/` (grep 0 hits); `moveSelection`
(`src/features/prs/usePrSelection.ts:191-199`) muteert alleen state,
`PrList.tsx:95` zet geen ref.
**Acceptatie**: pijltjesnavigatie houdt de geselecteerde rij zichtbaar
(`scrollIntoView({block:"nearest"})`).

### B7 (middel) - sidebar-filter blijft hangen op een verdwenen repo
`selectedRepoId` (`Cockpit.tsx:70`) wordt nooit gecorrigeerd als de repo uit
`groups` verdwijnt; de sidebar rendert alleen repo's mét PR's
(`src/features/prs/Sidebar.tsx:47-63`). Resultaat: lege lijst "Niets te
reviewen" terwijl er PR's zijn, filter onzichtbaar en onophefbaar.
**Acceptatie**: verdwijnt de gefilterde repo, dan valt het filter terug op
"Alles".

### U6 (middel) - menu's muis-only; focus loopt uit de pas met selectie
Contextmenu (`src/features/prs/PrContextMenu.tsx:38-58`), sortmenu
(`src/features/prs/SortMenu.tsx:27-63`) en mergemenu
(`MergeSection.tsx:118-152`) hebben geen pijltjesnavigatie of focusherstel.
Na een klik houdt de rij-button DOM-focus terwijl pijltjes de selectie
verplaatsen: Enter herselecteert de oude rij én opent de nieuwe
(`Cockpit.tsx:415-417`). Lijst mist listbox-semantiek
(`src/features/prs/PrList.tsx:76-95`).
**Acceptatie**: menu's zijn met pijltjes/Enter/Escape bedienbaar en geven
focus terug; Enter werkt op de rij die geselecteerd oogt; de lijst heeft
`role="listbox"`/`option` met `aria-selected`.

### U7 (middel) - multi-selectie onzichtbaar in detailpaneel; contextmenu mist kernacties
Chip "N geselecteerd" staat alleen boven de lijst (`Cockpit.tsx:478-490`);
`DetailPanel` krijgt alleen `selectedPr` (`:517`). Contextmenu
(`PrContextMenu.tsx:90-101`) mist merge en "stop review".
**Acceptatie**: bij multi-selectie maakt het detailpaneel duidelijk dat acties
op N PR's slaan (of toont een multi-select-paneel), en het contextmenu dekt
minimaal dezelfde acties als het detailpaneel voor zover bulk-zinvol.

### U8 (laag) - shortcuts onvindbaar
Enige uitleg staat in het lege detailpaneel dat door auto-selectie nooit leeg
is (`src/features/prs/DetailPanel.tsx:187-198`,
`usePrSelection.ts:146-151`); dubbelklik-om-te-openen (`PrList.tsx:107`)
staat nergens.
**Acceptatie**: een vindbaar shortcut-overzicht (bv. `?`-toets of item in de
toolbar).

### U9 (hoog) - R doet stilzwijgend niets zonder CLI of repomap
`Cockpit.tsx:224-226` returnt zonder feedback. Het detailpaneel kent de reden
al (`DetailPanel.tsx:208-219`).
**Acceptatie**: R zonder CLI/map toont een toast met dezelfde reden-tekst.

### U10 (middel) - afgeronde agent-run onzichtbaar; lijst blijft stale
`src/features/agents/useAgentRuns.ts:149-168` muteert alleen state; geen
toast/notificatie, en comment-counts verversen pas bij de volgende tick.
**Acceptatie**: run klaar → toast (en optioneel systeemnotificatie als het
venster verborgen is) + een refresh van de PR-lijst.

### U11 (middel) - één fout, drie meldingen
Merge-fout verschijnt inline (`MergeSection.tsx:167`), als toast
(`Cockpit.tsx:387`) én als banner (`usePrs.ts:229-240` →
`Cockpit.tsx:463-477`); de re-throw op `Cockpit.tsx:388` bestaat alleen om de
inline-variant te voeden. Agent-fouten dubbel (`Cockpit.tsx:530-541`).
**Acceptatie**: per fout één kanaal: inline waar de actie plaatsvond, banner
alleen voor context-loze achtergrondfouten; geen dubbele meldingen.

### U12 (laag) - één toast-slot; bulk-feedback overschrijft zichzelf
`src/features/prs/Toast.tsx:22-26` vervangt de vorige toast;
`Cockpit.tsx:335-346` toast per mislukte PR; bulk-start meldt alleen wat
overgeslagen werd (`Cockpit.tsx:352-376`).
**Acceptatie**: bulk-uitkomsten gebundeld in één samenvattende toast
("5 gestart, 2 overgeslagen: ..."); fouten verdringen elkaar niet.

## Voorgestelde commit-knip (volgorde)

1. `fix(prs):` B3 (focus bij mount + focusherstel)
2. `fix(prs):` B6 (scrollIntoView)
3. `fix(prs):` B4 (bulkteller op gefilterde lijst) - met rode test eerst
4. `fix(prs):` B5 (shortcuts-guard dekt alle menu's) - met rode test eerst
5. `fix(prs):` B7 (filter-reset bij verdwenen repo)
6. `fix(prs):` U9 (toast bij stille R)
7. `feat(agents):` U10 (run-klaar-melding + refresh)
8. `refactor(prs):` U11 (één foutkanaal)
9. `feat(prs):` U12 (toast-bundeling bulk)
10. `feat(prs):` U6 (menu-toetsenbord + aria) - grootste stuk, evt. splitsen
11. `feat(prs):` U7, U8 als slotpolish

## Overlap-waarschuwing

Raakt `Cockpit.tsx`, `usePrs.ts`-consumers en `Toolbar.tsx`, net als
werkstroom 1 (login/refresh). Draai NA werkstroom 1, niet parallel. U10 raakt
`useAgentRuns.ts`, dat ook in werkstroom 3 (agent-lifecycle) wordt aangepast:
stem de volgorde af of beperk je hier tot de frontend-melding.

## Niet getriaged

- VoiceOver-gedrag is niet met een echte screenreader getest; de
  aria-bevindingen komen uit code-inspectie.
