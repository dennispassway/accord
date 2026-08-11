# Handoff: ontwerpvragen voor een openspec-run (D1-D3)

Werkstroom 4 van de flow-audit van 2026-08-02. Volledige context:
https://claude.ai/code/artifact/3de789ce-b56b-42a5-9683-a217494040c2

Dit zijn productbesluiten, geen bugs: het proposal moet ze expliciet
beantwoorden, niet stilzwijgend voorbeslissen. Huidige stand met
code-referenties per vraag.

## D1 - afkap op 50 PR's per bucket

Huidig: `first: 50` per search, zonder paginering en zonder signaal
(`src/lib/github/queries.ts:25,28,31`); boven de 50 verdwijnen PR's stil.

1. Pagineren tot alles binnen is, of een zichtbare "lijst afgekapt bij
   50"-indicator, of de limiet gewoon verhogen?
2. Als pagineren: geldt de huidige query-zwaarte (statusCheckRollup +
   agentCommits per PR) dan nog, of moet de query eerst lichter?

## D2 - onomkeerbare acties zonder rem

Huidig: (a) `m` merget direct, zonder bevestiging of undo; expliciet zo
ontworpen (`src/features/prs/MergeSection.tsx:42-46`); (b) uitloggen is één
klik zonder confirm (`src/features/settings/SettingsSheet.tsx:341-347`);
(c) "Open op GitHub" op een ⌘A-selectie opent tientallen tabs zonder drempel
(`src/features/prs/Cockpit.tsx:575-577`).

3. Blijft merge-zonder-bevestiging het ontwerp (snelheid boven veiligheid),
   en zo ja: volstaat de guard-fix uit werkstroom 2 (B5, shortcuts uit bij
   open menu's), of komt er alsnog een lichte rem (undo-toast van ~5 s,
   confirm alleen bij multi-select of P1)?
4. Krijgt uitloggen een bevestiging of een undo?
5. Komt er een drempel op bulk-tabs openen (bv. confirm boven N=5)?

## D3 - persistentie-model en REBASE

Huidig: merge-methode en settings overleven een herstart
(`MergeSection.tsx:9,92`, `src/lib/settings.ts:51,84`); sorteermodus,
repo-filter, zoekopdracht en selectie niet (`Cockpit.tsx:70-73`). REBASE
bestaat in state en labels maar staat niet in het keuzemenu
(`MergeSection.tsx:17-21`): wie hem ooit in localStorage kreeg kan hem niet
meer wegkiezen.

6. Welke werkcontext hoort persistent te zijn: sorteermodus? repo-filter?
   zoekopdracht? (selectie waarschijnlijk niet)
7. Is REBASE gewenst (dan in het menu opnemen) of dode code (dan uit
   state/labels verwijderen en bestaande localStorage-waarde migreren)?

## Afbakening

- Raakt bij implementatie `MergeSection.tsx`, `Cockpit.tsx` en
  `queries.ts`: overlap met werkstromen 1 en 2, dus besluiten hier pas
  implementeren nadat die zijn geland.
- Verwacht resultaat van de openspec-run: per vraag een besluit met
  rationale, en pas daarna een implementatieplan.
