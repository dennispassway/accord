import { beforeEach, describe, expect, it } from "vitest";
import {
  loadColumns,
  loadFavorites,
  loadPanels,
  loadRepoFilter,
  loadSortMode,
  saveColumns,
  saveFavorites,
  savePanels,
  saveRepoFilter,
  saveSortMode,
} from "./cockpitPrefs";
import { COLUMN_BOUNDS, DEFAULT_COLUMNS } from "./columnLayout";
import { DEFAULT_PANELS, PANEL_BOUNDS } from "./panelLayout";

/** vitest draait in een node-omgeving zonder DOM: cockpitPrefs.ts gebruikt
 * localStorage direct, dus hier een minimale in-memory mock (patroon uit
 * src/lib/settings.test.ts). */
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.get(key) ?? null;
  }
  key(index: number) {
    return [...this.store.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    value: new MemoryStorage(),
    configurable: true,
  });
});

describe("loadSortMode", () => {
  it("geeft een geldige opgeslagen sortmode terug", () => {
    localStorage.setItem("pr-cockpit.sortMode", "omvang");
    expect(loadSortMode()).toBe("omvang");
  });

  it("valt terug op triage bij een onbekende waarde", () => {
    localStorage.setItem("pr-cockpit.sortMode", "onzin");
    expect(loadSortMode()).toBe("triage");
  });

  it("valt terug op triage bij lege storage", () => {
    expect(loadSortMode()).toBe("triage");
  });
});

describe("loadRepoFilter", () => {
  it("geeft de opgeslagen repo-filter terug", () => {
    localStorage.setItem("pr-cockpit.repoFilter", "acme/website");
    expect(loadRepoFilter()).toBe("acme/website");
  });

  it("geeft 'all' terug bij lege storage", () => {
    expect(loadRepoFilter()).toBe("all");
  });
});

describe("loadFavorites", () => {
  it("geeft de opgeslagen favorieten terug", () => {
    localStorage.setItem(
      "pr-cockpit.favorites",
      JSON.stringify(["acme/api", "acme/website"]),
    );
    expect(loadFavorites()).toEqual(["acme/api", "acme/website"]);
  });

  it("geeft een lege lijst bij lege storage", () => {
    expect(loadFavorites()).toEqual([]);
  });

  it("geeft een lege lijst bij corrupte JSON", () => {
    localStorage.setItem("pr-cockpit.favorites", "{niet json");
    expect(loadFavorites()).toEqual([]);
  });

  it("geeft een lege lijst als de opgeslagen waarde geen string-array is", () => {
    localStorage.setItem("pr-cockpit.favorites", JSON.stringify({ a: 1 }));
    expect(loadFavorites()).toEqual([]);
  });
});

describe("loadPanels", () => {
  it("geeft de opgeslagen breedtes terug", () => {
    localStorage.setItem(
      "pr-cockpit.panels",
      JSON.stringify({ sidebar: 240, detail: 400 }),
    );
    expect(loadPanels()).toEqual({ sidebar: 240, detail: 400 });
  });

  it("geeft de defaults bij lege storage", () => {
    expect(loadPanels()).toEqual(DEFAULT_PANELS);
  });

  it("geeft de defaults bij corrupte JSON", () => {
    localStorage.setItem("pr-cockpit.panels", "{niet json");
    expect(loadPanels()).toEqual(DEFAULT_PANELS);
  });

  it("geeft de defaults als een veld ontbreekt of geen getal is", () => {
    localStorage.setItem(
      "pr-cockpit.panels",
      JSON.stringify({ sidebar: "240" }),
    );
    expect(loadPanels()).toEqual(DEFAULT_PANELS);
  });

  it("trekt een opgeslagen waarde buiten de grenzen terug", () => {
    localStorage.setItem(
      "pr-cockpit.panels",
      JSON.stringify({ sidebar: 4000, detail: 10 }),
    );
    expect(loadPanels()).toEqual({
      sidebar: PANEL_BOUNDS.sidebar.max,
      detail: PANEL_BOUNDS.detail.min,
    });
  });
});

describe("loadColumns", () => {
  it("geeft de opgeslagen breedtes terug", () => {
    localStorage.setItem(
      "pr-cockpit.columns",
      JSON.stringify({ ...DEFAULT_COLUMNS, project: 150 }),
    );
    expect(loadColumns().project).toBe(150);
  });

  it("geeft de defaults bij lege storage", () => {
    expect(loadColumns()).toEqual(DEFAULT_COLUMNS);
  });

  it("geeft de defaults bij corrupte JSON", () => {
    localStorage.setItem("pr-cockpit.columns", "{niet json");
    expect(loadColumns()).toEqual(DEFAULT_COLUMNS);
  });

  it("vult een ontbrekende kolom aan met zijn default", () => {
    localStorage.setItem("pr-cockpit.columns", JSON.stringify({ nr: 60 }));
    expect(loadColumns()).toEqual({ ...DEFAULT_COLUMNS, nr: 60 });
  });

  it("trekt een kolom buiten zijn grenzen terug", () => {
    localStorage.setItem(
      "pr-cockpit.columns",
      JSON.stringify({ status: 4000 }),
    );
    expect(loadColumns().status).toBe(COLUMN_BOUNDS.status.max);
  });

  it("negeert een veld dat geen getal is", () => {
    localStorage.setItem("pr-cockpit.columns", JSON.stringify({ wie: "44" }));
    expect(loadColumns().wie).toBe(DEFAULT_COLUMNS.wie);
  });
});

describe("saveSortMode/saveRepoFilter", () => {
  it("schrijft de sortmode weg zodat loadSortMode 'm teruggeeft", () => {
    saveSortMode("project");
    expect(loadSortMode()).toBe("project");
  });

  it("schrijft de repo-filter weg zodat loadRepoFilter 'm teruggeeft", () => {
    saveRepoFilter("acme/api");
    expect(loadRepoFilter()).toBe("acme/api");
  });

  it("schrijft favorieten weg zodat loadFavorites ze teruggeeft", () => {
    saveFavorites(["acme/api"]);
    expect(loadFavorites()).toEqual(["acme/api"]);
  });

  it("schrijft paneelbreedtes weg zodat loadPanels ze teruggeeft", () => {
    savePanels({ sidebar: 260, detail: 300 });
    expect(loadPanels()).toEqual({ sidebar: 260, detail: 300 });
  });

  it("schrijft kolombreedtes weg zodat loadColumns ze teruggeeft", () => {
    const columns = { ...DEFAULT_COLUMNS, tijd: 70 };
    saveColumns(columns);
    expect(loadColumns()).toEqual(columns);
  });
});
