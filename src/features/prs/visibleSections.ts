import type { PrSection } from "./sort";
import { matchesSearch } from "./usePrSelection";

/**
 * Wat de lijst toont: elke sectie (óók "Later") gefilterd op de
 * zoekopdracht, los van of "Later" is ingeklapt. Dat inklappen telt alleen
 * mee voor toetsenbordnavigatie en selectie (zie visiblePrs in
 * Cockpit.tsx), niet voor de sectiekop of -telling hier: anders verdwijnt de
 * hele Later-sectie zodra hij dicht staat, en is een gesnoozede PR nergens
 * meer te bereiken.
 */
export function visibleSectionsFor(
  sections: PrSection[],
  search: string,
): PrSection[] {
  return sections
    .map((section) => ({
      ...section,
      prs: section.prs.filter((pr) => matchesSearch(pr, search)),
    }))
    .filter((section) => section.prs.length > 0);
}
