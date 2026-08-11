# Handoff: agent-run-lifecycle in src-tauri (B10-B16, U15)

Werkstroom 3 van de flow-audit van 2026-08-02. Volledige context:
https://claude.ai/code/artifact/3de789ce-b56b-42a5-9683-a217494040c2

## Werkwijze

- **Geen PR's, geen worktrees**: direct op `main` in kleine conventional commits.
- Cargo staat niet op het default PATH: prefix met
  `/opt/homebrew/opt/rustup/bin` (bv. `/opt/homebrew/opt/rustup/bin/cargo test`
  in `src-tauri/`).
- Frontend-checks blijven gelden: `pnpm typecheck && pnpm test && pnpm lint && pnpm knip`.
- Rust-kant: `cargo test` en `cargo clippy` in `src-tauri/` vóór elke commit.
- Deze bevindingen steunen op code-trace, niet op live-reproductie (mock is
  read-only en start geen echte agents). Waar een fix riskant is: schrijf eerst
  een Rust-test of reproduceer gecontroleerd met een dummy-script als "agent".

## Bevindingen en geverifieerde root causes

### B10 (kritiek) - geen exit-handler: agents lopen door, worktrees en refs lekken
`src-tauri/src/lib.rs:7-31` registreert geen exit/cleanup-hook; "Afsluiten" in
de tray doet `app.exit(0)` (`src-tauri/src/tray.rs:53`). Lopende
`claude`/`codex`-processen worden niet gestopt en pushen door zonder UI. De
wait/cleanup-thread (`src-tauri/src/agents.rs:484-497`) sterft mee, dus per
run blijven achter: `$TMPDIR/pr-cockpit/<run-id>`, de geregistreerde
git-worktree in de repo van de gebruiker én de ref
`refs/pr-cockpit/<run-id>` (die wordt sowieso nooit opgeruimd). `git worktree
prune` bij een volgende run (`agents.rs:429`) helpt niet: de directory bestaat
nog.
**Acceptatie**: bij app-exit worden lopende runs gestopt (procesgroep, zie
B11) en worktrees/refs opgeruimd; oude zwerf-refs (`refs/pr-cockpit/*`) en
geregistreerde-maar-dode worktrees worden bij een volgende run alsnog
opgeruimd.

### B11 (hoog) - cancel kan stil falen; alleen SIGTERM op de directe child
Tussen commandostart en registratie in `AgentRuns` (`agents.rs:398-449` tot
`:477`) zit de hele `git fetch` + `worktree add`; een cancel in dat venster
faalt met "run X loopt niet" en de frontend slikt dat
(`src/features/agents/useAgentRuns.ts:110`, `void invoke` zonder catch)
terwijl de UI "cancelled" toont. `cancel_agent_review`
(`agents.rs:502-516`) stuurt alleen `kill` (TERM) naar de directe child: geen
procesgroep, geen SIGKILL-follow-up; kleinkinderen (node, git) blijven
draaien. Extra race: status "cancelled" kan later door `agent-done`
overschreven worden (`useAgentRuns.ts:95,155-165`).
**Acceptatie**: (a) een run is cancelbaar vanaf het moment dat de UI hem
toont (registreer vóór de fetch, of maak cancel-in-voorbereiding een nette
"annuleer bij eerstvolgende stap"); (b) stop = procesgroep-TERM met
KILL-follow-up na een grace-periode; (c) een gecancelde run kan niet meer
"done" worden; (d) een mislukte cancel is zichtbaar in de UI.

### B12 (hoog) - git zonder timeout of GIT_TERMINAL_PROMPT=0 hangt eeuwig
`run_git` (`agents.rs:241-256`) heeft geen timeout en zet
`GIT_TERMINAL_PROMPT=0` niet; `git fetch origin +refs/pull/N/head`
(`agents.rs:417-433`) op een repo met verlopen credentials wacht oneindig.
De run blijft eeuwig "reviewt" en kost een blocking-pool-thread.
**Acceptatie**: alle git-aanroepen draaien met `GIT_TERMINAL_PROMPT=0` en een
timeout (~60 s voor fetch); een timeout levert een leesbare fout in de UI.

### B13 (hoog) - runs bestaan alleen in React-state
`src/features/agents/useAgentRuns.ts:58`; geen `list_runs`-command of
server-side logbuffer in `agents.rs`. Na een webview-reload zijn lopende runs
onzichtbaar én onstopbaar; de log is weg (geen kopieerknop,
`src/features/agents/AgentLogPanel.tsx:57-59`).
**Acceptatie**: Rust is de bron van waarheid: een `list_runs`-command (+ een
gebufferde log per run, cap ~500 regels) waarmee de frontend na mount de
lopende/afgelopen runs herstelt; plus een kopieerknop op het logpaneel.

### B14 (middel) - worktree hard verwijderd: niet-gepushte commits weg
`agents.rs:489-490` ruimt de worktree op zodra het proces eindigt, ook als de
agent wél gecommit maar bewust niet gepusht heeft (precies wat de prompts
voorschrijven bij rode tests, `agents.rs:266-275`). Cleanup-fouten worden
genegeerd (`cleanup_worktree`, `agents.rs:349-359`, `let _ =`).
**Acceptatie**: vóór verwijdering checkt de cleanup op niet-gepushte commits;
zijn die er, dan blijft de worktree staan en meldt de run-uitkomst dat (pad
erbij). Cleanup-fouten worden gelogd richting de frontend-log.

### B15 (middel) - sync commands blokkeren de main thread
`get_token` (`src-tauri/src/auth.rs:143-150`, keychain-read, aangeroepen bij
elke load/prioriteit/merge via `src/features/prs/usePrs.ts:37,73,164,218`,
zonder cache), `check_agent_clis` (`agents.rs:104-110` + PATH-scan
`:52-77`) en `cancel_agent_review` (`agents.rs:502-516`, mutex + fork) zijn
sync `#[tauri::command]`s en draaien op de main thread.
**Acceptatie**: deze commands zijn async/`spawn_blocking`; het token krijgt
een in-memory cache met invalidatie bij logout.

### B16 (middel) - repo-paths.json niet-atomair; leesfout crasht stil
`src-tauri/src/repos.rs:35-40` schrijft direct (crash = corrupt bestand =
permanent alle koppelingen kwijt via `read_store`, `repos.rs:27`);
`get_repo_paths` wordt zonder catch aangeroepen
(`src/features/agents/useAgentRuns.ts:120`): unhandled rejection en elke run
faalt daarna met "Geen lokale map bekend" zonder oorzaak.
**Acceptatie**: write-to-temp + rename (atomair); een corrupt bestand geeft
een zichtbare fout + reset-pad i.p.v. stil falen; de frontend-call heeft een
catch met melding.

### U15 (laag) - log-streaming: één IPC-event en één array-kopie per regel
`agents.rs:464-475` emit per regel; `useAgentRuns.ts:144` kopieert per regel
de hele array. Spraakzame agents veroorzaken jank. `BufReader::lines()` is
ongebounded bij één gigantische regel (`agents.rs:465`).
**Acceptatie**: regels gebatcht (bv. flush per ~100 ms), regellengte gecapt,
en de frontend appendt batches.

## Voorgestelde commit-knip (volgorde)

1. `fix(agents):` B12 (GIT_TERMINAL_PROMPT=0 + timeouts) - klein, ontvlecht de rest
2. `fix(agents):` B11 (registratie vóór fetch, procesgroep-kill, status-race)
3. `feat(agents):` B13 (list_runs + logbuffer in Rust, frontend-herstel, kopieerknop)
4. `fix(agents):` B10 (exit-handler + opruimen zwerf-refs/worktrees)
5. `fix(agents):` B14 (worktree-behoud bij niet-gepushte commits)
6. `perf(tauri):` B15 (async commands + token-cache)
7. `fix(repos):` B16 (atomaire write + foutpad)
8. `perf(agents):` U15 (log-batching)

## Overlap-waarschuwing

B13 en U15 raken `useAgentRuns.ts`, dat in werkstroom 2 (U10, run-klaar-melding)
ook wordt aangepast: stem volgorde af. De Rust-bestanden zijn exclusief voor
deze werkstroom.

## Niet getriaged

- Alle B10-B16 zijn code-trace, niet live gereproduceerd; bouw waar zinvol een
  gecontroleerde repro met een dummy-agent-script.
- Tray-menu-herbouw bij elke refresh (`src-tauri/src/tray.rs:102`, mogelijk
  flikkeren van een openstaand menu): gezien, niet getriaged; alleen oppakken
  als het zich echt voordoet.
