# Statuskleuren staan als tekst op een tint van zichzelf

Geldt voor: `src/App.css`, `src/**/*.css`

De statuskleuren (`--ok`, `--err`, `--warn`, `--accent`, `--agent`) zijn in deze huid
tegelijk tekstkleur en achtergrond: sectiekop-icoon, count-pill, statuspill, statuschip en
prioriteitchip zetten de kleur op `color-mix(in srgb, currentColor 11%, transparent)`.
De echte achtergrond van die tekst is dus die tint, niet het paneel eronder.

- Reken een kleurtoken nooit alleen op de paneelachtergrond na. Een waarde die op wit
  ruim 4,5:1 haalt kan op zijn eigen 11%-tint onder 4,5:1 zakken, en juist daar staat de
  kleinste tekst (10-11px chips).
- `src/themeContrast.test.ts` gate't dit voor het lichte thema op precies 11%. Kies je
  voor een nieuwe drager een ander tintpercentage, dan valt die drager buiten de gate:
  houd 11% aan, of breid de test uit met de nieuwe waarde in dezelfde wijziging.
- Een nieuw statustoken hoort in de lijst in `themeContrast.test.ts`; de test leest de
  hex-waarden uit `App.css` en vindt een token dat er niet in staat niet vanzelf.
- Wil een test CSS als tekst inlezen, dan is `?raw` niet genoeg: vitest stubt CSS-imports
  naar een lege string tenzij het bestand in `css.include` (`vitest.config.ts`) staat.
