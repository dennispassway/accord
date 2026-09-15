import { describe, expect, it } from "vitest";
import type { AppliedColumns } from "./columnLayout";
import {
  COLUMN_BOUNDS,
  clampColumn,
  DEFAULT_COLUMNS,
  effectiveColumns,
  FIXED_COLUMNS,
  ROW_PADDING,
  TITLE_MIN,
} from "./columnLayout";

/** Smalste lijstkolom die kan voorkomen: LIST_MIN uit panelLayout.ts. */
const NARROW = 384;
const WIDE = 724;

/** Telt de rij na zoals de browser hem legt: padding, cellen en gaps. */
function rowWidth(applied: AppliedColumns, shows: Shows): number {
  const cells = [
    shows.project ? applied.widths.project : null,
    applied.widths.nr,
    shows.prio ? FIXED_COLUMNS.prio : null,
    applied.widths.status,
    applied.widths.wie,
    applied.showMetrics ? FIXED_COLUMNS.omvang : null,
    applied.showComments ? FIXED_COLUMNS.reacties : null,
    applied.widths.tijd,
  ].filter((width): width is number => width !== null);

  const sum = cells.reduce((total, width) => total + width, 0);
  return ROW_PADDING + sum + cells.length * applied.gap + applied.titleWidth;
}

interface Shows {
  project: boolean;
  prio: boolean;
}

const ALLES: Shows = { project: true, prio: false };
const EEN_REPO: Shows = { project: false, prio: false };
const MET_PRIO: Shows = { project: true, prio: true };

describe("clampColumn", () => {
  it("houdt een kolom binnen zijn ondergrens", () => {
    expect(clampColumn("status", 10)).toBe(COLUMN_BOUNDS.status.min);
  });

  it("houdt een kolom binnen zijn bovengrens", () => {
    expect(clampColumn("project", 9000)).toBe(COLUMN_BOUNDS.project.max);
  });

  it("valt terug op de default bij een onbruikbare waarde", () => {
    expect(clampColumn("nr", Number.NaN)).toBe(DEFAULT_COLUMNS.nr);
  });
});

describe("effectiveColumns op een breed venster", () => {
  it("laat alle kolommen en labels staan", () => {
    const applied = effectiveColumns(DEFAULT_COLUMNS, WIDE, ALLES);
    expect(applied.projectLabel).toBe(true);
    expect(applied.statusLabel).toBe(true);
    expect(applied.showComments).toBe(true);
    expect(applied.showMetrics).toBe(true);
  });

  it("geeft de titel alle overgebleven ruimte", () => {
    const applied = effectiveColumns(DEFAULT_COLUMNS, WIDE, ALLES);
    expect(applied.titleWidth).toBeGreaterThan(TITLE_MIN);
    expect(rowWidth(applied, ALLES)).toBe(WIDE);
  });
});

describe("effectiveColumns op de smalste lijstkolom", () => {
  it("schakelt het project terug naar alleen de stip", () => {
    const applied = effectiveColumns(DEFAULT_COLUMNS, NARROW, ALLES);
    expect(applied.projectLabel).toBe(false);
  });

  it("schakelt de status terug naar alleen het icoon", () => {
    const applied = effectiveColumns(DEFAULT_COLUMNS, NARROW, ALLES);
    expect(applied.statusLabel).toBe(false);
  });

  it("houdt de titel op minstens TITLE_MIN", () => {
    const applied = effectiveColumns(DEFAULT_COLUMNS, NARROW, ALLES);
    expect(applied.titleWidth).toBeGreaterThanOrEqual(TITLE_MIN);
  });

  it("laat de rij niet breder worden dan de lijstkolom", () => {
    const applied = effectiveColumns(DEFAULT_COLUMNS, NARROW, ALLES);
    expect(rowWidth(applied, ALLES)).toBeLessThanOrEqual(NARROW);
  });

  it("laat de omvangkolom staan zolang de titel past", () => {
    const applied = effectiveColumns(DEFAULT_COLUMNS, NARROW, ALLES);
    expect(applied.showMetrics).toBe(true);
    expect(applied.showComments).toBe(false);
  });

  it("offert ook de omvangkolom op als de prioriteitkolom meedoet", () => {
    const applied = effectiveColumns(DEFAULT_COLUMNS, NARROW, MET_PRIO);
    expect(applied.showMetrics).toBe(false);
    expect(applied.titleWidth).toBeGreaterThanOrEqual(TITLE_MIN);
    expect(rowWidth(applied, MET_PRIO)).toBeLessThanOrEqual(NARROW);
  });

  it("houdt in een enkele repo meer over doordat de projectkolom wegvalt", () => {
    const alles = effectiveColumns(DEFAULT_COLUMNS, NARROW, ALLES);
    const een = effectiveColumns(DEFAULT_COLUMNS, NARROW, EEN_REPO);
    expect(een.titleWidth).toBeGreaterThan(alles.titleWidth);
    expect(rowWidth(een, EEN_REPO)).toBeLessThanOrEqual(NARROW);
  });
});

describe("effectiveColumns met versleepte breedtes", () => {
  it("neemt een bredere projectkolom over", () => {
    const applied = effectiveColumns(
      { ...DEFAULT_COLUMNS, project: 200 },
      WIDE,
      ALLES,
    );
    expect(applied.widths.project).toBe(200);
    expect(rowWidth(applied, ALLES)).toBe(WIDE);
  });

  it("laat een te brede kolom de titel niet onder TITLE_MIN duwen", () => {
    const applied = effectiveColumns(
      { project: 220, nr: 72, status: 160, wie: 96, tijd: 90 },
      NARROW,
      ALLES,
    );
    expect(applied.titleWidth).toBeGreaterThanOrEqual(TITLE_MIN);
  });
});
