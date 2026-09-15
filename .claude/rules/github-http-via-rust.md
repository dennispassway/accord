# GitHub-verkeer loopt via Rust, niet via de fetch van de webview

Geldt voor: `src/lib/github/**`, `src-tauri/src/github.rs`

Elke aanroep naar GitHub gaat door `tauriFetch` (`src/lib/github/tauriFetch.ts`), dat het
Rust-commando `github_request` aanroept. De globale `fetch` ziet er in een nieuwe call
site vanzelfsprekender uit en lijkt ook te werken, maar levert twee problemen op die pas
bij een gebruiker opvallen:

- WKWebView gooit elke mislukte load op dezelfde `TypeError: Load failed`. Een
  onvindbare hostnaam, een verbinding die tijdens het lezen van de body wegvalt en een
  door de CSP geblokkeerde aanvraag zijn daar niet uit elkaar te houden, dus kan de UI er
  geen melding en geen retry-beleid op baseren. reqwest kent de oorzaak wel en stuurt
  hem als `kind` mee.
- De CSP staat alleen `https://api.github.com` toe. Het diff-endpoint antwoordt met een
  redirect naar een andere host: via de webview wordt die geblokkeerd, via reqwest
  gevolgd.

Verder:

- Een nieuwe `TransportErrorKind` in `src-tauri/src/github.rs` hoort in dezelfde
  wijziging in `KIND_FROM_RUST` (`tauriFetch.ts`) te landen. Zonder die kant valt het
  kind stil terug op `unknown` en is de reden weg zonder dat iets faalt.
- `tauriFetch` negeert de `signal` uit de init: de timeout staat in Rust. Een call site
  die op afbreken rekent moet dat daar regelen, niet met een `AbortSignal`.
- De body loopt over dezelfde verbinding als de headers. Omhul dus ook
  `response.json()` en `response.text()` met `withNetworkError`, niet alleen de fetch
  zelf, anders ontsnapt precies het geval waarin het antwoord binnenkwam en de
  verbinding daarna wegviel.

Dit is dezelfde vorm als `git-fout-classificatie.md`: een generieke fout uit een lagere
laag geef je niet door als één diagnose.
