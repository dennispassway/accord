# Een gefaalde git-aanroep zegt niet waaróm hij faalde

Geldt voor: `src-tauri/src/**`

Alles loopt via `run_git` (`src-tauri/src/agents.rs`), en die geeft één `Err(String)` terug
voor elke oorzaak: een echte git-fout, een onbekende sha of ref, een kapotte hook, en de
harde timeout die het proces met SIGTERM afbreekt. Een `is_err()` mag je dus nooit
vertalen naar één specifieke diagnose voor de gebruiker.

- Wil je een bepaalde toestand melden (een rebase die op een conflict stilstaat, een
  verlopen lease, een ontbrekende branch), toets dan de toestand zelf met een tweede,
  goedkope git-aanroep: `rev-parse --verify REBASE_HEAD` bewijst dat de rebase echt is
  blijven staan. Zonder dat bewijs geef je de git-fout door, niet je gok.
- Vraagt de melding de gebruiker om handwerk, dan is dat extra belangrijk: een verkeerde
  diagnose stuurt hem naar een worktree die op dat moment al opgeruimd is.
- Ruim in elk foutpad de worktree op en push niets, ongeacht welke tak je kiest.
- Zet bij zo'n classificatie een test die de andere tak afdwingt (bijvoorbeeld een geldig
  gevormde maar onbestaande sha), anders vangt de suite alleen het geval dat je verwachtte.
