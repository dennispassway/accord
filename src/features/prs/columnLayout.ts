/**
 * Kolombreedtes van de PR-lijst.
 *
 * De lijst is een tabel: kop en rijen lezen dezelfde tracks, zodat ze per
 * constructie niet uit elkaar kunnen lopen. De titel is de enige kolom die
 * meebeweegt; al het andere staat vast op zijn breedte.
 *
 * Krimpen gebeurt bewust hier en niet met een container query: de breedtes
 * komen als inline custom properties uit React, en een inline waarde wint
 * altijd van een stylesheet-regel.
 */

/** Kolommen waarvan de gebruiker de breedte kan verslepen. */
export type ColumnKey = "project" | "nr" | "status" | "wie" | "tijd";

export type ColumnWidths = Record<ColumnKey, number>;

export const DEFAULT_COLUMNS: ColumnWidths = {
  project: 118,
  nr: 38,
  status: 88,
  wie: 44,
  tijd: 44,
};

export const COLUMN_BOUNDS: Record<ColumnKey, { min: number; max: number }> = {
  project: { min: 60, max: 220 },
  nr: { min: 32, max: 72 },
  status: { min: 56, max: 160 },
  wie: { min: 24, max: 96 },
  tijd: { min: 34, max: 90 },
};

/** Kolommen met inhoud van vaste maat; die zijn niet te verslepen. */
export const FIXED_COLUMNS = { prio: 22, omvang: 26, reacties: 34 };

/** Onder deze breedte zegt een PR-titel niets meer. */
export const TITLE_MIN = 120;

/** Horizontale padding van .pl-row, links plus rechts. */
export const ROW_PADDING = 24;

const GAP = 10;
const GAP_TIGHT = 8;

/** Het project valt terug op zijn gekleurde stip. */
const PROJECT_DOT = 9;
/** De status valt terug op zijn icoon. */
const STATUS_ICON = 20;

/** Volgorde waarin kolommen ruimte afstaan als alles al is ingeklapt. */
const SHRINK_ORDER: ColumnKey[] = ["wie", "tijd", "nr", "status"];

export interface ColumnVisibility {
  /** De "Alles"-weergave toont het project; een enkele repo niet. */
  project: boolean;
  /** Alleen tonen als er in beeld een PR met prioriteit staat. */
  prio: boolean;
}

export interface AppliedColumns {
  widths: ColumnWidths;
  gap: number;
  /** false: alleen de projectstip, zonder naam. */
  projectLabel: boolean;
  /** false: alleen het statusicoon, zonder tekst. */
  statusLabel: boolean;
  showMetrics: boolean;
  showComments: boolean;
  titleWidth: number;
}

export function clampColumn(key: ColumnKey, value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_COLUMNS[key];
  const bounds = COLUMN_BOUNDS[key];
  return Math.max(bounds.min, Math.min(value, bounds.max));
}

/**
 * Wat er van de opgegeven breedtes overblijft op een lijstkolom van
 * `containerWidth`. Krimpt in vaste stappen, van de kolom die het minst
 * kost tot de kolom die het meest kost, en pas als laatste door de
 * versleepbare kolommen zelf terug te zetten.
 */
export function effectiveColumns(
  widths: ColumnWidths,
  containerWidth: number,
  shows: ColumnVisibility,
): AppliedColumns {
  const applied: ColumnWidths = {
    project: clampColumn("project", widths.project),
    nr: clampColumn("nr", widths.nr),
    status: clampColumn("status", widths.status),
    wie: clampColumn("wie", widths.wie),
    tijd: clampColumn("tijd", widths.tijd),
  };

  let gap = GAP;
  let projectLabel = true;
  let statusLabel = true;
  let showMetrics = true;
  let showComments = true;

  function titleRoom(): number {
    const cells: number[] = [];
    if (shows.project) {
      cells.push(projectLabel ? applied.project : PROJECT_DOT);
    }
    cells.push(applied.nr);
    if (shows.prio) cells.push(FIXED_COLUMNS.prio);
    cells.push(statusLabel ? applied.status : STATUS_ICON);
    cells.push(applied.wie);
    if (showMetrics) cells.push(FIXED_COLUMNS.omvang);
    if (showComments) cells.push(FIXED_COLUMNS.reacties);
    cells.push(applied.tijd);

    const sum = cells.reduce((total, width) => total + width, 0);
    return containerWidth - ROW_PADDING - sum - cells.length * gap;
  }

  if (titleRoom() < TITLE_MIN && shows.project) projectLabel = false;
  if (titleRoom() < TITLE_MIN) {
    statusLabel = false;
    gap = GAP_TIGHT;
  }
  if (titleRoom() < TITLE_MIN) showComments = false;
  if (titleRoom() < TITLE_MIN) showMetrics = false;

  // Laatste stap: de versleepbare kolommen zelf terug naar hun ondergrens,
  // anders loopt een rij met vijf brede kolommen alsnog over de rand.
  for (const key of SHRINK_ORDER) {
    const deficit = TITLE_MIN - titleRoom();
    if (deficit <= 0) break;
    if (key === "status" && !statusLabel) continue;
    const give = Math.min(deficit, applied[key] - COLUMN_BOUNDS[key].min);
    if (give > 0) applied[key] -= give;
  }

  return {
    widths: {
      ...applied,
      project: projectLabel ? applied.project : PROJECT_DOT,
      status: statusLabel ? applied.status : STATUS_ICON,
    },
    gap,
    projectLabel,
    statusLabel,
    showMetrics,
    showComments,
    titleWidth: Math.max(TITLE_MIN, titleRoom()),
  };
}
