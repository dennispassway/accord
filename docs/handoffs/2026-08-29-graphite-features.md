# Handoff: notificaties, auto-rebase en stapel-merge

Drie features uit het goedgekeurde redesign-canvas ("Accord cockpit-voorstellen",
zie de projectmemory `accord-cockpit-redesign-canvas`) die bewust buiten de
visuele redesign-PR (#11) zijn gehouden omdat het nieuwe functionaliteit is.
Het visuele deel is al gemerged; deze handoff gaat alleen over gedrag.

## Werkwijze (gaat vóór de standaard-afspraak)

- Werk per feature in een eigen worktree op een `claude/*`-branch en lever per
  feature een PR met screenshots (vóór/ná waar zichtbaar). Dit wijkt bewust af
  van de "direct op main"-afspraak: features 2 en 3 doen git-operaties op echte
  repo's en verdienen een reviewbare PR.
- Volgorde: feature 2 (auto-rebase) eerst, feature 3 (stapel-merge) bouwt erop.
  Feature 1 (notificaties) is onafhankelijk en kan parallel.
- TDD voor alle beslislogica (welke PR's rebasen, keten-volgorde, wanneer
  notificeren): test eerst rood, dan implementeren. Fixtures blijven fictief
  (acme/octocat, zie `accord-besluiten`): NOOIT echte klant- of repo-namen.
- Visuele/flow-QA via de mockmodus (`http://localhost:1420/?mock=app`, poort is
  strict; zie memory `visuele-qa-mockmodus`). Git-gedrag test je met een
  wegwerp-testrepo met een gestapelde branch-keten, niet tegen echte repo's.
- Groen vereist vóór elke commit: `pnpm typecheck`, `pnpm lint` (bij "terminated
  abnormally (possibly out of memory)": valse rtk-melding, hercheck via
  `rtk proxy pnpm lint`), `pnpm test`, `pnpm knip`. Rust-kant: cargo staat kaal
  op het PATH (memory `cargo-via-brew-rustup`); draai ook `cargo test` als je
  `src-tauri` raakt.

## Feature 1: macOS-notificaties

Accord meldt via een systeemnotificatie, alleen als het venster niet gefocust is:

1. Agent-run afgerond: "Claude is klaar met #594 · 2 opmerkingen, 1 fix-commit"
   (agent, PR-nummer, comment-/commit-aantallen uit de run); ook bij "gefaald".
   Aanhaakpunt: de status-overgangen in `src/features/agents/useAgentRuns.ts`.
2. CI-omslag naar rood op een eigen PR, gedetecteerd bij een refresh
   (`usePrs`-snapshotvergelijking: was pending/success, is nu failure).
3. Merge voltooid vanuit Accord.

Uitvoering: `tauri-plugin-notification` (Tauri 2); permissie-flow netjes
afhandelen (eerste keer vragen, geweigerd = stil overslaan). Klik op de
notificatie brengt het venster naar voren en selecteert de betreffende PR als
dat haalbaar is; minimaal het venster focussen. Instelling "Notificaties"
(aan/uit) in de instellingen-sheet onder de nieuwe sectie Weergave-achtige
opzet, default aan, persistentie via het bestaande settings-patroon
(`src/lib/settings.ts`, incl. leeg-/default-afhandeling en tests). In de
mockmodus geen echte notificaties sturen; log ze daar naar console zodat QA ze
kan zien.

Acceptatie: notificatie verschijnt bij een afgeronde mock-run met het venster
op de achtergrond; geen notificatie bij focus; toggle uit = stil; alle drie de
triggers gedekt door tests op de beslislogica (niet op het plugin-call-niveau).

## Feature 2: auto-rebase van stapels na een merge

Na een merge (vanuit Accord) van een PR die onderin een stapel zit, rebaset
Accord de bovenliggende PR's automatisch, zodat de stapel niet vastloopt op de
oude base.

- Detectie van de keten bestaat al: `src/lib/github/stacks.ts`
  (`buildStackChain`, `computeStackInfo`).
- Uitvoering in Rust naast de bestaande worktree-machinerie in
  `src-tauri/src/agents.rs`: verse worktree, `git rebase --onto <nieuwe-base>
  <oude-base> <branch>`, push met `--force-with-lease`. GitHub retarget de
  PR-base zelf al bij een merge; de rebase ruimt de meegelifte commits op.
- Conflictgeval: rebase afbreken (`git rebase --abort`), worktree opruimen, en
  in de UI melden welke PR handmatig aandacht nodig heeft; NOOIT half
  gerebasede staat pushen.
- Instelling "Auto-rebase stapels" (aan/uit, default aan) via het
  settings-patroon. In het detailpaneel van een stapel-PR een regel die de
  instelling weergeeft (zie het canvas: toggle-regel in de stapel-kaart).
- UI-feedback: tijdens het rebasen een status op de stapel-kaart; daarna
  ververst de lijst.

Acceptatie: in een lokale testrepo met keten main←A←B←C merge je A; B en C
staan daarna gerebased op main respectievelijk B, zonder oude commits; bij een
geforceerd conflict blijft alles onaangeroerd en toont de UI de melding; toggle
uit = geen rebase. Beslislogica (welke branches, welke volgorde, oude/nieuwe
base) volledig in geteste TS/Rust-functies.

## Feature 3: merge stapel in volgorde

Eén actie op een stapel-PR die de hele keten van onder naar boven merget, met
CI-bewaking per stap.

- Knop "Merge stapel in volgorde (N)" in de stapel-sectie van het detailpaneel
  (zie canvas), alleen actief als de onderste PR mergebaar is.
- Loop per stap: merge de onderste onggemergde PR (bestaande merge-methode en
  -voorkeur uit `MergeSection`/`src/lib/github/merge.ts`), wacht de
  auto-rebase van feature 2 af, poll de CI van de volgende PR tot groen
  (interval ~30s, respecteer de bestaande refresh-machinerie), merge de
  volgende, enzovoort.
- Stopcondities: rode CI, changes requested, conflict of een mislukte rebase
  stoppen de keten met een duidelijke melding welke stap bleef staan; al
  gemergde stappen zijn gewoon klaar (geen rollback). Annuleerknop tijdens het
  wachten.
- Voortgang zichtbaar op de stapel-kaart (stap x van N, waar hij op wacht).

Acceptatie: in de mockmodus is de knop zichtbaar op een stapel-PR en toont de
voortgangs-states (te mocken); in een lokale testrepo-keten van 3 merget de
actie alle drie in volgorde met tussentijdse rebases; een geforceerd rode CI op
stap 2 stopt de keten na stap 1 met de juiste melding.

## Referenties

- Canvas met de uitgewerkte UI (stapel-artboard en notificatie-voorbeeld):
  https://claude.ai/code/artifact/839afbe5-7bbb-4261-abd2-cad4b40ccee5
- Redesign-PR met de huidige stijltokens en paneel-anatomie: #11.
- Memories: `accord-cockpit-redesign-canvas`, `accord-besluiten`,
  `visuele-qa-mockmodus`, `cargo-via-brew-rustup`.
