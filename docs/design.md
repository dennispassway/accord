# Designspec PR Cockpit

Richting: **instrumentenpaneel, dark-first**. Dichtheid van OrbStack, zachte afgeronde
rijen van Raycast, getint glas in de sidebar zoals moderne Mac-apps. Geen generieke
bootstrap-look, geen emoji als icoon, geen volle-breedte platte rijen.

Twee dingen dragen het ontwerp: de **vibrancy-sidebar** die het venster native laat
aanvoelen, en **rij-typografie op twee regels** zodat je per PR in één blik titel,
project, auteur, CI en stack ziet.

## Tokens

Alle kleuren als custom properties op `:root`, dark als hoofdontwerp, light net zo
verzorgd. Beide themes via `prefers-color-scheme` plus `:root[data-theme=...]`.

### Dark (hoofd)

| Token | Waarde | Gebruik |
| --- | --- | --- |
| `--bg-base` | `#0B0F17` | vensterachtergrond achter de content |
| `--bg-panel` | `rgba(255,255,255,0.035)` | lijst- en detailpaneel over vibrancy |
| `--bg-elevated` | `#161E2C` | geselecteerde rij, inputs, log-paneel |
| `--bg-sunken` | `rgba(0,0,0,0.28)` | agent-log |
| `--line` | `rgba(255,255,255,0.07)` | scheidingslijnen |
| `--line-strong` | `rgba(255,255,255,0.13)` | randen van knoppen |
| `--text` | `#EAF0F8` | primaire tekst |
| `--text-2` | `#9AA7BC` | meta, labels |
| `--text-3` | `#67728A` | tertiair, placeholders |
| `--accent` | `#F0A020` | merk-accent (amber), selectie en primaire actie |
| `--accent-ink` | `#1A1206` | tekst op accent-vlakken |
| `--green` | `#46C48B` | CI groen |
| `--red` | `#FF6B6B` | CI rood, P1 |
| `--amber` | `#F5B942` | CI pending, P2 |
| `--purple` | `#A78BFA` | agent-activiteit |

Tints voor pills: `color-mix(in srgb, <kleur> 16%, transparent)`.

### Light

`--bg-base #F5F6F9`, `--bg-panel rgba(255,255,255,0.72)`, `--bg-elevated #FFFFFF`,
`--bg-sunken rgba(0,0,0,0.04)`, `--line rgba(0,0,0,0.08)`,
`--line-strong rgba(0,0,0,0.14)`, `--text #131A26`, `--text-2 #566076`,
`--text-3 #8A94A8`, `--accent #B26A00`, `--accent-ink #FFFFFF`,
`--green #1F8F5A`, `--red #C8383C`, `--amber #B07600`, `--purple #6D4FD6`.

## Metriek en typografie

- Venster: `titleBarStyle: "Overlay"` en `hiddenTitle: true`, content loopt door tot de
  rand; bovenste 34px is een `data-tauri-drag-region` sleepstrook.
- Sidebar 212px, rijen 30px hoog, radius 8, 8px binnenmarge (rijen raken de rand niet).
- Lijstkolom: rijen 46px, twee regels, radius 10, 6px horizontale inset, 2px tussenruimte.
- Detailpaneel 324px, 16px padding.
- Type: 15px detailtitel (600), 13px rijtitel (500), 12px meta, 11px labels in
  uppercase met `letter-spacing: 0.07em`. Systeemfont voor tekst, `ui-monospace` voor
  nummers, branches en logs. Getallen die uitlijnen krijgen `tabular-nums`.
- Radius: 6 klein (chips), 8 (sidebar, knoppen), 10 (rijen), 12 (panelen).

## Componenten

1. **Toolbar** (in de sleepstrook): zoekveld links van het midden (filtert op titel,
   repo en nummer), rechts de laatst-bijgewerkt-tijd in `--text-3` en een
   ververs-icoonknop. Zoekveld: `--bg-elevated`, radius 8, hoogte 28, 12px tekst,
   focusring in accent.
2. **Sidebar**: item = 6px statusdot, naam, aantal in een pill met `tabular-nums`.
   Actief item: `--bg-elevated`, tekst in `--accent`, dot gevuld. Bovenaan "Alles",
   daaronder de repo's; de projectnaam zonder owner-prefix (owner in de tooltip).
3. **PR-rij**, regel 1: prioriteitschip (P1 gevuld rood, P2 amber met rand), `#nummer`
   mono in `--text-3`, titel (ellipsis). Regel 2: projectnaam (alleen in "Alles"),
   auteur, agentchip bij een agent-auteur, stackchip `2/3`, CI als gekleurde dot met
   woord ("groen", "rood", "bezig"), en bij een lopende run een pulserende paarse chip.
   Geselecteerd: `--bg-elevated` plus 1px ring in `--line-strong`; hover: 6% wit.
4. **Detailpaneel**: kop met titel en `owner/repo #nummer` in mono; metaregel met
   `+toevoegingen` groen en `-verwijderingen` rood; branchregel `head → base` in mono,
   afgekapt met ellipsis en volledige waarde in de tooltip. Daaronder secties met
   11px uppercase labels.
5. **Stack-rail**: verticale lijn met een dot per PR, huidige PR gevuld accent en vet,
   voorgangers in `--text-2`; onder de rail "eerst #40 mergen" in `--amber` als er iets
   blokkeert.
6. **Knoppen**: primair (accent-vlak, `--accent-ink` tekst), secundair
   (`--bg-elevated` plus `--line-strong` rand), ghost (transparant, hover-vlak).
   Prioriteit als segmented control (P1 / P2 / Geen) met de actieve segment gevuld.
   Per agent een regel: agentnaam als chip, dan twee ghost-knoppen ("Alleen comments",
   "Comments + fixes"); de voorgestelde agent krijgt een accent-rand.
7. **Agent-log**: `--bg-sunken`, radius 10, 11px mono, max-hoogte 200px, kopregel met
   statusdot, label en een ghost "Stop". Auto-scroll naar onder.
8. **Statusdots**: 7px, met `box-shadow: 0 0 0 3px <tint>` zodat ze rustig oplichten.
9. **Lege staten**: gecentreerd, 12px in `--text-3`, met een korte volgende stap.

## Interactie

- Toetsenbord: pijl omhoog/omlaag door de lijst, Enter opent op GitHub, cmd+F focust
  het zoekveld, cmd+R ververst, Escape leegt het zoekveld.
- Focus is altijd zichtbaar: 2px accent-outline met 1px offset.
- Beweging: alleen 120ms hover- en selectie-overgang plus de pulserende agentdot; alles
  uit onder `prefers-reduced-motion`.
- Alle interactieve elementen zijn echte buttons met een `title` die de reden noemt
  wanneer ze disabled zijn.
