# Changelog

## [1.3.1](https://github.com/dennispassway/accord/compare/v1.3.0...v1.3.1) (2026-09-23)


### Opgelost

* **agents:** geef git de aangevulde PATH mee zodat Git LFS-hooks werken ([66b70f6](https://github.com/dennispassway/accord/commit/66b70f647b90c2e80f875606053f429167109caa))
* **agents:** laat reviews op LFS-repo's starten vanuit de Finder-app ([cb691b8](https://github.com/dennispassway/accord/commit/cb691b8a897a1f0fe7d470be64b7856c1ae8812c))

## [1.3.0](https://github.com/dennispassway/accord/compare/v1.2.0...v1.3.0) (2026-09-23)


### Nieuw

* **agents:** bewaar de volledige runlog en meld gepushte en lokale commits ([ca5beb8](https://github.com/dennispassway/accord/commit/ca5beb8d25fb2c5ddd9fcf3510efaa3dec420d37))
* **agents:** samenvatting per run en volledig uitklapbare log ([92a57cb](https://github.com/dennispassway/accord/commit/92a57cbbac8ea77bbcc661a56e4e053c779ad7a3))
* **auth:** toon waarom je uitgelogd bent en laat inloggen annuleren ([0ea0c4c](https://github.com/dennispassway/accord/commit/0ea0c4c397a707ed3749f47d7f521553f9ff25f3))
* **cockpit:** koppel indeling, review, snooze en runs aan cockpit en detailpaneel ([2b0af73](https://github.com/dennispassway/accord/commit/2b0af730fd4acf874adf44078175bd7df18b8fc1))
* **detail:** goedkeuren, changes vragen en reageren vanuit de app ([3232a67](https://github.com/dennispassway/accord/commit/3232a670abe04427850ce822ef19ca725db17824))
* **github:** beantwoord, sluit en heropen review-threads ([90f7304](https://github.com/dennispassway/accord/commit/90f7304c42d617a1815fa9c11a3aa1f1a6416a11))
* **github:** gedeelde helper voor GraphQL-mutaties ([4f3ec09](https://github.com/dennispassway/accord/commit/4f3ec09f56806c60792cdeabf82b4b4567704a4a))
* **github:** haal mergeStateStatus en het aantal open threads op ([d804884](https://github.com/dennispassway/accord/commit/d804884aa51b1346738bf83c8f21883033b74368))
* **github:** plaats een review via addPullRequestReview ([45831fa](https://github.com/dennispassway/accord/commit/45831fae44c26af416d003071a1a38fc18e9597b))
* **inspector:** reageer op threads en toon reacties als markdown ([d87f23d](https://github.com/dennispassway/accord/commit/d87f23d689157745b6f30a6996e417a76e308b28))
* **prs:** probleem-pill, inklapbare Later-sectie en snooze in het rechtsklikmenu ([1dd1706](https://github.com/dennispassway/accord/commit/1dd17061f836afcea14ca8a06bf0001127f39372))
* **prs:** secties op rol, 'Wacht op review' en 'Later' ([66cfa55](https://github.com/dennispassway/accord/commit/66cfa552a99bab02360b85e91fd66961532dddfa))
* **prs:** snooze-logica met Amsterdamse tijden ([547603b](https://github.com/dennispassway/accord/commit/547603b0623ceded5366c9e6fa53b6e18fb312eb))
* **prs:** verversbeleid voor een verborgen venster en J/K-navigatie ([814b2db](https://github.com/dennispassway/accord/commit/814b2db5d3e16500fa3a7aac235fceea56fd0b8d))
* **settings:** instelling voor de automatische lessen-run na een fix ([27892f8](https://github.com/dennispassway/accord/commit/27892f82964c96bd4acf81b6d7899f2a608d57de))
* **tauri:** sta het openen van een map in Finder toe ([d024061](https://github.com/dennispassway/accord/commit/d024061e0206abd7219158d5c65e3cc770ba08aa))


### Opgelost

* **agents:** logopruiming volgt geen symlink of map van een ander account ([a889c27](https://github.com/dennispassway/accord/commit/a889c2704aba5e58badd3aacc6c823d5e9602f62))
* **agents:** logpaneel per run opnieuw mounten zodat een volledige log niet onder een andere PR blijft staan ([7fca86a](https://github.com/dennispassway/accord/commit/7fca86ade426859ba84968d1571f3c80c68d4453))
* **auth:** een geannuleerde login pollt niet door na een mislukte poll ([edae15b](https://github.com/dennispassway/accord/commit/edae15b6aecc64e9ae180915452e8cddfd73d9f5))
* **detail:** klikbare statuschip houdt de chip-opmaak ([8930de6](https://github.com/dennispassway/accord/commit/8930de6c2e353ef5f663fc3ea480a6121a2f54b4))
* **prs:** bepaal de status van een PR vanuit jouw rol ([84987b4](https://github.com/dennispassway/accord/commit/84987b486bd74775f989e24e1112109f45f58fae))
* **prs:** eigen snoozetijd op een DST-nacht valt niet een uur verschoven ([4c327e1](https://github.com/dennispassway/accord/commit/4c327e1faf15a0cc40ec545b2f83a310ae3b8f03))
* **prs:** L ingedrukt houden snoozet geen reeks PR's en rekent morgen vanaf de echte klok ([bd0a46c](https://github.com/dennispassway/accord/commit/bd0a46c623faf77ee110993ac0afffa30f5c4fad))
* **prs:** Later-knop houdt zijn label bij één geselecteerd project ([8876d2d](https://github.com/dennispassway/accord/commit/8876d2d660eab959b80cb7f425b93a02aeb9b6ec))
* **prs:** Later-kop in de stijl van de andere secties, korte terugkomtijd in de rij ([86969cf](https://github.com/dennispassway/accord/commit/86969cf4eef89319ab1a5d4fafedf01b1414a7b6))
* **prs:** Later-rijen niet meer als li binnen een li ([0d9f7a3](https://github.com/dennispassway/accord/commit/0d9f7a380b1973b4d28b0ca3f4ea1adf7783590b))
* **prs:** refetch na een threadmutatie overschrijft geen nieuwere detail of die van een andere PR ([dfd294b](https://github.com/dennispassway/accord/commit/dfd294ba76a0f0dec5dc8bd5a9791bc589f452cd))
* **prs:** snooze-picker krijgt focus en weigert een inmiddels verstreken moment ([9641a9c](https://github.com/dennispassway/accord/commit/9641a9cbe904fd4344294b10b0c6b750101f18b8))
* **prs:** voorkom een render-loop via het opschonen van snoozes ([14fc79c](https://github.com/dennispassway/accord/commit/14fc79c73bab76e15bb1bd5f964f6cdf5f71c036))
* **settings:** toon de uitkomst van 'Map zoeken' en voeg de lessen-schakelaar toe ([0da6ecd](https://github.com/dennispassway/accord/commit/0da6ecdcd8df943d24e9c9e5c790f76dcdb15d9c))

## [1.2.0](https://github.com/dennispassway/accord/compare/v1.1.1...v1.2.0) (2026-09-21)


### Nieuw

* **agents:** preferredFixer kiest de tegenhanger van de laatste reviewer ([83b1e5a](https://github.com/dennispassway/accord/commit/83b1e5a46c9ec1e635abfae68173f778a1c66521))
* **detail:** aparte fixkaart met eigen agentkeuze naast de reviewkaart ([29e6139](https://github.com/dennispassway/accord/commit/29e6139ddc2e29099f243a3c7ebcabaa4a911619))


### Opgelost

* **detail:** laat flex het agent-log niet tot 0px knijpen op een laag venster ([3208525](https://github.com/dennispassway/accord/commit/32085251e485b4f0d92d94d8bf56cd1556a1a223))

## [1.1.1](https://github.com/dennispassway/accord/compare/v1.1.0...v1.1.1) (2026-09-20)


### Opgelost

* **agents:** laat een commentsOnly-run falen als er geen review geplaatst is ([12962aa](https://github.com/dennispassway/accord/commit/12962aa457b5391a18e95160131864eb099d1144))

## [1.1.0](https://github.com/dennispassway/accord/compare/v1.0.0...v1.1.0) (2026-09-17)


### Nieuw

* **settings:** eigen model voor reviews zonder fixes ([03f33a3](https://github.com/dennispassway/accord/commit/03f33a3e6937a4b29047c2b4622b218f6f87da25))


### Sneller

* **agents:** laat de fix-modes groene CI vertrouwen ([3cf8f71](https://github.com/dennispassway/accord/commit/3cf8f71b5fdd9806d4d19a01dc1a61371c79b927))
* **agents:** richt het lezen in de review-modes op de diff ([ba8a876](https://github.com/dennispassway/accord/commit/ba8a876afb350955de9bee1fd3ef02864bad3c72))
* maak agent-review-runs goedkoper (CI-bewuste gates, diff-gericht lezen, model per modus) ([a6ea388](https://github.com/dennispassway/accord/commit/a6ea388f42f5e27226c357de079f8064360808de))

## [1.0.0](https://github.com/dennispassway/accord/compare/v0.11.0...v1.0.0) (2026-09-17)


### ⚠ BREAKING CHANGES

* **deps:** bump typescript naar 7
* **deps:** bump vitest en @vitest/coverage-v8 naar 5
* **deps:** bump vite naar 8 en @vitejs/plugin-react naar 6

### Nieuw

* verwijder prioritering (P1/P2) ([c42f3d4](https://github.com/dennispassway/accord/commit/c42f3d44d17e12c558fa94e710c331b2b41eacf4))


### Opgelost

* **prs:** open ook meer dan 5 PR's op GitHub ([e850dcb](https://github.com/dennispassway/accord/commit/e850dcb2b7caaafda6b8ecbe022cc52f6cb918dd))
* **prs:** open ook meer dan 5 PR's op GitHub ([08518fa](https://github.com/dennispassway/accord/commit/08518fa4f5c261881551d29dd4a84ed48557d5fd))
* **window:** sta start_dragging toe zodat het venster sleepbaar is ([062cb5f](https://github.com/dennispassway/accord/commit/062cb5ff067d9780a4fb479f3f23b0ca93493d77))


### Build

* **deps:** bump typescript naar 7 ([9634c24](https://github.com/dennispassway/accord/commit/9634c243f540dbfc52e06429c3cc08c6cdc6fd56))
* **deps:** bump vite naar 8 en @vitejs/plugin-react naar 6 ([c494950](https://github.com/dennispassway/accord/commit/c494950640d2d06a523c3f8de5a2ac11296816ce))
* **deps:** bump vitest en @vitest/coverage-v8 naar 5 ([687a4b4](https://github.com/dennispassway/accord/commit/687a4b41e5be360172c4f240039430fd2820ff2e))

## [0.11.0](https://github.com/dennispassway/accord/compare/v0.10.0...v0.11.0) (2026-09-15)


### Nieuw

* **github:** doe de HTTP-aanvragen in Rust in plaats van in de webview ([6156ea2](https://github.com/dennispassway/accord/commit/6156ea2e65f698be4f9f47b9502de5e8e98e2134))


### Opgelost

* **github:** vertaal netwerkfouten naar een leesbare melding ([6e1f1ef](https://github.com/dennispassway/accord/commit/6e1f1ef75d0b86857f5ae24395de0c024a537727))
* **prs:** probeer een mislukte refresh opnieuw voor je een banner toont ([49e6b7c](https://github.com/dennispassway/accord/commit/49e6b7c49336042c78e477fd101a81bd32777596))

## [0.10.0](https://github.com/dennispassway/accord/compare/v0.9.0...v0.10.0) (2026-09-15)


### Nieuw

* **prs:** kolombreedtes van de PR-lijst versleepbaar maken ([80c71bd](https://github.com/dennispassway/accord/commit/80c71bde34a0732ff3a3fceb92841e2814cf78e8))
* **prs:** PR-lijst als tabel met vaste kolommen en kopregel ([a2b4635](https://github.com/dennispassway/accord/commit/a2b46356b9e403777715c1d945d295c7315f5cd0))
* **prs:** zijbalk en detailpaneel versleepbaar maken ([befd8c8](https://github.com/dennispassway/accord/commit/befd8c8de6e7c16ac7a4a77c54167b7488c821cc))


### Opgelost

* **prs:** conceptpill op --text-2 zodat hij zijn eigen tint haalt ([0c1452d](https://github.com/dennispassway/accord/commit/0c1452dcc820fae5d019fb63fbbffaca1e3f7eb8))
* **prs:** één klik op een sleepgreep zette de kolom op zijn ondergrens ([4e2dab1](https://github.com/dennispassway/accord/commit/4e2dab1c132da710c848bd84b3c8e33b14f3aa8b))
* **prs:** meet de lijstbreedte met een ref-callback ([6eb2292](https://github.com/dennispassway/accord/commit/6eb2292e5c8ac8f1c1842a1ea19c60cc3b365717))
* **prs:** reken een sleepgreep na op de zichtbare breedtes ([e1024cb](https://github.com/dennispassway/accord/commit/e1024cbd673c1d38e30e736f0fc44eaff7830596))
* **prs:** sleepgreep stopt waar de titel zijn ondergrens raakt ([4dcfe73](https://github.com/dennispassway/accord/commit/4dcfe731d32cba8e3b2049ffb165d59d030e8de6))
* **prs:** verlies een sleep niet bij een afgebroken pointer ([7bb8beb](https://github.com/dennispassway/accord/commit/7bb8beba05d04453fc760e68505657118c1f8392))


### Onder de motorkap

* **prs:** leid de kolomsleutels van loadColumns af uit de defaults ([3e77203](https://github.com/dennispassway/accord/commit/3e772035846f83aab6db215e53b9c7056a6a8064))

## [0.9.0](https://github.com/dennispassway/accord/compare/v0.8.0...v0.9.0) (2026-08-30)


### Nieuw

* **ui:** dekkende Strak-kleuren en typografie uit het ontwerp ([304d37f](https://github.com/dennispassway/accord/commit/304d37f27a039d4e7f8daa1fc303e56a770f0aa6))
* **ui:** dekkende Strak-vlakken in plaats van vibrancy ([6c009e2](https://github.com/dennispassway/accord/commit/6c009e2c467f850a13d7dcfb15c94230f87f326f))
* **ui:** typografie en gewicht uit het Strak-ontwerp ([be6244d](https://github.com/dennispassway/accord/commit/be6244df22ad5c4da72da014930e0abeef740d90))

## [0.8.0](https://github.com/dennispassway/accord/compare/v0.7.0...v0.8.0) (2026-08-30)


### Nieuw

* **cockpit:** sidebar, detailpaneel en toolbar in de Strak-stijl ([1afb937](https://github.com/dennispassway/accord/commit/1afb9376ba8a049748820d8682f007e101589057))
* **cockpit:** Strak-design, meer contrast en iconen in licht en donker ([2be92ef](https://github.com/dennispassway/accord/commit/2be92ef1ef2c7544add25b8a1b74914f0d4b7cb3))
* **prlist:** sectiekoppen met iconen, getinte pills en selectierail ([fa274cb](https://github.com/dennispassway/accord/commit/fa274cbdfae331177cb017f9db57fd60e29ee6e2))
* **tokens:** verzadigder ok/err/warn in het lichte thema en --ok-ink ([c1436c8](https://github.com/dennispassway/accord/commit/c1436c8a0b3bb117c0dce5dcf383f4e24a3d4ec1))


### Opgelost

* **tokens:** lichte statuskleuren halen 4,5:1 op hun eigen tint ([7369412](https://github.com/dennispassway/accord/commit/7369412f8d0125fe15600a6cde1c940d33d5a626))

## [0.7.0](https://github.com/dennispassway/accord/compare/v0.6.0...v0.7.0) (2026-08-30)


### Nieuw

* **notificaties:** macos-systeemnotificaties bij run, ci-omslag en merge ([0046c2e](https://github.com/dennispassway/accord/commit/0046c2e6f653c66fec2288555937c1108113ff11))
* **notificaties:** systeemnotificaties bij run, ci-omslag en merge ([e7939b9](https://github.com/dennispassway/accord/commit/e7939b9646211877bcf67fc609a954e6a057f119))
* **prs:** auto-rebase van bovenliggende stapel-PR's na een merge ([7bf59fe](https://github.com/dennispassway/accord/commit/7bf59fe5789f0046177e01d20543ae3b1f6026a6))
* **prs:** auto-rebase van stapels na een merge ([76b8d5c](https://github.com/dennispassway/accord/commit/76b8d5c375879ae54635562fbf4a5c349b5d0429))
* **stacks:** tauri-commands voor het rebasen van stapel-branches ([0355e1f](https://github.com/dennispassway/accord/commit/0355e1f5ba4ab531c0f11eb08f7b0572cdaaf4e9))


### Opgelost

* **prs:** koppel de rebase-status aan repo plus PR-nummer ([77454b6](https://github.com/dennispassway/accord/commit/77454b6ee0b0fb0d0d018517db5afbfdbf3fd6ea))
* **stacks:** meld een gefaalde rebase alleen als conflict bij een echte stop ([0695869](https://github.com/dennispassway/accord/commit/069586904704d7fa720e84773ad26629ae2a4c10))

## [0.6.0](https://github.com/dennispassway/accord/compare/v0.5.0...v0.6.0) (2026-08-29)


### Nieuw

* **detail:** kaarten-anatomie voor het detailpaneel met getinte CI-kaart ([23eba31](https://github.com/dennispassway/accord/commit/23eba319d4b57b7e319ca1c75914e1c289a20caa))
* **prs:** dichte eenregel-rijen met status-pills en sectiekop-dots ([afa1a6e](https://github.com/dennispassway/accord/commit/afa1a6e305c4b2bfa045604cb5ee544a09317d94))
* **settings:** thema-keuze licht/donker/systeem met flashvrije load ([68fa738](https://github.com/dennispassway/accord/commit/68fa7389d76249300fb3e437d1e6c47b09ab2383))
* **sidebar:** deterministische kleurdot per repo ([3c82662](https://github.com/dennispassway/accord/commit/3c826624a162a14efb4e5dac73afd14048a93365))
* **ui:** cockpit-redesign met dichte rijen, kaarten-detailpaneel en thema-keuze ([3a87372](https://github.com/dennispassway/accord/commit/3a8737259408554b63406cfc5901150e25d8f7f0))
* **ui:** redesign-tokens (kaarten, knop-gradients, koelere chrome) en witte toolbar-controls ([499db85](https://github.com/dennispassway/accord/commit/499db8560042544f72f2cb6b197b0f48a7bb4789))


### Opgelost

* **prs:** laat het rechtercluster krimpen zodat de reponaam afkapt ([1caa4fa](https://github.com/dennispassway/accord/commit/1caa4fa4f0241ecd85c5b6e39e231bf79cca6466))
* **theme:** laat de bootstrap-listener de thema-keuze niet overschrijven ([0e43ee0](https://github.com/dennispassway/accord/commit/0e43ee0194c3e2b2e57a47ca05cb1bb771b84d24))

## [0.5.0](https://github.com/dennispassway/accord/compare/v0.4.0...v0.5.0) (2026-08-20)


### Nieuw

* **agents:** lessen-run landt na een fix-run op de PR-branch zelf, met rem op CLAUDE.md-groei ([c7d8614](https://github.com/dennispassway/accord/commit/c7d8614f1a0141934efabbb561a7109f9d0d5e5d))
* **agents:** lessen-run landt na een fix-run op de PR-branch zelf, met rem op CLAUDE.md-groei ([452f1b1](https://github.com/dennispassway/accord/commit/452f1b1bff13b74bd0520b70e405964eae1d9b0d))

## [0.4.0](https://github.com/dennispassway/accord/compare/v0.3.1...v0.4.0) (2026-08-20)


### Nieuw

* **agents:** start automatisch een lessen-run na een geslaagde fix-run ([f465bb8](https://github.com/dennispassway/accord/commit/f465bb8d293180e896df8414876bd81fa758e96b))
* **agents:** withFixes leest bestaande review-threads en beide fix-modes resolven verwerkte threads ([e5be789](https://github.com/dennispassway/accord/commit/e5be78951b097181d761a303d10a9ab9f3a70ff7))
* **prs:** fix-modes ook in het contextmenu en tooltip bij Lessen vastleggen ([0c98906](https://github.com/dennispassway/accord/commit/0c98906a28af749d879b630494d500b5d4489546))
* **tray:** monochroom template-icoon met alleen de logo-pijl in de macOS-menubar ([4d64a02](https://github.com/dennispassway/accord/commit/4d64a02782b15524582b34b14be577df4d6efd8e))

## [0.3.1](https://github.com/dennispassway/accord/compare/v0.3.0...v0.3.1) (2026-08-13)


### Opgelost

* **linux:** venster opaak maken zodat de WebView op Linux zichtbaar is ([#4](https://github.com/dennispassway/accord/issues/4)) ([7860be7](https://github.com/dennispassway/accord/commit/7860be78d277b12dd3f75b93e55f96c806fe5d26))

## [0.3.0](https://github.com/dennispassway/accord/compare/v0.2.0...v0.3.0) (2026-08-11)


### Nieuw

* **sidebar:** markeer projecten als favoriet en zet ze bovenaan ([65a272f](https://github.com/dennispassway/accord/commit/65a272fcc7f23b0c8ed35393c5bad4f7488e6bd4))


### Opgelost

* **agents:** laat een al bestaand testfalen de push niet blokkeren ([5282afa](https://github.com/dennispassway/accord/commit/5282afa92423383b88eb9df619cc22a841db7fa4))
* **ui:** centreer de iconen in knoppen met een vaste maat ([6b3e73f](https://github.com/dennispassway/accord/commit/6b3e73fb80a193732e95fc2c8a2a32829dd570c7))

## [0.2.0](https://github.com/dennispassway/accord/compare/v0.1.0...v0.2.0) (2026-08-11)


### Nieuw

* Accord, een native cockpit voor je GitHub pull requests ([418b45f](https://github.com/dennispassway/accord/commit/418b45f8da7715c795f3fe30ef9d193ecce5dd47))
