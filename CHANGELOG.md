# Changelog

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
