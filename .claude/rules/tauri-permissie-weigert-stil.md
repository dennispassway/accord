# Een ontbrekende Tauri-permissie faalt zonder een spoor

Geldt voor: `src-tauri/capabilities/**`, en elke nieuwe aanroep van een
Tauri-commando vanuit `src/**` of `index.html`

Elk commando dat de webview naar Rust stuurt gaat langs de ACL uit
`src-tauri/capabilities/default.json`. Staat de bijbehorende permissie daar niet,
dan weigert Tauri de aanroep: de knop doet niets, de Rust-log blijft leeg, en er
faalt geen test. Zo stond `data-tauri-drag-region` in de markup terwijl het
venster niet te verslepen was, want `core:default` bevat
`core:window:allow-start-dragging` niet.

- **`core:default` is veel smaller dan het lijkt.** Het `core:window`-deel is
  vrijwel alleen getters (`is-maximized`, `inner-size`, `title`) plus
  `allow-internal-toggle-maximize`. Alles wat het venster echt beweegt, sluit of
  verplaatst hoort er los bij.
- **De geldige identifiers haal je uit een expres foute.** Zet een verzonnen
  permissie in de capability en draai `cargo check`: de fout somt alle bestaande
  op. Dat is korter dan zoeken in de docs en het klopt met de tauri-versie die
  hier staat. Prefix cargo met de `TAURI_CONFIG`-override, anders struikelt de
  build eerst over de allowlist-check.
- **Een groene `cargo check` bewijst alleen dat de identifier bestaat**, niet dat
  het de goede is. Het gedrag zelf moet je in de draaiende app aanwijzen.
- **Zoek bij "het staat er maar het doet niets" naar een zustercommando dat wél
  werkt.** Dubbelklikken op de sleepstrook maximaliseerde het venster wel, want
  dat pad gebruikt `internal_toggle_maximize` en die zit in de default. Dat
  verschil wijst de ACL aan als oorzaak en niet de CSS of de markup.

Zelfde vorm als `github-http-via-rust.md`: de grens tussen webview en Rust slikt
informatie die je nodig hebt om de fout te begrijpen.
