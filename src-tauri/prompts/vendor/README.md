# Vendored review-lenzen

Ongewijzigde kopieën van review-instructies uit externe skill-collecties. Accord leest ze bij het bouwen in (`include_str!`) en geeft ze mee aan de review-agents, zodat de lenzen werken bij iedereen die Accord installeert, ook zonder die plugins.

Pas deze bestanden niet aan; hoe Accord ze inzet staat in de prompt-opbouw in `src-tauri/src/agents.rs`.

| Bestand | Bron | Versie | Licentie |
| --- | --- | --- | --- |
| `pstack/rubric.md`, `pstack/code-quality-review.md`, `pstack/lead-judgment.md` | https://github.com/cursor/plugins/tree/main/pstack/skills/interrogate/references (Lauren Tan) | commit `1b6d44ff26d4e242f4e8f68c391e6d2f7ca16def` | MIT, zie `pstack/LICENSE` |
| `ponytail/ponytail-review.md` (was `skills/ponytail-review/SKILL.md`) | https://ponytail.dev (DietrichGebert) | 5.1.0 | MIT, zie `ponytail/LICENSE` |

Bijwerken: kopieer dezelfde bestanden opnieuw uit de bron en werk de versie in deze tabel bij.
