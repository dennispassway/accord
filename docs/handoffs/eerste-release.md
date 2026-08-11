# Handoff: eerste installeerbare release van Accord (macOS + Linux)

Repo: `~/Projects/tools/accord`, publiek op `github.com/dennispassway/accord`.
Werkwijze hier: kleine conventional commits direct op `main`, geen worktree, geen
PR's tenzij ik erom vraag. Draai vóór elke commit `pnpm typecheck`, `pnpm lint`,
`pnpm test` en `pnpm knip` tot groen.

## Doel

Collega's met een Mac én collega's op Linux kunnen Accord downloaden, installeren,
inloggen en hun PR's zien. Eindproduct: een GitHub Release met werkende installers,
plus een kant-en-klaar bericht dat ik in Slack kan plakken (zie onderaan).

"Werkend" betekent expliciet: na installeren kan iemand die deze repo nooit gezien
heeft inloggen. Een release die niet kan inloggen is geen release.

## Wat er al staat

- `release-please.yml` houdt een release-PR bij; die merge maakt tag + GitHub
  Release en roept `release.yml` direct aan als reusable workflow (regel 32). Er is
  dus geen tag-trigger nodig en PR #1 (`chore(main): release 0.2.0`) staat open.
- `release.yml` bouwt op `macos-latest` en `ubuntu-22.04`, overschrijft de appversie
  uit de tag, en hangt de bundels aan de Release. `workflow_dispatch` bouwt zonder
  te releasen en hangt de bundels als run-artifact aan de run: gebruik dát om te
  testen, niet de echte release.

## Blokkers die je EERST oplost

1. **Login werkt niet in een gebouwde bundel.** `release.yml` geeft de
   tauri-action geen `VITE_GITHUB_CLIENT_ID` mee, terwijl `beforeBuildCommand`
   (`pnpm build` → `vite build`) die var op buildtijd nodig heeft; zonder hem is
   `GITHUB_CLIENT_ID` een lege string (`src/features/auth/config.ts:1`) en toont de
   app het "geen Client ID"-scherm. Een device-flow client ID is geen secret: zet
   hem als **repo variable** (`gh variable set VITE_GITHUB_CLIENT_ID --repo
   dennispassway/accord`) en geef hem mee in de `env` van de tauri-action-step
   (`${{ vars.VITE_GITHUB_CLIENT_ID }}`). Vraag mij om de waarde, of haal hem uit
   mijn lokale dotenv-bestand in de repo-root (dat mag jij niet lezen, dus vraag).
   Overweeg met mij of we hiervoor een aparte OAuth App "Accord" maken in plaats van
   mijn bestaande: collega's zien die naam in het autorisatiescherm.
2. **De signing-secrets staan niet op deze repo.** `TAURI_SIGNING_PRIVATE_KEY` en
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` staan op `dennispassway/pr-mac-app-archive`
   en zijn niet uitleesbaar. `bundle.createUpdaterArtifacts` staat op `true`, dus
   verifieer empirisch (dispatch-run) of de build zonder die secrets faalt of alleen
   de updater-artifacts overslaat: de comment in `release.yml:79` beweert het
   tweede, dat is niet getest. Heb ik de sleutel niet meer in mijn
   wachtwoordmanager, dan is een nieuwe gratis (er is nog geen enkele release):
   `pnpm tauri signer generate`, nieuwe pubkey in `tauri.conf.json:36`, beide
   secrets zetten met `gh secret set`.
3. **Intel-Macs krijgen niets.** `macos-latest` is arm64, dus de dmg draait niet op
   een Intel-Mac. Vraag mij of er collega's op Intel zitten. Zo ja: bouw universal
   (`--target universal-apple-darwin` in de action-args plus beide rust-targets
   installeren), of voeg een tweede matrix-entry toe. Zo nee: zet in het bericht
   expliciet "Apple Silicon".

## Stappen

1. Los blokker 1 op, commit als `ci(release): ...`.
2. Beslis blokker 2 en 3 met mij vóór je bouwt.
3. Draai een `workflow_dispatch`-run op `main` en download de artifacts. Dit is de
   test, niet de release: pas als deze bundels goed zijn ga je verder.
4. **Installeer de macOS-bundel echt** (`open` de dmg, sleep naar Applications,
   start hem) en verifieer: geen Gatekeeper-doodloper, loginscherm toont een
   device-code, na inloggen komen er PR's binnen. Lukt inloggen niet, ga terug naar
   stap 1. Vraag mij om de Linux-kant te testen als je geen Linux-machine hebt, of
   verifieer minimaal dat het `.deb`/`.AppImage` bestaat en de juiste versie heeft.
5. Documenteer de Gatekeeper-stap die je zélf nodig had in de README onder Install.
   De bundel is ad-hoc ondertekend (`signingIdentity: "-"`), dus verwacht "kan niet
   worden geopend" of "beschadigd"; `xattr -dr com.apple.quarantine
   /Applications/Accord.app` is de betrouwbare route, rechtsklik > Openen werkt niet
   altijd meer. Schrijf op wat je aantrof, niet wat de theorie zegt.
6. Merge release-PR #1. Volg de run (`gh run watch`) en verifieer met
   `gh release view v0.2.0` dat er een dmg, een deb, een rpm, een AppImage en (als
   blokker 2 dat oplevert) `latest.json` aan hangen.
7. Lever het aankondigingsbericht (zie onder) met de echte links, en zet het op mijn
   klembord met `pbcopy`.

## Acceptatiecriteria

- `gh release view v0.2.0` toont installers voor macOS en Linux.
- Jij hebt de macOS-app zelf geïnstalleerd en ingelogd, en de stappen die daarvoor
  nodig waren staan in de README.
- Een collega hoeft niets te bouwen, geen OAuth App aan te maken en geen dotenv te
  vullen: downloaden, openen, inloggen.
- Checks groen en de README klopt met wat je werkelijk deed.

## Niet doen

- De release forceren als inloggen nog niet werkt: liever geen release dan een
  release die collega's een loginscherm zonder client ID toont.
- `bundle.createUpdaterArtifacts` uitzetten om blokker 2 te omzeilen zonder dat met
  mij te bespreken: dan kunnen bestaande installaties nooit meer auto-updaten.
- De macOS-beperkingen in de README wegpoetsen. Ad-hoc signing blijft rammelen bij
  updates; dat hoort er eerlijk te staan.

## Aankondigingsbericht (vul de links in, hou de toon)

> **Accord 0.2.0 staat er** 🎉
>
> Alle PR's die op jou wachten in één venster, gegroepeerd per project, met
> stack-detectie, prioriteit als GitHub-label, reviews door Claude of Codex, en
> mergen zonder naar GitHub te gaan.
>
> Download: <link naar de release>
> Repo: https://github.com/dennispassway/accord
>
> **Mac** (<Apple Silicon of universal>): dmg openen, Accord naar Programma's
> slepen. macOS klaagt dat de app niet te verifiëren is, want hij is niet
> ondertekend met een Apple Developer-certificaat. Fix: `<het commando dat jij
> werkend zag>`
>
> **Linux**: `.deb`, `.rpm` of `.AppImage`. Je hebt een keyring nodig
> (gnome-keyring of kwallet) omdat je GitHub-token daarin wordt opgeslagen.
>
> Bij de eerste start log je in met een device-code op github.com. De app vraagt
> `repo`-scope omdat hij labels zet en merget; je token blijft in je eigen keychain
> en gaat nergens anders heen.
>
> Werkt iets niet: <hoe ze mij bereiken>
