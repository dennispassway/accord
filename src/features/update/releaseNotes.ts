// De versiekop van release-please: `## [1.8.0](compare-url) (2026-10-08)`.
// De kaarttitel noemt de versie al, dus die kop is in de kaart een herhaling.
const VERSION_HEADING = /^#{1,3} \[?v?\d+\.\d+\.\d+[^\n]*\n+/;

// Het ` ([7341685](…/commit/…))`-staartje achter elke regel: in een kaart van
// 320px breed is een hash ruis, en de PR-link ervoor blijft staan.
const COMMIT_LINK = / \(\[[0-9a-f]{7,40}\]\([^)\s]*\/commit\/[0-9a-f]+\)\)/g;

/** Maakt de release-please-body uit latest.json geschikt voor de update-kaart.
 * Notes in een andere vorm komen ongewijzigd terug. */
export function tidyReleaseNotes(notes: string): string {
  return notes.replace(VERSION_HEADING, "").replace(COMMIT_LINK, "");
}
