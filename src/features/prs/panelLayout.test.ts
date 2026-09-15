import { describe, expect, it } from "vitest";
import {
  clampPanel,
  clampPanels,
  DEFAULT_PANELS,
  LIST_MIN,
  PANEL_BOUNDS,
} from "./panelLayout";

/** Het venster heeft een harde ondergrens in src-tauri/tauri.conf.json. */
const MIN_WINDOW = 940;

describe("clampPanel", () => {
  it("houdt de sidebar binnen zijn eigen ondergrens", () => {
    expect(clampPanel("sidebar", 40, DEFAULT_PANELS.detail, 1600)).toBe(
      PANEL_BOUNDS.sidebar.min,
    );
  });

  it("houdt de sidebar binnen zijn eigen bovengrens", () => {
    expect(clampPanel("sidebar", 900, DEFAULT_PANELS.detail, 1600)).toBe(
      PANEL_BOUNDS.sidebar.max,
    );
  });

  it("laat de lijstkolom niet onder LIST_MIN zakken", () => {
    // 940 - 340 - 384 = 216, ruim onder de bovengrens van 360.
    expect(clampPanel("sidebar", 360, 340, MIN_WINDOW)).toBe(216);
  });

  it("verplaatst het andere paneel niet tijdens het slepen", () => {
    // Alleen de gesleepte waarde komt terug; de aanroeper houdt de rest vast.
    expect(clampPanel("detail", 400, 216, 1600)).toBe(400);
  });

  it("geeft de eigen ondergrens terug als het venster te smal is voor beide", () => {
    expect(clampPanel("detail", 400, 360, 700)).toBe(PANEL_BOUNDS.detail.min);
  });
});

describe("clampPanels", () => {
  it("laat passende breedtes ongemoeid", () => {
    expect(clampPanels(DEFAULT_PANELS, 1600)).toEqual(DEFAULT_PANELS);
  });

  it("clampt eerst per paneel op de eigen grenzen", () => {
    expect(clampPanels({ sidebar: 900, detail: 120 }, 2400)).toEqual({
      sidebar: PANEL_BOUNDS.sidebar.max,
      detail: PANEL_BOUNDS.detail.min,
    });
  });

  it("krimpt beide panelen tot de lijst weer LIST_MIN haalt", () => {
    const next = clampPanels({ sidebar: 360, detail: 520 }, MIN_WINDOW);
    expect(next.sidebar + next.detail + LIST_MIN).toBeLessThanOrEqual(
      MIN_WINDOW,
    );
  });

  it("verdeelt het krimpen over de speling die elk paneel heeft", () => {
    // sidebar heeft 180 speling (360-180), detail 240 (520-280): detail wijkt meer.
    const next = clampPanels({ sidebar: 360, detail: 520 }, MIN_WINDOW);
    expect(360 - next.sidebar).toBeLessThan(520 - next.detail);
  });

  it("houdt beide panelen op hun ondergrens als er geen speling meer is", () => {
    expect(clampPanels({ sidebar: 300, detail: 400 }, 600)).toEqual({
      sidebar: PANEL_BOUNDS.sidebar.min,
      detail: PANEL_BOUNDS.detail.min,
    });
  });

  it("laat de defaults passen op het smalste toegestane venster", () => {
    expect(clampPanels(DEFAULT_PANELS, MIN_WINDOW)).toEqual(DEFAULT_PANELS);
  });
});
