# CLAUDE.md

Alleen niet-vanzelfsprekende zaken. Structuur, commando's en stack zijn af te leiden uit
`README.md`, `package.json` en `src-tauri/`.

## Vóór je een feature bouwt

Accord is live: releases staan op GitHub met `.dmg` (macOS aarch64) en `.deb`/`.rpm`/
`.AppImage` (Linux), MIT-licentie, gratis. De bottleneck is hier niet functionaliteit maar
bereik: er is nog geen kanaal dat gebruikers naar de app brengt.

Weegt een nieuwe feature op tegen distributie? Stel distributie voor als het antwoord nee
is. Zie `/marketing-maandag`. Concreet openstaand, in volgorde van opbrengst:

- De README is de landingspagina: screenshot of GIF bovenaan, in één zin wat het oplost,
  dan pas installatie.
- De app is ad-hoc signed en niet genotariseerd, dus macOS geeft bij eerste start een
  Gatekeeper-waarschuwing. Dat kost installaties; notariseren of het expliciet uitleggen in
  de README is een echte conversie-actie.
- Show HN en dev-kanalen pas nadat de README staat.

Achtergrond en het weekritme staan in de vault onder `00 Projecten/Accord/`.

## Docs

`docs/design.md` en `docs/design-v2/` beschrijven de UI-richting, `docs/handoffs/` bevat
losse overdrachten.

Bestandsspecifieke regels staan in `.claude/rules/`: lees het bijbehorende bestand
voor je CSS in `src/` of het bootstrap-script in `index.html` aanraakt, en voor werk in
`src/features/prs/` of `src/lib/github/` (PR-identiteit, meerstaps-remote-acties).
