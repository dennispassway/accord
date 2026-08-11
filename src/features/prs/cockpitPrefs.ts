import type { SortMode } from "./sort";

const SORT_MODE_KEY = "pr-cockpit.sortMode";
const REPO_FILTER_KEY = "pr-cockpit.repoFilter";

const SORT_MODES: SortMode[] = [
  "triage",
  "prioriteit",
  "bijgewerkt",
  "oudste",
  "omvang",
  "project",
];

/** Onthouden sorteermodus; ongeldige of ontbrekende waarde valt terug op
 * "triage" (patroon uit MergeSection.tsx's loadMethod). */
export function loadSortMode(): SortMode {
  const stored = localStorage.getItem(SORT_MODE_KEY);
  return (SORT_MODES as string[]).includes(stored ?? "")
    ? (stored as SortMode)
    : "triage";
}

export function saveSortMode(mode: SortMode): void {
  localStorage.setItem(SORT_MODE_KEY, mode);
}

/** Onthouden repo-filter uit de sidebar; ontbrekende waarde valt terug op
 * "all" (het geldigheid-tegen-de-huidige-groepen-check gebeurt in Cockpit). */
export function loadRepoFilter(): string {
  return localStorage.getItem(REPO_FILTER_KEY) ?? "all";
}

export function saveRepoFilter(repoId: string): void {
  localStorage.setItem(REPO_FILTER_KEY, repoId);
}
