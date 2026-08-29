---
name: bootstrap-script-index-html
description: Het pre-mount script in index.html dupliceert settings-state, geldt bij index.html, src/lib/settings.ts en src/lib/theme.ts
globs: index.html, src/lib/settings.ts, src/lib/theme.ts
---

# Het inline script in index.html is een tweede lezer van de settings

Geldt voor: `index.html`, `src/lib/settings.ts`, `src/lib/theme.ts`

Het script in `index.html` zet `document.documentElement.dataset.theme` vóór React mount,
zodat er geen flash naar het systeemthema is. Twee eigenschappen maken het riskant:

- Het herhaalt de opslagsleutel (`"pr-cockpit.settings"`) en de vorm van het themaveld als
  losse literals, binnen een `try/catch` die fouten opslikt. Hernoem je `STORAGE_KEY`,
  verander je de opslagvorm of komt er een themawaarde bij, dan valt het script stil terug
  op de systeemvoorkeur zonder foutmelding: de flash is terug en niets faalt. Werk het
  script in dezelfde wijziging bij.
- Het script registreert een `matchMedia`-listener die na mount actief blijft; `applyTheme`
  in `src/lib/theme.ts` ruimt alleen zijn eigen listener op. Beide listeners schrijven naar
  hetzelfde `dataset.theme`. De listener uit `index.html` mag daarom niets vastleggen dat
  later kan wijzigen: hij leest de opgeslagen keuze bij elke aanroep opnieuw, zodat een
  latere keuze in de instellingen niet door een OS-wissel wordt overschreven.

Zelfde patroon bij elke nieuwe pre-mount bootstrap: lees vers, en spiegel de wijziging aan
de kant die de waarde echt bezit.
