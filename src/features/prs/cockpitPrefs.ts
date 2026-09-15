import type { PanelWidths } from "./panelLayout";
import { DEFAULT_PANELS, PANEL_BOUNDS } from "./panelLayout";
import type { SortMode } from "./sort";

const SORT_MODE_KEY = "pr-cockpit.sortMode";
const REPO_FILTER_KEY = "pr-cockpit.repoFilter";
const FAVORITES_KEY = "pr-cockpit.favorites";
const PANELS_KEY = "pr-cockpit.panels";

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

/** Als favoriet gemarkeerde repo's; alles wat geen string-array is (corrupte
 * of oude waarde) valt terug op een lege lijst. */
export function loadFavorites(): string[] {
  const stored = localStorage.getItem(FAVORITES_KEY);
  if (stored === null) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) && parsed.every((id) => typeof id === "string")
      ? parsed
      : [];
  } catch {
    return [];
  }
}

export function saveFavorites(repoIds: string[]): void {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(repoIds));
}

/** Versleepte breedtes van de twee zijpanelen. Alles wat geen paar getallen
 * is valt terug op de defaults; een waarde buiten de grenzen wordt
 * teruggetrokken, zodat een oude of met de hand aangepaste opslag de lijst
 * nooit wegdrukt. De vensterbreedte telt hier niet mee: die kent alleen de
 * Cockpit, die er clampPanels overheen haalt. */
export function loadPanels(): PanelWidths {
  const stored = localStorage.getItem(PANELS_KEY);
  if (stored === null) return DEFAULT_PANELS;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (parsed === null || typeof parsed !== "object") return DEFAULT_PANELS;
    const { sidebar, detail } = parsed as Record<string, unknown>;
    if (!Number.isFinite(sidebar) || !Number.isFinite(detail)) {
      return DEFAULT_PANELS;
    }
    return {
      sidebar: withinBounds("sidebar", sidebar as number),
      detail: withinBounds("detail", detail as number),
    };
  } catch {
    return DEFAULT_PANELS;
  }
}

export function savePanels(panels: PanelWidths): void {
  localStorage.setItem(PANELS_KEY, JSON.stringify(panels));
}

function withinBounds(panel: keyof PanelWidths, value: number): number {
  const bounds = PANEL_BOUNDS[panel];
  return Math.max(bounds.min, Math.min(value, bounds.max));
}
