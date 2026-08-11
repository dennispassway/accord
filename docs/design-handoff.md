# Handoff-prompt: PR Cockpit design uitwerken

Deze prompt is bedoeld om in een aparte designsessie (Claude, artifact-modus) het
volledige ontwerp uit te werken. De uitkomst komt daarna terug in deze repo en wordt
geimplementeerd; `docs/design.md` is de huidige spec en wordt door de uitkomst
vervangen of bijgewerkt.

---

Je bent design lead voor **PR Cockpit**, een macOS-desktopapp die ik dagelijks gebruik
om pull requests te reviewen. Ik wil dat je het volledige interfaceontwerp uitwerkt als
een zelfstandige HTML-artifact die ik daarna 1-op-1 kan porten naar de echte app.

## Wat de app doet en voor wie

Ik ben developer en laat veel code schrijven door AI-agents (Claude en Codex). Daardoor
review ik de hele dag PR's over tientallen repo's van mijn eigen account en van de
organisatie waar ik werk. GitHub's eigen overzicht werkt niet voor mij: alles staat door
elkaar, gesorteerd op status in plaats van op project, en ik zie niet welke PR eerst
gemerged moet worden.

De app haalt alle open PR's op waar ik reviewer of assignee ben, plus mijn eigen PR's,
groepeert ze **per project**, en geeft per PR snelle acties: laten reviewen door Claude
of Codex (alleen comments, of comments plus gepushte fixes), prioriteit zetten,
en mergen. De agent draait lokaal in een aparte git-worktree en zijn output streamt live
in de app.

Het is een **werkinstrument dat de hele dag open staat**, geen presentatiepagina. Ik scan
het met mijn ogen en bedien het met het toetsenbord. Dichtheid en rust zijn belangrijker
dan grote koppen. Referenties die ik mooi vind: Raycast (zachte afgeronde rijen,
toetsenbord-eerst), OrbStack (dichtheid zonder rommel), Ulysses (rustige typografie),
en de PassWall-app (getint glas, twee-regelige rijen).

## Wat ik al heb (en waarom ik verder wil)

De app werkt en heeft een eerste designronde gehad: drie kolommen (projecten, PR-lijst,
detailpaneel), overlay-titlebar met macOS-vibrancy, amber accent, PR-rijen op twee
regels. Het voelt nog niet zo af als de apps hierboven. Ik wil dat je het ontwerp echt
uitwerkt: hierarchie, ritme, iconografie, de statustaal, en alle toestanden die ik in de
praktijk tegenkom.

## Harde technische randvoorwaarden

Het ontwerp moet implementeerbaar zijn in de bestaande app, dus:

- **React met platte CSS** (geen Tailwind, geen component-library, geen CSS-in-JS). Lever
  je tokens als custom properties op `:root`, en per component klassen die ik direct kan
  overnemen.
- **Strikte CSP: geen externe requests.** Geen Google Fonts, geen CDN, geen remote
  afbeeldingen. Systeemfonts (`-apple-system`, `ui-monospace`) of een font als inline
  data-URI. Iconen als **inline SVG met `currentColor`**, geen icon-library.
- **Vibrancy-venster**: de achtergrond is doorschijnend en toont de bureaubladachtergrond
  van de gebruiker. Panelen zijn dus halftransparante lagen over een onbekende backdrop:
  contrast en leesbaarheid moeten kloppen op zowel een lichte als een donkere wallpaper.
- **Beide themes volwaardig**: dark is het hoofdontwerp, light net zo verzorgd. Schakelen
  gaat via `prefers-color-scheme` plus overrides op `:root[data-theme="dark"|"light"]`.
- **Minimale venstergrootte 940x600**, standaard 1100x720. Het ontwerp moet daar allebei
  goed uitzien; brede content (branchnamen, logs) mag nooit horizontaal laten scrollen
  behalve in zijn eigen container.
- **Toetsenbord-eerst**: pijltjes door de lijst, Enter opent op GitHub, cmd+F zoeken,
  cmd+R verversen, Escape leegt het zoekveld. Focus moet altijd zichtbaar zijn.
- `prefers-reduced-motion` respecteren.
- Alle teksten in het **Nederlands**, en gebruik **geen em-streepjes**.

## De data die echt beschikbaar is

Ontwerp alleen met deze velden; verzin geen data die de app niet heeft.

Per PR: project (`owner/repo`), nummer, titel, url, head-branch, base-branch, auteur
(mens of agent, en welke agent: claude of codex), CI-status (groen, rood met een lijst
gefaalde checknamen, bezig, of geen checks), reviewstatus (review gevraagd, goedgekeurd,
changes requested, geen), draft ja/nee, mergebaar (kan, conflicten, onbekend),
prioriteit (P1, P2 of geen; wordt als GitHub-label opgeslagen), aanmaakdatum en
laatst-bijgewerkt (weergeven in Europe/Amsterdam), aantal toegevoegde en verwijderde
regels, en of het een review-verzoek aan mij is, ik assignee ben, of ik de auteur ben.

Per PR ook stackinformatie: positie in de stack, stackgrootte, en de nummers van de PR's
die eerst gemerged moeten worden. Een stack ontstaat als de base-branch van PR B de
head-branch van PR A is.

Per project: naam en aantal PR's. Verder: mijn GitHub-login, of de Claude- en Codex-CLI
lokaal beschikbaar zijn, of de lokale map van een project gekoppeld is, en per lopende
agent-run de status en de logregels.

## Wat ik van je wil

Werk de volgende toestanden allemaal uit, in dark en light. Zet ze in een artifact onder
elkaar met een kort kopje per toestand, zodat ik ze kan vergelijken.

1. **Hoofdvenster, "Alles"-weergave**: sidebar met "Alles" plus projecten met aantallen,
   PR-lijst met projectkoppen, detailpaneel. Vul de lijst met realistische variatie: een
   P1 met rode CI, een stack van drie PR's, een PR van een agent-auteur, een draft, een
   PR waar een agent op dit moment aan reviewt, en een gewone PR zonder bijzonderheden.
2. **Hoofdvenster, één project geselecteerd** (geen projectkoppen, wel de projectnaam in
   de context).
3. **Toolbar**: leeg zoekveld, en actief zoekveld met een resultaat-indicatie.
4. **Detailpaneel in vijf toestanden**: (a) normale PR met stack-visualisatie, CI en
   acties, (b) PR die niet gemerged kan worden met de redenen zichtbaar, (c) de
   merge-bevestigingsstap met keuze tussen squash en merge commit, (d) een lopende
   agent-run met live log en stopknop, (e) een project waarvan de lokale map nog niet
   gekoppeld is (met de zoek- en handmatige-pad-optie).
5. **Lege en foutstaten**: niets te reviewen, geen zoekresultaten, aan het laden, en een
   fout met een opnieuw-proberen-knop. Ook: een schrijffout (prioriteit of merge
   mislukt) die de lijst intact moet laten.
6. **Loginschermen**: nog geen client-ID geconfigureerd, uitgelogd, en de device-flow
   met de code die ik op github.com moet invoeren.

Ontwerp daarbij expliciet:

- De **statustaal**: hoe CI, reviewstatus, draft, prioriteit, stackpositie en
  agent-activiteit naast elkaar leesbaar blijven zonder dat een rij een kerstboom wordt.
  Kies wat altijd zichtbaar is en wat alleen in het detailpaneel hoort.
- De **hierarchie van acties**: mergen, prioriteit zetten, agent laten reviewen en zelf
  openen op GitHub staan alle vier in het detailpaneel. Maak duidelijk wat de primaire
  actie is en hoe een uitgeschakelde actie zijn reden toont.
- **Iconografie**: een kleine, consistente set inline SVG's (leveren als code).
- **Typografie en ritme**: type-scale, gewichten, regelhoogtes, en de rijhoogte waarop
  de lijst rustig blijft bij 40 PR's.

## Vorm van de oplevering

Eén zelfstandige HTML-artifact met:

- een `:root`-tokenblok met alle kleuren, radii, spacing en type-scale, in beide themes;
- de uitgewerkte toestanden zoals hierboven, met echte Nederlandse content;
- de inline SVG's;
- onderaan een kort blok **implementatienotities**: welke klasse bij welk bestaand
  component hoort (`Toolbar`, `Sidebar`, `PrList`-rij, `DetailPanel`, `StackRail`,
  `PrioritySegmented`, `MergeSection`, `AgentButtons`, `AgentLogPanel`,
  `RepoPathSetup`), en waar je bewust afwijkt van wat ik nu heb en waarom.

Werk niet in vage richtingen maar in concrete waarden: als je een kleur of maat kiest,
noem hem. Ik ga het exact zo bouwen.
