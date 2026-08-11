# Handoff: automatische releases + in-app updater voor Accord

Context: Tauri 2-app (repo dennispassway/accord, macOS + Linux sinds PR #2). Er staat al een `.github/workflows/release.yml`: die bouwt op een v*-tag een GitHub Release (macOS dmg/app, Linux deb/rpm/AppImage); workflow_dispatch bouwt alleen artifacts. Details: PR #2 en de secties "Linux" en "Builden" in de README.

## 0. Fundament verifiëren (blokkerend)
- Check dat PR #2 gemergd is en draai eerst een handmatige run van de release-workflow (Actions > release > Run workflow) of push een testtag. De workflow heeft nog nooit gedraaid; de Linux x64- en macOS-builds in CI zijn onbewezen (lokaal is alleen arm64 in Docker bewezen). Fix eventuele CI-fouten vóór het updaterwerk.

## 1. In-app updater
- Voeg `tauri-plugin-updater` en `tauri-plugin-process` toe (Rust- én npm-kant; capabilities `updater:default` en `process:allow-restart`).
- Genereer een minisign-sleutelpaar met `pnpm tauri signer generate`. Private key + wachtwoord NOOIT in de repo: zet ze als GitHub-secrets `TAURI_SIGNING_PRIVATE_KEY` en `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, en laat Dennis ze ook in een wachtwoordmanager bewaren (sleutel kwijt = bestaande installs kunnen nooit meer updaten).
- tauri.conf.json: `bundle.createUpdaterArtifacts: true`, pubkey en endpoint `https://github.com/dennispassway/accord/releases/latest/download/latest.json` onder `plugins.updater`. tauri-action genereert latest.json automatisch zodra de updater actief is; geef de secrets als env mee aan de tauri-action-step.
- Update-UI in React, passend bij het bestaande design (tokens in src/App.css): check bij opstarten en daarna periodiek (zelfde ritme als refreshMinutes is prima); toon versie + release notes met knoppen "Update en herstart" en "Later". Downloaden + `relaunch()` via de plugin. Maak een mockmodus-variant (`?mock=update`) voor visuele QA.
- Valkuil macOS: de app is ad-hoc signed (`signingIdentity: "-"`). Onderzoek en documenteer of de updater een gedownloade update op macOS zonder notarisatie kan installeren (Gatekeeper/quarantine); zo niet, benoem de opties (Apple Developer-account, $99/jaar) expliciet in de PR in plaats van stil te laten falen.

## 2. Automatische releases
- Automatiseer versiebeheer met release-please (conventional commits zijn hier al de norm): release-PR met changelog; de merge maakt de v*-tag en de bestaande release.yml bouwt en publiceert.
- Zorg dat de versie in package.json, src-tauri/Cargo.toml en src-tauri/tauri.conf.json synchroon meebumpt (uitzoeken: tauri.conf.json kan mogelijk de package.json-versie volgen; anders release-please extra-files gebruiken).
- Laat de release notes uit de changelog in de release-body/latest.json landen zodat het updatescherm ze kan tonen.

## Buiten scope
- Windows-support (fase 2, het procesbeheer is unix-only) en het aanschaffen van code-signing-certificaten voor Windows of macOS.

## Werkwijze
Werk in een worktree op een claude/*-branch. Knip in twee PR's: (1) updater-plugin + UI, (2) release-please + versie-sync. TDD voor de update-check-logica; per PR typecheck, test, lint en knip groen; volg de git-commit-skill. Secrets nooit committen; alles wat een GitHub-secret of handmatige stap van Dennis vereist zet je als genummerd stappenlijstje in de PR-beschrijving.
