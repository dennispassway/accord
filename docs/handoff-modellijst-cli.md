# Handoff: modellijst uit de CLI lezen

Repo: `~/Projects/tools/accord` (Accord, Tauri 2 + React 19 + TS, platte CSS, vitest, biome). Werkwijze voor dit project: geen PR's en geen worktrees, kleine conventional commits direct op `main`. Draai vóór elke commit `pnpm typecheck`, `pnpm lint`, `pnpm test` en `pnpm knip` tot groen. Cargo staat niet op het default PATH: `env PATH="/opt/homebrew/opt/rustup/bin:$PATH" cargo ...` in `src-tauri`.

## Opdracht

Het instellingenblad (⌘,) toont per agent (Claude, Codex) een modellijst die nu hardcoded is in `src/lib/settings.ts` (`CLAUDE_MODELS = haiku|sonnet|opus`, `CODEX_MODELS = o4-mini|gpt-5|gpt-5-codex`). De designnotitie in `docs/design-v2/pr-cockpit-v2.dc.html` (regels 1244-1276, entry SettingsSheet) zegt: "De modellijst hoort in de echte app uit de CLI te komen in plaats van hardcoded." Bouw dat.

## Aanpak

1. **Ontdek eerst empirisch** wat de geïnstalleerde CLI's aan modeldiscovery bieden (alleen help-/listcommando's draaien, niets uitvoeren): `claude --help` en eventuele subcommands; `codex --help`, en bekijk ook `~/.codex/config.toml`-achtige config als de CLI daarnaar verwijst. Verwacht: mogelijk bestaat er géén nette "list models"-uitvoer; rapporteer wat je vindt vóór je bouwt en kies dan de betrouwbaarste bron.
2. **Rust-command**: nieuwe Tauri-command in `src-tauri/src/` (naast `agents.rs`, waar ook de CLI-detectie voor `clis` woont) die per agent de beschikbare modellen teruggeeft. Time-out kort (enkele seconden); bij falen of onparseerbare uitvoer een lege lijst teruggeven, nooit hangen.
3. **Frontend**: `src/lib/settings.ts` houdt de huidige hardcoded lijsten als FALLBACK. `SettingsSheet` (`src/features/settings/SettingsSheet.tsx`) toont de CLI-lijst zodra die geladen is (invoke bij openen van het blad, één keer per sessie cachen); is de opgeslagen modelkeuze niet meer in de lijst, laat hem dan staan met een markering in plaats van hem stil te resetten.
4. **Mockmodus** (`?mock`, zie `src/lib/mock/mode.ts`): geen Tauri beschikbaar, dus daar altijd de fallback-lijst gebruiken; de bestaande mock-guards in de hooks laten zien hoe.
5. **Tests**: unit-tests voor de parse van de CLI-uitvoer (Rust) en voor de fallback-logica (TS). Nieuwe tests eerst rood laten falen om de juiste reden.

## Grenzen en valkuilen

- Verander de `Settings`-persistentievorm (`localStorage["pr-cockpit.settings"]`, versieveld) niet zonder migratie.
- `start_agent_review` accepteert al `model`/`effort` en geeft ze door aan de CLI's; daar hoeft niets aan te veranderen.
- Raak nooit een bestand of commando aan met `.env` in de naam (hook blokkeert dat).
- Rapporteer aan het eind: gevonden discovery-mechanisme per CLI, gekozen bron, en wat niet kon.
